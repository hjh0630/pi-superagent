import { homedir } from "node:os";
import { join } from "node:path";
/**
 * M5 wave 10 — 自主收尾两件事：
 *   1) 12 小时报告例程（M4 遗留的"决策通道"）
 *   2) 各平台注册材料包（把人的动作压到最少）
 *
 * 只用 pi：PI_FLEET_ONLY_PROVIDER=pi
 * 用法：node tools/m5-wave10.mjs
 */

import { execFileSync } from "node:child_process";
import { dispatch } from "../store/runner.ts";
import { readJob } from "../store/jobs.ts";
import { resolveExecutor, composeTask } from "../store/roles.ts";

process.env.PI_FLEET_ONLY_PROVIDER = "pi";

const CWD = process.env.SITE_DIR || join(homedir(), "site-m5");

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
				if (job && job.status !== "succeeded") console.log("    ", (job.stderr || job.output || "").slice(0, 300));
			}
		}
		if (!pending.size) break;
		await new Promise((r) => setTimeout(r, 4000));
	}
}

const [reportJob, packJob] = await Promise.all([
	run(
		"seo",
		`在 ${CWD} 写一份**12 小时报告模板**（决策通道用），文件：${CWD}/docs/report-12h-template.md。
这是"每 12 小时给决策者的一份进展 + 下 12 小时计划"的骨架，内容要能被自动填充：
1) 报告骨架（Markdown 模板，用 {{占位符}} 标出要自动填的字段）：本窗口完成 / 失败 / 在跑 / 需你决策（各一段，附数据来源：账本表与字段名）、今日花费（每 provider 次数与分钟，对照预算上限）、风险与卡点；
2) **下 12 小时计划**的格式：每条写 目标 / 负责人角色（design|frontend|review|seo|social|deploy）/ 验收标准 / 预算 / 审批边界 / 若数据缺失怎么办（写明"报告失败，不用旧数据凑数"）；
3) 一份"决策通道 vs 流水通道"的分工说明（哪类消息必须有人回应、哪类只做快照、过期规则）；
4) 三种典型情形各一个填好的完整示例（一切顺利 / 有任务卡住 / 需要人拍板）。
不要写具体业务数据，只写格式与示例骨架。`,
		"pi 写 12h 报告模板",
	),
	run(
		"social",
		`在 ${CWD}/docs/registration-pack/ 产出一套**平台注册与资料包**（让人 10 分钟完成一个平台，而不是一小时）：
1) README.md：逐平台清单（Google Business Profile / Nextdoor / Facebook 本地群 / Craigslist / Yelp / Bing Places / Apple 商家资料 / LinkedIn），每个平台写：入口网址、需要哪些材料、验证方式（短信/邮件/明信片/执照）、预计耗时、常见卡点、**哪一步必须人做**、以及我们本地已备好的东西对应哪一步；
2) brand-assets/：可直接用的素材（logo SVG、方形头像 SVG、1200×630 分享图 PNG —— 用仓库里已有的 scripts/make-og-image.mjs 的做法，零依赖手写 PNG）；
3) copy/：各平台的现成文案（Google Business Profile 750 字符以内的业务描述、服务清单 ≤20 条、简介一句话、简介页 1000 字符内、Nextdoor 帖子开场、LinkedIn 公司页简介、Facebook 页面简介、Craigslist 分类与标题模板）—— 全部基于真实事实（我们卖 Google Maps 可见度服务、纯线上、无实体门店、不派技师），**不得出现评分、排名、客户案例、承诺数字**；
4) nap-packet.md：NAP 填表清单（每个字段：填什么、从哪来、示例格式、没填时该字段会不会被发布——本项目是线上服务公司，地址/工时可留空并省略）；
5) checklist.md：每个平台一个勾选清单（从注册到第一条内容发布），人照着打勾即可。
不要代填任何需要真实身份的信息（电话、地址、执照号、域名）。`,
		"pi 做注册材料包",
	),
]);

await waitFor([reportJob, packJob]);
console.log("WAVE10 DONE");
