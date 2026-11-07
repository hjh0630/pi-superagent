const TOOLS_DIR = process.env.PI_TOOLS_DIR || join(homedir(), ".pi", "agent", "packages", "pi-superagent", "tools");
import { homedir } from "node:os";
import { join } from "node:path";
/**
 * M5 wave 5 — 让评审只看证据包（不再逐行翻仓库），然后五步验收。
 *
 * 本轮只用 pi（MiniMax）：PI_FLEET_ONLY_PROVIDER=pi。
 * 用法：node tools/m5-wave5.mjs
 */

import { execFileSync } from "node:child_process";
import { dispatch } from "../store/runner.ts";
import { readJob } from "../store/jobs.ts";
import { resolveExecutor, composeTask } from "../store/roles.ts";
import { runPipeline, formatRun } from "../store/pipeline.ts";

process.env.PI_FLEET_ONLY_PROVIDER = "pi";

const CWD = process.env.SITE_DIR || join(homedir(), "site-m5");
const EVIDENCE = `${CWD}/docs/verify-evidence.md`;

// 1) 重新采集证据包（机器跑，不让模型自己翻仓库）
execFileSync(process.execPath, [join(TOOLS_DIR, "m5-evidence.mjs"), CWD], {
	encoding: "utf8",
	stdio: ["ignore", "ignore", "inherit"],
});
console.log("证据包已更新");

const role = resolveExecutor("review");
console.log(`▶ pi 评审（只看证据包）｜${role.executor}`);
const outcome = await dispatch({
	provider: role.executor,
	task: composeTask(
		role,
		`你在做发布前评审。**不要去翻仓库**，只依据下面这份机器采集的证据包判断。
证据包（docs/verify-evidence.md）：
${EVIDENCE}

背景：这是给美国拉斯维加斯本地家庭维修承包商做"Google Maps 可见度优化"的服务站。上一轮评审提出 6 个必须先修的问题：
1) 城市页各自声明了一家 LocalBusiness（虚假门店）2) 把品牌写成持牌派工网络 + 编造价格与"Top-rated" + 引用了加州的 Title 24 法规 3) JSON-LD 钉了占位坐标与营业时间 4) 关键词文档里写了可直接粘贴的虚假业主答复与完工帖 5) 分享图带中文占位 6) 面包屑中间层指向错误 URL。

请逐条核对证据包，判断这 6 项是否已修好，并指出**还有哪些必须先修**（只说阻塞发布的问题；不要提风格偏好）。
最后给出一句结论：要么"可以合并"，要么"不能合并，必须先修 N 项"。
把结论写进 ${CWD}/docs/review-wave4.md（纯文本结论 + 逐条判定）。`,
	),
	cwd: CWD,
	background: true,
	dedupe: false,
	timeoutMs: 2_700_000,
});
console.log(`  job ${outcome.jobId}`);

const deadline = Date.now() + 2_800_000;
while (Date.now() < deadline) {
	const job = readJob(outcome.jobId);
	if (job && job.status !== "running" && job.status !== "queued") {
		console.log(`  ✓ ${job.status} ${job.durationMs}ms`);
		console.log((job.output || job.stderr || "").slice(0, 1500));
		break;
	}
	await new Promise((r) => setTimeout(r, 5000));
}

const verification = await runPipeline({
	cwd: CWD,
	ticketId: "tk-20261103-103815-UBS0",
	checks: ["npm run build"],
	reviewRounds: 1,
	reviewer: "pi",
	reviewEvidenceFile: EVIDENCE,
	mergeCommand: "git merge -m \"M5 wave 5\" main",
	verifyCommand: "npm run build",
	dryRun: false,
});
console.log(`=== 五步验收 ${verification.run.id} → ${verification.run.status} ===`);
console.log(formatRun(verification.run));
console.log(`审批卡：${verification.approvals.join(", ") || "无"}`);
console.log("WAVE5 DONE");
