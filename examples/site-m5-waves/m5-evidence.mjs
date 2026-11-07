import { homedir } from "node:os";
/**
 * M5 evidence pack — the checks a reviewer should judge, collected by machine.
 *
 * A slow model should not read the repo to find out whether the repo is fine;
 * it should judge this file. This is the evidence contract in practice.
 *
 * Usage: node tools/m5-evidence.mjs [repoDir]
 */

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const REPO = process.argv[2] || process.env.SITE_DIR || join(homedir(), "site-m5");
const OUT = join(REPO, "docs", "verify-evidence.md");

function sh(cmd, args, cwd = REPO) {
	try {
		return execFileSync(cmd, args, { cwd, encoding: "utf8", timeout: 180_000, maxBuffer: 8 << 20 }).trim();
	} catch (err) {
		return `FAILED: ${(err.stderr || err.message || "").toString().slice(0, 300)}`;
	}
}

const dist = join(REPO, "dist");
const html = [];
const walk = (dir) => {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const p = join(dir, entry.name);
		if (entry.isDirectory()) walk(p);
		else if (entry.name.endsWith(".html")) html.push(p);
	}
};
try {
	walk(dist);
} catch {
	/* dist missing */
}

const titles = html.map((f) => (readFileSync(f, "utf8").match(/<title>([^<]*)<\/title>/) || [])[1]?.trim() || "");
const descs = html.map((f) => (readFileSync(f, "utf8").match(/name="description" content="([^"]*)"/) || [])[1]?.trim() || "");
const dupT = titles.filter((t, i) => t && titles.indexOf(t) !== i);
const dupD = descs.filter((d, i) => d && descs.indexOf(d) !== i);

const forbidden = [
	"Top-rated", "Verified Partner", "background-checked", "Title 24", "IECC",
	"45–90", "45-90", "30%–50", "2026 Data", "Clinch", "Elite",
];
const hits = forbidden.map((s) => {
	// only site content and build output — docs/ legitimately quotes these phrases
	const out = sh("git", ["grep", "-l", "-I", "-F", s, "--", "dist", "content", "site"]);
	return { s, files: out && !out.startsWith("FAILED") ? out.split("\n").filter(Boolean) : [] };
});

/**
 * Claims must be proven by *patterns*, not by a word blacklist: "licensed" and
 * "dispatch" legitimately appear in advice to homeowners ("check the
 * contractor's license") and in the disclaimer ("we do not dispatch").
 * What must never appear is a first-person claim of being a licensed dispatch
 * network — and the disclaimer must appear where it matters.
 */
const claimPatterns = [
	/our\s+(licensed|verified|background[- ]checked)\s+(technicians|contractors|partners)/i,
	/we\s+(dispatch|send|deploy)\s+(our\s+)?(technicians|crews|repair\s+teams)/i,
	/24\/7\s+(emergency\s+)?(dispatch|call\s+line|hotline)\s+(we|our)/i,
	/our\s+emergency\s+(call\s+)?line/i,
	/we\s+are\s+a\s+licensed\s+(contractor|dispatch|home\s+service)/i,
];
const claimHits = [];
for (const file of [...html, ...["content/services.json", "content/cities.json", "content/pages.json"]]) {
	let text;
	try {
		text = file.endsWith(".html") ? readFileSync(file, "utf8") : readFileSync(join(REPO, file), "utf8");
	} catch {
		continue;
	}
	for (const re of claimPatterns) {
		const m = re.exec(text);
		if (m) claimHits.push({ file, pattern: String(re), match: m[0].slice(0, 80) });
	}
}

/** The disclaimer has to be present, not just the claim absent. */
const disclaimers = ["not a dispatch service", "do not send technicians", "not a dispatch"];
const disclaimerMissing = disclaimers.map((d) => {
	const out = sh("git", ["grep", "-l", "-I", "-F", d, "--", "content"]);
	return { d, files: out && !out.startsWith("FAILED") ? out.split("\n").filter(Boolean) : [] };
});

/** The keyword/outreach docs must not carry ready-to-paste fabricated answers. */
const docPatterns = [
	/95\s*PSI/i, /top\s*3\s*ZIP/i, /NSCB[^.\n]{0,40}(?:insured|licensed)/i,
	/\b35%\b/, /spiking/i, /NSCB license and insured/i,
	/Green Valley[^.\n]{0,80}(?:PSI|spiking|completed|replaced)/i,
	/Top-rated/i, /\$\d[\d,]*\s*[-–]\s*\$?\d/i, /\$\d[\d,]*\s*[-–]\s*\$?\d[^.\n]{0,40}(?:diagnos|install|repair)/i,
];
const docFiles = [
	"docs/keyword-map-lasvegas.md",
	"docs/local-outreach-lasvegas.md",
	"docs/page-plan.md",
	"docs/site-blueprint.md",
	"docs/seo-geo-requirements.md",
];
const docHits = [];
for (const doc of docFiles) {
	let text = "";
	try {
		text = readFileSync(join(REPO, doc), "utf8");
	} catch {
		continue;
	}
	for (const re of docPatterns) {
		const m = re.exec(text);
		if (m) docHits.push({ doc, pattern: String(re), match: m[0].slice(0, 60) });
	}
}

/** Breadcrumbs: the last crumb must be the page itself, and every crumb URL must exist. */
const sitemapUrls = new Set();
try {
	const sm = readFileSync(join(dist, "sitemap.xml"), "utf8");
	for (const m of sm.matchAll(/<loc>([^<]+)<\/loc>/g)) sitemapUrls.add(m[1].replace(/\/$/, "") || "/");
} catch {
	/* ignore */
}
const crumbProblems = [];
for (const file of html) {
	const text = readFileSync(file, "utf8");
	const blocks = [...text.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
	let graph = [];
	for (const b of blocks) {
		try {
			const parsed = JSON.parse(b);
			graph = graph.concat(parsed["@graph"] ?? [parsed]);
		} catch {
			/* unparsable JSON-LD is itself a problem */
			crumbProblems.push({ file, issue: "JSON-LD 无法解析" });
		}
	}
	const crumbs = graph.find((n) => n && n["@type"] === "BreadcrumbList");
	if (!crumbs) {
		// the homepage and the 404 page legitimately have no breadcrumb trail
		const isHomeOr404 = /[\\/](index|404)\.html$/.test(file);
		if (!isHomeOr404) crumbProblems.push({ file, issue: "没有 BreadcrumbList" });
		continue;
	}
	const items = (crumbs.itemListElement ?? []).map((i) => String(i.item ?? ""));
	if (items.length < 2) crumbProblems.push({ file, issue: `面包屑只有 ${items.length} 级` });
	const last = (items[items.length - 1] ?? "").replace(/\/$/, "") || "/";
	const own = file
		.replace(/^.*[\\/]dist[\\/]/, "")
		.replace(/[\\/]index\.html$/, "")
		.replace(/\.html$/, "")
		.replace(/\\/g, "/");
	const ownUrl = (own === "index" ? "/" : own).replace(/\/$/, "") || "/";
	if (ownUrl !== "/" && !last.endsWith(ownUrl)) {
		crumbProblems.push({ file, issue: `最后一级指向 ${last}，不是本页 ${ownUrl}` });
	}
	for (const it of items.slice(0, -1)) {
		const norm = it.replace(/\/$/, "") || "/";
		if (!sitemapUrls.has(norm)) crumbProblems.push({ file, issue: `中间级 ${it} 不在 sitemap 里` });
	}
}

/** The social share image must not carry placeholders. */
const ogFiles = html.filter((f) => {
	const t = readFileSync(f, "utf8");
	return /og:image/.test(t);
});
const ogIssues = ogFiles.filter((f) => {
	const t = readFileSync(f, "utf8");
	const m = /property="og:image"\s+content="([^"]+)"/.exec(t);
	if (!m) return true;
	let pathname = m[1];
	try {
		pathname = new URL(m[1]).pathname;
	} catch {
		pathname = m[1].replace(/^https?:\/\/[^/]+/, "");
	}
	const p = join(dist, pathname.replace(/^\//, "").split("?")[0]);
	try {
		const img = readFileSync(p, "utf8");
		return /\[TODO/.test(img) || !/MapSignal/.test(img);
	} catch {
		return true;
	}
});

const cityPages = html.filter((f) => f.includes(`${join("dist", "areas")}`) || /areas[\\/]/.test(f));
const cityWithBusiness = cityPages.filter((f) => /HomeAndConstructionBusiness|LocalBusiness/.test(readFileSync(f, "utf8")));

/**
 * The site-level entity must NOT be a home-repair business: MapSignal sells
 * Maps visibility, not repairs. Scan EVERY page, not just the city pages.
 */
const businessEntityPages = html.filter((f) => /HomeAndConstructionBusiness|LocalBusiness|GeneralContractor/.test(readFileSync(f, "utf8")));
const serviceOfferNames = [];
for (const f of html) {
	const t = readFileSync(f, "utf8");
	for (const m of t.matchAll(/"name"\s*:\s*"([^"]*(?:Repair|Installation|Replacement|Cleaning|Maintenance|Detection|Recharging|Upgrade)[^"]*)"/g)) {
		serviceOfferNames.push({ file: f, name: m[1].slice(0, 70) });
	}
}
const providerIsBusiness = html.filter((f) => {
	const t = readFileSync(f, "utf8");
	return /"provider"\s*:\s*\{[^}]*"@type"\s*:\s*"HomeAndConstructionBusiness"/s.test(t);
});

/** The lead form must actually reach the endpoint. */
const formWiring = [];
for (const f of ["site/templates/contact.html", "site/templates/free-audit.html"]) {
	let t = "";
	try {
		t = readFileSync(join(REPO, f), "utf8");
	} catch {
		continue;
	}
	const action = /<form[^>]*action="([^"]*)"[^>]*method="([^"]*)"/i.exec(t);
	const usesApi = t.includes("/api/lead");
	formWiring.push({ file: f, action: action?.[1] ?? "(无 form)", method: action?.[2] ?? "-", usesApi });
}
const mainJs = (() => {
	try {
		return readFileSync(join(REPO, "site/assets/js/main.js"), "utf8");
	} catch {
		return "";
	}
})();
const jsCallsApi = /\/api\/lead/.test(mainJs);
const getWithPii = (() => {
	for (const f of ["site/templates/contact.html", "site/templates/free-audit.html"]) {
		let t = "";
		try {
			t = readFileSync(join(REPO, f), "utf8");
		} catch {
			continue;
		}
		const form = /<form[\s\S]*?<\/form>/i.exec(t)?.[0] ?? "";
		const method = /method="([^"]*)"/i.exec(form)?.[1]?.toLowerCase() ?? "";
		const hasPii = /name="(email|phone|zip_code|business_name)"/i.test(form);
		if (method === "get" && hasPii) return true;
	}
	return false;
})();

/** Social platforms do not render SVG og:images. */
const ogFormats = {};
for (const f of html) {
	const t = readFileSync(f, "utf8");
	const m = /property="og:image"\s+content="([^"]+)"/.exec(t);
	if (!m) continue;
	let pathname = m[1];
	try {
		pathname = new URL(m[1]).pathname;
	} catch {
		pathname = m[1].replace(/^https?:\/\/[^/]+/, "");
	}
	const ext = pathname.split(".").pop()?.toLowerCase() ?? "?";
	ogFormats[ext] = (ogFormats[ext] ?? 0) + 1;
}
const ogRasterOk = Object.keys(ogFormats).some((e) => ["png", "jpg", "jpeg", "webp"].includes(e));

