---
title: pi-Super-agent 实施记录（2026-11-03）
date: 2026-11-03
tags: [AI项目, pi-CLI, Super-agent, 实施记录, pi-model-fleet]
---

# pi-Super-agent 实施记录（2026-11-03）

> 记录 2026-11-02 16:09 → 11-03 09:23 的一次连续工作：从「能不能用手机远程操作 pi」出发，一路做到「pi 统一调度多模型、自动开展一个项目」的 M0 交付。
> **2026-11-03 09:45 追加：M1 已交付（异步化 + 幂等 + Outbox + 12h 计划窗口），见第五章。**
> **2026-11-03 10:30 追加：pi 已升级到 1.5.0；M2 已交付（分级自主 + 审批闸门 + 钉钉审批卡），见第六章。**
> **2026-11-03 10:45 追加：M3 已交付（五步验收 + 证据契约 + dry-run），见第七章。**
> **2026-11-03 11:05 追加：M4 已交付（Watchdog + 恢复便签 + Panel + 排程），见第八章。**
> 架构基线见 `pi-Super-agent架构方案-2026-11-02.md`；三篇文章的提炼与取舍见 `pi-Super-agent设计借鉴-2026-11-03.md`；各模型接入实测见 `pi-模型舰队接入现状-2026-11-03.md`；本次会话全文见 `pi-Super-agent会话存档-2026-11-02.md`。

---

## 零、一句话结论

**两条线同时推进并各自闭环：** 手机侧用 `pi-reach`（PWA + 公共 relay）打通了远程查看与指令下达；模型侧自建 `pi-model-fleet` 包并交付 M0（5 个 provider 声明式注册 + sqlite 账本 + 能力目录 + 每日预算闸门 + 30 分钟零成本心跳），实测跑通"模型开工单 → 派单 → 证据落库 → 心跳"全链路。**当前唯一可用的大模型执行器是 `pi`（MiniMax）；其余四个外部 CLI 全部被网络与账号双重阻断，唯一网络可达的是 DeepSeek API，只缺一个 key。**

---

## 一、今天落地的东西

### 1.1 线 A · 手机远程链路（已闭环）

| 步骤 | 结论 |
|---|---|
| 首选方案 | `pi-mobile`（E2E 加密、无中继、锁屏通知、语音）——**但它强制走 Tailscale Serve 提供 HTTPS**，而 Tailscale 在国内 App Store 无法安装 |
| 实际落地 | 改用 `@yefengr/pi-reach`：公共 relay + 网页 PWA，手机零安装（Safari/Chrome 打开即用） |
| 配对结果 | ✅ 已成功，`~/.pi/pi-reach/peers.json` → `iPhone browser`（短 ID `4K00kQgy`，配对时间 2026-11-02 16:56） |
| Relay | `https://pi-reach-relay.yefengr.cn`（.cn 域名，本机实测 1.2s 可达） |
| 安全现状 | ⚠️ **无应用层 E2E**（仅 TLS，relay 运营方理论上可见内容）；配对关系长期有效，配对码本身一次性、5 分钟上限 |
| 附带处置 | Tailscale 已装但**转发已关**（`tailscale serve --https=443 off` → `No serve config`），不做公网暴露 |
| 已知坑 | Windows Git Bash（MSYS）会把 `/pi-reach devices` 这类参数转成 `C:/Program Files/Git/...`，需 `MSYS_NO_PATHCONV=1` |

### 1.2 线 B · 模型舰队 `pi-model-fleet`（M0 已交付）

**定位**：pi 是脑与界面，外部模型 CLI 是手；一个 provider = 一个文件，加模型不改核心。

