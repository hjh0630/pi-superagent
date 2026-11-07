---
title: pi-Super-agent 会话存档（M1→M4 · 2026-11-03）
date: 2026-11-03
tags: [AI项目, pi-CLI, Super-agent, 会话存档, M1, M2, M3, M4, pi-1.5.0]
---

# pi-Super-agent 会话存档（2026-11-03 09:32 → 11:10 · M1→M4）

> 本文件是 pi 会话 `01a19f09-1a89-7138-8630-c67ca79f8a5a` 的可读转录（用户消息 + 助手回复正文，工具调用与内部过程省略）。
> 原始记录：`~/.pi/agent/sessions/--C--Users-S115336--/2026-11-03T01-32-16-394Z_01a19f09-1a89-7138-8630-c67ca79f8a5a.jsonl`
> 主题：pi 1.5.0 变更速览 → **升级到 1.5.0** → 继续 pi-Super-agent 事项 → **M1 异步派单 → M2 分级自主与审批闸门 → M3 五步验收 → M4 Watchdog/恢复便签/Panel/排程**
> 快照时间：2026-11-03 11:10（本文件为会话进行中的快照，末条回复可能未包含）

---

## 👤 用户 · 第 1 轮

pi 1.5.0更新了啥呢

---

## 🤖 助手 · 回复 1

你本地装的还是 **1.4.0**，npm 上 `latest` 已经是 **1.5.0**（发布于 2026-11-02），来源是 earendil-works/pi 的 v1.5.0 Release Notes。下面是重点：

## 新功能
- **扩展更新日志**：扩展包更新后，下次冷启动会显示 "Extension Updates" 区块（读 `package.json` 的 `pi.changelogPath` 或包根目录 `CHANGELOG.md`），`collapseChangelog` 可折叠成一行。
- **流式渲染更快**：大 tool call 改为增量解析；代码块高亮和 Markdown 渲染结果会被复用，不再每次刷新重算。
- **自定义自更新命令**：`PI_SELF_UPDATE_COMMAND` / `selfUpdateCommand`（全局设置），可用 mise/其他包管理器更新 pi。
- **GPT-6.1 Terra**：OpenAI、Azure OpenAI Responses、OpenAI Codex 可用，支持 tool search、会话中改 thinking 等级、thinking `off`，Codex 侧 500K 上下文。

## Breaking Change（注意）
- 工具参数校验改用 `@earendil-works/pi-schema`：TypeBox 中 JSON Schema 之外的特性（`Type.Refine()`、`Type.BigInt()`、`Type.Undefined()`、codecs、`Format.Set()`）**不再生效**于工具参数；纯 JSON Schema 工具（含 MCP 工具）现在获得与 TypeBox 相同的类型强制转换。错误提示格式也变了（`- path: missing` 而不是 TypeBox 的 `must have required properties path`）。

## 其他改动
- OpenAI 默认模型从 `gpt-5.5` → `gpt-6.1-sol`（ChatGPT 登录后未指定模型时也是它）。
- 内置模型目录升级到 models.dev v2：不再把 realtime/仅图像模型当聊天模型可选。
- MCP OAuth 改用 Client ID Metadata Document / 动态注册（`oauth.clientRegistration: "auto"`，`pi mcp add --oauth-client-registration`）。
- `/model`、`/scoped-models` 显示模型名；`/resume` 与 `/model` 搜索改为精确子串匹配。
- 扩展里的 `keyText()` / `keyHint()` 现从渲染上下文注入（修掉按键提示不显示）。
- `pi.exec()` 新增 `maxBuffer`，结果带 `truncated`；超时会 SIGKILL。
- 设备码登录（Copilot 等）按 Enter 自动打开验证页并复制码。
- 收紧系统提示词。

## 值得注意的修复
- **Windows 大小写路径比较 bug**：盘符大小写不一致时技能重复加载、项目信任反复询问、`--continue` 看不到会话、`pi remove` 匹配失败——这条对 Windows 用户影响挺大。
- 大流式 tool call 的 CPU/内存飙升、流式输出重复高亮整段代码。
- `tool_search` / `searchTools()` 排序改进；**中日韩等非 ASCII 查询现在能搜到东西了**（之前只保留 ASCII 字母数字）。
- macOS 中止命令会顺带执行下一条命令的问题（改为杀整个进程组）。
- HTML 导出：几千条记录的会话空白页、缺失 system 消息（`pi --export` 现在也包含 system prompt 和 tools）。
- 图片缩放现在优先小体积编码，不再发几 MB 的 PNG。
- 会话写入失败后内存与磁盘不一致、恢复会话丢历史和工具。
- `pi update` 在 Windows 上 `git clean -fdx` 失败的修复。
- Kimi K3.1 Pro 用错 K2 请求参数；Claude `role 'system' must precede...`；Bedrock strict tools 超限自动降级重试。

## 移除
- 原生 `sandbox/` 扩展示例及其依赖被删除，改用 Gondolin 示例或容器化指南。