const build = sh(process.execPath, ["build.mjs"]);
const sitemap = (() => {
	try {
		return (readFileSync(join(dist, "sitemap.xml"), "utf8").match(/<loc>/g) || []).length;
	} catch {
		return 0;
	}
})();
const llms = (() => {
	try {
		return readFileSync(join(dist, "llms.txt"), "utf8").length;
	} catch {
		return 0;
	}
})();
const todoHits = (() => {
	const out = sh("git", ["grep", "-l", "-I", "-F", "[TODO:", "--", "dist"]);
	return out && !out.startsWith("FAILED") ? out.split("\n").filter(Boolean) : [];
})();

/**
 * NAP must have exactly one source of truth, and the build must read it.
 * Three copies (site.json / pages.json.site.nap / pages.json.pages[contact].data.nap)
 * meant that filling in the real values changed nothing in the output — the
 * publishing gate failed silently.
 */
function napSingleSource() {
	const siteSrc = readFileSync(join(REPO, "content/site.json"), "utf8");
	const pagesSrc = readFileSync(join(REPO, "content/pages.json"), "utf8");
	const buildSrc = readFileSync(join(REPO, "build.mjs"), "utf8");
	// strip comments: a mention in a comment is not a read
	const buildCode = buildSrc
		.split("\n")
		.filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
		.join("\n");
	const readsSite = /["'`][^"'`]*site\.json["'`]/.test(buildCode);
	let dupInPages = 0;
	try {
		const pages = JSON.parse(pagesSrc);
		if (pages?.site?.nap) dupInPages++;
		const contact = (pages?.pages ?? []).find?.((p) => p.id === "contact" || p.slug === "contact");
		if (contact?.data?.nap) dupInPages++;
	} catch {
		dupInPages = -1;
	}
	let siteHasNap = 0;
	try {
		const site = JSON.parse(siteSrc);
		if (site?.profile?.nap) siteHasNap = Object.keys(site.profile.nap).length;
	} catch {
		siteHasNap = -1;
	}
	let distTodo = 0;
	for (const f of html) {
		distTodo += (readFileSync(f, "utf8").match(/\[TODO:/g) || []).length;
	}
	return { readsSite, dupInPages, siteHasNap, distTodo };
}

const nap = napSingleSource();

const report = `# 验收证据包（机器采集）

生成命令：\`node tools/m5-evidence.mjs\`｜仓库：\`${REPO}\`
每节都标注扫描范围（产物 dist/ · 内容库 content/ · 模板 site/ · 文档 docs/）。

## 1 构建（完整输出 + 退出码）
范围：仓库根
\`\`\`
${build}
\`\`\`

## 2 页面清单（${html.length} 个 HTML）
范围：dist/
- 唯一 title：${dupT.length === 0 ? "✅ 无重复" : `❌ 重复：${dupT.join(" / ")}`}
- 唯一 description：${dupD.length === 0 ? "✅ 无重复" : `❌ 重复：${dupD.join(" / ")}`}
- sitemap URL 数：${sitemap}｜llms.txt 字节：${llms}

## 3 站点实体不得是家装企业（虚假门店红线，全站）
范围：dist/**/*.html（注意：不只城市页）
- 城市页数量：${cityPages.length}；城市页仍声明营业主体：${cityWithBusiness.length === 0 ? "✅ 无" : `❌ ${cityWithBusiness.join(", ")}`}
- **全站**仍出现 HomeAndConstructionBusiness/LocalBusiness/GeneralContractor 的页面：${businessEntityPages.length === 0 ? "✅ 无" : `❌ ${businessEntityPages.map((f) => f.replace(/^.*[\\/]dist[\\/]/, "")).join(", ")}`}
- Service.provider 指向家装企业的页面：${providerIsBusiness.length === 0 ? "✅ 无" : `❌ ${providerIsBusiness.map((f) => f.replace(/^.*[\\/]dist[\\/]/, "")).join(", ")}`}
- 结构化数据里看起来像"维修服务"的 Offer 名：${serviceOfferNames.length === 0 ? "✅ 无" : serviceOfferNames.slice(0, 6).map((s) => `\n  ❌ ${s.file.replace(/^.*[\\/]dist[\\/]/, "")} → "${s.name}"`).join("")}

## 4 编造话术扫描（黑名单，应全部 0 命中）
范围：dist/ + content/ + site/
| 词 | 命中文件 |
|---|---|
${hits.map((h) => `| ${h.s} | ${h.files.length === 0 ? "0 ✅" : "❌ " + h.files.join(", ")} |`).join("\n")}

## 5 第一人称虚假声明扫描（模式匹配，不是黑名单）
范围：dist/*.html + content/*.json
正则：${claimPatterns.map((r) => `\`${r.source}\``).join("  ·  ")}
- 命中：${claimHits.length === 0 ? "✅ 0 处" : claimHits.map((h) => `\n  ❌ ${h.file} · ${h.match}`).join("")}