| 组件 | 路径 | 作用 |
|---|---|---|
| 包本体 | `C:\Users\S115336\.pi\agent\packages\pi-model-fleet\` | 本地 pi 包，已 `pi install` 写进 `~/.pi/agent/settings.json` |
| 工具 | `extensions/fleet.ts` | `assign_model` 工具（派单 → 落账 → 出报告 → 出心跳）+ `/fleet` 命令 |
| 编排层 | `extensions/superagent.ts` | `new_ticket` / `record_decision` 工具 + `/super` 命令 |
| Provider 契约 | `providers/types.ts` | `ProviderSpec`：bin / buildArgs / parseOutput / capabilities / envAllow / sandbox |
| 五个 provider | `providers/{gemini,grok,codex,claude,pi}.ts` | 声明式注册表；`pi` provider 走 RPC 起第二个 pi 运行时 |
| 账本 | `store/db.ts` + `store/ledger.ts` | sqlite（7 表）：tickets / assignments / reports / events / outbox / decisions / plans / budget |
| 能力目录 | `store/catalog.ts` | `rules.json` 驱动的路由与每日预算闸门 |
| 账本文件 | `C:\Users\S115336\.pi\agent\superagent\superagent.db` | `node:sqlite`（Node 24.16 ✅） |
| 规则表 | `C:\Users\S115336\.pi\agent\superagent\rules.json` | provider 分级/能力标签/日限额 + 路由表 |
| 作业记录 | `C:\Users\S115336\.pi\agent\fleet\jobs\<job-id>\` | `job.json` + `output.log`（原始 stdout/stderr） |
| 测试脚本 | `tools/fleet-test.mjs` | RPC 冒烟测试（可脚本化跑 provider） |

**M0 验收证据（模型自主调用，全链路实测）**

| 表 | 实际写入 |
|---|---|
| `tickets` | `tk-20261102-223553-DQX4` · M0 ledger smoke test · **queued → running → done** |
| `assignments` | `as-...N4WV` · 关联该 ticket · provider=pi · **succeeded** · exit=0 · 3568ms · 输出 `LEDGER OK` |
| `reports` | `rp-...CKRP` · status=**ready** · evidence={exitCode, durationMs, logPath} |
| `budget` | pi: 1 call / 4 s（上限 60 calls / 90 min） |
| `events` | 6 条审计事件：created → ticket.running → assignment.started → ticket.done → assignment.finished → report.added |
| `outbox` | 心跳入队（pending）：`⏱ 心跳 · 22:35 · 过去 30 分钟｜完成 1｜失败 0｜在跑 0｜待办 0｜需你 0` |

**已具备的 4 项能力**：可审计的工作单元（工单=意图+验收+预算）· 路由由规则表决定（不让弱模型自由裁量）· 每日预算闸门（超限直接拒派）· 30 分钟心跳（纯模板读账本，**零 token**）。

---

## 二、运行手册（下次接手照此操作）

```powershell
# 1) 让扩展生效（新会话或 /reload）
pi                                  # 启动后先敲 /reload

# 2) 看能力目录与路由
/super catalog
/super route code                  # → codex > claude > pi

# 3) 开工单 → 派单 → 心跳
#    模型侧：new_ticket → assign_model(ticket_id=...)
/super tickets
/super ticket <id>
/super heartbeat 30                # 生成一次心跳快照并入 outbox

# 4) 预算与决策
/super budget
/super decisions
```

```bash
# 5) 命令行直跑 provider（冒烟测试用）
cd C:/Users/S115336
MSYS_NO_PATHCONV=1 node .pi/agent/packages/pi-model-fleet/tools/fleet-test.mjs "/fleet run pi 说一句话" 60

# 6) 查账本
python -c "import sqlite3;c=sqlite3.connect(r'C:\Users\S115336\.pi\agent\superagent\superagent.db');[print(r) for r in c.execute('SELECT * FROM tickets')]"
```

**手机侧**：`https://pi-reach.yefengr.cn/app` → 选这台电脑上的 pi 会话 → 发指令 / 看流式输出。

---

## 三、未决事项（等你提供）

| # | 事项 | 缺什么 | 阻断了什么 |
|---|---|---|---|
| 1 | **开代理**（Clash 之类） | 一个动作 | codex / gemini / grok 三家的网络全断 |
| 2 | **DeepSeek API key** | 一个 key | T1 主力执行器（唯一现在网络可达的模型） |
| 3 | **Antigravity CLI 授权**（`D:\ai\Antigravity CLI\agy.exe`） | 点一次 Google OAuth | gemini 这一格复活（比废弃的 gemini CLI 更强，自带 `--remote-control`） |
| 4 | **codex API Key 登录** | 一个 OpenAI key | codex 权益问题（ChatGPT 登录 6 个模型全 `model_not_found`） |
| 5 | **grok 设备码授权** | 代理开启后点一次 | grok CLI + `grok agent serve/leader`（唯一可编程接进执行层的外部件） |
| 6 | **审批卡通道**（钉钉 or 飞书） | 一个选择 | L3 动作的"人在环"落地 |
| 7 | **试点项目**（独立站：仓库/技术栈/域名/部署目标） | 需求 | M5 真实闭环 |
| 8 | **预算上限**（每日/每模型/总额） | 一个数 | 闸门只能用默认值 |

