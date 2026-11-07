---
title: Grok Bot 二次提炼（2026-11-03 18:30）
date: 2026-11-03
tags: [AI项目, pi-CLI, Super-agent, grokbot, 二次提炼, 审批, 草稿卡, 设计参考]
---

# Grok Bot 二次提炼（对标本项目 M0→M4 的已建能力）

> **输入**：`anightmonarch/grokbot-guide`（xAI Grok Bot 中文实践手册，VuePress，2026-10-20 verified）全 4821 行 / 42 篇。
> **方法**：agent-reach 的 GitHub/dev 通道 → `git clone --depth 1` → 逐篇读原文（`start/what-is` `start/local-exec` `workbench/security` `workbench/routines` `workbench/memory` `workbench/channels` `workbench/skills` `workbench/multi-bot` `faq/pitfalls` `scenarios/*` `paths/*`）。
> **目的**：第一次提炼（2026-11-03 上午）是"三文对照取公理"；这一次是**拿着已经建好的系统去逐条对照**，看哪些机制我们还没有、哪些我们已经做偏了。
> **配套**：《pi-Super-agent实施记录》第五～八章 · 《pi-模型舰队接入现状》· 《pi-当前状态速查》

---

## 零、一句话结论

**这套手册最有价值的不是"云电脑"，而是三条边界纪律：①「描述管常设规矩 + 审批卡管具体动作」双保险 ②「过期 = 未放行，且过期不补做」③「先出草稿，人点 Send 才出门」。**
我们第一轮抄了公理，第二轮对照发现：**双保险和过期语义我们已经做对了；但"Ask first 必须赢过 Always allow"、"卡片要能一眼看出风险"、"规则要能被定期复核"、"草稿卡"这四块我们缺**——本轮全部补上并实测。

---

## 一、逐条对照（官方机制 → 我们的落点 → 本轮动作）

