# pi-superagent

> 把 Pi 变成一个**可审计的多模型编排台**：一个 Pi 会话里派单给别的模型 CLI，把结果写进一个账本，
> 不可逆动作卡在审批墙前，每一步都有证据。

设计来源是三篇文章的共同内核（微信文「dsh-superagent 解读」/ X 长文「一年实践」/ Grok Bot 中文指南），
提炼过程见 [`docs/pi-Super-agent设计借鉴-2026-11-03.md`](docs/pi-Super-agent设计借鉴-2026-11-03.md)。

这个仓库是**可移植**的：不含任何一台机器的绝对路径，所有位置都能用环境变量改。

---

## 它是什么

| 部件 | 作用 |
|---|---|
| `extensions/fleet.ts` | `assign_model`：把任务派给另一个模型 CLI（gemini / grok / codex / claude / antigravity / pi），前台或后台 |
| `extensions/superagent.ts` | `/super` 命令族：工单、计划窗口、审批卡、预算、决策、汇报 |
| `store/` | 账本（SQLite）：tickets / plans / assignments / approvals / drafts / decisions / budget / reports / verifications |
| `providers/` | 每个模型 CLI 的适配层（怎么起进程、怎么收结果、怎么判失败） |
| `runtime.ts` | 后台任务完成后的**唯一投递通道**（outbox → 会话） |
| `tools/` | 运维工具：站点静态服务、隧道守护、访客口径、DoH DNS、看门狗、12 小时报告 |
| `config/rules.example.json` | L0–L3 分级规则、角色路由表、provider 能力与预算 |
| `docs/` | 三篇来源的提炼、架构方案、实施记录、会话存档、本周踩坑记录 |
| `examples/site-m5-waves/` | 一个真实试点站的 12 轮编排脚本（作为用法样例） |

---

## 安装

```bash
# 1) 把仓库放到 pi 的包目录（默认 ~/.pi/agent/packages/pi-superagent）
git clone https://github.com/hjh0630/pi-superagent.git ~/.pi/agent/packages/pi-superagent

# 2) 装成 pi 包
cd ~/.pi/agent && pi install ./packages/pi-superagent

# 3) 重载会话
/reload
```

装完就有两个新能力：**模型**用 `assign_model`，**人**用 `/fleet` 和 `/super`。

---

## 用法速查

### 派单给别的模型 CLI（模型视角）

```
assign_model({ provider: "grok", task: "只读评审这个目录，指出必须先修的问题", cwd: "C:/work/repo" })
assign_model({ provider: "codex", task: "...", cwd: "C:/work/repo", background: true })   # 后台，回来再叫醒会话
```

`provider + task + cwd + model` 完全相同 → **幂等**，不会重复花额度。

### 车队与账本（人视角）

```
/fleet                      # provider 列表 + 最近 5 个任务
/fleet providers            # provider 能力标签
/fleet bg <provider> <task> # 后台派单
/fleet wait <job-id>        # 最多等 2 分钟
/fleet collect              # 现在就把 outbox 里的结果送进会话

/super                      # 工单
/super ticket <id>          # 一个工单
/super plan                 # 12 小时计划窗口
/super approve <plan-id>    # 批准 → 各步骤后台自动派出去
/super reject  <plan-id>    # 拒绝 → 什么都不发生
/super approvals            # 审批卡（待处理 + 已处理）
/super approve <ap-id>      # 允许一次（/super approve <ap-id> always = 该范围内一直允许）
/super budget               # 今天每个 provider 花了多少
/super catalog              # 能力表 + 路由表
/super decisions            # 人已经做过的决定（别再问）
/super outbox               # 待投递消息 + 投递结果
```

### 草稿卡（永远由人按下发送）

```
new_draft({ title, target, source, constraints, deliverable, stop_at, content })
/super drafts | /super draft <id> | /super send <id> | /super discard <id>
```

草稿带五个要素：**结果 / 依据 / 约束 / 交付物 / 停在哪**。
`/super send` 只生成 L3 审批卡——**内容不会自己发出去**，人点头才发。

---

## 分级自主 L0–L3

每个工具调用都有级别，级别决定**谁可以放行**：

| 级别 | 含义 | 例子 |
|---|---|---|
| L0 | 观察 | 读文件、grep、find、ls |
| L1 | 起草 | 生成产物供人取用（默认级） |
| L2 | 可逆 | 改本地文件、写分支、装依赖、派单 |
| L3 | 不可逆 | 发布、合并主干、花钱、对外、删数据 —— **必须人点头** |

规则表在 `config/rules.example.json` → 装好后落到 `~/.pi/agent/superagent/rules.json`。
`/super levels` 看分级表，`/super audit` 审当前规则（哪些永远允许、哪些太宽、最近的卡）。

---

## 可移植性：所有路径都从这里来

代码里**没有任何绝对路径**。位置由 `tools/paths.mjs` 统一解析，全部可用环境变量覆盖：