**待你拍板的设计点**（我已给建议，见会话存档）：
- D1 是否坚持"全部本地、不接 Grok Bot/Muse 云电脑"（建议：是）
- D2 调度与裁决用强模型，Flash 级只做提取杂活（建议：是）
- D3 四个坏 CLI：修 vs 弃 vs 混合（建议：混合，T1 兜底）
- D4 审批卡载体（建议：钉钉卡片，国内可达 + 按钮回填）
- D5 首批触发源（建议：钉钉 + 手机 PWA + cron）
- D6 改造顺序（建议：M0→M1→M2→M3→M4→M5→M6）

---

## 四、下一步路线

| 阶段 | 内容 | 验收 |
|---|---|---|
| **M1**（1 天） | ✅ fleet 异步化：派单即返回 jobId、后台跑、完成用 `pi.sendMessage` 唤醒；幂等去重；Outbox；**12 小时计划窗口（需人批准）** | ✅ 已实测：派单不阻塞主回合；12h 计划可一键批准（见第五章） |
| **M2**（1 天） | ✅ L0–L3 分级自主 + `tool_call` 审批钩子 + **钉钉审批卡**（待办完成 = 批准）+ `expires_at`（过期=未放行）+ 决策记忆表 | ✅ 实测：L3 被拦 → 卡片（会话+钉钉）→ 批准 → 会话被唤醒 → 自动重试（见第六章） |
| **M3**（1 天） | ✅ 五步验收（只读审查限 3 轮 / 检查 / 合并 / 发布 / **核实**）+ 证据契约 + dry-run | ✅ 在 fleet-demo 真仓库上跑通：dry-run 只记录、非 dry-run 出审批卡且不执行（见第七章） |
| **M4**（半天） | ✅ Watchdog + 恢复便签 + Panel（需人/在跑/完成/花钱）+ 排程（Windows 计划任务） | ✅ 判"有没有实质进展"；每次启动写恢复便签；15 分钟一次自动巡检 |
| **M5**（1–2 天） | **真实试点：做一个独立站**（代码 → 五步验收 → 托管 → 社媒内容排期，只到 L1/L2） | 一个可访问的站点 + 7 天内容排期 + 完整心跳与 12h 汇报记录 |
| **M6**（需资质） | 付费渠道 + 社媒自动发布（**批量授权窗口**内自动） | 一周自动发布 N 条、花费在预算内、0 次越权 |

**官方推荐顺序（三篇一致）**：一次性任务跑通 → 沉淀成 Skill → 做成 Routine。我们已处于第一步（fleet 单次任务跑通 ✅），下一步是 Skill 化与例程化。

---

## 五、M1 交付（2026-11-03 09:45 追加：异步化 + 12h 计划窗口）

> 一句话：**派单不再挡住主回合——`assign_model(background=true)` 立刻返回 jobId，CLI 在后台跑，结果通过 Outbox 唤醒会话；同一个任务不会跑第二次；跨小时的工作先变成一份「待批准的计划」，人点了才动手。**

### 5.1 交付内容（代码在 `C:\Users\S115336\.pi\agent\packages\pi-model-fleet\`）

| 模块 | 文件 | 作用 |
|---|---|---|
| 派单引擎 | `store/runner.ts` | 预算闸门 → 幂等键 → 记账 → 跑 → 记账 → Outbox（唯一顺序，不可颠倒） |
| 会话唤醒 | `runtime.ts` | Outbox → `pi.sendMessage()`：后台 job 完成 = 一条自定义消息（summary 会触发一个回合） |
| 进程层 | `providers/run.ts` | 启动/超时/取消/凭据清洗，dispatch 与 `/fleet run` 共用 |
| 计划窗口 | `store/plans.ts` + `store/ledger.ts` | 12h 计划（步骤 + 验收 + 预算），批准后按路由异步派发 |
| 账本迁移 | `store/db.ts` | `plans` 表加列迁移（老库自动升级，不动已有行） |

### 5.2 新增能力

