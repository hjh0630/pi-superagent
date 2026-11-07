import { homedir } from "node:os";
import { join } from "node:path";
/**
 * M5 wave 3: fill the pilot with the real business.
 *
 * seo + social + frontend (with dependencies) → review → five-step verification.
 * Everything runs under one long-lived supervisor: when the spawning process
 * exits, the CLI children are reaped with it and the job stays "running".
 *
 * Usage: node tools/m5-wave3.mjs
 */

import { readFileSync } from "node:fs";
import { dispatch } from "../store/runner.ts";
import { readJob } from "../store/jobs.ts";
import { resolveExecutor, composeTask } from "../store/roles.ts";
import { runPipeline, formatRun } from "../store/pipeline.ts";

const CWD = process.env.SITE_DIR || join(homedir(), "site-m5");
const profile = JSON.parse(readFileSync(`${CWD}/content/site.json`, "utf8")).profile;

const CONTEXT = `【项目背景（不可改写的事实）】
品牌：${profile.brandLine}｜一句话：${profile.tagline}
定位：${profile.category}
市场：美国 ${profile.market.state}（${profile.market.stateCode}）· ${profile.market.metro} 都会区
服务城市：${profile.market.serviceAreas.map((a) => a.name).join("、")}
服务品类：${profile.services.map((s) => `${s.name}(${s.cn})`).join("、")}
免费起手：${profile.offer.freeItem}
付费项：${profile.offer.paidItem}
NAP 现状：商号/地址/电话/邮箱/域名都还是 TODO 占位（人还没给），所以**不要编造任何真实联系方式、地址、电话、客户案例、数据**。
守则：${profile.guardrails.join("；")}`;

async function run(roleId, task, label) {
	const role = resolveExecutor(roleId);
	console.log(`▶ ${label}｜${role.label}（${role.executor}）`);
	const outcome = await dispatch({
		provider: role.executor,
		task: composeTask(role, `${CONTEXT}\n\n---\n\n${task}`),
		cwd: CWD,
		background: true,
		dedupe: false,
		timeoutMs: 1_200_000,
	});
	console.log(`  job ${outcome.jobId}`);
	return outcome.jobId;
}

async function waitFor(jobIds, timeoutMs = 1_400_000) {
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
		await new Promise((r) => setTimeout(r, 5000));
	}
}

// 1) keyword map + page plan (blocks the frontend step)
const seoJob = await run(
	"seo",
	`在 ${CWD} 产出两份文件：
【A】${CWD}/docs/keyword-map-lasvegas.md —— 本地关键词与意图地图 + Google Maps（GBP）优化清单。
必须覆盖：
1) 关键词地图：按「服务品类 × 城市 × 意图（紧急/计划性/比价/附近）」四象限列出目标词族（英文原词 + 中文释义 + 搜索意图 + 应落到哪个 URL），每个服务品类至少 12 个词，覆盖 "near me"、"in Las Vegas"、具体 ZIP/街道修饰词、竞品对比词、故障描述词（例：no heat in Las Vegas）；
2) 每个词族的落地页建议：URL、页面类型（服务页/城市页/问答页/对比页）、title 与 description 模板（含字数限制）、H1、主 H2、内链指向；
3) GBP 优化清单（12 项以上）：主类目与附加类目、服务项目怎么填、服务区域怎么设（区别于门店地址）、营业时间与节假日、照片规格与拍摄清单（含前后对比）、Q&A 预置问题库（10 条）、Google Posts 每周节奏、评论获取流程（不许刷评）、照片/视频对排名的影响、违规风险红线；
4) 本地引用与一致性清单：列出 12-18 个真实存在的、可提交商号信息的地方（城市/县官方名录、行业协会、商会、本地目录、行业名录、房东与物业协会等），每条写：名称、提交网址或渠道、需要什么资料、优先级；
5) "LSA（Local Service Ads）"与 Google Ads 到底要不要做、什么时候做、成本量级（不写具体报价，给量级与判断标准）。
【B】${CWD}/docs/page-plan.md —— 站点页面计划表（给前端照着建）：每行：URL slug、页面类型、title 模板、description 模板、H1、主要区块清单、内链指向、是否需要城市变量、验收要点。至少 14 页（6 个服务页 + 5 个城市页 + 首页 + 免费审计页 + 定价 + FAQ + 对比页 + 关于 + 联系）。`,
	"SEO 角色：关键词地图 + GBP 清单 + 页面计划",
);

// 2) frontend waits for the page plan; social can run in parallel
await waitFor([seoJob]);

