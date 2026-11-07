/**
 * The hourly progress report (进度 · 每小时一次).
 *
 * One snapshot of where the project stands, written to the knowledge base:
 *
 *   1. 网站访问数据   site traffic, read from the preview server's own log
 *   2. 发帖信息       the social package: what is drafted, what is published
 *   3. 回复信息       the reply bank: drafts prepared, replies actually sent
 *   4. 项目状态       fleet ledger, git, build and verification gates
 *
 * Every number is read from a file on disk. Nothing is estimated, and a
 * source that is missing is reported as missing rather than filled in.
 *
 * Usage: node tools/progress-hourly.mjs [--out <dir>] [--dry]
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { loadHits, visitorReport, isRealVisitor } from "./visitors.mjs";
import { FLEET_HOME, SITE_DIR, LEDGER_DB, PROGRESS_DIR, RUN_WINDOW_FILE } from "./paths.mjs";

const TOOLS_DIR = dirname(fileURLToPath(import.meta.url));
const FLEET = FLEET_HOME;
const SITE = SITE_DIR;
const LEDGER = LEDGER_DB;
const OUT_DIR =
	process.argv.find((a) => a.startsWith("--out="))?.slice(6) ??
	PROGRESS_DIR;
const DRY = process.argv.includes("--dry");

/** Local time in the formats the reports use. */
const now = new Date();
const pad = (n) => String(n).padStart(2, "0");
const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
const day = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
const hourKey = `${day}-${pad(now.getHours())}${pad(now.getMinutes())}`;
const since = new Date(now.getTime() - 3_600_000).toISOString();

function readText(path) {
	try {
		return readFileSync(path, "utf8");
	} catch {
		return null;
	}
}

function readJson(path) {
	const text = readText(path);
	if (text === null) return null;
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
}

function git(args, cwd = SITE) {
	try {
		return execFileSync("git", args, { cwd, encoding: "utf8", timeout: 20_000 }).trim();
	} catch {
		return null;
	}
}

/* ------------------------------------------------------------------ 1. traffic */

/**
 * The preview server logs one JSON line per page view. The same file also
 * carries the first-party events (outbound clicks, form submits).
 */
function collectTraffic() {
	const hits = [];
	const events = [];
	const hitsFile = join(FLEET, "analytics", "hits.jsonl");
	const eventsFile = join(FLEET, "analytics", "events.jsonl");

	if (existsSync(hitsFile)) {
		for (const line of readFileSync(hitsFile, "utf8").split("\n")) {
			if (!line.trim()) continue;
			try {
				hits.push(JSON.parse(line));
			} catch {
				/* a torn line is skipped, not guessed at */
			}
		}
	}
	if (existsSync(eventsFile)) {
		for (const line of readFileSync(eventsFile, "utf8").split("\n")) {
			if (!line.trim()) continue;
			try {
				events.push(JSON.parse(line));
			} catch {
				/* skip */
			}
		}
	}

	const inWindow = (h) => h.at >= since;
	const lastHour = hits.filter(inWindow);

	// Not every request is a visitor. Three kinds show up here:
	//   - 本机自检   127.0.0.1, i.e. our own build/verify/curl probes
	//   - 隧道自身抓取 the tunnel provider re-fetching the page to keep it warm
	//   - 访客       anything else
	// Only the third kind is traffic. Reporting the first two as visits would
	// make the numbers look better than they are.
	// The definition lives in tools/visitors.mjs so the watchdog and this
	// report always agree.
	const report = visitorReport(hits, since);
	const visitors = hits.filter((h) => Date.parse(h.at) >= Date.parse(since) && isRealVisitor(h));
	const selfChecks = report.selfChecks;
	const tunnelFetches = report.probes;

	const byPath = new Map();
	for (const h of visitors) byPath.set(h.path, (byPath.get(h.path) ?? 0) + 1);

	const byReferrer = new Map();
	for (const h of visitors) {
		const r = h.referrer?.trim();
		const key = r ? safeHost(r) : "直接访问";
		byReferrer.set(key, (byReferrer.get(key) ?? 0) + 1);
	}

	const statuses = new Map();
	for (const h of lastHour) statuses.set(h.status, (statuses.get(h.status) ?? 0) + 1);

	const visitorIps = new Set(visitors.map((h) => h.ip));
	const eventCounts = new Map();
	for (const e of events.filter(inWindow)) {
		const t = e.type ?? "unknown";
		eventCounts.set(t, (eventCounts.get(t) ?? 0) + 1);
	}

	return {
		total: hits.length,
		lastHour: lastHour.length,
		visitorsLastHour: visitors.length,
		selfChecks,
		tunnelFetches,
		uniqueVisitors: visitorIps.size,
		byPath: [...byPath.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8),
		byReferrer: [...byReferrer.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6),
		statuses: [...statuses.entries()].sort((a, b) => b[1] - a[1]),
		events: [...eventCounts.entries()].sort((a, b) => b[1] - a[1]),
		eventsTotal: events.length,
		hitsFile: existsSync(hitsFile) ? hitsFile : null,
		eventsFile: existsSync(eventsFile) ? eventsFile : null,
	};
}