| 能力 | 入口 | 说明 |
|---|---|---|
| 后台派单 | `assign_model({background:true})` / `/fleet bg <provider> <task>` | 立刻返回 jobId，主回合继续；结果回来自动唤醒会话 |
| 幂等去重 | 自动 | 幂等键 = sha256(provider+model+cwd+task)；在跑/排队 → 复用同一个 job；24h 内成功过 → 直接复用结果，不花第二次调用 |
| Outbox 投递 | 自动 | 心跳/结果/审批统一入队；`session_start` 补投、后台 job 结束即投、`agent_settled` 空闲时投 |
| 中断收尾 | 自动 | `session_start` 检查在跑的 job：进程 pid 不在了就标 `orphaned` 并告警，不会永远挂在账本里 |
| 12h 计划窗口 | `new_plan` + `/super approve <id>` / `/super reject <id>` | 计划是一串步骤（任务+验收+预算），不是一段话；批准前一步都不跑；批准/拒绝都写进 `decisions` 表，不会重复问人 |

**边界情况也处理了**：批准轨迹（`decided_at` / `decided_by`）只写一次不会被后续状态覆盖；某个步骤派不出去（provider 不存在 / 超预算）时该步标 `failed`、其它步照跑；所有步都失败时整个计划标 `failed`，不会永远挂在「已批准」。

### 5.3 实测证据（真实 pi provider，非 mock）

| 检查 | 结果 |
|---|---|
| 后台派单 | `job-20261103-014437-98QT` 8103ms 完成，输出 `灯塔OK`（pi 第二运行时 · MiniMax） |
| 真实会话唤醒 | RPC 会话里 `/fleet bg pi …` → 3.8s 后收到 `customType: superagent.summary` 自定义消息，并自动触发一个回合 ✅ |
| 幂等 | 同一 provider+task+cwd 再派 → 返回**同一个 jobId**，`deduped: true` ✅ |
| 账本 | assignments `succeeded` · reports `ready` · events 六条审计链 ✅ |
| 12h 计划 | `pl-20261103-014445-92X4` awaiting_approval → approve → 步骤后台派发 → job succeeded → 计划 `done` ✅ |
| 类型检查 | `tsc -p tsconfig.json` 0 error ✅ |

### 5.4 新命令速查

```powershell
/fleet bg codex 审查这次改动       # 后台派单，结果自动唤醒
/fleet wait <job-id>               # 等一个 job（最多 2 分钟）
/fleet collect                     # 立刻投递排队中的消息
/fleet cancel <job-id>             # 杀掉在跑的 provider
/super plan                        # 看所有 12h 计划
/super approve <plan-id>           # 人批准 → 步骤后台派发
/super reject <plan-id> 原因        # 人拒绝 → 什么都不跑
/super outbox                      # 看待发消息 + 投递结果
```

### 5.5 M1 之后的账（没变的部分）

- **仍只有一个可用执行器**：`pi`（MiniMax）；codex/gemini/grok/claude 的阻断原因见《模型舰队接入现状》。
- **审批通道仍在会话内**（`/super approve`）；钉钉/飞书卡片是 M2。
- 未决事项见第三章：第 1/2/3/4/5 条仍卡在「开代理 / key / 授权」——**M1 让链路变快了，但一个网络阻断都没解开**。
- pi 本体仍是 **1.4.0**（2026-11-02 已发 1.5.0，本轮不升级）；M1 用到的 `pi.sendMessage` / `pi.on("session_start"|"agent_settled")` 在 1.4.0 均可用，且新写的工具 schema 都是纯 JSON Schema（`Type.Object/Array/String/Number/Boolean`），与 1.5.0 的 `pi-schema` 校验兼容。

---

## 六、M2 交付（2026-11-03 10:30 追加：分级自主 + 审批闸门 + 钉钉审批卡）

> 一句话：**不是"让 agent 更能干"，而是"让它在不可逆的事上必须停下来问人"——L3 动作（推送/发布/删除/花钱）先落一张卡，卡没被批准就不许执行；批准之后会话被唤醒，agent 自己重试。**

### 6.1 交付内容（代码在 `C:\Users\S115336\.pi\agent\packages\pi-model-fleet\`）

