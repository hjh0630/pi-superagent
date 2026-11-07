import { homedir } from "node:os";
import { join } from "node:path";
/**
 * M5 wave 12 — 我们自己拥有的 GEO/SEO 工具链（不依赖任何平台账号）。
 * 用法：node tools/m5-wave12.mjs
 */
import { dispatch } from "../store/runner.ts";
import { readJob } from "../store/jobs.ts";
import { resolveExecutor, composeTask } from "../store/roles.ts";

process.env.PI_FLEET_ONLY_PROVIDER = "pi";
const CWD = process.env.SITE_DIR || join(homedir(), "site-m5");

async function run(roleId, task, label) {
	const role = resolveExecutor(roleId);
	console.log(`▶ ${label}｜${role.label}（${role.executor}）`);
	const o = await dispatch({ provider: role.executor, task: composeTask(role, task), cwd: CWD, background: true, dedupe: false, timeoutMs: 2_700_000 });
	console.log(`  job ${o.jobId}`);
	return o.jobId;
}
async function waitFor(ids, ms = 2_800_000) {
	const end = Date.now() + ms; const pending = new Set(ids);
	while (pending.size && Date.now() < end) {
		for (const id of [...pending]) {
			const j = readJob(id);
			if (!j || (j.status !== "running" && j.status !== "queued")) { pending.delete(id); console.log(`  ✓ ${id} → ${j?.status} ${j?.durationMs ?? ""}ms`); }
		}
		if (!pending.size) break;
		await new Promise((r) => setTimeout(r, 4000));
	}
}

const job = await run("seo", `在 ${CWD} 补齐**我们自有的 GEO/SEO 工具链**（这是不依赖任何第三方平台账号的阵地，AI 搜索引擎与 RSS 阅读器都吃这一套）：
1) 生成 /feed.xml（RSS 2.0）与 /atom.xml（Atom 1.0）：包含首页 + 全部服务页 + 全部城市页 + /glossary + /methodology，每条有 title / link / guid / description / pubDate / category；description 用页面的 metaDescription，不要新造事实；在 /llms.txt 里加上 feed 链接；在 head 里加 <link rel="alternate" type="application/rss+xml">。
2) 新增 /press 页（媒体与事实页，可被引用）：
   - 一句话业务定义 + 我们服务的市场（内华达/拉斯维加斯）与服务对象（家庭维修承包商）；
   - "可引用事实块"：6-10 条每条都可被直接引用的事实（只写已在仓库里能核对的内容：服务品类、市场口径、我们不做什么、审计口径维度、页面清单规模），每条后面标注来源文件；
   - "我们不做的事"（不刷评、不做虚假门店、不派技师、不代持牌）；
   - "联系方式"：只写"通过站内的免费审计表单联系"（没有真实 NAP 就不写电话邮箱）；
   - Organization + FAQPage 结构化数据。
3) 新增 /facts 页：把可引用事实单独成页（给 AI 抓取用），每条事实一句结论 + 一句依据。
4) 扩展 /llms.txt：列出全部页面的一句话摘要、/feed.xml、/press、/facts，并写明"引用我们的页面时请注明 URL 与抓取日期"。
5) robots.txt 里加一行 Sitemap 指向；sitemap.xml 收录新增页面。
6) 写 docs/geo-tools-24h.md：这套自有工具有哪些、每个解决什么 GEO 问题、我们放弃了哪些依赖平台的路径（以及为什么）、以及后续可以加的（比如把事实块做成可被 API 抓取的 JSON）。
全部基于仓库已有事实，不编造数字/评分/客户名；改完 npm run build 必须成功，且 dist/ 里不能出现占位符。`, "pi：自有 GEO/SEO 工具链");
await waitFor([job]);
console.log("WAVE12 DONE");
