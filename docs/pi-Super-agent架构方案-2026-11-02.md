---
title: pi-Super-agent 架构方案（pi CLI 自主 Agent 层）
date: 2026-11-02
tags: [AI项目, pi-CLI, Super-agent, Agent, 多模型编排, 远程控制]
---

# pi-Super-agent 架构方案（pi CLI 自主 Agent 层）

> 2026-11-02 整理：在 **pi CLI 本身**上构建一层"持续在线、跨会话、可调度多模型"的 Super-agent
> 落地形态：**一个 pi 包（package）+ 一个常驻 Router 会话 + 一组外部模型 Worker**
> 来源：[DeepSeek Super-agent 设计探索](https://mp.weixin.qq.com/s/zoS7GlReWPhfCjENGxXCdg) · [`dsh-superagent-prototype`](https://github.com/deepseek-ai/dsh-superagent-prototype/tree/6337fc823ce20251c8de8085948165c81aaa701e) · [Anthropic Scaling Managed Agents](https://www.anthropic.com/research/managed-agents) · [`deepseek-harness`](https://github.com/deepseek-ai/deepseek-harness/tree/ce7073d51254c26cd63b22a60835b8f948deb447) · [Simon Willison: More than just code review](https://simonwillison.net/2026/Aug/22/more-than-just-code-review/)
> 关联：`50.Myπ/`（**定位不同**：Myπ 是日常工作 Agent 产品；本项目是 pi CLI 的自主调度层，两者独立，只共享 pi 生态）

---

## 零、一句话结论

**pi 已经是一个强大的"单会话手"，缺的是"脑"——一个常驻的调度层：决定谁该干活、把活派给 gemini/grok/codex、验收结果、在手机上随时查看与干预。**

- **脑（Router）= 一个常驻 pi 会话**：只做交互、授权判定、分派、验收；不给它写文件/跑命令的工具。
- **手（Worker）= 外部模型 CLI**：gemini / grok / codex 各自在隔离 git worktree 里干活，异步回流结果。
- **主动（Trigger）= 多渠道事件统一入队**：Telegram / 手机 / 定时 / webhook / 未来的企微、飞书。
- **持久（Watchdog）= 会话之外的独立控制回路**：判"有没有实质进展"，而不是"进程还在不在"。

三份材料说的是同一件事的三个侧面：**Anthropic** 给接口（brain / hands / session 三层解耦）、**DeepSeek Super-agent** 给自主性架构（双层 + 事件驱动 + 主动 + 持久）、**Pi Durable** 给机制（Storage / Harness / Execution Env / checkpoint）。

---

## 一、定位与边界

### 1.1 本项目做什么

| # | 目标 | 交付形态 |
|---|---|---|
| 1 | **一个"grok bot 式"的常驻 Agent**：多渠道接入、自己接单、只在需要人时说话 | pi 包 `pi-superagent` + 常驻 Router 会话 |
| 2 | **通过 pi 指挥外部大模型**：gemini / grok / codex 首批，架构预留其它 | Provider Registry（可插拔执行器） |
| 3 | **手机上查看与安排任务**：看进度、追问、验收、打回、排程、打断 | `pi-mobile` 为主通道（§7） |
| 4 | **长期在线、异常自愈**：崩溃后续跑、看门狗干预 | 断点续跑标记 + Watchdog 会话 |

### 1.2 与 Myπ 的关系（**明确不同**）

| | Myπ | 本项目（pi-Super-agent） |
|---|---|---|
| 定位 | 日常工作 Agent（WorkOps 台账、微信/钉钉/邮件、打样跟单） | pi CLI 的自主调度层：写代码类长任务的编排与遥控 |
| 载体 | 独立产品（server/web/desktop/mobile） | **pi 包 + pi 会话**，跑在 pi CLI 里 |
| 用户场景 | 每天用它管事 | 需要它持续把代码任务派给多个模型并在手机上验收 |
| 关系 | **互不依赖**；只共享 pi SDK / pi 生态 | |

> 本文档不涉及 Myπ 代码库的任何改动。

### 1.3 明确不做

| 不做 | 原因 |
|---|---|
| 替换 pi 内核为 Pi Durable | Durable 是实验性包（API 随时变），且 pi 已有 skill/扩展/MCP 生态，Durable 无 `DefaultResourceLoader` 对应物；本项目只在需要处**借用其机制**（checkpoint、幂等、background task） |
| 账号反代（workbuddy2api 类） | 违反 ToS、有封号风险、凭据要进模型可达范围（踩 Anthropic 安全红线） |
| 逐行 code review 式验收 | Simon Willison：验证比逐行看更有效 |
| 无人请求时自动动手 | 起步只允许"干跑记录"（would_do），人认可后才转规则 |
| 让 Agent 制造产量（批量 PR、群发消息） | Super-agent 明令：那消耗的是团队注意力 |

---

## 二、参考材料 → 设计要点 → 采纳

| # | 材料 | 关键论点 | 采纳 |
|---|---|---|---|
| A1 | Super-agent §2 | 双层架构：常驻 Router 承接交互与全局协调，上下文隔离的 Worker 并发执行 | ✅ Router = 常驻 pi 会话；Worker = 独立 pi 会话 + 独立 worktree |
| A2 | Super-agent §2.1 | Router 不直接执行具体任务；Trigger 批处理（长输入短输出） | ✅ Router 工具集裁剪；批处理注入 |
| A3 | Super-agent §3 | 事件驱动 Trigger → Eval → Decision；订阅直通 | ✅ 已订阅 Thread 消息直接投 Worker，不二次判定 |
| A4 | Super-agent §4 | 异步 ReAct：`start()`/`stop()`，结果作为事件回流，不阻塞前台 | ✅ Worker 全走后台作业模型 |
| A5 | Super-agent §4.2 | 多信道规范：IM 单次回复 ≤100 词；异步信道高信息密度结构化 | ✅ 写进渠道适配层 |
| A6 | Super-agent §5 | 存算分离 + 执行环境分离；端侧 daemon，BYOM | ✅ 状态在 `~/.pi/agent/superagent/`；执行环境在 worktree / 远端机器 |
| A7 | Super-agent §6 | Watchdog：系统外的独立控制回路，判"实质进展" | ✅ 独立 Watchdog 会话 + 进度断言 |
| B1 | Anthropic | brain / hands / session 解耦；沙箱是可替换的 cattle | ✅ Worker 环境 = git worktree，可随时重建 |
| B2 | Anthropic | 凭据永不可从沙箱达；MCP 走代理 + vault | ✅ Worker env 白名单 |
| B3 | Anthropic | session ≠ 上下文窗口；上下文是外置对象 | ✅ pi 的 JSONL 会话日志就是外置 session log |
| B4 | Anthropic | 多个脑共享同一套手 | ✅ Provider Registry 的核心抽象 |
| C1 | dsh-superagent 001/002 | 领域模型 + 授权三档（explicit / inferred / not admitted） | ✅ 授权表落库，可审计 |
| C2 | dsh-superagent 003 | Ticket 状态机、Executor 槽位、后台作业 30 分钟上限 | ✅ 阈值可调 |
| C3 | dsh-superagent 007 | Engine 唯一写入者、事务化、Ports 解耦外部边界 | ✅ 单写者 + SQLite 事务 + 端口接口 |
| D1 | Simon Willison 08-22 | 关键是"能放心交代改动 + 能放心验证被正确应用" | ✅ 交付契约强制附可复现验证证据 |
| D2 | Pi Durable 机制 | Storage/Harness/Execution Env、checkpoint、`replay:"safe"`、background task | ✅ 借用：崩溃续跑标记、工具幂等键、后台作业语义 |

---

## 三、pi 原生能力映射（我们用什么实现什么）

| 设计要点 | pi 原生能力 | 用法 |
|---|---|---|
| Router 常驻会话 | pi 会话 + 扩展 | 在"主控台"会话里加载本包；该会话即 Router |
| Worker 隔离 | `SessionManager.create(cwd)` + git worktree | 每个 Ticket 一个 cwd 一个会话 |
| 工具暴露 | `pi.registerTool()` | `assign_worker` / `approve` / `reject` / `schedule` / `status` / `recall` |
| 命令 | `pi.registerCommand()` | `/sa` 系列：新建工单、看队列、验收、排程 |
| 事件驱动 | `pi.on("input")` / `agent_settled` / `session_start` | 准入判定、完成通知、调度器启停 |
| 结果回流 | `pi.sendUserMessage({ triggerTurn: true })` | 后台作业完成后把报告注入 Router 会话 |
| 持久化状态 | `pi.appendEntry()` + 自建 SQLite | 崩溃续跑标记写进会话 JSONL；工单库放 `~/.pi/agent/superagent/` |
| 定时触发 | 扩展内 `setInterval` + `session_start` 启动 / `session_shutdown` 停止；或系统 cron 调 `pi -p` | 两种模式（§5.2） |
| 外部模型 | 自建 Provider Registry（子进程调用官方 CLI） | gemini / grok / codex / claude / … |
| 外部工具接入 | `pi.registerMcpServer()` / `mcp.json` | 需要额外能力时挂 MCP（如多 CLI 编排 MCP） |
| 直接调模型 | `pi.registerProvider()` / `registerVirtualModel()` | 想让 pi 原生把某模型当 provider（如 ollama、OpenAI 兼容端点） |
| 手机/远端 | RPC 模式 `pi --mode rpc`；第三方包 `pi-mobile` | §7 |
| 分发 | pi package（`package.json` + `pi.extensions`） | `pi install npm:pi-superagent` 或本地路径 |
| 权限 | `pi.on("tool_call")` 审批钩子 | 高危动作（删除/推送/外发）必须人工确认 |

---

## 四、总体架构

```
┌────────────────────────── 信道层（多渠道）──────────────────────────┐
│  手机(pi-mobile) │ Telegram │ 终端 TUI │ 定时/事件 │ webhook │ MCP   │
└───────────────────────────────┬─────────────────────────────────────┘
                                │ Trigger（统一入队）
┌───────────────────────────────▼─────────────────────────────────────┐
│  Router 层（脑）= 常驻 pi 会话 + pi-superagent 扩展                    │
│  · 交互与全局协调 │ 授权判定 │ 选 provider │ 分派 │ 验收（读 evidence）  │
│  · 工具集裁剪：不给 write/edit/bash（只给调度与验收类工具）              │
│  · 批处理：多条 Trigger 合并成一次推理                                 │
└──────┬─────────────────────────────┬───────────────────────────────┘
       │ 分派（显式 cwd + 沙箱策略）      │ 结果回流
┌──────▼──────────────┐ ┌──────────────▼──────────┐ ┌─────────────────┐
│ Worker: gemini      │ │ Worker: grok            │ │ Worker: codex   │
│ gemini -p … --yolo  │ │ grok --cwd … --json -p … │ │ codex exec …    │
│ cwd=<worktree>      │ │ cwd=<worktree>           │ │ cwd=<worktree>  │
└──────┬──────────────┘ └──────────────┬──────────┘ └─────────────────┘
       │        作业状态 / 日志 / 报告事件（异步回流，不阻塞前台）      │
┌──────▼──────────────────────────────────────────────────────────────┐
│ 状态层：~/.pi/agent/superagent/                                     │
│   superagent.db（tickets/triggers/assignments/reports/jobs/budget） │
│   jobs/<jobId>.{json,log}   ← 后台作业，进程重启不丢                 │
│   sessions/                   ← pi 会话 JSONL（外置 session log）    │
│ 执行环境层：git worktree（可重建的 cattle）│ 可扩展到远端/手机端      │
└──────────────────┬───────────────────────────────────────────────────┘
                   │ 巡检
┌──────────────────▼───────────────────────────────────────────────────┐
│ Watchdog（独立 pi 会话 · 系统外控制回路 · 判"实质进展"而非"进程存活"） │
└───────────────────────────────────────────────────────────────────────┘
```

### 4.1 一次任务的完整时序

```
手机 ──"把这个接口的性能问题查一下并出 PR"
 │
 ├─(1) Trigger 入队（telegram/phone/webhook/cron 统一入口）
 ├─(2) 批处理注入 Router 会话（一次推理处理多条）
 ├─(3) Router：准入判定 explicit ✔ → 建 Ticket「查性能问题」
 │       ├─ 选 provider：能力标签 → codex（编码/仓库/PR 强）
 │       ├─ 建隔离环境：git worktree add ../wt/<ticket-id>
 │       └─ 分派：spawn codex exec … → jobId(J1)
 ├─(4) 回执一句：「已开工，PR 号回来给你」→ 手机收到（≤100 词）
 ├─(5) codex 在 worktree 里异步干活 → 产出 Report（含 evidence[]）
 ├─(6) 报告回流 → Router 读 evidence（测试命令+退出码+diff 摘要）
 │       ├─ 通过 → 出 PR → 通知手机「可验收」
 │       └─ 不通过 → 退回 Worker（带具体缺口），上限 2 次后转人
 └─(7) 手机验收：通过 / 打回 / 追加要求
```

---

## 五、领域模型与运行形态

### 5.1 领域模型（借 dsh-superagent 001/002，按 pi 需要裁剪）

| 概念 | 含义 | 存储 |
|---|---|---|
| **Source** | 事件来源（telegram/phone/cron/webhook/mcp） | `sources` 表 |
| **Thread** | 一次对话/一条工单串 | `threads` 表 |
| **Ticket** | 一件需要推进的事（核心单元） | `tickets` 表 |
| **Mandate** | 该 Ticket 的授权边界（人可收紧） | `tickets.mandate_json` |
| **Decision** | Router 对一次 Trigger 的判定（accept/attach/ignore/stop） | `decisions` 表 |
| **Assignment** | 一次"把 Ticket 交给某 Worker 干" | `assignments` 表 |
| **Report** | Worker 交付报告（必含 evidence） | `reports` 表 |
| **Notice** | 需要人处理的通知 | `notices` 表 |

### 5.2 Ticket 状态机（自上而下第一条命中者胜）

| Stage | 条件 | 面板标签 |
|---|---|---|
| person / delivery | 投递给 Worker 失败（2s → 翻倍退避至 1min） | 输入未送达 |
| person / answer | 有待答问题 | 等你回答 |
| person / review | 最新 Report 为 `ready` | 等你验收 |
| person / blocked \| failed | 最新 Report 为 `blocked`/`failed` 且无人工介入 | 卡住 / 失败 |
| working / queued | 无 Assignment 或 pending | 排队中 |
| idle | 最新 Report 为 `waiting` 或 Assignment 已结束 | 等触发 |
| working | 其余 | 进行中 |

### 5.3 常驻形态：两种模式（**必须选一个**）

| 模式 | 形态 | 优点 | 代价 | 适用 |
|---|---|---|---|---|
| **A. 会话内调度器** | 一个长期开着的 pi "主控台"会话，扩展自带 cron 循环 | 零额外进程；手机/终端随时接入同一会话 | 会话退出即停调度；TUI 断开会话可能结束 | 个人单机、随手开着 |
| **B. RPC 守护进程** | `pi --mode rpc` 常驻（Windows 任务计划程序 / NSSM / tmux），外部客户端接入 | 真正 7×24；终端、手机、渠道都只是客户端 | 多一层守护进程运维；需验证与 `pi-mobile` 的兼容性 | 长期值守、渠道机器人 |

**建议**：先做 **A**（一天内可用），验证后再升 **B**。Phase 0 必验项：`pi-mobile` 能否看到并接管 `pi --mode rpc` 常驻进程（若不支持，B 模式需要自写一个薄前端，走 pi 的 RPC 协议）。

### 5.4 状态存储

- **SQLite**（Node ≥22.19 自带 `node:sqlite`）：`~/.pi/agent/superagent/superagent.db`，7 张表。
- **会话日志**：pi 原生 JSONL —— 这就是 Anthropic 说的"session 在 harness 之外"。
- **作业日志**：`~/.pi/agent/superagent/jobs/<jobId>.{json,log}`（借鉴 `pi-ai-bridge` 的 `~/.pi/agent/ai-bridge/jobs/` 模式），进程重启不丢。

---

## 六、模型编队：Provider Registry

### 6.1 设计原则

1. **Router 只认"能力标签"，不认厂商**（`code-review`/`research`/`bulk-edit`/`pr`/`test`）。
2. **新增 provider = 新增一个文件 + 注册一行**，不改核心。
3. **执行器永远显式声明 cwd**，默认落在隔离 worktree。
4. **凭据不进沙箱**：worker 进程 env 白名单。
5. **能用官方沙箱就不用 yolo**（见 §6.7）。
6. **优先复用现成件**：`pi-ai-bridge` 已实现 claude/codex/gemini 的后台作业 + job 目录 + 工具化；本项目在其基础上加 **grok**、**路由策略**、**报告契约**与**预留注册机制**（是"扩展"而不是"重写"）。

### 6.2 Provider 定义 Schema

```ts
export interface ProviderSpec {
  id: string;                       // "gemini" | "grok" | "codex" | ...
  label: string;
  bin: string;                      // 可执行名或绝对路径
  version?: string;
  buildArgs(spec: { prompt: string; cwd: string; model?: string; extra?: string[] }): string[];
  capabilities: Record<string, number>;   // 能力标签 → 优先级权重
  limits?: { maxTurns?: number; timeoutMs?: number; contextTokens?: number };
  quota?: { maxConcurrent?: number; dailyCalls?: number; costPerCall?: number };
  sandbox: {
    mode: "worktree" | "cwd" | "readonly";
    allowNetwork?: boolean;
    osSandbox?: string;             // provider 原生沙箱档位（Windows 上可能不生效）
    toolAllowlist?: string[];
  };
  headless: boolean;                // 能否后台全自动跑
  parseOutput(stdout: string): { text: string; evidence?: EvidenceItem[] };
  isFailure?(code: number | null, stdout: string, stderr: string): boolean;
}
```

### 6.3 首批 Provider（本机实测命令）

| provider | 可执行 | 调用形态 | 能力标签 | 备注 |
|---|---|---|---|---|
| **gemini** | `gemini` 0.46.0 | `gemini -p <prompt> --yolo -m <model>` | `research:3, bulk-edit:3, general:2` | 已装；`--yolo` 才能非交互 |
| **grok** | `grok` 0.2.112 | `grok --cwd <cwd> --output-format json --always-approve --max-turns N -p "<prompt>"` | `code-review:4, research:3, pr:2` | 已装。**自带隔离与最小权限能力**（§6.7）；另有 `grok agent stdio`（ACP）/ `serve` / `leader`（多客户端共享一个后端 = Super-agent"脑共享手"形态） |
| **codex** | `codex-cli` 0.146.0-alpha.3.1 | `codex exec <prompt> --dangerously-bypass-approvals-and-sandbox -C <cwd> -m <model>` | `code:5, refactor:4, pr:4, test:3` | **不在 PATH**（`~/.codex/.sandbox-bin/codex.exe`），registry 写绝对路径或补 PATH |
| claude（预留） | `claude` 2.1.228 | `claude -p <prompt> --dangerously-skip-permissions --model <m>` | `code:5, review:4` | 已装；`pi-ai-bridge` 已覆盖 |
| 通用预留位 | — | — | — | `qwen` / `deepseek` / `ollama` / 任意 OpenAI 兼容端点（可用 `pi.registerProvider` 让 pi 原生直连） |
| workbuddy（受限） | — | — | `office:4, doc:3` | 腾讯 WorkBuddy **无公开 CLI**；处理方式见 §6.6 |

### 6.4 路由策略

```
1. 能力标签硬匹配 —— 没有能打这活的不派
2. 硬约束 —— 沙箱允许？cwd 存在？provider 在线（版本探测 ≤2s，超时跳过）
3. 优先级 —— capabilities[tag] 分数高的优先
4. 配额 —— 当日剩余次数/并发额度；不健康自动降权
5. 成本 —— 同分时挑 costPerCall 低的
6. 人工指定 —— 用户/工单显式指定时覆盖以上全部
7. 兜底 —— 全部不满足 → 不派单，报"无可用执行器"，不硬塞
```

**降级**：失败 → `retry(≤2, 指数退避)` → 换等价 provider → 仍失败则 Report=`blocked` 并通知人。**任何降级写进 Report**，人能看见"这次实际是谁干的"。

### 6.5 成本与配额

- 每日三闸：调用次数 / token 估算 / 累计时长。
- 超限：**挂起而非静默烧钱**；Router 只收到一条 budget 通知。
- 记账粒度：一次 Assignment 一条（provider、模型、时长、估算 token、退出码）。

### 6.6 WorkBuddy 怎么处理（明确结论）

1. **不做账号反代**（`workbuddy2api` 类：逆向、违反 ToS、有封号风险，且凭据要进模型可达范围 —— 同时踩 Anthropic 安全红线）。**默认不采用。**
2. **当"记忆源"与"离线环境"用**：`~/.workbuddy/{SOUL,MEMORY,USER,IDENTITY}.md` 可作为人设/长期偏好只读注入（可审计）；`binaries/{node,python,PortableGit}` 可作离线文档处理环境（不走账号、不走 API）。
3. **若腾讯出官方 CLI/Agent 接口**，按 §6.2 加一个 provider 即可，位置已预留。

### 6.7 沙箱与最小权限矩阵

| provider | 官方隔离能力 | 我们的用法 | Windows（本机）注意 |
|---|---|---|---|
| **grok** | ① `--worktree[NAME]` 自带 worktree 隔离 ② `--sandbox <profile>` **内核级**（Linux=Landlock / macOS=Seatbelt）文件与网络护栏，内置 `off`/`workspace`/`read-only`/`strict`，且**不可逆**（模型无法在运行中放宽）③ `--tools`/`--disallowed-tools` 工具白/黑名单（仅 headless）④ `--permission-mode` + `--allow/--deny` 规则 | 首选 `workspace` + 工具白名单 + worktree | ⚠️ **Windows 无内核级实现**，只 warning 后**不带强制继续** → 隔离必须我们自己做（worktree + 目录 ACL + env 白名单） |
| **codex** | `--dangerously-bypass-approvals-and-sandbox` / `-C <cwd>` | `-C <worktree>` 限定根目录 | 以 `-C` + worktree 为主 |
| **gemini** | `--yolo` | 配合工具白名单 | 以 cwd 限定为主 |
| claude | `--dangerously-skip-permissions` | 同上 | 同上 |

**安全优先级（高 → 低）**：① worktree 隔离（共同底线）→ ② 官方沙箱优先于 yolo → ③ 工具白名单 → ④ env 白名单（不含任何 `*_KEY`/`*_TOKEN`）→ ⑤ 删除/推送/外发必须人工确认（`pi.on("tool_call")` 审批钩子）。

---

## 七、远程手机方案（选型结论）

### 7.1 对比

| 方案 | 形态 | 契合度 | 结论 |
|---|---|---|---|
| **`pi-mobile`（npm 0.4.0）** | `/remote` 出二维码，手机浏览器/原生 App，E2E 加密，无服务器无账号；能应答**扩展弹窗**（权限确认、选择器）；列出机器上**所有 pi 会话**并把"需要你"的排最前；语音对话；实时看 tool steps；Tailscale 或自有 HTTPS | ★★★★★ 直接对接 pi CLI 会话 | **主选** |
| `remote-pi`（npm 0.7.0） | 手机 App + 本机 agent mesh（UDS broker，多 pi 互发消息，leader 故障自动切换）+ 跨 PC relay | ★★★★ 强在"多 pi 互联/跨机"，弱在需要 relay | 备选（当需要多机多会话协同） |
| `pi-piper`（npm 0.1.0） | Rust Hub + `/rc` + 手机 PWA，走 Tailscale | ★★★ 轻，但依赖 Tailscale | 备选 |
| `@firstpick/pi-package-remote-webui` | 局域网 WebUI + 二维码 | ★★★ 最轻，功能薄 | 局域网应急 |
| `happy-next` / `agent-of-empires` | 控 claude/codex/gemini 的手机端 | ★★★ 控的是**外部 CLI**，不是 pi 本身 | 未来"手机指挥 gemini/grok/codex"可选 |

### 7.2 结论

**主选 `pi-mobile`**：零部署（二维码即连）、E2E 加密（每台手机一对密钥）、能应答 pi 的提问与扩展弹窗（这正是 Super-agent 需要的"人在环"入口）、同一台机器所有会话统一可见。

`remote-pi` 作为**第二阶段**引入：它的本机 mesh 正好可以承载 Super-agent 的"多个 pi 互联"（Router 与 Worker 之间的消息投递、跨 PC Worker）。

### 7.3 手机上必须能做的 7 件事

| # | 能力 | pi-mobile 现状 | 需补 |
|---|---|---|---|
| 1 | 看全部工单进度 | 有会话列表与流式输出 | **需扩展**：Ticket 看板（按"需要人"优先） |
| 2 | 追问/补充上下文 | 可发消息、可 steer | 走"订阅直通"语义（关联 Ticket 而非新会话） |
| 3 | 验收 | 能看到回复 | **需扩展**：evidence 摘要 + diffStat + 通过/打回按钮 |
| 4 | 派单指定 provider | 可发指令 | **需扩展**：provider 选择器（gemini/grok/codex） |
| 5 | 排程 | 无 | **需扩展**：cron 编辑（可复用 `@amaster.ai/pi-task-scheduler` 的存储） |
| 6 | 打断 | 有 stop/steer/换模型 | 补：停某个 job、收紧 Mandate |
| 7 | 收通知 | 锁屏通知 + 扩展弹窗 | 补：工单级通知（需你答/需你验/卡住/预算到顶） |

> 扩展方式两条路：(a) pi 扩展侧把工单状态写进会话流，让 `pi-mobile` 直接看到（成本最低）；(b) 自写 PWA 前端走 `pi --mode rpc`（控制力最强，Phase 4 再评估）。

### 7.4 网络现实（必读）

本机实测：`github.com` / `npmjs.org` 直连被阻断（Clash 把 `github` 指向失效的加速节点），境内站点与 `npmmirror` / `gh-proxy.com` 可达。

手机 ↔ pi 的链路优先级：

1. **同一局域网**：`/remote` 默认地址 + WiFi 直连，最稳。
2. **自有 HTTPS 地址**：`/remote settings` 配 HTTPS 域名（`pi-mobile` 支持），适合长期在外。
3. **Tailscale**：体验取决于 DERP 质量，国内不一定稳。
4. **不裸暴露**：保持现有安全策略（认证 + 限流 + work-only 硬闸思路迁移到 RPC 通道）。

依赖安装：`npm config set registry https://registry.npmmirror.com`；git 走 `https://gh-proxy.com/https://github.com/...`；并修正 Clash 中失效的 github 规则。

---

## 八、事件驱动、调度与异步 ReAct

### 8.1 Trigger 统一入口

所有来源（Telegram/手机/定时/webhook/MCP/未来的企微飞书）先落 `triggers` 表，再由 Router 的批处理循环消费：

```
每 2s（或有命令请求时立刻）取一批未处理 Trigger
  → 若上一轮推理未结束 → 继续积压（不打断）
  → 上一轮结束 → 合并注入一次 Router 推理（长输入、短输出）
```

**批处理收益（对齐 DeepSeek 7.2 实验）**：触发速率 1/min → 40/min 时，平均 batch 1.0 → 2.8，单次请求耗时 2.5s → 3.9s（增长慢于 batch），**单决定分摊推理时间 6.4s → 1.6s**。因此初期**不需要** Router 水平切分，优先保留全局上下文连续性。

### 8.2 订阅直通

- `tickets` 维护 Thread 订阅关系。
- 已订阅 Thread 上的新消息（人/机器人/CI 都算）**直接投给对应 Worker**，跳过 Eval；但**不授予新权限**。
- Worker 认为超范围 → 交还 Router，Router 重走 Eval。

### 8.3 异步 ReAct

- 耗时命令与外部模型调用都是**后台作业**：`start() → jobId → 完成事件回流`（对应 pi 的 `session.subscribe` 事件流 + 我们的 job 目录）。
- Router 在作业进行中**仍可响应人类输入**（新输入在当前推理步结束后处理）。
- 支持 `stop()`：超限/跑偏时主动终止。
- **后台作业上限**（默认 30 分钟）：超时杀作业、标 waiting、报告注明"哪些被杀、哪些还在跑"。
- 借鉴 Pi Durable 的 background task 语义：后台作业属于会话但不属于当前工作，前台 Esc 不打断它。

### 8.4 定时任务与 Trigger 统一

**所有定时任务都是一种 Trigger**，不搞第二套调度器：

| 类型 | 例子 | 触发 |
|---|---|---|
| 巡检类 | 每天 9:00 汇总未读与待办 | cron → Trigger |
| 响应类 | PR 评论后 10 分钟无响应则提醒 | 事件 + 延迟 |
| 条件类 | 构建失败才叫人 | 事件 + 条件过滤 |
| 周期类 | 每晚跑一次回归 | cron → Trigger |

底层可复用 `@amaster.ai/pi-task-scheduler`（cron 解析 + 任务生命周期 + LLM 可调用工具）或 `@bacnh85/pi-cron`（把 prompt 打进活着的 session），但**产出统一落 Trigger 表**。

### 8.5 授权与准入（照搬 dsh-superagent 002）

| 强度 | 情形 | 结果 |
|---|---|---|
| **explicit** | 白名单内的人直接对 Agent 说；已建 Ticket 的 Thread 上的追问；admission 表标 `explicit` 的格子 | 立刻受理，开 Ticket |
| **inferred** | 非白名单的人在有 Ticket 的 Thread 上追问；admission 表标 `inferred` 的格子；**机器人**在允许列表上并@了 Agent | 候选，进 Router 判定 |
| **not admitted** | 其他机器人的消息；admission 表忽略的格子；accept 关闭时的全部 inferred | 不建 Ticket，只记录 |

**规则**：
- **allowed-list 起步**（本人 + 2–3 人），跑顺再放宽。
- **主动默认只记录**：无人请求时先以 `would_do` 干跑，人认可后才转规则。
- **Mandate 不可被消息内容修改**：聊天/邮件/PR 正文只是**输入**，不是权限。
- **越界即交还**：Worker 不能自行扩大范围。
- **噪音纪律**：只在"人必须行动"或"人能用上结果"时说话；IM 单次回复 **≤100 词**；一次只问一个具体问题，用结构化选项。

---

## 九、Watchdog（外部控制回路）

> Super-agent §6：仅靠进程存活探测不够 —— 很多异常不是崩溃，而是**模型陷入无效循环或偏离目标**。

| 项 | 设计 |
|---|---|
| 形态 | 独立 pi 会话，周期触发（建议 5 分钟） |
| 巡检对象 | 每个 `working` 的 Ticket / 每个活跃 Assignment |
| 判"实质进展" | 比较进度断言：最近 N 分钟是否有新 evidence / 文件改动 / 阶段推进；无进展超阈值 → 判"卡住" |
| 干预动作 | ① 重启 Worker（换 provider）② 降级任务范围 ③ 杀作业并标 waiting ④ 上报人（手机通知） |
| 故障覆盖 | 接口报错、状态恢复失败、worker 进程消失、预算耗尽、worktree 脏冲突 |
| 人机关系 | Watchdog 本身是完整 Agent：可用自然语言问它"为什么这任务卡了"，也可让它改主系统行为 |
| 边界 | 不能自行扩大 Mandate、不能替人验收、不能绕过预算闸 |

---

## 十、交付契约：验证优先，不逐行 review

> Simon Willison（2026-08-22）：关键是"能放心交代改动 + 能放心验证被正确应用"；逐行看代码从来不是最有效的验证方式。

### 10.1 Worker 报告契约

```ts
interface Report {
  ticketId: string;
  assignmentId: string;
  provider: string;            // 实际执行者
  model?: string;
  status: "ready" | "blocked" | "failed" | "waiting";
  summary: string;             // ≤100 词，手机可读
  changes: { files: string[]; diffStat: { added: number; removed: number }; artifacts?: string[] };
  evidence: EvidenceItem[];    // ★ 验证证据（必填，否则不予验收）
  risks?: string[];
  nextStep?: string;
}

interface EvidenceItem {
  kind: "test" | "build" | "lint" | "manual" | "benchmark";
  command: string;             // 可复现命令
  exitCode: number;            // 0 = 通过
  summary: string;             // 关键输出摘要（≤5 行）
  logs?: string;
}
```

### 10.2 Router 验收清单

1. **目标达成度**：对照 Ticket 目标与结果判定逐条打勾。
2. **证据强度**：至少 1 条可复现命令 + 退出码 0；只有"我改好了"不算。
3. **影响面**：diff 是否在 Mandate 内；是否碰了不该碰的文件（凭据、配置、锁文件）。
4. **风险项**：未覆盖路径是否已声明。
5. **人工确认**：涉及金额、对外发送、删除、发布 → 必须人工点确认（`pi.on("tool_call")` 审批钩子）。

不通过 → 带**具体缺口**退回 Worker（≤2 次），第 3 次转人。

---

## 十一、安装形态与目录

```
~/.pi/agent/
  superagent/                 ← 本项目的状态与作业目录
    superagent.db             (tickets/triggers/assignments/reports/jobs/budget)
    jobs/<jobId>.json|.log
    logs/
  extensions/ 或 packages 里：
    pi-superagent/            ← 本包（扩展 + skills + prompts）
      package.json             (keywords: ["pi-package"], pi.extensions: [...])
      extensions/router.ts     (工具、命令、事件钩子、准入判定)
      extensions/scheduler.ts  (cron 循环、Trigger 入队、批处理)
      extensions/watchdog.ts   (进展断言与干预)
      providers/registry.ts    (ProviderSpec 注册表)
      providers/{gemini,grok,codex,claude}.ts
      providers/runner.ts      (后台作业执行器)
      store/db.ts              (SQLite)
      report/schema.ts         (Report + Evidence)
      prompts/router.md        (Router 角色提示词)
      prompts/worker.md        (派单提示词模板)
      skills/superagent/SKILL.md
```

安装：
```bash
npm config set registry https://registry.npmmirror.com   # 本机 github/npm 直连被阻断
pi install npm:pi-superagent        # 发布后
pi install ./pi-superagent          # 本地开发
pi -e ./pi-superagent --help         # 单次试用
```

---

## 十二、路线图

| Phase | 内容 | 验收 |
|---|---|---|
| **0 地基**（0.5 天） | 包骨架；SQLite（7 表）；Provider Registry；runner（先接 gemini）；`codex` 补 PATH；验证 `pi-mobile` 与 `pi --mode rpc` 常驻进程的兼容性 | 手工 assign 一次 gemini：jobId → 日志 → 报告三段可见；`pnpm test` 通过 |
| **1 双层闭环**（1.5 天） | Router 工具集裁剪 + `assign_worker`/`approve`/`reject`/`status`；worktree provision + 回收；作业上限与 `stop()`；报告契约与验收清单；**加 grok provider** | 一句话 → 建 Ticket → gemini/grok 在 worktree 干活 → 回报告 → 验收通过/打回 |
| **2 事件驱动与调度**（2 天） | Trigger 总线 + 批处理 + 订阅直通；cron 合一；准入三档 + allowed-list + admission 表；接一个真实渠道（Telegram 优先） | 同一 Thread 连续追问不重复建 Ticket；未授权不建 Ticket；50 条触发下单决定耗时不爆 |
| **3 主动性与 Watchdog**（1.5 天） | `would_do` 干跑 → 人工认可 → 转规则；Watchdog（进展断言 + 干预 + 回放）；预算三闸 | Worker 卡死 15 分钟内被干预；超预算后无静默调用且有明确通知 |
| **4 手机通道收口**（2 天） | `pi-mobile` 落地（配对、局域网/自有 HTTPS）；工单信息投影进会话流（让手机直接看到看板）；通知分类；验收/派单/排程/打断入口 | 手机完成"派单 → 验收 → 打回 → 重跑"全流程 |
| **5 规模化**（后续） | RPC 守护进程模式（7×24）；`remote-pi` 多机 mesh；Worker 间直接通信（A2A，保持隔离前提）；跨设备执行环境 | — |

---

## 十三、风险登记表

| 风险 | 影响 | 缓解 | 归属 |
|---|---|---|---|
| Worker 全权限（`--yolo`/`--dangerously-skip-permissions`/`--bypass`） | 误改误删、凭据泄露 | worktree + env 白名单 + 不挂载用户 HOME；优先官方沙箱与工具白名单，yolo 降为最后手段 | Phase 1 |
| **grok 沙箱在 Windows 不生效**（仅 Landlock/Seatbelt） | 以为有隔离实则没有 | worktree + 目录 ACL（icacls）+ env 白名单；`~/.grok/sandbox-events.jsonl` 做违例审计 | Phase 1 |
| 凭据进入上下文 | 泄露 | worker env 清洗；对外 API 走代理+vault；报告落库前过滤 secret 模式 | Phase 1 |
| 消息内容被当指令（提示注入） | 越权 | 聊天/邮件/PR 正文只作输入，不进 Mandate；准入只认人显式设置 | Phase 2 |
| 噪音（最大风险） | 注意力被消耗 | 白名单起步、≤100 词、只在需要人时说话、would_do 观察期 | Phase 3 |
| 外部 CLI 配额/限流 | 任务排队 | quota + 降权 + 换 provider + 超限挂起 | Phase 3 |
| 花费失控 | 真金白银 | budget 三闸 + 每日上限 + 记账到 Assignment | Phase 3 |
| GitHub/npm 直连被阻断（本机现状） | 依赖装不上 | npmmirror + gh-proxy；修正 Clash 中失效的 github 规则 | Phase 0 |
| WorkBuddy 反代 | 封号 + ToS | **不采用**；只做只读记忆源与离线环境 | — |
| 会话模式调度随会话退出而停 | "以为在跑其实没跑" | 明确 A/B 两形态；B 形态用任务计划程序守护 `pi --mode rpc`，并加"心跳缺失"告警 | Phase 5 |
| pi 版本漂移 | 扩展 API 变更 | 锁定 `pi` 版本区间；扩展只用公开 API（registerTool/registerCommand/事件钩子） | 持续 |

---

## 附录

### A · 可直接复用的 pi 包

| 需求 | 包 | 用法 |
|---|---|---|
| 多模型派发（基座） | `pi-ai-bridge` | claude/codex/gemini 的后台作业 + job 目录 + 工具；**在其上加 grok 与路由策略** |
| 定时任务 | `@amaster.ai/pi-task-scheduler` / `@bacnh85/pi-cron` | cron 解析与任务生命周期，产出落 Trigger 表 |
| 子 agent 团队 | `pi-subagents` / `@arhen/pi-core-subagent` | 复杂任务内再分 Worker |
| 多模型路由 | `pi-shift-router` / `@sapjax/pi-orchestrator` | 按角色分配模型 |
| 信道 | `pi-messenger-bridge` / `@amaster.ai/pi-channels` / `pi-telegram` 系列 | 机器人形态的外壳 |
| 手机 | `pi-mobile`（主）/ `remote-pi` / `pi-piper` | §7 |
| 守护进程/多机 | `remote-pi` 的 mesh、`pi --mode rpc` | Phase 5 |

### B · 外部参考项目（已核实 README）

| 项目 | 用途 |
|---|---|
| `deepseek-ai/dsh-superagent-prototype` @6337fc8 | 领域模型 / 授权三档 / 状态机 / Engine 架构蓝本 |
| `deepseek-ai/deepseek-harness` @ce7073d | 会话持久化、子 Agent、Agent Teams 运行时参考 |
| `HKUDS/AutoSwarm` | 同时接 Codex/Claude/Grok/WorkBuddy 的统一编排体 |
| `hitosea/happy-next` / `agent-of-empires` | 手机端控多 CLI 的形态参考 |
| `orbiqd/orbiqd-briefkit` | 多 CLI 编排暴露成 MCP 的做法 |
| `Dokkabei97/all-agents-mcp`（已归档） | "直接调官方 CLI、不偷 OAuth token"的安全立场 |
| `lss233/kirara-ai` / `egoist/lorca` / `SouravBeraAkaSpeed/xiryn` | 机器人形态与多 agent 工作区参考 |

### C · 术语对照

| 中文 | 英文 | 含义 |
|---|---|---|
| 脑 | brain | Router + 模型，决策层 |
| 手 | hands | 执行环境（worktree / 外部 CLI 进程 / 远端机器） |
| 触发 | trigger | 外部事件进入系统的入口 |
| 直通 | subscription pass-through | 已订阅消息跳过二次判定直接派给 Worker |
| 判定 | decision | Router 对一次触发的结论 |
| 工单 | ticket | 一件需要推进的事 |
| 交付报告 | report | Worker 产出，含验证证据 |
| 外部控制回路 | control loop | Watchdog，主系统之外 |


---

## 十五、实施状态与后续增补（2026-11-03 更新）

本文是 **2026-11-02 的架构基线**，方案方向不变；2026-11-02 晚 → 11-03 上午的落地、实测与三篇新材料的取舍，见同目录：

| 文档 | 内容 |
|---|---|
| `pi-Super-agent实施记录-2026-11-03.md` | 已交付：手机远程链路（`pi-reach` 闭环）+ `pi-model-fleet` **M0**（5 provider 声明式注册、sqlite 账本、能力目录、每日预算闸门、30 分钟零成本心跳）；文件清单、实测证据、运行手册、未决事项、M1–M6 路线 |
| `pi-模型舰队接入现状-2026-11-03.md` | 逐项实测：网络矩阵与代理状态、codex / gemini（含 Antigravity CLI）/ grok / grok bot / deepseek / claude 的真实状态与修法、provider 注册表、5 条故障模式备忘 |
| `pi-Super-agent设计借鉴-2026-11-03.md` | 三篇材料（dsh 解读 / 卡兹克实践 / Grok Bot 手册）→ **8 条设计公理**、照抄与不抄清单、三个关键设计（L0–L3 分级自主、双通道汇报、T1/T2 两级执行器） |
| `pi-Super-agent会话存档-2026-11-02.md` | 当日会话全文转录 |

**对本文的三处修正（以增补文档为准）**：
1. **手机通道**：原文首选 `pi-mobile`，但它强制依赖 Tailscale 提供 HTTPS，而 Tailscale 在国内 App Store 不可安装 → 已改用 **`pi-reach`**（PWA + 公共 relay，已配对成功），`pi-mobile` 保留为应急旁路。
2. **执行层要分两级**：原文把 gemini/grok/codex 视为同级 Worker；实测显示 API 级（DeepSeek/xAI，OpenAI 兼容，免授权、可高并发）与 CLI 级（能改文件跑命令）性质不同 → 正式拆为 **T1 API 级 / T2 CLI 级**，T1 承担调度与裁决，T2 承担执行。
3. **路由不能由弱模型自由裁量**：按卡兹克原则（"不能用笨逼指挥聪明的"）→ 路由规则外置为 `~/.pi/agent/superagent/rules.json`，并加**每日预算闸门**。

**下一步**：M1 异步化 + 12 小时计划窗口 → M2 审批卡与 L0–L3 分级自主 → M3 五步验收 → M4 Watchdog 与排程 → M5 真实试点 → M6 社媒/付费。