| 模块 | 文件 | 作用 |
|---|---|---|
| 分级 | `store/levels.ts` + `rules.json` v2 | 每个工具调用判成 L0/L1/L2/L3；规则在机器可读的规则表里，不在 prompt 里 |
| 审批闸门 | `extensions/superagent.ts` 的 `tool_call` 钩子 | L3 拦截 → 落卡 → 拦下 → 给出放行方式 |
| 审批卡 | `store/approvals.ts` + `approvals` 表 | 卡（等级/范围/工具+参数/过期/决定）+ args_hash 识别"同一个动作" |
| 钉钉通道 | `store/channels/dingtalk.ts` | 卡片变成钉钉**待办**（标题带 `[审批S7QQ]`），在钉钉里点"完成"= 批准；本地轮询回读 |
| 决策记忆 | `decisions` 表（scope） | "always" 按范围记住（`tool:bash:git push`），同一个问题不再问 |

### 6.2 分级与默认

| 级别 | 含义 | 默认 | 例子 |
|---|---|---|---|
| L0 | 观察 | 自动 | read / grep / find / ls |
| L1 | 起草 | 自动 | 未知工具、new_plan |
| L2 | 可逆执行 | 自动 | write / edit / 普通 bash / MCP / assign_model |
| L3 | 不可逆或对外 | **必须人点头** | git push / npm publish / rm -rf / del / Remove-Item / git reset --hard |

### 6.3 实测证据（真实 pi 会话，RPC 模式）

| 环节 | 证据 |
|---|---|
| 拦截 | 模型执行 `cd /c/Users/S115336 && git push` → 工具结果变成 "L3 不可逆 动作需要人工批准：ap-20261103-020519-DXZK（B3ZM）…" —— **命令没有执行** |
| 卡片进会话 | `custom superagent.alert` 消息：等级/命中规则/截止时间/三种放行方式 |
| 卡片进手机 | 钉钉待办 `[审批B3ZM] bash: cd /c/Users/S115336 && git push`，截止时间 = 卡的过期时间 |
| 人批准 | `/super approve ap-…` → 卡变 `approved`（decided_by=human） |
| 自动继续 | Outbox 送出"✅ 审批 … 已批准，请重新执行被拦截的动作" → 会话被唤醒 → **模型自己重试** → 同一动作 args_hash 命中已批准的卡 → 放行执行 |
| 过期=未放行 | 过期的卡再批准被拒（"过期即未放行"），并标 `expired` |
| always 记忆 | scope `tool:bash:git push` 的"永久放行"写进 decisions；同 scope 之后直接放行，别的动作照问 |
| 单测 | `tools/m2-smoke.mjs`：13 条分级断言 + 卡片生命周期 + 过期 + 记忆 + 钉钉建/读/删 → **ALL PASS** |
| 类型检查 | `tsc -p tsconfig.json` 0 error |

**钉钉通道的坑（已解决）**：钉钉待办列表一页最多 20 条，而且默认只返回"执行人"角色——必须带 `--size 20 --role-types creator,executor,participant` 并翻页，否则新建的审批待办读不回来（`--size 50` 直接返回空）。

### 6.4 新命令

```powershell
/super levels                # 分级表 + 规则
/super approvals             # 所有审批卡（待批/已决）
/super approve <ap-id>       # 放行一次
/super approve <ap-id> always # 永久放行（限同 scope）
/super reject  <ap-id> [why]  # 拒绝（加 always = 永久拒该 scope）
/super sync                  # 立刻从钉钉回读答案
```

### 6.5 pi 升级到 1.5.0

- `pi update --self`：1.4.0 → **1.5.0**（npm 全局安装；npm 留了一个锁文件目录 `.pi-coding-agent-*`，因为当前 pi 进程占用着 `pi-tui` 的 `.node`，可以下次退出后删）。
- 升级后回归：扩展加载无错、`assign_model(background=true)` 参数校验通过（1.5.0 改成 `pi-schema` 校验）、后台 job 完成后仍能自动唤醒会话（`job-20261103-015529-B5D7`，4690ms，输出 `1.5.0 链路 OK`）。
- 我们的工具 schema 全是纯 JSON Schema（`Type.Object/Array/String/Number/Boolean`），与 1.5.0 的 `pi-schema` 兼容；没用 `Type.Refine()` 等 1.5.0 已移除的特性。

### 6.6 M2 之后的账

- **审批闭环现在是真的了**：会话 + 钉钉两条通道都通，人在手机上点一下"完成"就能放行（不用回到电脑前）。
- **但钉钉待办只有"完成"语义，没有"拒绝"按钮**：拒绝仍走会话命令（手机 pi-reach 可以发 `/super reject`）；要真正的卡片按钮，需要一个钉钉审批表单模板（目前企业里只有"公车使用申请单"，不适用）——**这一项需要你或 IT 建模板**。
- 四个外部 CLI 依旧全断（代理/key/授权），见第三章未决事项 1–5。

