const FLEET_DIR = process.env.PI_FLEET_HOME || join(homedir(), ".pi", "agent", "fleet");
import { homedir } from "node:os";
import { join } from "node:path";
/**
 * M5 wave 1 supervisor.
 *
 * Long-running dispatches must have a long-lived parent: when the process
 * that spawned the CLIs exits, the CLIs are reaped with it and the job stays
 * "running" in the ledger forever (the Watchdog catches it, but the work is
 * lost). This supervisor owns the jobs, waits for them, and writes a report.
 *
 * Usage: node tools/m5-wave1.mjs [--dispatch] [--wait]
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dispatch } from "../store/runner.ts";
import { readJob } from "../store/jobs.ts";
import { resolveExecutor, composeTask } from "../store/roles.ts";
import { getPlan, updatePlanSteps } from "../store/ledger.ts";

const CWD = process.env.SITE_DIR || join(homedir(), "site-m5");
const PLAN = "pl-20261103-103815-YCV7";
const LOG = join(FLEET_DIR, "m5-wave1.log");

function log(line) {
	const stamp = new Date().toISOString().slice(11, 19);
	const text = `[${stamp}] ${line}`;
	writeFileSync(LOG, `${text}\n`, { encoding: "utf-8", flag: "a" });
	console.log(text);
}

/** The steps of wave 1, with the briefs we already agreed on. */
const STEPS = [
	{
		id: "s3",
		role: "social",
		title: "社媒打法手册",
		task: `在 ${CWD}/docs/social-playbook.md 写一份社媒内容手册。要求：
1) 平台选择依据表：每个候选平台（小红书/公众号/视频号/X/LinkedIn/知乎等）写明适合什么内容形态、需要什么素材、发布节奏、与站点的导流位（哪个页面接哪个平台）；
2) 内容矩阵：内容类型（干货/案例/对比/教程/观点/幕后）× 目标（获客/信任/检索）× 频率，一周 7 条的示例排期；
3) 每条内容的"五要素"模板（结果/来源/约束/交付物/发布前要人点头的节点）；
4) 一条完整的示例文案草稿（中文，真实可用，不要编造数据与引语），以及它在我们的审批卡上应该长什么样（发给谁、在哪个平台、不自动发布）；
5) 明确写出"哪些动作永远要人点头"：发布、私信、评论回复、花钱投放。`,
		acceptance: "docs/social-playbook.md 存在，含平台表、排期、五要素模板、示例草稿",
	},
	{
		id: "s4",
		role: "frontend",
		title: "工程骨架与构建流水线",
		task: `在 ${CWD} 内完成可静态构建的站点骨架。要求：
1) 不引入任何框架或运行时依赖，只用 Node 内置模块（node >= 22）+ 原生 HTML/CSS/JS；
2) 写 build.mjs：读取 site/templates/*.html 与 content/pages.json，生成 dist/（index.html、每个页面、sitemap.xml、robots.txt、llms.txt、404.html，每个 HTML 带唯一 title/description/og/canonical）；
3) site/ 下已有 templates/{layout,home,compare,faq,pricing,404}.html 与 assets/，请在此基础上补齐并保证 build 通过；
4) npm run build 必须成功，产物在 dist/；
5) 给出三套部署配置模板（不执行部署）：vercel.json、wrangler.toml（Pages）、.github/workflows/pages.yml，各自写清"填什么值就能上线"；
6) 不要写营销文案，用占位文案 + 明确 TODO 标记。`,
		acceptance: "npm run build 成功产出 dist/（含 sitemap/robots/llms.txt），三套部署配置模板就位",
	},
];

async function runStep(step) {
	const role = resolveExecutor(step.role);
	log(`▶ ${step.id} ${step.title} → ${role.label}（${role.executor}）`);
	const outcome = await dispatch({
		provider: role.executor,
		task: composeTask(role, step.task),
		cwd: CWD,
		background: true,
		dedupe: false,
		timeoutMs: 1_200_000,
	});
	log(`  job ${outcome.jobId} 已派（${outcome.status}）`);
	return { step, jobId: outcome.jobId };
}

async function waitFor(jobIds, timeoutMs = 1_500_000) {
	const deadline = Date.now() + timeoutMs;
	const pending = new Set(jobIds);
	while (pending.size && Date.now() < deadline) {
		for (const id of [...pending]) {
			const job = readJob(id);
			if (!job || job.status !== "running" && job.status !== "queued") {
				pending.delete(id);
				log(`  ✓ ${id} → ${job?.status ?? "gone"} ${job?.durationMs ?? ""}ms`);
			}
		}
		if (!pending.size) break;
		await new Promise((r) => setTimeout(r, 4000));
	}
}

const plan = getPlan(PLAN);
if (!plan) throw new Error(`plan ${PLAN} not found`);

log("=== M5 wave 1 ===");
const dispatched = [];
for (const step of STEPS) {
	dispatched.push(await runStep(step));
}
await waitFor(dispatched.map((d) => d.jobId));

// attach the jobs to the plan steps so the plan shows the truth
const updated = plan.steps.map((s) => {
	const hit = dispatched.find((d) => d.step.id === s.id);
	return hit ? { ...s, jobId: hit.jobId, status: "dispatched" } : s;
});
updatePlanSteps(PLAN, updated);
log("wave 1 完成");