| # | Grok Bot 机制 | 官方怎么做 | 我们的落点 | 状态 |
|---|---|---|---|---|
| 1 | 窄职责的 Bot | 一件事一个 Bot，宽职责角色"攒下来的东西很难复用" | 一个 capability tag → 一个 executor；路由在 `rules.json` | ✅ 已有 |
| 2 | 描述 / 对话 / 记忆 三层 | 描述=常设规矩，对话=本周临时，记忆=稳定偏好 | `rules.json`=描述层 · 会话=对话层 · `decisions` 表=记忆层 | ✅ 已有 |
| 3 | 描述 + 审批卡 **双保险** | "描述管的是常设规矩，审批卡管的是具体动作" | `rules.json` 分级规则 + `approvals` 表逐动作卡 | ✅ 已有（设计被手册验证） |
| 4 | 审批三态 | Allow once / Always allow / Deny（+ Deny once） | `/super approve <ap>`（一次）/ `always`（永久）/ `/super reject`（一次）/ `always`（永久） | ✅ 已有 |
| 5 | 审批卡显示**完整命令** | 批准前读命令本身；盯三处：路径 / 改动 / 外发 | 卡片本来就带完整命令 | ⚠️ 本轮补"盯三处"清单 |
| 6 | **Ask first 赢** | 两类规则冲突时 Ask first 优先；Auto Review 只能更严 | 新增规则字段 `alwaysAsk`：这类动作永远要人点头，`always` 不能绕过 | ✅ **本轮新增** |
| 7 | **~10 分钟过期 = 未放行** | 过期卡显示 Expired，动作不执行 | `expires_at` 10 分钟；过期后再批准被拒 | ✅ 已有 |
| 8 | 过期**不补做** | 过期卡上的"以后总是允许"只加规则，不补跑那次 | 过期卡批准被拒；卡片文案明写"过期不会补做，要继续请重跑" | ✅ **本轮补文案** |
| 9 | **草稿卡：人点 Send 才出门** | 可编辑草稿 → 核对 → Send / Discard；群聊里不出现草稿 | 新增 `new_draft`（五要素）+ `/super send` → 审批卡 → 批准才可发 | ✅ **本轮新增** |
| 10 | 草稿的**五要素** | 结果 / 来源 / 约束 / 交付物 / 停下来等我的节点 | `new_draft` 的五个字段就是这五项 | ✅ **本轮新增** |
| 11 | 例程**六要素** | 归属哪个 Bot / 时间表与时区 / 输入来源 / 预期结果 / 审批边界 / **数据源缺失时怎么办** | 12h 计划有步骤+验收+预算；缺"输入来源"与"缺数据策略" | ⏳ M5 补 |
| 12 | **Test run 先跑** | 改完例程先 Test run（会真做事），过了再开闹钟 | `verify_change(dry_run=true)` + 不可逆步骤先出审批卡 | ✅ 等价物 |
| 13 | 技能 → 例程 | 先 skill（怎么做）后 routine（何时做）；Teach a task | provider 文件 = 可复用技能；12h 计划 = 例程雏形 | ⏳ M5 沉淀 |
| 14 | **定期复核清单** | always 列表有没有忘了/过宽；Deny 后去源系统确认 | 新增 `/super audit`：常设授权、过宽 scope 告警、最近审批卡 | ✅ **本轮新增** |
| 15 | 最小权限 6 条 | 只连需要的 / 从只读和草稿开始 / 外发留审批 / 敏感文件用完删 / 不用的登出 / 定期回顾 | env 白名单 / L0–L3 / 审批卡 / 无 / provider `paused` / `/super audit` | ⚠️ 4/6 |
| 16 | 共享电脑**不是**安全边界 | 账号下所有 Bot 共享 cookie / 文件 / 凭据 | 我们所有 provider 共享本机与凭据 → env 白名单 + 凭据不外传 | ✅ 设计取舍一致 |
| 17 | 写意图，不冻死点击菜谱 | 源系统改版就碎；先暂停→手动跑通→更新技能→Test run | 路由规则在表里、provider 声明式、加 provider 不改核心 | ✅ 已有 |
| 18 | 一事一对话 / 一事一 Bot | 宽对话费额度也容易误动作 | job 粒度 + provider 粒度 + 计划粒度 | ✅ 已有 |
| 19 | 写明"无数据/旧数据"策略 | 不要静默用旧数据凑数 | 我们：检查失败即失败（`ok:false` + exitCode），**不静默** | ✅ 已有（语义等价） |

---

## 二、本轮落地的四个补丁（都已实测）

### 补丁 1 · Ask first 永远赢（`alwaysAsk`）

`rules.json` 的规则可以带 `alwaysAsk: true`：**这类动作永远要人点头，就算人上一次点了"永久放行"也不能绕过**。对应手册的"Ask first 与 Allow automatically 冲突时 Ask first 赢"。

已加一条真实例子（外发内容）：

```json
{ "toolPrefix": "mcp__", "field": "text",
  "fieldContains": ["发布", "publish", "post", "发到", "群发"],
  "level": "L3", "alwaysAsk": true,
  "desc": "外发内容（永远要人点头，always 不能绕过）" }
```

代码：`store/levels.ts`（`Classification.alwaysAsk`）→ `extensions/superagent.ts`（命中 `alwaysAsk` 时**不**读记忆里的 always 决策）。

### 补丁 2 · 卡片要能一眼看出风险

手册对命令审批卡的要求：批准前读完整命令，盯三处——**路径 / 改动 / 外发**。我们的卡片现在自带这三行提示，并写明"过期=未放行；过期不会补做，要继续请重跑"。

### 补丁 3 · 规则能被定期复核（`/super audit`）

```
/super audit
→ 🔍 规则复核
  常设授权（1）
    ✅ 永久放行 tool:bash:git push  ← 永久放行 git push（2026-11-03 02:19）
  ⚠️ 范围偏宽（1）：tool:bash —— 建议改成带具体动作的 scope
  最近审批卡（11）  ✅/⛔/⌛/⏳ 逐条
  复核清单：① 过期卡 ≠ 已放行 ② always 列表里有没有你已忘了的条目 ③ 拒绝之后去源系统确认真的没发生
```