---

## 七、M3 交付（2026-11-03 10:45 追加：五步验收 + 证据契约 + dry-run）

> 一句话：**"做完了"不算数，"证据在"才算数——一条改动要走过 审查 → 检查 → 合并 → 发布 → 核实 五步，每一步都留下可复核的证据；合并和发布是 L3，卡没被批准就不执行。**

### 7.1 交付内容（代码在 `C:\Users\S115336\.pi\agent\packages\pi-model-fleet\`）

| 模块 | 文件 | 作用 |
|---|---|---|
| 五步流水线 | `store/pipeline.ts` | 审查（≤3 轮）→ 检查 → 合并 → 发布 → 核实；每步写证据 |
| 证据契约 | `verifications` 表 | run + 步骤 + 证据 JSON（动作 / 证据 / 日志路径 / 是否通过） |
| 工具 | `verify_change` | 模型可调用；`dry_run` 只记录不执行 |
| 命令 | `/fleet verify [run-id]` | 人看验收报告 |
| 路由健康度 | `store/catalog.ts` `providerHealth()` | 规则表决定"谁能干"，健康度决定"先试谁" |

### 7.2 五步与级别

| 步 | 级别 | 做什么 | 证据 |
|---|---|---|---|
| 1 审查 | L2 | 只读审查，最多 3 轮 | provider / 轮次 / 结论 / jobId |
| 2 检查 | L2 | 跑检查命令 | 命令 + exitCode + 输出尾部 |
| 3 合并 | **L3** | 合并主干 | 审批卡（含精确命令） |
| 4 发布 | **L3** | 发布 | 审批卡（含精确命令） |
| 5 核实 | L0 | 复验结果 | 命令 + exitCode + 输出尾部 |

### 7.3 实测证据（fleet-demo 真仓库）

**dry-run** `vr-20261103-020910-A5OR`：
- 审查 1 轮 → pi 给出"## 审查结论" ✅
- 检查 2 条命令 → exitCode 0 ✅
- 合并 / 发布 → `planned`（只记录"dry-run：计划执行 …"），**没有审批卡、没有执行** ✅
- 核实 → `git log --oneline -1` → `067ccd0 init` ✅

**非 dry-run** `vr-20261103-020932-SI16`：
- 审查结论"**可以合并**" ✅
- 合并 → `blocked` + 卡 `ap-20261103-020954-AH3S`（F45X，记录 `git merge feature-x`）
- 发布 → `blocked` + 卡 `ap-20261103-020955-I62E`（FKU6，记录 `npm publish --dry-run`）
- **两步都没执行**；人批准后模型重新发出同一条命令 → 闸门按 args_hash 放行

**真实 pi 会话**里模型调用 `verify_change`（cwd=fleet-demo, dry_run=true）→ 正常跑完并写进账本 ✅
`tools/m3-smoke.mjs` → **ALL PASS**；`tsc -p tsconfig.json` 0 error。

### 7.4 M3 之后的账

- 五步流水线现在能在真仓库上跑，但**只有"检查/核实"两步有硬证据**（审查也只有 pi 一家能用，其余 CLI 断着）。
- M4（Watchdog + 恢复便签 + 排程）现在好做：卡、run、assignment 都在账本里，Watchdog 读账本就能判"有没有实质进展"。
- 仍缺的东西：第六章 6.6（钉钉审批表单模板）+ 第三章未决事项 1–5。

---

## 八、M4 交付（2026-11-03 11:05 追加：Watchdog + 恢复便签 + Panel + 排程）

> 一句话：**"进程还在"不等于"有进展"——Watchdog 判的是有没有实质进展；每次启动都写一张恢复便签，断电重启不用重放整个会话；Panel 回答三问：现在需要我吗 / 系统健康吗 / 花了多少。**

### 8.1 交付内容（代码在 `C:\Users\S115336\.pi\agent\packages\pi-model-fleet\`）