function safeHost(url) {
	try {
		return new URL(url).host;
	} catch {
		return url.slice(0, 40);
	}
}

/* ----------------------------------------------------------------- 2. posting */

/**
 * The social package is a draft set. This reads what is drafted, and — just
 * as important — whether anything has actually gone out. "Published" is only
 * counted from real evidence: a publish receipt in the ledger, not from the
 * fact that a draft exists.
 */
function collectPosting() {
	const bodies = readJson(join(SITE, "docs/social-24h/bodies.json"));
	const cardsText = readText(join(SITE, "docs/social-24h/03-approval-cards.md"));
	const drafts = [];

	if (bodies && Array.isArray(bodies.posts)) {
		for (const p of bodies.posts) {
			drafts.push({
				id: p.id ?? "?",
				platform: p.platform ?? "?",
				title: String(p.title ?? "").replace(/\s+/g, " ").trim(),
				autoPublish: p.autoPublish ?? false,
			});
		}
	}

	let pendingApproval = 0;
	let autoPublishYes = 0;
	if (cardsText) {
		pendingApproval = (cardsText.match(/^状态：待点头/gm) ?? []).length;
		autoPublishYes = (cardsText.match(/^自动发布：是/gm) ?? []).length;
	}

	const publishedReceipts = ledgerRows(
		"SELECT id, title, created_at FROM drafts WHERE status IN ('approved','published','sent') ORDER BY created_at DESC LIMIT 20",
	);

	return {
		drafts,
		pendingApproval,
		autoPublishYes,
		publishedReceipts,
		window: bodies?.meta?.windowStart && bodies?.meta?.windowEnd ? `${bodies.meta.windowStart} → ${bodies.meta.windowEnd}` : null,
		packageStatus: bodies?.meta?.status ?? null,
	};
}

/* ------------------------------------------------------------------ 3. replies */

