import { homedir } from "node:os";
/**
 * M1 smoke test: background dispatch -> ledger -> outbox -> session wake.
 *
 * Runs the real dispatch engine against the real `pi` provider (a second pi
 * runtime on the same machine). Nothing here is mocked except the session
 * runtime, which is replaced by a recorder so the wake-up can be observed.
 *
 * Usage: node tools/m1-smoke.mjs
 */

import { dispatch } from "../store/runner.ts";
import { readJob, listJobs } from "../store/jobs.ts";
import { getDb } from "../store/db.ts";
import { approvePlanAndDispatch } from "../store/plans.ts";
import { createPlan, getPlan, listPlans } from "../store/ledger.ts";
import { bindRuntime, flushOutbox } from "../runtime.ts";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const delivered = [];
bindRuntime({
	sendMessage(message, options) {
		delivered.push({ customType: message.customType, text: message.content?.[0]?.text ?? "", triggerTurn: options?.triggerTurn });
	},
});

function step(name) {
	console.log(`\n=== ${name} ===`);
}

step("1. 后台派单（provider=pi）");
const task = "只回答四个字符：灯塔 OK";
const first = await dispatch({
	provider: "pi",
	task,
	cwd: process.env.FLEET_CWD || homedir(),
	background: true,
	dedupe: false,
});
console.log("dispatched:", first);

step("2. 幂等：同一个任务再派一次");
const again = await dispatch({
	provider: "pi",
	task,
	cwd: process.env.FLEET_CWD || homedir(),
	background: true,
	dedupe: true,
});
console.log("second:", again);
console.log(again.jobId === first.jobId && again.deduped ? "PASS 命中幂等键" : "FAIL 没有命中幂等键");

step("3. 等后台 job 结束");
let job;
for (let i = 0; i < 120; i++) {
	await sleep(1000);
	job = readJob(first.jobId);
	if (job && job.status !== "queued" && job.status !== "running") break;
}
console.log("final status:", job?.status, "exit:", job?.exitCode, "ms:", job?.durationMs);
console.log("output:", (job?.output ?? "").slice(0, 300));

step("4. 账本");
const db = getDb();
console.log("assignments:", db.prepare("SELECT id, provider, status, duration_ms FROM assignments ORDER BY started_at DESC LIMIT 3").all());
console.log("reports:", db.prepare("SELECT id, status, impact FROM reports ORDER BY created_at DESC LIMIT 3").all());
console.log("events:", db.prepare("SELECT kind FROM events ORDER BY id DESC LIMIT 6").all().map((r) => r.kind).join(" → "));
console.log("outbox pending:", db.prepare("SELECT COUNT(*) AS n FROM outbox WHERE status='pending'").get());

step("5. 会话唤醒（outbox 投递）");
const sent = flushOutbox();
console.log("delivered:", sent);
for (const d of delivered) console.log(`  [${d.customType}] triggerTurn=${d.triggerTurn} ${d.text.slice(0, 120).replace(/\n/g, " / ")}`);
console.log("outbox pending after flush:", db.prepare("SELECT COUNT(*) AS n FROM outbox WHERE status='pending'").get());

step("6. 12h 计划窗口（人批准后派发）");
const plan = createPlan({
	title: "M1 冒烟：写一首两行的诗",
	summary: "验证计划窗口→批准→后台派发",
	windowHours: 12,
	steps: [
		{
			id: "s1",
			title: "写诗",
			task: "写两行中文诗，第一行包含“灯塔”，只输出诗本身。",
			tag: "general",
			acceptance: "输出恰好两行中文",
		},
	],
});
console.log("plan:", plan.id, plan.status, "window:", plan.window_start, "→", plan.window_end);

const approved = await approvePlanAndDispatch(plan.id, { cwd: process.env.FLEET_CWD || homedir() });
console.log("approved:", approved.plan.status, "dispatched:", approved.dispatched, "failed:", approved.failed);

step("7. 计划状态");
for (let i = 0; i < 120; i++) {
	await sleep(1000);
	const p = getPlan(plan.id);
	if (p?.status === "done") break;
}
console.log("plans:", listPlans(5).map((p) => `${p.id} ${p.status} ${p.steps.length}步`).join(" | "));
console.log("jobs:", listJobs(5).map((j) => `${j.id} ${j.provider} ${j.status}`).join(" | "));
console.log("plan detail:", JSON.stringify(getPlan(plan.id)?.steps, null, 1));
console.log("\nDONE");