const [frontJob, socialJob] = await Promise.all([
	run(
		"frontend",
		`按 ${CWD}/docs/page-plan.md 的页面计划，把站点填成真实内容。要求：
1) 重写 content/pages.json 为真实页面数据（不再有 [TODO] 文案，NAP 类占位保留 TODO，其余文案按计划写成真实可用的英文营销文案；语气：务实、可信、不吹牛、面向承包商老板）；
2) 写 content/services.json（6 个服务品类：hvac/plumbing/electrical/handyman/roofing/water-heater，每个含 name、cn、slug、metaTitle、metaDescription、h1、intro、services[]（5-8 条具体服务项）、faqs[]（4-6 条，答案要具体可执行，不许写"联系我们"这类空话）、emergency 标记）；
3) 写 content/cities.json（5 个城市页：每个含 name、slug、metaTitle、metaDescription、h1、areas[]（3-5 个具体社区/小区名）、localNotes[]（写当地真实可查的居住特征与季节性需求，例如 Summerlin 的房龄与绿化、Enterprise 无市政服务、Henderson 新房与仓库社区）、faq[]）；
4) 改 build.mjs：按上述数据生成全部页面；服务页与城市页的 title/description/canonical/H1 必须唯一；pricing 与 schema.org 保持正确（"联系我们"不得输出 price 0；用 OfferCatalog + ContactPoint 表达）；FAQPage / Service / LocalBusiness(JSON-LD) 结构化数据齐全；生成 sitemap.xml（含全部页面）、robots.txt、llms.txt（含全部页面链接与一句话摘要）；保留三套部署配置与现有 URL 形态；
5) 保留 site/assets/css/style.css 里上一轮修好的对比度与 token；新增组件时同样满足 WCAG AA；
6) 执行 npm run build 必须成功，产物覆盖新增页面；
7) 不新增任何依赖。`,
		"前端角色：填真实页面并扩构建",
	),
	run(
		"social",
		`产出 ${CWD}/docs/local-outreach-lasvegas.md，并写 ${CWD}/docs/registration-runbook.md。
【local-outreach-lasvegas.md】必须包含：
1) 渠道矩阵（按优先级排序，每个渠道写：为什么选它、目标读者是谁、内容形态、发布频率、谁来做、是否要钱、合规注意、衡量指标）；
2) 每个渠道的"第一次怎么做"（3 步以内能上手的动作，不要宏观策略）；
3) 4 条**真实可发布**的英文内容草稿（一条面向房主的 FAQ 型、一条面向承包商的 Maps 优化科普、一条本地化案例型、一条反常识观点型），每条含：目标平台、标题、正文（可直接发）、标签、建议发布时段、以及它在我们的审批卡上长什么样（发给谁、哪个平台、明确"不自动发布"）；
4) 面向承包商的**外联邮件模板**（英文，3 封不同角度：免费审计邀约、Maps 评分差距邀约、房东/物业多套房的批量邀约），每封含主题行、正文、CTA，以及"如何在一周内拿到回复"的跟进节奏；
5) 线下渠道（建材批发商/商会/城市名录/房东物业协会/本地商会活动）的打法与一页纸物料清单；
6) 30 天节奏表：第 1 周做什么、第 2-4 周做什么、每周产出物；
7) 风险清单：哪些行为会被 Google/平台判为滥用（刷评、虚假门店、群发重复内容），并写明我们的做法如何避开。
【registration-runbook.md】按渠道列出**注册/认领流程的人工作业清单**：平台、入口网址、需要什么材料（邮箱/手机/营业执照/地址证明/官网）、验证方式（短信/邮件/明信片）、预计耗时、常见卡点、我们在本地已经准备好的东西（如 NAP 资料包、logo、头像、简介文案、封面图清单）、以及"哪一步必须人做"；
所有邮箱/电话/网址都要写清是占位还是要人填。`,
		"社媒角色：本地渠道打法 + 4 条草稿 + 外联模板 + 注册手册",
	),
]);

await waitFor([frontJob, socialJob]);

// 3) review
const reviewJob = await run(
	"review",
	`只读评审 ${CWD} 的全部产出：content/{site,services,cities,pages}.json、build.mjs、docs/{keyword-map-lasvegas,page-plan,local-outreach-lasvegas,registration-runbook}.md、dist/ 产物。
只提**必须先修**的问题：① 事实/占位符残留（除 NAP 刻意占位外，不该再有 [TODO]）② 页面 title/description/canonical 重复或缺失 ③ JSON-LD 错误（尤其价格、FAQ、Service、LocalBusiness）④ 构建产物与页面计划不一致 ⑤ 社媒草稿里有编造的数据/引语/承诺 ⑥ 注册手册里的步骤不可执行。
按严重度排序，每条给文件+定位+为什么阻塞+怎么改；没有问题就直接回复"可以合并"。结论写进 ${CWD}/docs/review-wave3.md。`,
	"评审角色：wave 3 全量评审",
);
await waitFor([reviewJob]);

// 4) five-step verification
const verification = await runPipeline({
	cwd: CWD,
	ticketId: "tk-20261103-103815-UBS0",
	checks: ["npm run build"],
	reviewRounds: 1,
	reviewer: "grok",
	mergeCommand: "git merge -m \"M5 wave 3\" main",
	verifyCommand: "npm run build",
	dryRun: false,
});
console.log(`=== 五步验收 ${verification.run.id} → ${verification.run.status} ===`);
console.log(formatRun(verification.run));
console.log(`审批卡：${verification.approvals.join(", ") || "无"}`);
console.log("WAVE3 DONE");