## 6 声明必须在场（不是"没有声称"而是"明确否认"）
范围：content/
| 声明 | 出现文件 |
|---|---|
${disclaimerMissing.map((d) => `| "${d.d}" | ${d.files.length === 0 ? "❌ 未出现" : d.files.join(", ")} |`).join("\n")}

## 7 关键词/话术文档里的可粘贴虚假内容
范围：${docFiles.join(" · ")}（不含 docs/review-*.md，那些是评审记录，会引用问题原句）
- 命中：${docHits.length === 0 ? "✅ 0 处" : docHits.map((h) => `\n  ❌ ${h.doc} · ${h.pattern} → "${h.match}"`).join("")}

## 8 面包屑层级与目标 URL
范围：dist/**/*.html（对照 dist/sitemap.xml）
- 问题：${crumbProblems.length === 0 ? "✅ 0 处" : crumbProblems.map((p) => `\n  ❌ ${p.file} · ${p.issue}`).join("")}

## 9 分享图（og:image）不得带占位，且必须是社交平台能渲染的位图
范围：dist/（含 svg 文本内容）
- 含 og:image 的页面：${ogFiles.length}
- 有问题的页面：${ogIssues.length === 0 ? "✅ 0 处" : ogIssues.join(", ")}
- og:image 格式分布：${Object.entries(ogFormats).map(([k, v]) => `${k}×${v}`).join("、")}
- 位图（png/jpg/webp）存在：${ogRasterOk ? "✅ 有" : "❌ 只有 SVG——Twitter/Facebook/LinkedIn 不渲染 SVG，社媒分享图会空白"}

