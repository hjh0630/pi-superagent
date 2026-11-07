/**
 * The 12-hour report (决策通道).
 *
 * Reads the ledger and writes the report a human should see twice a day:
 * what moved, what it cost, what needs a decision, and what the next window
 * should be. Costs one model call only when a plan has to be proposed; the
 * snapshot itself is free.
 *
 * Usage: node tools/report-12h.mjs [--plan "下一步建议"]
 */

import { writeFileSync } from "node:fs";
import { LEDGER_DIR } from "./paths.mjs";
import { homedir } from "node:os";
import { join } from "node:path";
import { getDb, nowIso } from "../store/db.ts";
import { enqueueOutbox } from "../store/ledger.ts";
import { pendingApprovals, listApprovals } from "../store/approvals.ts";
import { listPlans } from "../store/ledger.ts";
import { budgetFor } from "../store/catalog.ts";
import { providers } from "../providers/registry.ts";
import { panel } from "../store/panel.ts";

const HOURS = 12;
const since = new Date(Date.now() - HOURS * 3_600_000).toISOString();
const db = getDb();

/** A human-readable label: ticket title, else the actual instruction (after the role brief). */
function label(task, title) {
	if (title && title.trim()) return title.trim();
	const text = task ?? "";
	const after = text.split(/---/).pop() ?? text;
	const line = after.split("\n").map((l) => l.trim()).filter(Boolean).find((l) => l.length > 12) ?? "";
	return line.slice(0, 90);
}

const done = db
	.prepare(
		`SELECT a.provider, a.task, a.ended_at, t.title FROM assignments a
		 LEFT JOIN tickets t ON t.id = a.ticket_id
		 WHERE a.status = 'succeeded' AND a.ended_at >= ? ORDER BY a.ended_at DESC LIMIT 20`,
	)
	.all(since);
const failed = db
	.prepare(
		`SELECT a.provider, a.task, a.ended_at, a.stderr FROM assignments a
		 WHERE a.status IN ('failed','timeout','cancelled') AND a.ended_at >= ? ORDER BY a.ended_at DESC LIMIT 20`,
	)
	.all(since);
const spend = providers.map((p) => budgetFor(p.id));
const approvals = pendingApprovals();
const plans = listPlans(10).filter((p) => p.status === "awaiting_approval" || p.status === "running");
const snap = panel();

const planArg = process.argv.find((a) => a.startsWith("--plan="))?.slice(7);

const lines = [
	`# 12 小时报告 · ${nowIso().slice(0, 16).replace("T", " ")}`,
	``,
	`窗口：过去 ${HOURS} 小时`,
	``,
	`## 完成（${done.length}）`,
	...done.map((d) => `- ✅ ${d.provider} · ${label(d.task, d.title)}`),
	done.length ? `` : `- （无）`,
	`## 失败（${failed.length}）`,
	...failed.map((f) => `- ⛔ ${f.provider} · ${label(f.task, null)}`),
	failed.length ? `` : `- （无）`,
	`## 需要你决策（${approvals.length}）`,
	...approvals.map((a) => `- 🔔 ${a.id}（${a.code}）· ${a.title} · 截止 ${a.expires_at.slice(11, 16)}`),
	approvals.length ? `` : `- （无）`,
	`## 在跑（${snap.running.length}）`,
	...snap.running.slice(0, 8).map((r) => `- 🔄 ${r.provider} · ${r.minutes}min · ${label(r.label, null)}`),
	``,
	`## 今日花费`,
	`| provider | calls | 上限 | 分钟 | 上限 |`,
	`|---|---|---|---|---|`,
	...spend.map((s) => `| ${s.provider} | ${s.calls} | ${s.maxCalls} | ${Math.round(s.seconds / 60)} | ${s.maxMinutes} |`),
	``,
	`## 计划窗口（${plans.length}）`,
	...plans.map((p) => `- ${p.id} · ${p.status} · ${p.title}（${p.steps.length} 步）`),
	``,
	`## 下 12 小时计划`,
	planArg
		? planArg
		: `- （无自动建议：请运行 /super plan 或给 --plan="..." ）`,
	``,
	`> 本报告由 tools/report-12h.mjs 从账本生成；缺失数据报失败，不用旧数据凑数。`,
];

const report = lines.join("\n");
const dir = LEDGER_DIR;
writeFileSync(join(dir, `report-12h-${nowIso().slice(0, 10)}-${nowIso().slice(11, 13)}.md`), report, "utf8");
writeFileSync(join(dir, "report-12h.md"), report, "utf8");

// queue it for the next session (the outbox is the delivery channel)
enqueueOutbox("decision", "summary", report.slice(0, 4000));

console.log(report);
console.log(`\n→ ${join(dir, "report-12h.md")}`);