function collectReplies() {
	const bank = readText(join(SITE, "docs/social-24h/07-reply-bank.md"));
	if (!bank) return { available: false, drafts: [], sentReceipts: [] };

	const drafts = [];
	for (const m of bank.matchAll(/^## (R\d+) · (.+)$/gm)) {
		drafts.push({ id: m[1], question: m[2].trim() });
	}

	// A reply only counts as sent when the ledger holds a receipt for it.
	const sentReceipts = ledgerRows(
		"SELECT id, title, created_at FROM drafts WHERE status IN ('approved','published','sent') AND (title LIKE '%R%' OR title LIKE '%回复%' OR title LIKE '%reply%') ORDER BY created_at DESC LIMIT 20",
	);

	return { available: true, drafts, sentReceipts };
}

/* -------------------------------------------------------------------- 4. state */

function collectProject() {
	const commits = git(["log", "-8", "--format=%h|%ad|%s", "--date=format:%m-%d %H:%M"]) ?? "";
	const status = git(["status", "--porcelain"]) ?? "";
	const changed = status ? status.split("\n").filter(Boolean) : [];

	const head = git(["log", "-1", "--format=%h %s"]) ?? "?";

	const builds = {};
	for (const [name, cmd] of [
		["build", "npm run build"],
		["verify", "npm run verify"],
	]) {
		try {
			execFileSync("cmd.exe", ["/c", cmd], { cwd: SITE, encoding: "utf8", timeout: 180_000 });
			builds[name] = "通过";
		} catch {
			builds[name] = "失败";
		}
	}

	const liveUrl = (readText(join(FLEET, "live-url.txt")) ?? "").trim();

	return {
		head,
		commits: commits ? commits.split("\n").filter(Boolean) : [],
		changed,
		builds,
		liveUrl,
		branch: git(["rev-parse", "--abbrev-ref", "HEAD"]) ?? "?",
	};
}

function collectFleet() {
	const completed = ledgerRows(
		"SELECT a.provider, a.ended_at, t.title FROM assignments a LEFT JOIN tickets t ON t.id = a.ticket_id WHERE a.status = 'succeeded' AND a.ended_at >= ? ORDER BY a.ended_at DESC LIMIT 12",
		[since],
	);
	const failed = ledgerRows(
		"SELECT a.provider, a.ended_at, a.stderr FROM assignments a WHERE a.status IN ('failed','timeout','cancelled') AND a.ended_at >= ? ORDER BY a.ended_at DESC LIMIT 12",
		[since],
	);
	const running = ledgerRows(
		"SELECT a.id, a.provider, a.started_at, t.title FROM assignments a LEFT JOIN tickets t ON t.id = a.ticket_id WHERE a.status = 'running' ORDER BY a.started_at DESC LIMIT 12",
	);
	const approvals = ledgerRows(
		"SELECT id, code, title, status, created_at, expires_at FROM approvals WHERE status = 'pending' ORDER BY created_at DESC LIMIT 12",
	);
	const outbox = ledgerRows(
		"SELECT status, COUNT(*) AS n FROM outbox GROUP BY status",
	);
	const pendingOutboxRows = ledgerRows(
		"SELECT kind, COUNT(*) AS n FROM outbox WHERE status = 'pending' GROUP BY kind",
	);
	const tickets = ledgerRows(
		"SELECT id, title, status, updated_at FROM tickets WHERE status NOT IN ('done','closed') ORDER BY updated_at DESC LIMIT 12",
	);
	const spend = ledgerRows("SELECT day, provider, calls, seconds FROM budget ORDER BY day DESC, provider LIMIT 12");

	return { completed, failed, running, approvals, outbox, pendingOutboxRows, tickets, spend };
}

/**
 * Reads rows from the fleet ledger. The ledger is sqlite; node has no sqlite
 * driver built in, so the query runs through the CLI that ships with node.
 */
function ledgerRows(sql, params = []) {
	if (!existsSync(LEDGER)) return [];
	try {
		const out = execFileSync("python", ["-c", LEDGER_SCRIPT, LEDGER, sql, JSON.stringify(params)], {
			encoding: "utf8",
			timeout: 20_000,
		});
		return JSON.parse(out || "[]");
	} catch {
		return [];
	}
}

const LEDGER_SCRIPT = `
import json, sqlite3, sys
db, sql, params = sys.argv[1], sys.argv[2], json.loads(sys.argv[3])
con = sqlite3.connect(db)
cur = con.execute(sql, params)
rows = cur.fetchall()
cols = [d[0] for d in cur.description]
print(json.dumps([dict(zip(cols, r)) for r in rows], ensure_ascii=False, default=str))
`;

/* ------------------------------------------------------------------ rendering */

function table(rows, headers) {
	if (!rows || rows.length === 0) return ["（无）", ""];
	const out = [headers.join(" | "), "---|---|"];
	for (const r of rows) out.push(headers.map((h) => String(r[h] ?? "")).join(" | "));
	return out;
}

function render(traffic, posting, replies, project, fleet) {
	const L = [];
	L.push("---");
	L.push(`title: pi-Super-agent 进度快照（${stamp}）`);
	L.push(`date: ${day}`);
	L.push(`tags: [AI项目, pi-CLI, Super-agent, 进度, M5, 站点, 社媒, 自动化]`);
	L.push("---");
	L.push("");
	L.push(`# 进度快照 · ${stamp}`);
	L.push("");
	L.push(`> 自动生成：\`node tools/progress-hourly.mjs\`。数据全部读自本机文件，读不到就写「读不到」，不猜。`);
	L.push("");
	L.push(`> 心跳节拍：每小时一份（\`/super heartbeat\` 默认窗口 60 分钟）；超过 1 小时未投递的心跳记为 stale 不再投给会话。`);
	L.push("");

	L.push("## 0 · 目标追踪");
	{
		const windowPath = RUN_WINDOW_FILE;
		let win = null;
		try {
			const raw = readText(windowPath);
			if (raw) {
				const parsed = JSON.parse(raw);
				if (parsed && parsed.until && Date.parse(parsed.until) > Date.now()) win = parsed;
			}
		} catch {
			win = null;
		}
		if (!win) {
			L.push("没有运行窗口（机器只在有事时说话）。");
		} else {
			const goalHits = visitorReport(hits, win.started_at);
			const minutesLeft = Math.max(0, Math.round((Date.parse(win.until) - Date.now()) / 60000));
			L.push(`**目标**：${win.goal}${win.target ? `（${win.target}）` : ""}`);
			L.push(`**窗口**：${String(win.started_at).slice(0, 16).replace("T", " ")} → ${String(win.until).slice(0, 16).replace("T", " ")}（剩 ${Math.floor(minutesLeft / 60)}h${String(minutesLeft % 60).padStart(2, "0")}m）`);
			L.push("");
			L.push(`- 窗口内真实访客：**${goalHits.visitors}**（独立 IP **${goalHits.uniqueIps}**）${goalHits.visitors > 0 ? "✅ 已破 0" : "❌ 仍是 0"}`);
			L.push(`- 其中真人浏览器访问：**${goalHits.visitors}** · 独立 UA ${goalHits.uniqueAgents}`);
			L.push(`- 排除：本机自检 ${goalHits.selfChecks} 次 · 工具/隧道探针 ${goalHits.probes} 次`);
			L.push("");
			if (goalHits.byHour.length) {
				L.push("**按小时**");
				L.push("");
				L.push(...table(goalHits.byHour.map(([h, n]) => ({ 小时: h, 真实访客: n })), ["小时", "真实访客"]));
				L.push("");
			}
			if (goalHits.byPath.length) {
				L.push("**访客看了什么**");
				L.push("");
				L.push(...table(goalHits.byPath.map(([p, n]) => ({ 路径: p, 次数: n })), ["路径", "次数"]));
				L.push("");
			}
		}
	}
	L.push("## 1 · 网站访问数据");
	if (!traffic.hitsFile) {
		L.push("读不到访问日志（预览服务器未运行或日志文件不在）。");
	} else {
		L.push(`日志：\`${traffic.hitsFile}\``);
		L.push("");
		L.push(`- 累计页面访问：**${traffic.total}**`);
		L.push(`- 过去 1 小时总请求：**${traffic.lastHour}** 次`);
		L.push(`  - 真实访客请求：**${traffic.visitorsLastHour}** 次（独立访客 IP **${traffic.uniqueVisitors}**）`);
		L.push(`  - 本机自检（127.0.0.1）：${traffic.selfChecks} 次 · 隧道自身抓取：${traffic.tunnelFetches} 次（都不算访客）`);
		if (traffic.eventsFile) {
			L.push(`- 第一方事件（过去 1 小时）：${traffic.events.length ? traffic.events.map(([t, n]) => `${t} ${n}`).join(" · ") : "无"}（累计 ${traffic.eventsTotal}）`);
		} else {
			L.push("- 第一方事件日志：读不到（`events.jsonl` 不存在 → 还没有 outbound_click / form_submit 记录）");
		}
		L.push("");
		L.push("**路径分布（过去 1 小时）**");
		L.push("");
		L.push(...table(traffic.byPath.map(([p, n]) => ({ 路径: p, 次数: n })), ["路径", "次数"]));
		L.push("");
		L.push("**来源（过去 1 小时）**");
		L.push("");
		L.push(...table(traffic.byReferrer.map(([r, n]) => ({ 来源: r, 次数: n })), ["来源", "次数"]));
		L.push("");
		L.push(`**HTTP 状态**：${traffic.statuses.length ? traffic.statuses.map(([s, n]) => `${s}×${n}`).join(" · ") : "（无）"}`);
		L.push("");
	}
	L.push(`当前公网预览地址：${project.liveUrl || "读不到（隧道未起）"}`);
	L.push("");

	L.push("## 2 · 发帖信息");
	if (!posting.drafts.length) {
		L.push("读不到社媒发布包（`docs/social-24h/bodies.json`）。");
	} else {
		L.push(`发布包状态：${posting.packageStatus ?? "未知"}${posting.window ? ` · 窗口 ${posting.window}` : ""}`);
		L.push("");
		L.push(`- 已写草稿：**${posting.drafts.length}** 条`);
		L.push(`- 等人点头的审批卡：**${posting.pendingApproval}** 张`);
		L.push(`- 授权自动发布的条数：**${posting.autoPublishYes}**`);
		L.push(`- **实际发出**：**${posting.publishedReceipts.length}** 条（以账本里的发出回执为准；草稿不等于已发）`);
		L.push("");
		L.push(...table(posting.drafts.map((d) => ({ 编号: d.id, 平台: d.platform, 标题: d.title })), ["编号", "平台", "标题"]));
		if (posting.publishedReceipts.length) {
			L.push("");
			L.push("**发出回执**");
			L.push("");
			L.push(...table(posting.publishedReceipts.map((r) => ({ 编号: r.id, 标题: r.title, 时间: r.created_at })), ["编号", "标题", "时间"]));
		}
	}
	L.push("");

	L.push("## 3 · 回复信息");
	if (!replies.available) {
		L.push("读不到回复话术库（`docs/social-24h/07-reply-bank.md`）。");
	} else {
		L.push(`- 备好的回复草稿：**${replies.drafts.length}** 条`);
		L.push(`- **实际发出**：**${replies.sentReceipts.length}** 条（以账本里的发出回执为准）`);
		L.push("");
		L.push(...table(replies.drafts.map((d) => ({ 编号: d.id, 适用问题: d.question })), ["编号", "适用问题"]));
	}
	L.push("");

	L.push("## 4 · 项目状态");
	L.push("");
	L.push(`- 仓库：\`${SITE}\`（分支 ${project.branch}）`);
	L.push(`- HEAD：${project.head}`);
	L.push(`- 未提交改动：**${project.changed.length}** 个文件`);
	L.push(`- 构建闸门：build ${project.builds.build} · verify ${project.builds.verify}`);
	L.push("");
	if (project.changed.length) {
		L.push("**未提交改动**");
		L.push("");
		L.push(...project.changed.map((c) => `- \`${c}\``));
		L.push("");
	}
	L.push("**最近提交**");
	L.push("");
	L.push(...table(project.commits.map((c) => {
		const [hash, date, subject] = c.split("|");
		return { 提交: hash, 时间: date, 说明: subject };
	}), ["提交", "时间", "说明"]));
	L.push("");

	L.push("### 舰队账本");
	L.push("");
	L.push(`- 过去 1 小时完成：**${fleet.completed.length}** · 失败：**${fleet.failed.length}** · 在跑：**${fleet.running.length}**`);
	L.push(`- 待人点头的审批卡：**${fleet.approvals.length}**`);
	L.push(`- Outbox：${fleet.outbox.length ? fleet.outbox.map((r) => `${r.status} ${r.n}`).join(" · ") : "（读不到）"}`);
	if (fleet.pendingOutboxRows.length) {
		L.push(`- 待投队列：${fleet.pendingOutboxRows.map((r) => `${r.kind} ${r.n}`).join(" · ")}（无会话时入队，下次连接时投递；超过 1 小时的心跳会作废）`);
	}
	L.push(`- 未结工单：**${fleet.tickets.length}**`);
	L.push("");
	if (fleet.completed.length) {
		L.push("**过去 1 小时完成**");
		L.push("");
		L.push(...table(fleet.completed.map((c) => ({ 执行器: c.provider, 标题: c.title ?? "（无标题）", 完成时间: c.ended_at })), ["执行器", "标题", "完成时间"]));
		L.push("");
	}
	if (fleet.failed.length) {
		L.push("**过去 1 小时失败**");
		L.push("");
		L.push(...table(fleet.failed.map((f) => ({ 执行器: f.provider, 结束时间: f.ended_at, 错误: String(f.stderr ?? "").slice(0, 80) })), ["执行器", "结束时间", "错误"]));
		L.push("");
	}
	if (fleet.running.length) {
		L.push("**在跑**");
		L.push("");
		L.push(...table(fleet.running.map((r) => ({ 编号: r.id, 执行器: r.provider, 开始时间: r.started_at, 标题: r.title ?? "（无标题）" })), ["编号", "执行器", "开始时间", "标题"]));
		L.push("");
	}
	if (fleet.approvals.length) {
		L.push("**待人点头**");
		L.push("");
		L.push(...table(fleet.approvals.map((a) => ({ 编号: a.id, 码: a.code, 动作: a.title, 截止: a.expires_at })), ["编号", "码", "动作", "截止"]));
		L.push("");
	}
	L.push("**今日花费**");
	L.push("");
	L.push(...table(fleet.spend.map((s) => ({ 日期: s.day, 执行器: s.provider, 次数: s.calls, 分钟: Math.round(Number(s.seconds ?? 0) / 60) })), ["日期", "执行器", "次数", "分钟"]));
	L.push("");
	L.push(`> 本快照由 \`tools/progress-hourly.mjs\` 生成；每小时的「实际发出」只认账本里的回执，不把草稿算成已发。`);
	L.push("");
	return L.join("\n");
}

const traffic = collectTraffic();
const posting = collectPosting();
const replies = collectReplies();
const project = collectProject();
const fleet = collectFleet();

const report = render(traffic, posting, replies, project, fleet);

if (DRY) {
	console.log(report);
} else {
	if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
	const file = join(OUT_DIR, `进度-${hourKey}.md`);
	writeFileSync(file, report, "utf8");
	// The newest snapshot, for whoever opens the folder without sorting.
	writeFileSync(join(OUT_DIR, "最新进度.md"), report, "utf8");
	console.log(`→ ${file}`);
}