需要我直接执行 `pi update` 升级到 1.5.0 吗？

---

## 👤 用户 · 第 2 轮

先不升级，你继续刚刚的事项

---

## 🤖 助手 · 回复 2

继续的是上一会话的 **pi-Super-agent M1 里程碑**（M0 已交付，M1 是路线图第一格）。M1 现在做完并实测通过了。

## 交付了什么（M1）

代码在 `C:\Users\S115336\.pi\agent\packages\pi-model-fleet\`：

| 模块 | 文件 | 作用 |
|---|---|---|
| 派单引擎 | `store/runner.ts`（新） | 预算闸门 → 幂等键 → 记账 → 跑 → 记账 → Outbox，顺序不可颠倒 |
| 会话唤醒 | `runtime.ts`（新） | Outbox → `pi.sendMessage()`，后台 job 完成即唤醒会话 |
| 计划窗口 | `store/plans.ts`（新）+ `store/ledger.ts` | 12h 计划（步骤+验收+预算），人批准才派发 |
| 进程层 | `providers/run.ts`（从 fleet.ts 抽出） | 启动/超时/取消/凭据清洗，dispatch 与 `/fleet run` 共用 |
| 账本迁移 | `store/db.ts` | `plans` 表加列，老库自动升级不动已有行 |

新增能力：**后台派单**（`assign_model(background=true)` 立刻返回 jobId）· **幂等去重**（sha256(provider+model+cwd+task)，24h 内成功过直接复用结果）· **Outbox 统一投递**（心跳零 token / 结果触发一个回合 / `session_start` 补投 / `agent_settled` 空闲时投）· **中断收尾**（pid 不在了标 `orphaned` 并告警）· **12h 计划窗口**（`new_plan` → 人 `/super approve` 才执行，批准/拒绝都进 `decisions` 表）。

## 实测证据（真实 pi provider，非 mock）

- 后台 job `job-20261103-014437-98QT` 8.1s 完成，输出 `灯塔OK`
- **真实 pi 会话里**（RPC 模式）`/fleet bg pi …` → 3.8s 后收到 `customType: superagent.summary` 自定义消息并自动起回合 ✅
- 幂等：同一 provider+task+cwd 再派 → 同一个 jobId，`deduped: true` ✅
- 计划 `pl-20261103-014445-92X4`：awaiting_approval → approve → 步骤后台派发 → job succeeded → 计划 `done` ✅
- 失败路径也测了：provider 不存在 → 该步 `failed`、计划 `failed`、批准轨迹不丢 ✅
- `tsc -p tsconfig.json` 0 error；回归脚本 `tools/m1-smoke.mjs`

## 新命令

```
/fleet bg <provider> <task>   # 后台派单，结果自动唤醒
/fleet wait|collect|cancel     # 等 / 立刻投递 / 杀进程
/super plan [id]               # 12h 计划
/super approve|reject <id>     # 人批准 → 步骤后台派发；人拒绝 → 什么都不跑
/super outbox                  # 待发消息 + 投递结果
```

## 文档

知识库 `E:\...\60.pi-Super-agent\`：实施记录加了**第五章（M1 交付）**、索引 README 更新到「M0+M1 已完成」、新增 `pi-Super-agent会话存档-M1-2026-11-03.md`；包 README 全部重写。

## 没变的账

pi 仍是 **1.4.0**（按你说的不升级；M1 用到的 `pi.sendMessage` / `pi.on(session_start|agent_settled)` 在 1.4.0 可用，新写的工具 schema 都是纯 JSON Schema，与 1.5.0 的 `pi-schema` 校验兼容）。**四个外部 CLI 一个都没解开**——仍卡在代理 / key / 授权（未决事项 1–5），唯一可用执行器还是 `pi`(MiniMax)；审批通道仍在会话内，钉钉卡片是 M2。

下一步你挑：**(a)** 继续 M2（钉钉审批卡 + L0–L3 分级自主，钉钉 CLI 本机已装 `dws`），**(b)** 先把代理/key 解掉让 codex/gemini/grok 复活，**(c)** 先做 M3 五步验收。改动要在你当前会话生效请 `/reload`。

---

## 👤 用户 · 第 3 轮

那你先升级pi到1.5.0，然后再继续此项目开发，各种key最后再喊我来

---

## 🤖 助手 · 回复 3

pi 已升到 **1.5.0**，扩展链路在新版本上实测通过（后台派单 + 自动唤醒都正常）。现在继续 **M2：L0–L3 分级自主 + 审批闸门**。先看钉钉通道——好消息：`dws` 已登录（黄靖辉/信泰），无需新 key。

---

## 🤖 助手 · 回复 4

M2 交付完成并实测通过。继续 **M3：五步验收**（审查→检查→合并→发布→核实 + 证据契约 + dry-run）。

---

## 🤖 助手 · 回复 5

M3 交付完成。继续 **M4：Watchdog + 恢复便签 + Panel + 排程**。

