import { homedir } from "node:os";
import { join } from "node:path";
/**
 * M5 wave 11 — 24 小时冲刺：
 *   a) 站点埋点 + 页脚自报当前公网地址（frontend）
 *   b) GEO/SEO 资产补齐（seo）
 *   c) 24 小时社媒发布包（social）
 *
 * 只用 pi：PI_FLEET_ONLY_PROVIDER=pi
 * 用法：node tools/m5-wave11.mjs
 */

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
				console.log(`  ✓ ${id} → ${job?.status} ${job.durationMs ?? ""}ms`);
				if (job && job.status !== "succeeded") console.log("    ", (job.stderr || job.output || "").slice(0, 400));
			}
		}
		if (!pending.size) break;
		await new Promise((r) => setTimeout(r, 4000));
	}
}

const [trackJob, geoJob, socialJob] = await Promise.all([
	run(
		"frontend",
		`在 ${CWD} 给站点加上**第一方访问统计**与**当前公网地址自报**（服务器已经就绪，不需要任何外部服务）：
1) 在 site/assets/js/main.js 里加一个极简的第一方埋点：用 navigator.sendBeacon（或 fetch keepalive）POST 到 /api/track，事件类型区分 page_view / outbound_click / form_submit；不要用任何第三方脚本、不要写 cookie、不要收集个人信息（只发路径、来源、事件类型、时间）。
2) 页脚加一行：显示当前公网地址，模板里写占位符 __LIVE_URL__（服务器在返回 HTML 时会替换成当前地址），旁边加一句"这是本预览的当前地址，隧道重连后会变"。
3) 页脚再加一行指向本站统计后台：/__stats（相对路径即可）。
4) 外链与 CTA 点击要带 outbound_click 事件；两个表单提交成功后带 form_submit 事件。
5) 重新构建，产物里不应出现 __LIVE_URL__ 之外的未替换占位符；确认 JS 无语法错误（node --check）。
不要新增任何依赖。`,
		"pi：站点埋点 + 地址自报",
	),
	run(
		"seo",
		`在 ${CWD} 补齐 **GEO/SEO 资产**，目标：24 小时内可发布（全部基于真实事实，不编造数据/评分/客户）：
1) 新增两个页面并接入构建：
   - /glossary（术语与定义页）：12-16 个本地家装/Google Maps 相关术语（GBP、类目、评论、服务区域、NA/A/C、轮播图、Q&A、Local Pack、关键词意图…），每个给一句平实定义 + 为什么对承包商重要；页面要 FAQPage 结构化数据；
   - /methodology（我们怎么做）：说明我们的审计方法、评分维度（可核对的口径）、不做哪些事（不刷评、不做虚假门店、不代持牌）；要求写清"结论来自可核对的公开信息"。
2) 现有服务页与城市页补"可引用事实块"：每页一个 2-3 句的事实块（只写已知的地理/法规/需求事实，例如许可与检查流程、气候与季节性需求、服务半径与通勤），并加 FAQPage 与 Service 结构化数据（provider 仍是 Organization）。
3) 内部链接：服务页 ↔ 对应城市页 ↔ 对应服务页 ↔ glossary/methodology，互相链接（每页 3-8 条内链，锚文本写人话）。
4) 技术项：每页唯一 title/description/canonical（不得重复）、og/twitter 完整、lang="en"、一个 h1、结构化数据合法、图片有 alt、sitemap 收录全部公开页（不含 404）、robots 指向 sitemap、llms.txt 列出全部页面一句话摘要。
5) 写 docs/seo-geo-24h.md：列出本次改了什么、每页一句话价值、还缺什么（只写真实缺口，例如"缺真实 NAP 与真实客户案例"）。
不要编造数字、评分、排名、客户名；不要新增依赖；改完 npm run build 必须成功。`,
		"pi：GEO/SEO 资产补齐",
	),
	run(
		"social",
		`在 ${CWD}/docs/social-24h/ 产出**24 小时内的社媒发布包**（不是 7 天排期）：要求全部 24 小时内可发完。
1) 24 小时发布序列（按 America/Los_Angeles 给出确切时间点，覆盖 24 小时内的 6-8 条）：每条写：平台、账号类型（个人号/企业号/群组）、目标读者、标题、正文全文（英文，可直接粘贴）、标签/分类、需要配的图或链接、发布后 60 分钟内要做的动作（例如回评论）。
2) 各平台改写：同一条内容在 Nextdoor（邻居问答体，不带链接）、Facebook 群组（社区讨论体）、LinkedIn（从业者视角短文）、Craigslist 服务广告（标题 ≤50 字符、正文遵循 Craigslist 规则：不要留联系方式、只写服务内容）各一版；不要复制粘贴同一段文字。
3) 一份"发布前 60 秒清单"：每条发布前人工核对哪些点（无评分/无排名/无客户名/无电话号码/链接指向正确页面/时间符合当地作息）。
4) 一份"发完 24 小时后看什么"：每条对应看哪个指标（收藏/评论/私信/点击），以及 24 小时后要删掉或改掉什么。
5) 明确写出：哪些动作需要人点头（发任何一条）、哪些是本包授权范围（仅文案与排期）。
不得编造客户案例、评分、排名、承诺数字；不要写"我们的客户都说"。`,
		"pi：24 小时社媒发布包",
	),
]);

await waitFor([trackJob, geoJob, socialJob]);
console.log("WAVE11 DONE");
