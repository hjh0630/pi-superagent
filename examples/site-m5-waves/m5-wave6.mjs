const TOOLS_DIR = process.env.PI_TOOLS_DIR || join(homedir(), ".pi", "agent", "packages", "pi-superagent", "tools");
import { homedir } from "node:os";
import { join } from "node:path";
/**
 * M5 wave 6 — 收尾：修最后一处文档无出处声明 → 重采证据 → pi 评审 → 五步验收。
 *
 * 本轮只用 pi（MiniMax）：PI_FLEET_ONLY_PROVIDER=pi。
 * 用法：node tools/m5-wave6.mjs
 */

import { execFileSync } from "node:child_process";
import { dispatch } from "../store/runner.ts";
import { readJob } from "../store/jobs.ts";
import { resolveExecutor, composeTask } from "../store/roles.ts";
import { runPipeline, formatRun } from "../store/pipeline.ts";

process.env.PI_FLEET_ONLY_PROVIDER = "pi";

const CWD = process.env.SITE_DIR || join(homedir(), "site-m5");
const EVIDENCE = `${CWD}/docs/verify-evidence.md`;
const TOOLS = join(TOOLS_DIR, "m5-evidence.mjs");

const collect = () =>
	execFileSync(process.execPath, [TOOLS, CWD], { encoding: "utf8", stdio: ["ignore", "ignore", "inherit"] });

async function run(roleId, task, label) {
	const role = resolveExecutor(roleId);
	console.log(`▶ ${label}｜${role.label}（${role.executor}）`);
	const outcome = await dispatch({
		provider: role.executor,
		task: composeTask(role, task),
		cwd: CWD,
		background: true,
		dedupe: false,
		timeoutMs: 2_700_000,
	});
	console.log(`  job ${outcome.jobId}`);
	return outcome.jobId;
}

async function waitFor(jobIds, timeoutMs = 2_800_000) {
	const deadline = Date.now() + timeoutMs;
	const pending = new Set(jobIds);
	while (pending.size && Date.now() < deadline) {
		for (const id of [...pending]) {
			const job = readJob(id);
			if (!job || (job.status !== "running" && job.status !== "queued")) {
				pending.delete(id);
				console.log(`  ✓ ${id} → ${job?.status} ${job?.durationMs ?? ""}ms`);
			}
		}
		if (!pending.size) break;
		await new Promise((r) => setTimeout(r, 4000));
	}
}

// 1) 修最后一处：文档里带无出处评分的 meta 模板
const fixJob = await run(
	"frontend",
	`在 ${CWD} 修最后一处：docs/keyword-map-lasvegas.md 里有一个 meta description 模板用了 "Top-rated"（无出处的评分声明）。
要求：把该模板改成不带任何评分词、排名承诺或无出处数字的写法（例如 "HVAC contractors in Henderson, NV: AC repair, slab leaks, water heaters & electrical work throughout Henderson." 这种事实陈述），并检查同一文件（以及 docs/page-plan.md、docs/site-blueprint.md、docs/seo-geo-requirements.md）里其它 meta description / 标题模板是否有同类无出处声明（评分、第一、保证、百分比、固定价格），有就一并改成事实陈述。
不要改站点代码、不要改品牌名与口号、不要动 docs/review-*.md（那是评审记录）。完成后把你改了哪几行贴出来。`,
	"pi 修文档里的无出处声明",
);
await waitFor([fixJob]);

// 2) 重采证据 → pi 只判证据
collect();
const reviewJob = await run(
	"review",
	`你在做发布前评审。**不要翻仓库**，只依据下面这份机器采集的证据包判断：
${EVIDENCE}

判定标准（三件事分开说，别混）：
A. **代码/内容是否还有必须先修的问题**（虚假门店、编造声明与数字、错误的结构化数据、缺 meta/canonical、面包屑错、分享图占位、TODO 残留等）→ 有就逐条列出；没有就明确说"代码层面无阻塞项"。
B. **上线闸门**（NAP 仍是占位）→ 这是人工事项，部署前由人填真值；确认它不构成代码缺陷即可。
C. 给出最终结论：代码"可以合并"或"不能合并，必须先修 N 项"。
把结论写进 ${CWD}/docs/review-wave5.md。`,
	"pi 终审（只看证据包）",
);
await waitFor([reviewJob]);

// 3) 五步验收（评审同样只看证据包）
const verification = await runPipeline({
	cwd: CWD,
	ticketId: "tk-20261103-103815-UBS0",
	checks: ["npm run build"],
	reviewRounds: 1,
	reviewer: "pi",
	reviewEvidenceFile: EVIDENCE,
	mergeCommand: "git merge -m \"M5 wave 6\" main",
	verifyCommand: "npm run build",
	dryRun: false,
});
console.log(`=== 五步验收 ${verification.run.id} → ${verification.run.status} ===`);
console.log(formatRun(verification.run));
console.log(`审批卡：${verification.approvals.join(", ") || "无"}`);
console.log("WAVE6 DONE");