### 补丁 4 · 草稿卡（人点发送才出门）

这是手册里最被我们低估的一块：**"Bot 可以准备任何东西，但按下 Send 的人是你"**。

```
new_draft({ title, target, source, constraints, deliverable, stop_at, content })
  → 草稿卡进会话 + 钉钉；模型必须停在这里
/super drafts            # 草稿列表
/super draft <id>        # 草稿卡
/super send <id>         # 排入审批（出 L3 审批卡，scope=draft:<id>）
/super discard <id>      # 丢弃，永远不发
/super approve <ap-id>   # 批准 → 草稿状态变 approved（发送动作本身仍会被闸门拦一次）
```

实测（真实 pi 会话）：`new_draft` → 草稿卡 `df-20261103-102546-3XOC` → `/super send` → 卡 `ap-20261103-102616-1QVZ` → `/super approve` → 草稿 `approved` ✅

---

## 三、还没抄的（排进 M5/M6）

| 项 | 手册怎么做 | 我们的版本 | 什么时候做 |
|---|---|---|---|
| 例程六要素补全 | 输入来源 + 缺数据策略 | 12h 计划的步骤里加 `source` / `missingData` | M5 |
| 技能沉淀 | Teach a task 把跑通的流程存成技能 | 把 provider 声明 + 验收写成可复用 skill | M5 |
| 移除访问六步 | 停例程→登出→撤授权→删文件→隐藏→删号 | 我们的简化版：`rules.json` 里 `paused: true` + 撤销 key | 需要时 |
| 敏感文件用完删 | /workspace/secrets 约定路径 | 我们的 job 日志里有 stdout/stderr → 定期清理 | M6 |
| 群聊不出草稿/审批 | 群聊里不出现审批与草稿 | 我们的钉钉通道只有待办，够用 | 不做 |

---

## 四、明确不抄（连理由）

| 不抄 | 理由 |
|---|---|
| 云电脑（Cursor 托管机） | 公司代码跨境合规（机房在美国）；我们要的就是本机直连 |
| 连接器生态（Connect apps） | 我们的 provider 抽象更强：加模型 = 一个文件 + registry 一行，不用装插件 |
| 群聊多 Bot 协作 | 我们是单 Router + 多 executor；多 Bot 会引入"谁决策"的新问题 |
| 用量计费（按工作量） | 我们自控预算表（每日 calls/分钟），更可预测 |
| 复制 Bot | 复制 provider 文件一行 registry 就行，不需要"记忆不复制"那套心智负担 |
| Take over 接管 | 我们的"审批卡 + 钉钉待办 + 手机 pi-reach"已经是等价的人机边界 |
| 模型驱动的 Auto Review | 我们用**静态规则表**：确定、可审计、可版本控制；模型审查只作为未来增强，不做主闸门 |

---

## 五、可复核性

- 原文出处：`https://github.com/anightmonarch/grokbot-guide`（`docs/` 42 篇，2026-10-20 verified），关键页在文首 `::: source` 里逐条标注了 docs.x.ai 的官方链接。
- 手册本身明确区分"官方文档"与"社区实践/个人经验"；上面第 1–19 条里，**审批三态、过期、Ask first 优先、草稿卡、例程六要素、Test run** 均为官方文档口径，**"什么时候暂停例程""按角色路径"** 等属手册作者的个人建议。
- 我们的对应实现都在 `C:\Users\S115336\.pi\agent\packages\pi-model-fleet\`，本轮新增：`store/drafts.ts`、`store/levels.ts`（alwaysAsk）、`store/approvals.ts`（卡片文案）、`extensions/superagent.ts`（`new_draft` / `/super audit` / `/super drafts|send|discard`）、`rules.json`（alwaysAsk + 外发规则）。
