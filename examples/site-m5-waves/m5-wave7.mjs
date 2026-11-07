const TOOLS_DIR = process.env.PI_TOOLS_DIR || join(homedir(), ".pi", "agent", "packages", "pi-superagent", "tools");
import { homedir } from "node:os";
import { join } from "node:path";
/**
 * M5 wave 7 — 修最后 3 个阻塞项（全站实体类型 / 线索表单接后端 / 社媒位图），
 * 重采证据 → pi 终审 → 五步验收。
 *
 * 只用 pi（MiniMax）：PI_FLEET_ONLY_PROVIDER=pi
 * 用法：node tools/m5-wave7.mjs
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
	`在 ${CWD} 修 3 个发布阻塞项（每项都要真改代码，不许只写说明）：

**P0-1 站点实体类型错了（虚假门店红线）**
MapSignal 卖的是 Google Maps 可见度服务，不是家政维修，但现在 build.mjs 把站点实体写成 'HomeAndConstructionBusiness'，index/about/contact/pricing 四页都带这个节点，而 6 个服务页的 Service.provider 也指向它，Offer 名还叫 "Emergency AC Diagnostic & Repair"、"Heat Pump Replacement" 之类 —— 与页面上写的 "We do not send technicians" 正面冲突。
要求：
- 站点主体改成 Organization（name 用 "MapSignal"；品牌全称如果含 "Home Services" 会误导，也一并改成 "MapSignal"），全站只保留这一个主体节点（同一个 @id），首页 /about /contact 至少有一处完整展开（address/telephone/url 用 NAP 占位待人填，但结构要对）；
- 删掉与 "Custom quote" 冲突的 priceRange；
- 服务页的 Service/Offer 全部改成**可见度服务口径**（例如 "HVAC Google Business Profile Service Entries"、"Review & Reputation Program for HVAC Contractors"、"Local Citations & Map Visibility Audit"），provider 指向新的 Organization；可见文案里出现的"上门/维修/持牌技师"类措辞一并改成可见度口径；
- 改完重新构建，并确认 dist/ 里不再出现 HomeAndConstructionBusiness/LocalBusiness，也不再出现像维修服务的 Offer 名。

**P0-2 线索表单根本没接后端（线索 100% 丢失 + PII 进 URL）**
现在两个表单都是 <form action="/contact" method="get">，把 business_name/email/phone/zip 塞进 URL 跳转，而 functions/api/lead.js 根本没人调用。
要求：
- site/templates/contact.html 与 free-audit.html 的表单改成 method="post" action="/api/lead"，字段名与 functions/api/lead.js 期望的一致（name / phone / email / zip / trades[] / note / page）；
- site/assets/js/main.js 里加提交处理：fetch POST /api/lead、按钮禁用、成功/失败状态提示（不跳转、不把 PII 写进 URL、不用 alert），并在无 JS 时留一个可用的降级（mailto 兜底）；
- 没有后端时（本地静态预览）也要给出明确的失败提示，不能静默；
- 同步更新 deploy.md 里对表单的描述。

**P1-3 社媒分享图是 SVG，平台不渲染**
og:image 现在指向 .svg，Twitter/Facebook/LinkedIn 不渲染 SVG → 分享出来是空白。
要求：
- 生成一张 1200×630 的 PNG 分享图（品牌名 MapSignal + 口号 + 深色底 + 浅色字），放在 site/assets/images/ 下，og:image 改成这张 PNG；
- **不引入任何依赖**：用 Node 内置 zlib 手写 PNG（IHDR/IDAT/IEND + CRC32）或任何零依赖办法都行；深色背景 #0f172a，主色 #60a5fa；
- SVG 可以保留作为矢量资源，但 og:image 必须是 PNG；
- 构建后确认 dist 里的 og:image 是 .png 且文件真实存在。

完成后执行 npm run build（必须成功），并把改动清单与构建输出贴出来。`,
	"pi 修 3 个发布阻塞项",
);
await waitFor([fixJob]);

collect();
const reviewJob = await run(
	"review",
	`发布前终审。**先读证据包**（机器采集，覆盖 13 节），再对证据包没覆盖的部分做只读核对（你可以读文件与 grep，但不要改任何东西）。
证据包：${EVIDENCE}

判定口径（分开说，别混）：
A. **代码/内容必须先修项**（虚假门店或错误实体类型、编造声明与无出处数字、错误结构化数据、缺 meta/canonical、面包屑错、分享图格式或占位、TODO 残留、表单没接后端、PII 进 URL 等）→ 逐条列出并给定位；没有就明确说"代码层面无阻塞项"。
B. **上线闸门**（NAP 仍是占位）→ 这是人工事项，部署前由人填真值；确认它不构成代码缺陷即可。
C. 最终结论：代码"可以合并"或"不能合并，必须先修 N 项"。
结论写进 ${CWD}/docs/review-wave6.md。`,
	"pi 终审 wave 7",
);
await waitFor([reviewJob]);

const verification = await runPipeline({
	cwd: CWD,
	ticketId: "tk-20261103-103815-UBS0",
	checks: ["npm run build"],
	reviewRounds: 1,
	reviewer: "pi",
	reviewEvidenceFile: EVIDENCE,
	mergeCommand: "git merge -m \"M5 wave 7\" main",
	verifyCommand: "npm run build",
	dryRun: false,
});
console.log(`=== 五步验收 ${verification.run.id} → ${verification.run.status} ===`);
console.log(formatRun(verification.run));
console.log(`审批卡：${verification.approvals.join(", ") || "无"}`);
console.log("WAVE7 DONE");
