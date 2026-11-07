const TOOLS_DIR = process.env.PI_TOOLS_DIR || join(homedir(), ".pi", "agent", "packages", "pi-superagent", "tools");
import { homedir } from "node:os";
import { join } from "node:path";
/**
 * M5 wave 8 — NAP 单一真值源收口，然后重采证据 → pi 终审 → 五步验收。
 *
 * 只用 pi（MiniMax）：PI_FLEET_ONLY_PROVIDER=pi
 * 用法：node tools/m5-wave8.mjs
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
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
	`在 ${CWD} 修一个会让上线闸门静默失效的缺陷：**NAP 有三份拷贝，而构建读不到人填的那一份。**

现状：content/site.json（人按 deploy.md / review-wave5.md / registration-runbook.md 的指示去填这一份）、content/pages.json 里的 site.nap、以及 pages.json 里联系页的 data.nap。build.mjs 只读 pages.json 里的那两份，从不读 content/site.json。
后果：人把真实商号/地址/电话/邮箱/域名/工时填进 site.json 后重跑构建，**产物一点不变**——canonical、og:url、sitemap.xml、robots.txt、llms.txt 仍然是 https://[TODO: 域名]/…，联系页可见 NAP 仍是占位。失败信号只有上线后访客看到占位符。

要求：
1. **content/site.json 的 profile.nap 是唯一真值源**：build.mjs 必须真的读它（readFileSync + JSON.parse，别只在注释里提到）。pages.json 里的 site.nap 与 pages[contact].data.nap 两份重复拷贝删掉；联系页可见 NAP 改为从 site.nap 渲染（地址由 street/city/state/zip 拼装）。
2. **域名与 NAP 一起填**：site.json 里给一个明确的 domain 字段（与 nap.site 同源），canonical / og:url / sitemap / robots / llms.txt 全部用它；不要再出现第二处独立域名。
3. **保留占位结构**：真值还没给，所以仍然输出 [TODO: …] 占位，但必须全部来自 site.json 这一处。
4. **证明闸门有效**（这一步必须做）：把 site.json 里的商号/电话/域名/地址临时改成测试值（例如 TESTCO-VERIFY / +1-555-0100 / https://verify.example.com），重跑构建，确认 dist 里的 canonical、og:url、sitemap.xml、robots.txt、llms.txt、联系页可见 NAP、JSON-LD 的 address/telephone/url **全部**变成测试值；然后**把 site.json 改回原来的 [TODO: …] 占位**并重新构建，确认产物又回到占位状态。
5. deploy.md、docs/registration-runbook.md、docs/local-outreach-lasvegas.md、docs/review-wave5.md 里指向"填 site.json"的说明保持不变（它们是对的），如果提到别的文件名请改成 site.json。
6. 完成后执行 npm run build（必须成功），把第 4 步的前后对比证据贴出来。`,
	"pi 收口 NAP 单一真值源",
);
await waitFor([fixJob]);

collect();
const reviewJob = await run(
	"review",
	`发布前终审。先读机器采集的证据包（13 节），再对证据包未覆盖的部分做只读核对（可以读源码、grep、独立解析 dist/；不要改任何东西）。
证据包：${EVIDENCE}

判定口径分开说：
A. **代码/内容必须先修项**（错误实体类型、编造声明与无出处数字、错误结构化数据、meta/canonical 缺失或占位、面包屑错、分享图格式或占位、TODO 残留、表单没接后端、PII 进 URL、NAP 多份拷贝导致填了不生效等）→ 逐条列出并给定位；没有就明确说"代码层面无阻塞项"。
B. **上线闸门**（NAP 仍是占位）→ 人工事项，部署前由人填真值；确认不构成代码缺陷即可。
C. 最终结论：代码"可以合并"或"不能合并，必须先修 N 项"。
写进 ${CWD}/docs/review-wave7.md。`,
	"pi 终审 wave 8",
);
await waitFor([reviewJob]);

const verification = await runPipeline({
	cwd: CWD,
	ticketId: "tk-20261103-103815-UBS0",
	checks: ["npm run build"],
	reviewRounds: 1,
	reviewer: "pi",
	reviewEvidenceFile: EVIDENCE,
	mergeCommand: "git merge -m \"M5 wave 8\" main",
	verifyCommand: "npm run build",
	dryRun: false,
});
console.log(`=== 五步验收 ${verification.run.id} → ${verification.run.status} ===`);
console.log(formatRun(verification.run));
console.log(`审批卡：${verification.approvals.join(", ") || "无"}`);
console.log("WAVE8 DONE");
