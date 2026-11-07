const TOOLS_DIR = process.env.PI_TOOLS_DIR || join(homedir(), ".pi", "agent", "packages", "pi-superagent", "tools");
import { homedir } from "node:os";
import { join } from "node:path";
/**
 * M5 wave 9 — 让站点在"没有真实 NAP"时也能干净上线（不编造、不留占位符）。
 *
 * 用法：node tools/m5-wave9.mjs
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
const collect = () => execFileSync(process.execPath, [TOOLS, CWD], { encoding: "utf8", stdio: ["ignore", "ignore", "inherit"] });

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

const fixJob = await run(
	"frontend",
	`在 ${CWD} 把站点改成**没有真实 NAP 也能干净上线**（不编造信息、产物里不留任何占位符）。

背景事实：MapSignal 是**纯线上服务公司（Organization），没有实体门店**，因此"门牌地址 / 营业时间"本来就不该出现在页面上；联系入口是表单。真实商号/电话/邮箱/域名还没拿到，所以这些字段应当**留空并在渲染时省略**，而不是打上 [TODO: …] 占位符流到线上。

要求：
1. content/site.json：加一个 \`domain\` 字段（值：\`https://mapsignal-home.pages.dev\`，这是 Cloudflare Pages 项目上线后的正式地址），NAP 字段改成**可为空字符串**而不是 [TODO: …]；保留一段 note 写明"线上服务公司、无实体门店，地址与工时不发布"。
2. build.mjs：
   - canonical / og:url / sitemap.xml / robots.txt / llms.txt / 分享图 URL 全部用 site.json 的 \`domain\`；
   - NAP 字段为空时：JSON-LD 里**直接省略**该字段，页面可见文案里也**不出现**该行；绝不允许把 "[TODO:" 之类占位符写进产物；
   - 联系页：只展示"提交工单表单"这一条真实可用的联系路径 + 一句真实的响应说明（"我们通过你留下的邮箱回复"），不要编造电话、地址、工时；
   - 如果某个 NAP 字段将来被填上真值，它必须**自动出现**（JSON-LD 与可见文案都要有），并与 site.json 逐字一致。
3. 重新构建，然后**验证并贴出证据**：\`node tools/m5-evidence.mjs\`（在仓库根跑；它在 ../pi-model-fleet/tools 下，可用绝对路径 tools/m5-evidence.mjs）——要求 §11（产物 TODO 残留）为 0、§12 的构建读 site.json 为 ✅、NAP 重复拷贝 0 份。
4. deploy.md 加一节"上线时哪些 NAP 字段必须填、哪些可以不填"，并把正式域名改成 https://mapsignal-home.pages.dev（并注明将来绑自有域名后要同步改 site.json 的 domain 再重新构建）。
5. 不改品牌名、口号、页面结构与已通过的 SEO/GEO 内容；不新增依赖。`,
	"pi 让站点无 NAP 也能干净上线",
);
await waitFor([fixJob]);

collect();
const reviewJob = await run(
	"review",
	`发布前终审。**不要翻仓库、不要跑命令**，只依据下面这份机器采集的证据包判断：\n${EVIDENCE}\n\n判定口径分开说：A 代码/内容必须先修项（逐条列并给定位；没有就写"代码层面无阻塞项"）· B 上线闸门（人工事项）· C 最终结论（"可以合并"或"不能合并，必须先修 N 项"）。写进 ${CWD}/docs/review-final.md。`,
	"pi 终审 wave 9",
);
await waitFor([reviewJob]);

const verification = await runPipeline({
	cwd: CWD,
	ticketId: "tk-20261103-103815-UBS0",
	checks: ["npm run build"],
	reviewRounds: 1,
	reviewer: "pi",
	reviewEvidenceFile: EVIDENCE,
	mergeCommand: "git merge -m \"M5 wave 9\" main",
	verifyCommand: "npm run build",
	dryRun: false,
});
console.log(`=== 五步验收 ${verification.run.id} → ${verification.run.status} ===`);
console.log(formatRun(verification.run));
console.log(`审批卡：${verification.approvals.join(", ") || "无"}`);
console.log("WAVE9 DONE");