| 变量 | 含义 | 默认 |
|---|---|---|
| `PI_HOME` | pi 代理目录 | `~/.pi/agent` |
| `PI_FLEET_HOME` | 运行数据 / 日志 / 当前公网地址 | `$PI_HOME/fleet` |
| `PI_ANALYTICS_DIR` | 第一方统计目录 | `$PI_FLEET_HOME/analytics` |
| `PI_LEDGER_DB` | 账本数据库 | `$PI_HOME/superagent/superagent.db` |
| `PI_RUN_WINDOW` | 运行窗口文件 | `$PI_HOME/superagent/run-window.json` |
| `PI_SITE_DIR` | 要发布的站点目录 | `~/site` |
| `PI_PROGRESS_DIR` | 每小时进度快照落地目录 | `$PI_FLEET_HOME/progress` |
| `PI_VAULT_FILE` | 邮箱 vault | `$PI_HOME/vault/mailbox.json` |
| `PI_LIVE_URL_FILE` | 当前公网地址 | `$PI_FLEET_HOME/live-url.txt` |
| `PI_INDEXNOW_KEY` | IndexNow 校验 key | `$PI_FLEET_HOME/indexnow-key.txt` |
| `PI_HITS_FILE` | 访问日志 | `$PI_ANALYTICS_DIR/hits.jsonl` |
| `PI_TOOLS_DIR` | 本包 tools 目录 | `$PI_HOME/packages/pi-superagent/tools` |

换一台机器，只要 `PI_HOME` 指对（或用默认的 `~/.pi/agent`），就能跑。

---

## 运维工具（tools/）

| 工具 | 干什么 |
|---|---|
| `serve-static.mjs` | 静态站 + 第一方统计后端（`GET /__stats`、`POST /api/track`），零依赖 |
| `tunnel-watchdog.mjs` | 隧道守护：隧道掉了自动换供应商重连，把当前地址写到 `live-url.txt` |
| `doh-dns.mjs` | 本地 DoH 解析器（UDP+TCP），给被劫持 DNS 的网络用；**不要占 53** |
| `visitors.mjs` | 「什么算一个真实访客」的唯一口径（探针 / 自检 / 真人分开计数） |
| `watchdog.mjs` | 看门狗：关闭陈旧运行与孤儿派单、过期审批卡、心跳 |
| `progress-hourly.mjs` | 每小时进度快照（目标追踪 + 真实访客 + 花费） |
| `report-12h.mjs` | 12 小时报告：完成 / 失败 / 待决策 / 在跑 / 花费 |

典型调用：

```bash
node tools/serve-static.mjs 8787 "$PI_SITE_DIR/dist"   # 起站 + 统计
node tools/watchdog.mjs                                # 巡检账本
node tools/report-12h.mjs                              # 出报告
node tools/visitors.mjs                                # 看真实访客
```

---

## 安全约定（踩过坑才写下来的）

1. **任何进程都不要绑 53 端口**，更不要改网卡 DNS。Clash / 公司 DNS / 本地解析器会互相抢端口，
   抢到的一方如果答不出（SERVFAIL），表现就是「域名全废 = 断网」。
2. **本机 DNS 解析结果不可信**：被代理的 fake-IP、被劫持的通配符都会给出「看起来正常」的答案。
   判断公网可达性要用**外部探针**，本机自检只能证明本地进程活着。
3. **不可逆动作永远先出审批卡**，包括 `rm -rf`、`git push`、`wrangler deploy`、对外发帖。
4. **审批规则要匹配命令位置**，不要全文 grep 关键词：`grep "rm -r"` 不是删除，却会触发 L3 噪声。
5. **「真实访客」口径必须排除工具**（探针、自检、爬虫），否则数字好看但没有生意。

---

## 文档

| 文件 | 内容 |
|---|---|
| [`docs/pi-Super-agent设计借鉴-2026-11-03.md`](docs/pi-Super-agent设计借鉴-2026-11-03.md) | **三篇文章的提炼**：共同内核、8 条公理、分级自主、五步验收、双通道汇报、取舍 |
| [`docs/pi-Super-agent架构方案-2026-11-02.md`](docs/pi-Super-agent架构方案-2026-11-02.md) | 554 行架构方案 |
| [`docs/pi-Super-agent实施记录-2026-11-03.md`](docs/pi-Super-agent实施记录-2026-11-03.md) | M0→M5 实施记录 |
| [`docs/pi-Super-agent会话存档-2026-11-02.md`](docs/pi-Super-agent会话存档-2026-11-02.md) | 早期会话存档 |
| [`docs/pi-Super-agent会话存档-M1M4-2026-11-03.md`](docs/pi-Super-agent会话存档-M1M4-2026-11-03.md) | M1–M4 会话存档 |
| [`docs/grokbot-guide二次提炼-2026-11-03.md`](docs/grokbot-guide二次提炼-2026-11-03.md) | Grok Bot 指南二次提炼 |
| [`docs/pi-模型舰队接入现状-2026-11-03.md`](docs/pi-模型舰队接入现状-2026-11-03.md) | 各 provider 接入状态 |
| [`docs/LESSONS-2026-11.md`](docs/LESSONS-2026-11.md) | **本周踩的坑与整改**（端口 53、隧道三连坑、访客口径、审批噪声、零流量复盘） |
| [`docs/M5真实试点-站点工厂-2026-11-03.md`](docs/M5真实试点-站点工厂-2026-11-03.md) | 真实试点站的工厂流程 |

---

## 许可

代码与文档均保留作者所有。引用或再分发请保留出处。