| 模块 | 文件 | 作用 |
|---|---|---|
| Panel | `store/panel.ts` | 需人 / 在跑 / 完成（24h）/ 今日花费 |
| Watchdog | `store/panel.ts` `watchdog()` | 15 分钟没动静 = 卡住（不是"进程还活着"就算好） |
| 恢复便签 | `~/.pi/agent/superagent/resume.md` | 每次 `session_start` 与每次巡检写一次：谁在跑、什么等你、下一步做什么 |
| 巡检脚本 | `tools/watchdog.mjs` | 独立于 pi 运行：写便签 + 收尾孤儿 job + 需要人时入 outbox；退出码 0 正常 / 1 卡住 / 2 等人 |
| 排程 | Windows 计划任务 `pi-superagent-watchdog` | 每 15 分钟一次，人不开电脑也能被发现 |

### 8.2 实测证据

- 面板：`需人 0｜在跑 0｜完成 11（24h）｜pi 10/60 次 · 2/90 分钟` ✅
- 卡住判定：实测抓到一个 claude 任务——进程已死但账本还是 `running` → Watchdog 判"卡住" → 收尾标 `orphaned` ✅
- 恢复便签：`resume.md` 写出"在跑 / 等你 / 下一步 / 今日花费" ✅
- 排程：`schtasks /query /tn "pi-superagent-watchdog"` → 每 15 分钟一次 ✅
- **路由健康度**（实际踩出来的坑）：reviewer 候选现在按"跑成过"排序 → `pi` 优先，不再先试被墙掉的 `claude`（之前 claude 会先卡满 4 分钟超时）✅
- `tsc` 0 error；M3 回归 ALL PASS

### 8.3 M4 之后的账

- **M0→M4 全部落地**：自主派单 · 证据落账 · 分级审批 · 钉钉卡片 · 五步验收 · 巡检与恢复。
- 还没做的是 M5（真实试点：做一个独立站）与 M6（社媒/付费，需资质）。
- M5 的前置仍是第三章未决事项 1–5（代理 / key / 授权）——**系统已经准备好了，但一个外部模型都还跑不起来**。

---

## 九、Grok Bot 手册二次提炼（2026-11-03 18:40 追加：四个补丁）

> 第一次提炼是"三文对照取公理"；这一次是**拿着已建好的 M0→M4 回头逐条对照手册**（`anightmonarch/grokbot-guide` 全 42 篇），结果发现四块缺口，已全部补上并实测。完整对照表见《grokbot-guide 二次提炼-2026-11-03.md》。

| 缺口 | 手册怎么说 | 我们补了什么 | 实测 |
|---|---|---|---|
| **Ask first 必须赢** | 两类规则冲突时 Ask first 优先 | 规则新增 `alwaysAsk`：这类动作永远要人点头，"永久放行"也不能绕过 | 规则已加（外发内容），`levels.ts` + `superagent.ts` 已接 |
| **卡片要能一眼看出风险** | 批准前读完整命令，盯三处：路径 / 改动 / 外发 | 卡片自带"盯三处"清单 + "过期=未放行；过期不会补做，要继续请重跑" | 卡片文案已更新 |
| **规则要能被定期复核** | 定期查 always 列表是否过宽/忘了；Deny 后去源系统确认 | 新增 `/super audit`：常设授权清单 + 过宽 scope 告警 + 最近审批卡 + 复核清单 | 实跑输出正常 |
| **草稿卡：人点 Send 才出门** | 可编辑草稿 → 人点发送；群聊里不出现草稿 | 新增 `new_draft`（五要素：结果/来源/约束/交付物/停在何处）+ `/super send` → L3 审批卡 → 批准才可发 | 实跑：`new_draft` → `df-20261103-102546-3XOC` → `/super send` → 卡 `ap-20261103-102616-1QVZ` → approve → 草稿 `approved` ✅ |

**结论**：我们第一轮抄的是"公理"（脑手分离、注意力纪律、先记账后动手），这一轮发现真正的差距在**人机边界的细节语义**——过期不补做、Ask first 优先、卡片可读、规则可复核、草稿先行。这五项才是"敢让它自己跑"的前提。

---

## 十、M5 真实试点推进（2026-11-03 19:00 追加：站点工厂 + 只用 pi + 证据包）