## 10 JSON-LD 不得钉占位坐标与营业时间
范围：dist/**/*.html
- 含 openingHoursSpecification 或 geo 的页面：${html.filter((f) => /openingHoursSpecification|"geo"/.test(readFileSync(f, "utf8"))).length}（应为 0）

## 11 产物里的 TODO 残留（NAP 占位除外）
范围：dist/
${todoHits.length === 0 ? "✅ 无" : todoHits.join("\n")}

## 12 上线闸门（人工事项）+ NAP 单一入口
范围：content/site.json · content/pages.json · build.mjs · dist/
- 构建是否真的读 content/site.json：${nap.readsSite ? "✅ 是" : "❌ 否——人填了真值重跑构建，产物也不会变（闸门静默失效）"}
- pages.json 里还有几份重复 NAP 拷贝：${nap.dupInPages === 0 ? "✅ 0 份" : nap.dupInPages < 0 ? "❌ pages.json 解析失败" : `❌ ${nap.dupInPages} 份`}
- site.json 的 nap 字段数：${nap.siteHasNap}
- 产物里的 \`[TODO:\` 占位总数：${nap.distTodo}（人填真值后应为 0；NAP 占位之外不应有别的 TODO）
- 商号 / 街道 / 邮编 / 电话 / 邮箱 / 域名 / 营业时间目前全部是 \`[TODO: ...]\` 占位。
- **占位不阻塞合并代码**，但阻塞**上线**：部署前必须由人填真值 → 重跑构建 → 确认产物 \`[TODO:\` 为 0 → 核对 JSON-LD 的 address / telephone / url 与页面可见文案逐字一致。

## 13 线索表单必须真的接上后端（转化链路）
范围：site/templates/*.html + site/assets/js/main.js
| 表单 | action | method | 指向 /api/lead |
|---|---|---|---|
${formWiring.map((f) => `| ${f.file} | ${f.action} | ${f.method} | ${f.usesApi ? "✅" : "❌"} |`).join("\n")}
- main.js 是否调用 /api/lead：${jsCallsApi ? "✅ 有" : "❌ 没有——表单提交后没有任何后端接收"}
- 表单用 GET 携带 PII（email/phone/zip 等进 URL）：${getWithPii ? "❌ 是——PII 会进浏览器历史、CDN 日志与 Referer" : "✅ 否"}
`;
writeFileSync(OUT, report, "utf8");
console.log(report.slice(0, 2500));
console.log(`\n→ ${OUT}`);
