import { homedir } from "node:os";
import { join } from "node:path";
/**
 * M5 wave 4 — 修掉 wave3 评审的 6 个必修项，然后复审 + 五步验收。
 *
 * 本轮强制只用 pi（MiniMax）：PI_FLEET_ONLY_PROVIDER=pi。
 * 用法：node tools/m5-wave4.mjs
 */

import { dispatch } from "../store/runner.ts";
import { readJob } from "../store/jobs.ts";
import { resolveExecutor, composeTask } from "../store/roles.ts";

process.env.PI_FLEET_ONLY_PROVIDER = "pi";

const CWD = process.env.SITE_DIR || join(homedir(), "site-m5");

const FIX = `修复 ${CWD}/docs/review-wave3.md 指出的 6 个必须先修的问题（每条都要真改，不许只写说明）：

1) **城市页不得再声明营业主体**：删掉 build.mjs 城市分支里的 HomeAndConstructionBusiness/LocalBusiness；城市页只保留 BreadcrumbList + FAQPage；营业主体只在首页 /about /contact 输出，且全站共用同一个 @id。同步在 docs/page-plan.md §2.1 加一句明令。
2) **不得把 MapSignal 写成持牌派工网络**：build.mjs 的 Service 结构化数据、content/services.json 的 intro、content/cities.json 的 FAQ、content/pages.json 的对比表与联系页 —— 删除"verified / background-checked 技师"、"Emergency dispatch"、"24/7 调度台"、"Top-rated"、"MapSignal Verified Partner"以及所有无出处的价格与数字（诊断费 $49-89、$129-189、2026 Clark County 中位数、寿命缩短 30-50%、电费下降 30-40%、site/templates/compare.html 里写死的安装价区间与 "2026 Data" 标题）。同时删掉/改正 **Title 24 / IECC** 那句——那是加州法规，内华达不适用（改成内华达真实要求或直接删除该句）；"到场 45-90 分钟"若无依据也删。凡是没有来源的数字一律不写。
3) **真实地址与营业时间未给出前，不许在结构化数据里钉坐标与工时**：从 JSON-LD 删除 geo 与 openingHoursSpecification；联系页工时改回 "[TODO: 营业时间]" 并与 content/site.json 保持一致；page-plan.md §2.1 里的坐标/工时示例一并删除。NAP（商号/街道/邮编/电话/邮箱/域名）继续保留现有 TODO 占位，不得编造成真实值。
4) **删掉可直接粘贴的虚假业主答复与完工帖**：docs/keyword-map-lasvegas.md §3.7 的十条业主答复改成空表（问题保留，答案栏写"仅当该承包商当天的真实执照/班次/服务范围支持时才由人填写"）；§3.8 的 Henderson Green Valley 95 PSI 完工示例改成带 "[TODO: 人填 · 当天真实工单]" 的空模板；删掉"停留浏览点击通话平均高出同行 35%"这类无出处数字。
5) **分享图不能带中文占位**：site/assets/images/og-placeholder.svg 画面文字换成 "MapSignal Home Services" 与 "Get found on Google Maps. Get booked on the phone."，不加电话、地址、客户案例；重新构建后确认 dist 里除 NAP 占位外不再出现 "[TODO:"。
6) **面包屑中间层指向错**：全站没有 /services 与 /areas 索引页，因此服务页与城市页的面包屑只保留两级（Home → 当前页），第二级不得指向别的工种或城市；docs/page-plan.md §2.4 的示例同步改成当前页真实 URL。

完成后：执行 npm run build，必须成功；把构建输出、以及你实际改了哪些文件的清单（文件 + 改动一句话）贴进回复。不要新增依赖，不要改品牌名与口号。`;

async function run(roleId, task, label) {
	const role = resolveExecutor(roleId);
	console.log(`▶ ${label}｜${role.label}（${role.executor}）`);
	const outcome = await dispatch({
		provider: role.executor,
		task: composeTask(role, task),
		cwd: CWD,
		background: true,
		dedupe: false,
		timeoutMs: 1_500_000,
	});
	console.log(`  job ${outcome.jobId}`);
	return outcome.jobId;
}

async function waitFor(jobIds, timeoutMs = 1_700_000) {
	const deadline = Date.now() + timeoutMs;
	const pending = new Set(jobIds);
	while (pending.size && Date.now() < deadline) {
		for (const id of [...pending]) {
			const job = readJob(id);
			if (!job || (job.status !== "running" && job.status !== "queued")) {
				pending.delete(id);
				console.log(`  ✓ ${id} → ${job?.status} ${job?.durationMs ?? ""}ms`);
				if (job && job.status !== "succeeded") console.log("    ", (job.stderr || job.output || "").slice(0, 300));
			}
		}
		if (!pending.size) break;
		await new Promise((r) => setTimeout(r, 5000));
	}
}

const fixJob = await run("frontend", FIX, "pi 修复 wave3 的 6 个必修项");
await waitFor([fixJob]);

const reviewJob = await run(
	"review",
	`只读复审 ${CWD}：重点核对 docs/review-wave3.md 的 6 个必修项是否真的修好（逐条给"已修/未修+定位"），并检查有没有新引入的阻塞问题（占位符残留、title/description/canonical 重复或缺失、JSON-LD 错误、构建产物与 page-plan 不一致、dist 里仍有 [TODO: 除 NAP 占位外]、面包屑指向错）。
只提必须先修的问题；没问题就明确回复"可以合并"。结论写入 ${CWD}/docs/review-wave4.md。`,
	"pi 复审 wave 4",
);
await waitFor([reviewJob]);

const { runPipeline, formatRun } = await import("../store/pipeline.ts");
const verification = await runPipeline({
	cwd: CWD,
	ticketId: "tk-20261103-103815-UBS0",
	checks: ["npm run build"],
	reviewRounds: 1,
	reviewer: "pi",
	mergeCommand: "git merge -m \"M5 wave 4\" main",
	verifyCommand: "npm run build",
	dryRun: false,
});
console.log(`=== 五步验收 ${verification.run.id} → ${verification.run.status} ===`);
console.log(formatRun(verification.run));
console.log(`审批卡：${verification.approvals.join(", ") || "无"}`);
console.log("WAVE4 DONE");