> 三个决定由 pi-superagent 代做：**业务形态**（B2B：帮美国承包商做 Google Maps 可见度优化）· **州**（内华达·拉斯维加斯都会区）· **部署**（Cloudflare Pages）。工位 `C:\Users\S115336\site-m5\`，工单 `tk-20261103-103815-UBS0`。

### 10.1 本轮新增的能力（代码在 pi-model-fleet）

| 能力 | 位置 | 说明 |
|---|---|---|
| **角色表** | `rules.json` 的 `roles` + `store/roles.ts` + 工具 `assign_role` + `/super roles` | 6 个"机器人"（design / frontend / review / seo / social / deploy），角色带常设简报，计划里写角色不写 CLI |
| **计划依赖** | `store/plans.ts` `dependsOn` + `waitForDependencies` | 评审等构建，步骤不再并行打架 |
| **单模型强制** | `store/roles.ts` `PI_FLEET_ONLY_PROVIDER` | 本轮只用 pi（MiniMax）：角色与评审全部锁到同一个执行器 |
| **证据包** | `tools/m5-evidence.mjs` → `docs/verify-evidence.md` | 机器采集 13 项发布红线；**评审只判证据包**，不再逐行翻仓库 |
| **脱离式 supervisor** | `tools/m5-wave*.mjs` | 长任务必须由长驻进程托管（否则子进程被父进程连坐回收） |

### 10.2 "模型错误"的真相（三个不同的事）

1. **antigravity 前端作业超时**：20 分钟上限被杀（exit=None）。文件其实已落盘，19 个页面已生成——**超时 ≠ 没做**。
2. **pi 复审 exit=1、耗时 900107ms**：pi 内部 15 分钟超时被切断（它在逐行读 build.mjs）。**慢模型 + 大仓库 = 撞超时**。已修：pi provider 内部超时 15→40 分钟；评审超时按执行器区分（pi 45 分钟 / 其他 15 分钟）；**评审改为只看证据包 → 15 分钟降到 56 秒**。
3. **评审"不能合并"**：不是崩，是结论——wave3 评审在真实仓库里找到 6 个必须先修的**内容正确性**问题（详见 10.3）。

### 10.3 这一轮真正抓到的（内容正确性 > 好看）

wave3 评审（grok）在真实仓库里挑出 6 项，其中三项是"发出去会误导客户/搜索引擎"级别的：

- **五个城市页各自声明了一家 LocalBusiness**（虚假门店，Google 会当成 5 家店）
- **把 MapSignal 写成持牌派工网络**（Service.provider + "verified/background-checked 技师" + 24/7 调度台）
- **编造价格与法规**：诊断费 $49-89、"2026 Clark County 中位数"、"寿命缩短 30-50%"、"电费下降 30-40%"、**"Top-rated"**，以及把**加州的 Title 24 法规**写进内华达
- JSON-LD 钉了占位坐标与营业时间；关键词文档里写了可直接粘贴的**虚假业主答复与完工帖**（"Green Valley 95 PSI"）

wave6/wave7 评审又补出两个 P0：

- **全站主体仍是 HomeAndConstructionBusiness**（上一轮只清了城市页），服务页 Offer 名还叫 "Emergency AC Diagnostic & Repair"
- **线索表单根本没接后端**：`<form action="/contact" method="get">` 把 email/phone 塞进 URL 跳转 → **PII 进历史与 CDN 日志、线索 100% 丢失**，Cloudflare Function 是死代码
- 附带：og:image 是 SVG，社媒平台不渲染（分享空白）

### 10.4 方法论沉淀：**证据包是起点，不是围栏**

同一个模型、同一份证据，提问口径不同结论就不同（"只判证据包 → 无阻塞项"；"证据包 + 允许只读核对 → 又抓出 2 个 P0"）。
因此：**机器采集证据 → 模型判证据 + 允许只读复核 → 人只做上线闸门（NAP 真值、合并、部署、外发）**。

### 10.5 现在的状态

- 站点：18 个页面 + sitemap/robots/llms.txt + 三套部署配置 + 线索表单 Function + 分享图，`npm run build` 通过
- 文档：站点蓝图 / SEO-GEO 资产 / 社媒手册 / 本地渠道打法 / 注册手册 / 关键词地图 / 页面计划 / 历次评审
- 草稿卡：4 条可发布英文帖（Nextdoor / LinkedIn / Facebook / LinkedIn），全部**未发**，等人点
- 剩下的全是**人工事项**：NAP 真值（商号/地址/电话/邮箱/域名/工时）· 合并审批 · `wrangler login` 一次 · 各平台账号注册的身份验证（手机/邮件/执照/地址证明）
- 渠道矩阵与"不抄 Grok Bot 的云电脑"等取舍见《M5 真实试点-站点工厂》
