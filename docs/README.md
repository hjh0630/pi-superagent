---
title: 60.pi-Super-agent 索引
date: 2026-11-03
tags: [AI项目, pi-CLI, Super-agent, 索引]
---

# 60 · pi-Super-agent（pi CLI 自主调度层）

> **一句话**：在 pi CLI 之上建一层"持续在线、跨会话、可调度多模型"的 Super-agent —— pi 当脑，外部模型 CLI 当手，手机/IM 当人在环入口。
> **与 50.Myπ 的关系**：定位不同、互不依赖。Myπ 是日常工作 Agent 产品（WorkOps / 微信 / 钉钉 / 跟单）；本项目只做 **pi CLI 上的自主调度层**，不涉及 Myπ 代码库任何改动。

## 文件清单

| 文件 | 内容 | 状态 |
|---|---|---|
| `pi-Super-agent架构方案-2026-11-02.md` | **架构基线**（554 行 / 15 章）：定位边界、设计要点映射、总体架构、领域模型、Provider Registry、远程手机选型、事件驱动与 Watchdog、交付契约、目录与路线图、风险登记 | ✅ 基线（见文末增补） |
| `pi-Super-agent实施记录-2026-11-03.md` | **已落地什么**：手机远程链路（pi-reach 闭环）+ `pi-model-fleet` M0 交付（账本/能力目录/预算闸门/心跳）+ **M1（后台异步派单/幂等/Outbox/12h 计划窗口）**、文件清单、实测证据、运行手册、未决事项、M1–M6 路线 | ✅ 当前 |
| `pi-当前状态速查-2026-11-03.md` | **续跑速查页**：路径/能力/命令/待办/坑（压缩上下文后先读这一页） | ✅ 当前 |
| `grokbot-guide二次提炼-2026-11-03.md` | **Grok Bot 手册二次提炼**：拿着已建系统逐条对照（19 项机制 → 落点/差距），本轮补上 Ask-first 优先、卡片盯三处、规则复核、草稿卡 | ✅ 当前 |
| `M5真实试点-站点工厂-2026-11-03.md` | **M5 真实试点**：角色表（6 个机器人）+ 第一波计划与产出 + 五步验收在真仓库上的证据 + 人要拍板的 5 件事 | ✅ 当前 |
| `pi-模型舰队接入现状-2026-11-03.md` | **逐项实测**：网络矩阵、codex / gemini(含 Antigravity CLI) / grok / grok bot / deepseek / claude 的真实状态与修法、provider 注册表、5 条故障模式备忘 | ✅ 当前 |
| `pi-Super-agent设计借鉴-2026-11-03.md` | **三篇对照与取舍**：dsh 解读 / 卡兹克实践 / Grok Bot 手册 → 8 条设计公理、照抄与不抄清单、三个关键设计（L0–L3 分级自主、双通道汇报、T1/T2 两级执行器）、原始出处索引 | ✅ 当前 |
| `pi-Super-agent会话存档-2026-11-02.md` | 2026-11-02 16:09 → 11-03 09:23 完整会话转录（18 条用户消息 + 34 条助手回复） | ✅ 存档 |
| `pi-Super-agent会话存档-M1M4-2026-11-03.md` | 2026-11-03 09:32 → 11:10 会话转录：pi 1.5.0 速览 → 升级 1.5.0 → M1/M2/M3/M4 全过程 | ✅ 存档 |
| `M5站点-wave12收口与口径核对-2026-11-04.md` | **wave12 产出其实没丢**（派单进程消失 ≠ 产出消失，账本记成 orphaned）+ **口径核对**：全站 16 处「14-point」与 /methodology 的 8 个维度、/free-audit 的 6 张卡互相矛盾（读者数得出来）→ 收口为构建期统计的单一真值 + 加回归闸门；水硬度 250→270-450+ PPM；证据工具自身 bug 修掉 | ✅ 当前 |

## 进度/（每小时自动快照）

`pi-superagent-progress-hourly`（Windows 计划任务，每小时一次）调用 `C:\Users\S115336\.pi\agent\packages\pi-model-fleet\tools\progress-hourly.mjs`，把一份快照写进 `进度/`：

