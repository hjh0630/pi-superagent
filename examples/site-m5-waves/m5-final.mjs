const TOOLS_DIR = process.env.PI_TOOLS_DIR || join(homedir(), ".pi", "agent", "packages", "pi-superagent", "tools");
import { homedir } from "node:os";
import { join } from "node:path";
/**
 * M5 收官：重采证据 → pi 终审（严格只看证据包）→ 五步验收。
 * 用法：node tools/m5-final.mjs
 */
import { execFileSync } from "node:child_process";
import { dispatch } from "../store/runner.ts";
import { readJob } from "../store/jobs.ts";
import { resolveExecutor, composeTask } from "../store/roles.ts";
import { runPipeline, formatRun } from "../store/pipeline.ts";

process.env.PI_FLEET_ONLY_PROVIDER = "pi";
const CWD = process.env.SITE_DIR || join(homedir(), "site-m5");
const EVIDENCE = `${CWD}/docs/verify-evidence.md`;
execFileSync(process.execPath, [join(TOOLS_DIR, "m5-evidence.mjs"), CWD], { encoding: "utf8", stdio: ["ignore", "ignore", "inherit"] });
console.log("证据包已更新");

const role = resolveExecutor("review");
const outcome = await dispatch({
	provider: role.executor,
	task: composeTask(role, `发布前终审。**不要翻仓库、不要跑命令**，只依据下面这份机器采集的证据包判断。\n${EVIDENCE}\n\n判定口径：A 代码/内容必须先修项（逐条列并给定位；没有就写"代码层面无阻塞项"）· B 上线闸门（NAP 占位，人工事项）· C 最终结论（"可以合并"或"不能合并，必须先修 N 项"）。把结论写进 ${CWD}/docs/review-final.md。`),
	cwd: CWD,
	background: true,
	dedupe: false,
	timeoutMs: 1_800_000,
});
console.log(`  job ${outcome.jobId}`);
const deadline = Date.now() + 1_900_000;
while (Date.now() < deadline) {
	const job = readJob(outcome.jobId);
	if (job && job.status !== "running" && job.status !== "queued") {
		console.log(`  ✓ ${job.status} ${job.durationMs}ms`);
		console.log((job.output || "").slice(0, 900));
		break;
	}
	await new Promise((r) => setTimeout(r, 4000));
}

const verification = await runPipeline({
	cwd: CWD,
	ticketId: "tk-20261103-103815-UBS0",
	checks: ["npm run build"],
	reviewRounds: 1,
	reviewer: "pi",
	reviewEvidenceFile: EVIDENCE,
	mergeCommand: "git merge -m \"M5 final\" main",
	verifyCommand: "npm run build",
	dryRun: false,
});
console.log(`=== 五步验收 ${verification.run.id} → ${verification.run.status} ===`);
console.log(formatRun(verification.run));
console.log(`审批卡：${verification.approvals.join(", ") || "无"}`);
console.log("FINAL DONE");
