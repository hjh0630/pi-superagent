import { homedir } from "node:os";
import { join } from "node:path";
/**
 * M3 smoke test: the five-step acceptance pipeline.
 *
 * Step 1 runs on the real fleet-demo repo with the real `pi` reviewer; the
 * irreversible steps are recorded, not executed (dry run), then a second run
 * shows what happens when they are not dry: approval cards, nothing executed.
 *
 * Usage: node tools/m3-smoke.mjs
 */

import { runPipeline, getRun, formatRun } from "../store/pipeline.ts";
import { listApprovals, decideApproval } from "../store/approvals.ts";

const REPO = process.env.FLEET_CWD || join(homedir(), "fleet-demo");
let failures = 0;
function check(name, ok, extra = "") {
	if (!ok) failures++;
	console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? ` — ${extra}` : ""}`);
}

console.log("=== 1. dry-run 五步验收 ===");
const dry = await runPipeline({
	cwd: REPO,
	checks: ["git rev-parse --abbrev-ref HEAD", "git status --short"],
	reviewRounds: 1,
	reviewer: "pi",
	mergeCommand: "git merge main",
	publishCommand: "npm publish",
	verifyCommand: "git log --oneline -1",
	dryRun: true,
});
console.log(dry.report);

const steps = Object.fromEntries(dry.run.steps.map((s) => [s.name, s]));
check("五个步骤都在", dry.run.steps.length === 5, dry.run.steps.map((s) => s.name).join("→"));
check("审查有证据", steps.review.rounds.length >= 1 && steps.review.rounds[0].ok, steps.review.rounds[0]?.action);
check("审查轮数 ≤3", steps.review.rounds.length <= 3);
check("检查跑了两条命令", steps.check.rounds.length === 2 && steps.check.rounds.every((r) => r.ok));
check("合并只记录不执行", steps.merge.status === "planned" && steps.merge.rounds[0].evidence.dryRun === true);
check("发布只记录不执行", steps.publish.status === "planned");
check("核实有证据", steps.verify.status === "done" && steps.verify.rounds[0].evidence.exitCode === 0, String(steps.verify.rounds[0]?.evidence.outputTail ?? "").slice(0, 60));
check("dry-run 不产生审批卡", dry.approvals.length === 0);
check("run 状态 done", dry.run.status === "done", dry.run.status);

console.log("\n=== 2. 非 dry-run：L3 步骤只落卡不执行 ===");
const real = await runPipeline({
	cwd: REPO,
	checks: ["git rev-parse --abbrev-ref HEAD"],
	reviewRounds: 1,
	reviewer: "pi",
	mergeCommand: "git merge feature-x",
	publishCommand: "npm publish --dry-run",
	dryRun: false,
});
console.log(real.report);
const realSteps = Object.fromEntries(real.run.steps.map((s) => [s.name, s]));
check("合并被拦（blocked）", realSteps.merge.status === "blocked", String(realSteps.merge.rounds[0]?.evidence.approvalId));
check("发布被拦（blocked）", realSteps.publish.status === "blocked");
check("两张审批卡", real.approvals.length === 2, real.approvals.join(", "));
check("run 状态 blocked", real.run.status === "blocked");

for (const id of real.approvals) {
	const card = listApprovals(20).find((a) => a.id === id);
	check(`卡 ${id} 记录了命令`, Boolean(card?.tool_name === "bash" && String(card?.args_json).includes("command")), card?.title ?? "");
	const decision = decideApproval(id, "allow_once", "test");
	check(`卡 ${id} 可批准`, decision.ok, decision.reason ?? "");
}

console.log("\n=== 3. 报告可读 ===");
const reloaded = getRun(real.run.id);
console.log(formatRun(reloaded).split("\n").slice(0, 4).join("\n"));
check("run 可从账本读回", reloaded?.id === real.run.id);

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURES`}`);
process.exit(failures === 0 ? 0 : 1);