- 文件名 `进度-YYYY-MM-DD-HHMM.md`（每次一份，累积）+ `最新进度.md`（覆盖，永远是最近一份）
- 四段：**① 网站访问数据**（预览服务器自己的日志；本机自检与隧道抓取单独列出，不冒充访客）· **② 发帖信息**（草稿数 / 审批卡数 / **实际发出数只认账本回执**）· **③ 回复信息**（话术库草稿数 / 实际发出数）· **④ 项目状态**（仓库改动、构建闸门、舰队账本、今日花费）
- 数据全部读自本机文件；读不到就写「读不到」，不猜、不用旧数据凑数

**心跳节拍（2026-11-04 起）**：统一为**每小时一份**。

- `/super heartbeat` 默认窗口 30 → **60 分钟**；watchdog 巡检节奏 15 分钟 → **1 小时**
- watchdog 现在每次巡检都会排一条心跳，所以**没有任务完成时也能定时看到项目状态**（之前只在 job 完成时才产生心跳）
- 修掉一个真问题：**过期心跳不再投给会话**。之前 outbox 没有时效，pi 关闭期间攒下的旧心跳会在下次连接时一次性涌进来——本轮就收到 3 条 11-03 的旧快照，它们写着「在跑 3」，而实际在跑 0。现在超过 1 小时的心跳记为 `stale` 丢弃，且同一时刻只保留最新一条待投心跳
- 计划任务 `pi-superagent-watchdog` 的 action 由裸 `node` 改为绝对路径：裸 `node` 在调度器里解析不到（报 0x80070002），实测绝对路径后 `LastTaskResult=0`

## 代码位置（不在知识库，在机器上）

| 路径 | 内容 |
|---|---|
| `C:\Users\S115336\.pi\agent\packages\pi-model-fleet\` | pi 包：`extensions/{fleet,superagent}.ts` · `runtime.ts`（Outbox→会话唤醒）· `providers/*` · `store/{db,ledger,catalog,jobs,runner,plans,approvals,levels}.ts` + `store/channels/dingtalk.ts` · `tools/{fleet-test,m1-smoke,m2-smoke,m2-live-test}` |
| `C:\Users\S115336\.pi\agent\superagent\superagent.db` | 账本（sqlite：tickets/assignments/reports/events/outbox/decisions/plans/budget） |
| `C:\Users\S115336\.pi\agent\superagent\rules.json` | 能力目录 + 路由 + 每日预算（机器可读的策略表） |
| `C:\Users\S115336\.pi\agent\fleet\jobs\` | 每次派单的 `job.json` + `output.log` |
| `C:\Users\S115336\.pi\agent\pi-reach\peers.json` | 已配对手机（`iPhone browser`） |

## 当前状态一句话

**已完成 M0 + M1 + M2 + M3 + M4**（pi 本体已升到 1.5.0）：手机远程查看/指令 ✅ · 模型派单 + 证据落账 ✅ · 能力目录与预算闸门 ✅ · 30 分钟零成本心跳 ✅ · **后台异步派单（派单即返回 jobId，完成自动唤醒会话）** ✅ · **幂等去重** ✅ · **Outbox 投递** ✅ · **12h 计划窗口（人批准才执行）** ✅ · **L0–L3 分级自主 + 审批闸门（L3 必预人点头）** ✅ · **钉钉审批卡（手机点"完成"=批准）** ✅ · **五步验收流水线（每步带证据）** ✅ · **Watchdog + 恢复便签 + Panel + 15 分钟自动巡检** ✅
**可用执行器（2026-11-03 17:50 VPN 打开后）**：`antigravity`（Google，Gemini 3.8 Flash / Claude Sonnet 4.6 / GPT-OSS 120B）✅ · `grok`（xAI，CLI 1.0.70）✅ · `pi`（MiniMax）✅｜**paused**：`codex`（缺 OpenAI key）· `claude`（无付费会员）· `gemini`（官方已废）｜**待加**：DeepSeek（只缺 key，域名已通）

## 下一步

M5 真实试点（做一个独立站：代码 → 五步验收 → 托管 → 社媒内容排期，只到 L1/L2）→ M6 社媒/付费（需资质）
**M1/M2/M3/M4 的实测证据与新命令**见《实施记录》第五～八章。
**M5 的前置**：一个 DeepSeek key（可选）+ 试点需求（仓库/技术栈/域名/部署目标）。
