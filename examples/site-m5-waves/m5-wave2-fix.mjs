import { homedir } from "node:os";
import { join } from "node:path";
/**
 * M5 wave 2: fix the blocking issues the review found, then re-verify.
 *
 * Usage: node tools/m5-wave2-fix.mjs
 */

import { dispatch } from "../store/runner.ts";
import { readJob } from "../store/jobs.ts";
import { resolveExecutor, composeTask } from "../store/roles.ts";
import { runPipeline, formatRun } from "../store/pipeline.ts";

const CWD = process.env.SITE_DIR || join(homedir(), "site-m5");

const TASK = `在 ${CWD} 修复 docs/review-wave1.md 里列出的 3 个必须先解决的问题。要求：
1) 深色模式对比度：修正 site/assets/css/style.css 里深色令牌与 .nav-link[aria-current="page"] / .hero-badge 的配色，使 WCAG 2.1 AA 正文对比度 >= 4.5:1（图形/大字 >= 3:1）。在样式文件里用注释写明实测对比度数值与计算方式。
2) URL 一致性：让 buildCanonical、导航、页内链接、sitemap.xml、canonical 与 dist 产物路径完全一致，且与 vercel.json / wrangler.toml / .github/workflows/pages.yml 三套部署配置不冲突（同一 URL 在三套托管上都是 200 而不是 308）。只保留一套 URL 形态，不要同时输出 <slug>.html 与 <slug>/index.html。改完说明最终 URL 形态是什么、为什么选它。
3) 定价结构化数据：price === "联系我们" 的方案不能写成 0 元。改用正确的 schema 表达（例如 Offer 里用 priceSpecification 缺失或用 hasOfferCatalog / ContactPoint），保证模型读到 JSON-LD 不会得出"0 元"这种错误结论。在文件里写清你的选择与理由。
4) 修完执行 npm run build，必须成功；把构建输出贴进本轮回复。
5) 不改业务文案与 TODO 占位符结构；不要新增依赖。`;

const role = resolveExecutor("frontend");
console.log(`▶ ${role.label}（${role.executor}）修复 wave1 评审问题`);

const outcome = await dispatch({
	provider: role.executor,
	task: composeTask(role, TASK),
	cwd: CWD,
	background: true,
	dedupe: false,
	timeoutMs: 900_000,
});
console.log(`job ${outcome.jobId} 已派`);

const deadline = Date.now() + 1_000_000;
while (Date.now() < deadline) {
	const job = readJob(outcome.jobId);
	if (job && job.status !== "running" && job.status !== "queued") {
		console.log(`→ ${job.status} ${job.durationMs}ms`);
		console.log((job.output || job.stderr || "").slice(0, 1200));
		break;
	}
	await new Promise((r) => setTimeout(r, 5000));
}

const verification = await runPipeline({
	cwd: CWD,
	ticketId: "tk-20261103-103815-UBS0",
	checks: ["npm run build"],
	reviewRounds: 1,
	reviewer: "grok",
	mergeCommand: "git merge -m \"M5 wave 2\" main",
	verifyCommand: "npm run build",
	dryRun: false,
});
console.log(`=== 五步验收 ${verification.run.id} → ${verification.run.status} ===`);
console.log(formatRun(verification.run));
console.log(`审批卡：${verification.approvals.join(", ") || "无"}`);
