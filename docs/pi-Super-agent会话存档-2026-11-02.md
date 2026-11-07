---
title: pi-Super-agent 会话存档（2026-11-02 全天 ~ 11-03 上午）
date: 2026-11-03
tags: [AI项目, pi-CLI, Super-agent, 会话存档]
---

# pi-Super-agent 会话存档（2026-11-02 16:09 → 11-03 09:23）

> 本文件是 pi 会话 `01a19b4e-7140-7487-8e1e-92d85aee8903` 的可读转录（用户消息 + 助手回复正文，工具调用与内部过程省略）。
> 原始记录：`~/.pi/agent/sessions/--C--Users-S115336--/2026-11-02T08-09-31-712Z_01a19b4e-7140-7487-8e1e-92d85aee8903.jsonl`
> 主题：从「手机远程操作 pi」→ 到「pi 统一调度多模型、自动开展一个项目」的完整推演与落地（M0 已交付）

---

## 👤 用户 · 第 1 轮

可以远程用手机操作pi cli，推荐安装哪个插件

## 🤖 助手 · 回复 1

查了 pi 包市场（npm `keywords:pi-package`）和 pi 官方 RPC 能力，结论如下。

## 首推：`pi-mobile`（npm:pi-mobile，v0.4.0）

```bash
pi install npm:pi-mobile
```

在你已装的 pi 1.4.0 + Node 24 上直接可用（要求 Node ≥22）。用法：任意 pi 会话里执行 `/remote` → 手机扫码 → 加到主屏幕。

为什么是它（对比其他远程方案的硬指标）：
- **端到端加密、无第三方中继**：手机经 Tailscale HTTPS 直连你电脑（hub 只监听 127.0.0.1），NaCl secretbox 封装请求/事件，没有 bearer token 可偷。
- **能应答 pi 的任意弹窗**（含扩展的 select/confirm/input），锁屏通知（Web Push，密文）、可语音对话/语音下指令、传附件、steer 中途打断、压缩上下文、切模型。
- **一次配对覆盖本机所有 pi 会话**，多台电脑可加到同一个列表（`/remote add <ssh-host>`）。
- 官方 README 自己做了横评表（vs remote-pi / @pixu1980/pi-remote / pi-remote-control），它是唯一「不需架服务器 + E2E」都满足的。

前置条件：电脑和手机都装 **Tailscale**，并在 tailnet 里启用 HTTPS（`/remote` 会直接给出 Tailscale 的一键启用链接并自动 `tailscale serve`）。如果你有自己的 HTTPS 反代，可在 `/remote settings` 里设 `publicUrl`，并把 `tailscale` 设为 false。

## 备选（按你偏好挑）

| 方案 | 安装 | 适用 |
|---|---|---|
| `@yefengr/pi-reach` | `pi install npm:@yefengr/pi-reach` | 最省事：公共 relay + 网页 PWA，`/pi-reach pair` 扫码即用。但**无应用层 E2E**（需信任 relay 运营者，敏感工作请自建 relay）。要求 Pi ≥1.3.0 ✓ |
| `pi-remote-bridge` | `npm i -g pi-remote-bridge` | 局域网内 + 官方 **Android App**，配对 token 在 `~/.pi/remote/token` |
| `@firstpick/pi-package-remote-webui` | `pi install npm:@firstpick/pi-package-remote-webui` | 已有 Pi Web UI，一键对局域网开放并出二维码 |
| `@llblab/pi-telegram` / `pi-telegram` | `pi install npm:@llblab/pi-telegram` | 想在 **Telegram 聊天框**里遥控 |
| 自己写客户端 | 无需插件 | `pi --mode rpc --no-session` 的 JSONL 协议（见 `docs/rpc.md`、`docs/rpc-commands.md`），手机端 WebSocket 客户端直接驱动 |

另外：如果你想要的是「在手机上直接跑 pi」（不是远程操控电脑），用 Termux + `npm i -g @earendil-works/pi-coding-agent`，官方 `docs/termux.md` 有完整步骤。

⚠️ 安全提醒：任何被配对的手机都拥有你 pi 的全部权限（等价于能执行任意命令），请用 `/remote devices` 定期审计并 `revoke` 掉旧设备。

要我现在直接帮你把 `pi-mobile`（或你选的那个）装上并跑一遍 `/remote` 吗？装完我还可以顺手把 Tailscale 的检查步骤一起过一遍。

## 👤 用户 · 第 2 轮

/remote

## 🤖 助手 · 回复 2

`/remote` 是 pi-mobile 扩展提供的命令，你机器上还没装。我先装上再走完流程。

## 🤖 助手 · 回复 3

Tailscale 装好了，现在需要你登录一次（**在这台电脑的浏览器**里打开下面的链接，或在手机上打开同一个账号登录也行）：

**https://login.tailscale.com/a/1bfe382c0123f4**

我在这儿等着，登录完就自动继续。

## 🤖 助手 · 回复 4

Tailscale 已装好并登录（设备 `xtpc3375`，tailnet IP `100.79.202.102`）。还差最后一步：**给你的 tailnet 打开 HTTPS（Serve）**，点这个链接一键确认：

**https://login.tailscale.com/f/serve?node=ntmTWdko5E11CNTRL**

点完我这边会自动检测到，然后生成手机配对码。

## 🤖 助手 · 回复 5

HTTPS 已开通，Serve 已挂好（`https://xtpc3375.tail464fbe.ts.net/` → 本机 7878 端口）。现在启动 hub 生成手机配对码：

## 🤖 助手 · 回复 6

已经跑通了 ✅ 现在的状态：

| 组件 | 状态 |
|---|---|
| `pi-mobile` 扩展 | 已安装（`pi install npm:pi-mobile`，已写进 `~/.pi/agent/settings.json`） |
| `/remote` 命令 | 已注册（RPC 验证：`Use every pi session on this machine from your phone (end-to-end encrypted)`） |
| Tailscale 1.104.4 | 已安装 + 已登录（设备 `xtpc3375`，账号 `hjinghui@`，tailnet IP `100.79.202.102`） |
| tailnet HTTPS(Serve) | 已开启，`https://xtpc3375.tail464fbe.ts.net/` → 本机 `127.0.0.1:7878`（实测 HTTP 200） |
| pi-mobile hub | 正在 7878 端口运行，机器级共享开关已打开（`config.json: enabled=true`） |

## 手机配对（10 分钟内有效）

**链接**（手机连上 Tailscale 后直接打开）：
```
https://xtpc3375.tail464fbe.ts.net/#p=J7E5JS5HBpQf.kJ78JcSSWMsROdK9KqN32XxpyZchFRCiImUYGi7SaWg
```

**或扫码**（二维码就是上面这个链接）：
```
▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
█ ▄▄▄▄▄ █▄▀ ▀ ▄ ▄ ▀█▄▄▀▀ ▄███▄█ ▄▄▄▄▄ █
█ █   █ █   █▀▄ ▀▀█▄▀██ ▄   ▄██ █   █ █
█ █▄▄▄█ █▄█▀ ▄█ █▄▀▀▀▀ ▀█ ▀▀▄ █ █▄▄▄█ █
█▄▄▄▄▄▄▄█▄█ █ █▄█ ▀▄█ █ ▀▄█ ▀ █▄▄▄▄▄▄▄█
█▄   █▀▄▀▄▀ ▄ ▀▄▄ ▄█▀▄███▄▀█▄▄▄█▀▄  ▀▄█
█▄ ███ ▄█▄▄▄▄▄▀ █ █▀██▄▀▄█ ▀▀  ██▄█  ▀█
██▄▄▄▄ ▄ ███▀ ▄██▀  ▄██▀█▀▄▀        █ █
██ ▄ █ ▄█▀ ▀ ██ ▀█▄▀▄▀ ▀▀▀█▀▀ ▀    █▄▀█
█▄██ ██▄ █ ▄█▄▀▀ █  █  █▄▀ ▀▀▄█▀▀█▀▄ ▀█
█ ▄ ▄▀▀▄▀ ▀▄▀█▄█ ▄▀▄▀▄▄█▀▄█▀ ▀ █ ▀▀▄ ▄█
█ ▄▀▄ ▄▄ █▀ ███▄▀ ▄█▀██▄█▀▀▄▄▀██▄ ▀ ██
█  ▀█▀▀▄  █▄▀▀▀ ▀▀▄██▄▄▀▄ ▀▀█▄██▄█▀▀███
█▄▀ ▄█▄▄█ █▀ ██▄▄  ▀█▄█▄██▀  ▀█ ▄ ▀▄▄ █
█▀▄▀ ▄█▄▄▀▀▄█ █ █ █▀ ▄  ▀ ███▄▄██▄█▄▄▀█
███▄▄▄▄▄▄  █▄▀ ███▀ █▀█▄▄   █ ▄▄▄ ▄ ▄ █
█ ▄▄▄▄▄ ███▄▄ ▄▄▄█▀ █▄█▀█▄▄▄▀ █▄█  █  █
█ █   █ █▀█▄▄  █▄ ▀▄█▀▀▀▄█▄▄▀ ▄   ▀█  █
█ █▄▄▄█ █ ▄▄▄▄▄█▀ ███▀ █▀█▄▄   █ ▄▄▄ ▄ █
█▄▄▄▄▄▄▄█▄▄██▄█▄▄█▄██▄▄▄██▄████▄███▄▄▄█
```

### 手机端三步
1. 装 **Tailscale**（iOS App Store / Android 应用商店），用**同一个账号 `hjinghui@`** 登录。
2. 手机浏览器打开上面的链接（`#p=...` 里的 `#` 后面是配对密钥，浏览器不会发给服务器）。
3. 配对成功后 **添加到主屏幕**（iOS 16.4+ / Android），这样才有锁屏通知和麦克风。

## 你这边还要做一件事

当前这个 pi 会话是在扩展安装**之前**启动的，所以在**这个终端**里执行：

```
/reload
/remote
```

`/reload` 后 pi-mobile 才会接管本会话；`/remote` 会在终端里直接画出二维码 + 地址，并把**本会话**也加入手机列表（我这边的后台进程只负责起 hub，20 分钟后退出）。

常用命令：`/remote pair`（加新设备）、`/remote devices`（审计已配对设备）、`/remote off`（停止共享）、`/remote settings`（改端口/HTTPS 地址）。

## 注意事项
- 配对码 10 分钟有效，过期就再 `/remote` 一次。
- **被配对的手机等于你电脑的完全权限**（能执行任意命令），只配自己的手机；丢了用 `/remote devices` + `revoke` 撤掉。
- 流量全程 E2E 加密（NaCl secretbox），Tailscale 只看得到密文；Serve 只在 tailnet 内可达。
- 收尾清理：后台进程会写一个 `C:\Users\S115336\remote-pairing.log`，配对完可以删掉；`tailscale serve --https=443 off` 可关掉转发。

要不要我现在帮你把 `/reload` 也跑一遍，并确认手机端能连上（我这边可以模拟一次带设备密钥的请求验证握手）？

## 👤 用户 · 第 3 轮

还有其他方案么，tailscale国内app store不能安装

## 🤖 助手 · 回复 7

Tailscale 在国内确实装不了（iOS 换区、App Store 区域限制）。有几条完全不需要它的路子，我先查证一下现有包的可用性。

## 🤖 助手 · 回复 8

Tailscale 只是「给 pi-mobile 弄一个手机能访问的 HTTPS 地址」的手段，换掉它有 5 条路，都在**不用翻墙、不用公网 IP**的前提下成立：

## 路线 A｜飞书机器人（国内最稳，我最推荐）

```bash
pi install npm:pi-feishu
```

- 飞书开放平台建**自建应用 + 机器人**，事件订阅选「长连接」，拿 App ID / Secret
- 凭据三种给法：`pi --feishu-app-id=cli_xxx --feishu-app-secret=xxx`、环境变量 `FEISHU_APP_ID/APP_SECRET`、或 `~/.pi/agent/settings.json` 的 `feishu` 字段
- **WebSocket 长连接回连飞书 → 不需要公网 IP、不需要隧道、手机不用装任何 VPN**
- 手机装飞书（国内商店正常），私聊机器人发指令：流式输出、图片上下行、Reaction/正在输入、会话隔离、@触发
- 纯 Node 实现，代码里无任何平台特定逻辑 → Windows 无坑（我已下载源码核对过）

## 路线 B｜pi-reach（最快，手机零安装）

```bash
pi install npm:@yefengr/pi-reach
```

- 手机浏览器打开 `https://pi-reach.yefengr.cn/app`（我刚实测本机 **1.2s 可达**，.cn 域名国内线路不错），pi 里 `/pi-reach pair` 扫码或输 8 位码
- 不用装 App，Safari/Chrome 打开就���，可"添加到主屏幕"
- ⚠️ 走维护者的公共 relay，**没有应用层 E2E**（只有 TLS，relay 运营方理论上能看到你的对话和代码）。敏感活儿要么自建 relay（README 有说明），要么别用这条

## 路线 C｜保留 pi-mobile 的 E2E，把 Tailscale 换成国内隧道

pi-mobile 支持 `publicUrl`（任意合法 `https://` 地址）+ `tailscale:false`，所以给它一条国内公网 HTTPS 隧道即可，**端到端加密和完整手机 UI 都保留**：

```bash
# 隧道任选：cpolar（国内最常见）/ natapp（免费需实名）/ 花生壳 / 自建 frp+域名+Let's Encrypt
cpolar http 7878        # → https://xxxx.cpolar.top
# 然后在 pi 里：/remote settings  → 填 https://xxxx.cpolar.top → 配对
```

代价：hub 暴露在公网（配对码是唯一凭证，手机本地存长期设备密钥）。建议前面再套一层反代加 basic auth / IP 白名单，或换自建 frp 只暴露随机端口。

## 路线 D｜企业微信（企微智能机器人）

```bash
pi install npm:pi-remote-wecom
```

企微后台建**智能机器人 → API 模式-长连接**，拿 BotID + Secret → `/remote setup` → 6 位码私聊绑定。同样零公网暴露。
⚠️ README 写「需要 macOS」——那只是**开机自启管理**仅 macOS；源码里明确写了「其他系统可用 `pi-remote-wecom run` 前台运行」，Windows 上跑前台进程（或用计划任务/nssm 包成服务）即可。

## 路线 E｜如果手机是安卓

Tailscale 有**官方 APK**（pkgs.tailscale.com 直装，不需要 Google Play），之前那套 pi-mobile 方案照样能用——受 App Store 区域限制的只有 iOS。另外安卓想在手机本地跑 pi 就用 Termux（`docs/termux.md`）。

---

**给你的建议**：日常遥控选 **B（pi-reach，3 分钟搞定）**；要长期稳定用、涉敏感代码选 **A（飞书）**；既要 pi-mobile 的 E2E 和语音/通知能力又要国内直连，走 **C（cpolar/frp + publicUrl）**。

现在装的 pi-mobile 先别卸，C 路线直接复用。

要我直接动手哪个？我可以：
- **A**：装 pi-feishu + 生成配置模板（你把飞书 App ID/Secret 发我，我填好并跑通长连接）
- **B**：装 pi-reach 并起 relay，把配对码和地址直接给你
- **C**：装 cpolar（或你已有 frp/服务器），自动把 publicUrl 写进 pi-mobile 配置并出配对码

另外提醒：刚才那套 Tailscale + Serve 还开着（`tailscale serve` 转发 7878），如果走 B/A 路线建议 `tailscale serve --https=443 off` 关掉。

## 👤 用户 · 第 4 轮

B

## 🤖 助手 · 回复 9

配对码有效期最长只有 5 分钟，我重新生成一个新鲜的：

## 🤖 助手 · 回复 10

B 方案已就绪 ✅

## 现在配对（5 分钟内有效）

**1. 手机浏览器打开：** `https://pi-reach.yefengr.cn/app`（实测国内 1.2s 可达）

**2. 输入配对码：**

```
KKZ4TJNQ
```

有效期到 **16:59:15**（协议上限就是 5 分钟，过期了在 pi 里重跑一次 `/pi-reach pair` 即可拿新的）。

**3. 顺手做这一步：** 在你现在这个 pi 终端里敲

```
/reload
/pi-reach pair
```

`/reload` 之后，这个**你正在跟我对话的会话**才会加载 pi-reach 扩展并自动连上 relay，手机端就能在列表里看到它、直接指挥它（我这边后台起的那个只是临时代码发布者，是个空会话）。

## 已完成的配置

| 项 | 状态 |
|---|---|
| `@yefengr/pi-reach@0.0.20` | 已装（`pi install npm:@yefengr/pi-reach`），要求 Pi≥1.3.0 / Node≥22.19，你 1.4.0 + 24.16 ✓ |
| Relay | 默认 `https://pi-reach-relay.yefengr.cn` → wss，端点已在线（配对码是发给 relay 之后才生成的，能生成就说明连接是通的） |
| 身份密钥 | 存在 Windows 凭据管理器（`@napi-rs/keyring`），不落盘明文 |
| PWA | `https://pi-reach.yefengr.cn/app`（.cn 域名，国内线路正常） |

## 用法速查

- `/pi-reach pair` 再出一组码（加新设备）
- `/pi-reach devices` 看已配对设备、`/pi-reach revoke <id>` 撤销
- `/pi-reach status` 看 relay 状态和已连设备数
- `/pi-reach stop` 断开
- 手机端：Safari/Chrome 打开 PWA → 「添加到主屏幕」；中文界面（README 提到 PWA 支持中英文）

## 两点提醒

1. **这条链路没有应用层 E2E**——TLS 只保护传输，维护 relay 的那一方理论上能看到你的对话和代码内容。涉及生产密钥/客户数据的活儿，建议改走飞书（长连接、不经第三方）或用 pi-mobile + 自建 frp。
2. 上一轮 pi-mobile 的 Tailscale 转发还开着（`tailscale serve` → 7878）。要我现在关掉吗？命令是 `tailscale serve --https=443 off`（随时能再开）。也可以顺手把 pi-mobile 的机器级共享关掉（`/remote off`），我保留安装状态以备你之后走 C 路线。

## 👤 用户 · 第 5 轮

连上了，按你说的2关闭。这个链接是长期有效么

## 🤖 助手 · 回复 11

Tailscale 转发已关掉，配对也确认落地了：

```
✅ tailscale serve --https=443 off   →  No serve config（7878 不再对 tailnet 暴露）
✅ ~/.pi/pi-reach/peers.json          →  "iPhone browser"  已于 16:56 配对成功
```

## 关于「这个链接长期有效吗」——要分三层看

| 对象 | 是否长期有效 | 说明 |
|---|---|---|
| 配对码 `KKZ4TJNQ` | ❌ 一次性，5 分钟上限 | 协议里 `PAIR_TTL_MAX_MS = 300000` 写死的。用完即废，废弃就重跑 `/pi-reach pair` |
| 配对关系（手机 ↔ 这台电脑） | ✅ **长期** | 手机浏览器把身份存 localStorage，电脑端把 peer 存 `~/.pi/pi-reach/peers.json`（已写入）。以后这台电脑开任何 pi 会话，手机自动就能看到，**永远不需要再输码** |
| PWA 网址 `https://pi-reach.yefengr.cn/app` | ⚠️ 依赖维护者 | 是维护者托管的静态站 + 公共 relay（`pi-reach-relay.yefengr.cn`）。收藏到主屏幕即可，但对方哪天下线/换域名就得跟着改 |

想彻底摆脱对维护者的依赖，有两条路：

1. **自建 relay**（README 有 `Self-hosting` 章节：relay + PWA 都可自己部署），然后 `/pi-reach set-relay https://你的域名`（源码里是 `setRelay()`，只接受 http/https，内部自动转 wss）。国内自己有个小 VPS 的话，延迟和可用性都更好。
2. **换飞书**（`pi install npm:pi-feishu`）——长连接回连，完全不依赖任何第三方服务器/域名。

## 现在的日常用法

- 电脑端：pi 启动后自动连 relay；`/pi-reach status` 看状态、`/pi-reach devices` 看已配对设备、`/pi-reach revoke <id>` 撤销
- 手机端：PWA 打开 → 直接看到这台电脑上**正在运行的 pi 会话** → 选一个就能发指令、看流式输出、传附件、停止任务、压缩上下文、切模型/思考等级
- 前提：**必须有 pi 在跑**（Pi Reach 不能远程启动 pi，也不能让 pi 后台常驻）。如果你要「电脑关了就还能用」，得让 pi 跑在常开机器上（配合 tmux/herdr 之类）

另外提醒两点：
- 这条链路**没有应用层 E2E**，relay 运营方理论上能读到你的对话和代码——涉密任务切飞书或自建 relay。
- 之前 pi-mobile 我**只关了 Tailscale 转发**，扩展还装着、机器级共享开关还是开的（hub 仍在本机 7878 监听，但只对 localhost，外部访问不到）。要彻底停掉就在 pi 里跑 `/remote off`；想留着以后走 C 路线（配 publicUrl）就保持现状。

## 👤 用户 · 第 6 轮

/pi-reach devices

## 🤖 助手 · 回复 12

`/pi-reach devices` 在你这个会话里没被识别（扩展是会话启动后才装的，需要 `/reload` 才生效），我直接跑给你看——刚才那次是我这边的 Git Bash 把参数 `/pi-reach devices` 误转成了 Windows 路径，重新用关闭路径转换的方式跑：

## 🤖 助手 · 回复 13

`/pi-reach devices` 的真实输出：

```
[pi-reach] Paired devices:
* 4K00kQgy - iPhone browser
```

## 说明

| 项 | 值 |
|---|---|
| 已配对设备 | **1 个**：`iPhone browser`（短 ID `4K00kQgy`） |
| 配对时间 | 2026-11-02 08:56:04 UTC = 16:56 本地 |
| 存储位置 | 电脑端 `~/.pi/pi-reach/peers.json`；手机端在浏览器 localStorage；身份私钥在 Windows 凭据管理器（service `dev.pireach.pi`） |
| 撤销方式 | `/pi-reach revoke 4K00kQgy` |

## 两个小提醒

1. **你在终端里敲 `/pi-reach devices` 没反应，是因为当前会话没加载扩展**——pi-reach 是本会话启动之后才装的。敲一次 `/reload` 重新加载扩展后，`/pi-reach`、`/pi-reach pair`、`/pi-reach devices`、`/pi-reach status`、`/pi-reach stop`、`/pi-reach set-relay <url>` 这些命令就会原生生效（现在它们会当作普通文本发给我）。
2. 刚才发现一个 Windows 下的坑：**在 Git Bash 里带 `/` 开头的参数会被 MSYS 自动转成 Windows 路径**（`/pi-reach devices` → `C:/Program Files/Git/pi-reach devices`）。所以在 Git Bash / MSYS 终端里手动跑 `pi --mode rpc` 之类要带这类参数时，加 `MSYS_NO_PATHCONV=1` 或用 `MSYS2_ARG_CONV_EXCL='*'` 关掉转换。pi 自己的 TUI 不受影响。

补充一句现状：刚才那条链路现在是「**配对已生效，但 Pi Reach 的 PWA 只会列出正在运行的 pi 会话**」——这个聊天会话 `/reload` 之后就会出现在手机列表里。另外 `pi-mobile` 的机器级共享开关仍是开的（hub 只监听本机 127.0.0.1:7878，外部访问不到，Tailscale 转发也已关）。要彻底停掉就在 pi 里 `/remote off`，要保留备用就先这样。

## 👤 用户 · 第 7 轮

列出今天早上关于pi cli调用其他大模型cli的方案

## 🤖 助手 · 回复 14

今早那次会话（本地 **08:31–10:58**，session `01a199ab`）里关于「pi CLI 调用其他大模型 CLI」一共摆出了 **4 类方案**，最终收敛到第 2 类。方案原文已落盘：

> `E:\00.sincetech\10.knowledge\Sintech\00.david\10.AI项目\60.pi-Super-agent\pi-Super-agent架构方案-2026-11-02.md`（554 行）

---

## 方案一：直接用现成 pi 包当基座（不自己写）

今早盘出的 npm `pi-package` 里能「遥控其他模型 CLI」的：

| 包 | 版本 | 做法 | 覆盖模型 | 今天状态 |
|---|---|---|---|---|
| **`pi-ai-bridge`** ⭐基座 | 0.2.0（2026-06） | `ask_ai / check_ai / list_ai / cancel_ai` 四个工具 + `/ask`、`/ask-wait`、`/ai-jobs` 命令，把 CLI 当**后台全权 agent** 跑（`--dangerously-skip-permissions` / `codex exec --bypass` / `gemini --yolo`），job 落 `~/.pi/agent/ai-bridge/jobs/` **重启不丢** | claude / codex / gemini | ❌ 未装 |
| `pi-opium` | 0.4.2（2026-10） | orchestrator + 后台专家 + **多模型 council** | 多模型 | ❌ 未装 |
| `@sapjax/pi-orchestrator` | — | 按角色派不同模型（scout/worker/reviewer） | 多模型 | ❌ 未装 |
| `pi-shift-router` | — | 逐轮模型路由 + 故障转移 | 多模型 | ❌ 未装 |
| `pi-dynamic-workflows-oc-style` | — | 数百 subagent 扇出 + 路由 + 成本核算 + worktree 隔离 | 多模型 | ❌ 未装 |
| `pi-subagents` / `@chankov/agent-fleet` / `@arhen/pi-core-subagent` | — | 子 agent 团队 / 依赖图调度 | 多模型 | ❌ 未装 |

**问题**：`pi-ai-bridge` **不认 grok**，且是"一把梭 yolo"，没有隔离/验收/路由。→ 所以今早判定它**只当基座，不当终局**。

---

## 方案二：在 pi-ai-bridge 之上自建 `pi-superagent`（今早的最终选定路线）

今早最后的结论（§6.1 原则 6：*"优先复用现成件…是扩展而不是重写"*）：

**Provider Registry 声明式注册表**——新增一个模型 = 加一个文件 + 注册一行，不改核心：

```
ProviderSpec { id, bin, buildArgs(prompt,cwd,model), capabilities, limits,
               quota, sandbox{mode,toolAllowlist,osSandbox}, headless,
               parseOutput(stdout), isFailure(code,stdout,stderr) }
```

**首批三个 provider（今早本机实测过的真实命令）**：

| provider | 实测命令 | 版本/状态 |
|---|---|---|
| **gemini** | `gemini -p <prompt> --yolo -m <model>` | 0.46.0 ✅ 在 PATH |
| **grok** | `grok --cwd <cwd> --output-format json --always-approve --max-turns N -p "<p>"` | 0.2.112 ✅ 在 PATH（另有 `grok agent stdio`=ACP / `serve` / `leader`） |
| **codex** | `codex exec <p> --dangerously-bypass-approvals-and-sandbox -C <cwd> -m <m>` | 0.146.0-alpha.3.1 ⚠️ **不在 PATH**，须用 `~/.codex/.sandbox-bin/codex.exe` 绝对路径 |
| claude（预留） | `claude -p <p> --dangerously-skip-permissions --model <m>` | 2.1.228 ✅ |
| 通用预留 | `qwen`/`deepseek`/`ollama`/任意 OpenAI 兼容端点（`pi.registerProvider` 原生直连） | — |

配套还有：7 步路由策略（能力标签→硬约束→优先级→配额→成本→人工指定→兜底"无可用执行器"）、成本三闸、失败降级链（retry≤2 → 换等价 provider → `blocked` 报人）、沙箱优先级（**worktree > 官方沙箱 > 工具白名单 > yolo 最后手段**）、WorkBuddy 报告契约（验证优先，不逐行 review）。

---

## 方案三：借 GitHub 上现成项目（不自己写扩展）

今早实搜并核实过 README 的：

| 仓库 | 借鉴点 |
|---|---|
| **`orbiqd/orbiqd-briefkit`** | 把多 CLI 编排**直接暴露成 MCP server** → pi 可 `pi mcp add` 挂载，最省事 |
| **`kbwo/ccmanager`** (1.3k) | Claude Code/Gemini/Codex/Cursor/OpenCode/Kimi 会话统一管理 |
| **`hitosea/happy-next`** (63) | 手机/Web/Apple Watch 控 Claude/Codex/Gemini/Qoder，E2E 加密，多 agent DAG |
| **`agent-of-empires`** (3.4k) | Rust，TUI/Web 管多 agent，手机友好 |
| **`GarrickZ2/grove`** (48) | Kanban TUI：worktree 当任务卡 + tmux 隔离并行 agent |
| `hoangsonww/AI-Agents-Orchestrator` (97) | Python，协调 Claude/Codex/Gemini/Copilot |
| `automagik-dev/forge` (92) | Vibe Coding++，隔离多 agent 并行 |
| `HKUDS/AutoSwarm` (2.2k) | **唯一明确同时接 Codex/Claude Code/Grok/WorkBuddy/nanobot** 的统一编排体 |
| `lss233/kirara-ai` (19k) | 中文圈最成熟：微信/QQ/Telegram + DeepSeek/Grok/Claude/Gemini/Ollama |
| `artickc/grok-telegram-bot` | 用 **ACP(stdio) 遥控官方 Grok CLI** ← 你本机 grok 支持 |
| `andyyaro/orkestra` / `Moco99/OpenRelay` / `brianjhang/vibe-switch` | 本地优先编排 / 角色化 / tmux-for-agents |

---

## 方案四：今早明确**否决**的（留档避免以后走回头路）

| 否决项 | 理由 |
|---|---|
| **WorkBuddy 账号反代**（`workbuddy2api` / `workbuddy2api-hub`） | 逆向、违反 ToS、有封号风险，且凭据必须进模型可达范围——同时踩 Anthropic 安全红线。WorkBuddy 只当**只读记忆源**（`~/.workbuddy/{SOUL,MEMORY,USER,IDENTITY}.md`）+ 离线文档环境 |
| **直接拿 deepseek-harness 当框架** | 它是 DeepSeek 自家运行时，dsh-superagent 只是它的 bundle；正确做法是**借它的领域模型（Source/Thread/Ticket/Mandate/Decision/Assignment/Report）+ 状态机**，在 pi 上用 `pi.registerTool` + RPC + worktree 复刻 |
| **`all-agents-mcp`** | 已归档，作者自己的结论："直接调 CLI + Skills 才是主流"——与 Anthropic "hands 是可替换的"一致 |
| **grok 内核级沙箱在 Windows 上依赖** | 只有 Landlock(macOS/Linux)/Se

…（本条回复共 4731 字，已截断；完整内容见原始 jsonl）

## 👤 用户 · 第 8 轮

收敛一下，给我你的方案建议，一个方案就行

## 🤖 助手 · 回复 15

# 方案建议（收敛版）

**一句话：自建一个薄 pi 扩展 `pi-model-fleet`——声明式 Provider Registry + 4 个 provider（gemini/grok/codex/claude）+ worktree 隔离 + 异步 job + 报告契约；手机端沿用今天已打通的 `pi-reach`。装在 pi 用户级，不进 Myπ，不碰任何现有业务代码。**

---

## 1. 为什么是它（对掉另外三条路）

| 候选 | 结论 |
|---|---|
| `pi-ai-bridge` 当基座 | ❌ 0.2.0 停在 2026-06（5 个月未更新）、只认 claude/codex/gemini、**没有 grok**、没有 worktree 隔离、没有报告契约。要补齐等于 fork 它，不如自己写 300 行。**它的三个好设计我抄**：工具化入口、job 目录、命令 |
| 每次手敲 `codex exec ...` | ❌ 不能被 pi 编排、不能异步、不能留痕、不能验收 |
| 挂 `orbiqd-briefkit`（MCP server） | ⚠️ 值得**评估**，但它覆盖的模型/隔离/契约都不透明，且外部 MCP 无法按你的能力标签路由。留作备胎 |
| **自建 `pi-model-fleet`** | ✅ **采纳**。~300 行、声明式、后续接 qwen/deepseek/ollama/workbuddy 只加一个文件；能塞进 worktree 隔离和"验证优先"的报告契约 |

---

## 2. 形态

```
C:\Users\S115336\.pi\agent\packages\pi-model-fleet\
├── package.json          keywords:["pi-package"], pi.extensions
├── extensions\fleet.ts   registerTool("assign_model") + registerCommand("/fleet")
├── providers\
│   ├── gemini.ts   grok.ts   codex.ts   claude.ts   ← 每加一个模型 = 一个文件
│   └── types.ts    ProviderSpec（buildArgs / parseOutput / isFailure / sandbox / quota）
├── store\jobs.ts    node:sqlite ✅（你 Node 24.16，node:sqlite 可用）
└── skills\fleet.md  给模型看的用法说明
```

`pi install ./packages/pi-model-fleet`（本地路径包，写进 `~/.pi/agent/settings.json`）。

## 3. 首批 provider（本机实测命令已核对）

| provider | 调用形态（已验证 flag 存在） | 版本 | 沙箱 |
|---|---|---|---|
| **gemini** | `gemini -p <prompt> --yolo -m <model>` | 0.46.0 | 仅 cwd |
| **grok** | `grok --cwd <cwd> --output-format json --always-approve --max-turns N -p "<p>"` | 0.2.112 | `--sandbox workspace` + `--tools` 白名单（Windows 无内核级，隔离靠我们） |
| **codex** | `codex exec <p> --dangerously-bypass-approvals-and-sandbox -C <cwd> -m <m>` | 0.146.0-alpha.3.1 ⚠️ **须绝对路径** `~/.codex/.sandbox-bin/codex.exe`（不在 PATH） | `-C` + worktree |
| **claude**（预留位） | `claude -p <p> --dangerously-skip-permissions --model <m>` | 2.1.228 | cwd |

**预留**：`qwen` / `deepseek` / `ollama` / 任意 OpenAI 兼容端点（`pi.registerProvider` 原生直连）/ workbuddy（腾讯若出官方 CLI 加一行）。**workbuddy 账号反代一律不做**（逆向、封号风险、凭据进模型可达范围）。

## 4. 隔离与安全（Windows 优先）

优先级固定：**worktree > 官方沙箱 > 工具白名单 > yolo（最后手段）**

- 每次任务落独立 `git worktree`，provider 一律显式 `-C/--cwd` 指进去
- 子进程 env 白名单：**剔除所有 `*_KEY` / `*_TOKEN` / `*_AUTH`**
- 删除/推送/外发类操作 → `pi.on("tool_call")` 挂人工确认钩子
- grok 的 `--worktree`（自带）先于我们建，优先用它的

## 5. 触发与回流

- **工具**：`assign_model({ provider, task, cwd?, model?, verify? })` → 立刻返回 `jobId`，不阻塞
- **命令**：`/fleet list` `/fleet show <id>` `/fleet cancel <id>` `/fleet run gemini "..."`
- **job 落盘**：`~/.pi/agent/fleet/jobs/*.jsonl`（历史可查）+ sqlite 索引
- **报告契约**（照 Simon Willison 的"验证优先"）：worker 必须交 **验证证据**（测试/构建/diff 摘要 + 影响面），pi 只验收"证据通过"，不逐行读代码
- **路由**：能力标签（`code`/`research`/`review`/`test`）→ 硬约束（cwd 存在/版本可探测/配额）→ 优先级 → 成本；人工指定直接覆盖；全不满足就**报"无可用执行器"**，不硬塞
- **降级**：失败 → retry≤2 → 换等价 provider → 仍失败标 `blocked` 并把"这次实际是谁干的"写进报告

## 6. 手机端怎么用（不新增投入）

今天已打通的 `pi-reach` PWA 直接复用：手机选一个 pi 会话 → 发"让 codex 修 xxx 测试" → pi 里的 `assign_model` 起 job → 流式回显与结果回 PWA。
**定时/排程**（今天早上的 Phase 1 第三件）在第二阶段再上 `@amaster.ai/pi-task-scheduler`，它能把 prompt 打进活着的 session，正好承载 fleet 作业。

## 7. 落地顺序（今天就能出结果）

| 步 | 内容 | 产出 | 时间 |
|---|---|---|---|
| **1** | 补 codex PATH + 建 `pi-model-fleet` 骨架 + gemini/grok/codex/claude 四个 provider 文件 + `assign_model` 工具 + job 落盘 | pi 里一句话派出真实任务并看到结果 | **1.5 小时** |
| 2 | worktree 隔离 + env 白名单 + tool_call 确认钩子 + 报告契约（证据校验） | 安全边界达标 | 1 小时 |
| 3 | sqlite 索引 + `/fleet` 命令 + 能力标签路由 + 降级链 | 可长期运维 | 1 小时 |
| 4 | 接 `@amaster.ai/pi-task-scheduler` 做定时排程 | 手机上"安排任务"闭环 | 30 分钟 |

## 8. 明确不做（防止走回头路）

- ❌ WorkBuddy 账号反代（`workbuddy2api` 类）
- ❌ 把 deepseek-harness / dsh-superagent 当框架直接用（只借它的领域模型：Source/Thread/Ticket/Mandate/Decision/Assignment/Report）
- ❌ `all-agents-mcp`（已归档）
- ❌ 公网暴露 pi 端口（今天已关掉 Tailscale serve；pi-mobile 的 `/remote settings` 若要填公网 `publicUrl`，必须先加反代鉴权）

---

**我的建议：先只做第 1 步**，产出是一个能立刻验证的最小闭环——你在 pi 里说「让 codex 在某个目录修个 bug」或「让 grok 审一遍这段代码」，它真跑、真回、真留痕。跑通了再补隔离和路由，别一次写全。

要我现在开始第 1 步吗？我会新建 `~/.pi/agent/packages/pi-model-fleet`、写 4 个 provider + 工具入口，然后当场跑一个 gemini 和一个 codex 的真实任务给你看结果。

## 👤 用户 · 第 9 轮

好的

## 🤖 助手 · 回复 16

Step 1 开工。先建包骨架和四个 provider：

## 🤖 助手 · 回复 17

Step 1 交付完成 ✅ —— **端到端已经跑通真任务**。

## 交付物

```
C:\Users\S115336\.pi\agent\packages\pi-model-fleet\
├── package.json              keywords:pi-package（本地包，已 pi install 写进 settings.json）
├── extensions\fleet.ts       工具 assign_model + 命令 /fleet
├── providers\types.ts        ProviderSpec 契约（声明式）
├── providers\{gemini,grok,codex,claude,pi}.ts   一个模型 = 一个文件
├── providers\pi-runner.mjs   pi provider 用的 RPC 客户端
├── providers\registry.ts     注册表（加模型只改这一行）
├── store\jobs.ts             job 落盘（job.json + output.log）
├── tools\fleet-test.mjs      RPC 冒烟测试脚本
└── README.md
```

## 真跑验证（不是模拟）

| 验证 | 结果 |
|---|---|
| 模型调 `assign_model` 工具 | ✅ tool_execution_end：`Pi (second runtime) completed (job job-20261102-115648-Y3N8, 8227ms)` → **FLEET TOOL OK** |
| `/fleet run pi ...` 命令路径 | ✅ 同样出结果 |
| job 持久化 | ✅ `~/.pi/agent/fleet/jobs/<id>/job.json` + `output.log`（含 stderr 全文） |
| env 密钥清洗 | ✅ 子进程剔除 `*_KEY/*_TOKEN/*_SECRET/*_PASSWORD/*_AUTH`（各 provider 有 `envAllow` 白名单） |
| 踩到的坑 | ⚠️ Windows 下 `codex exec` 会等 stdin → 已改成 `stdio:["ignore",...]`，codex 从"挂死"变成 6 秒内失败 |
| 附带新增 | `pi` provider：把**第二个 pi 运行时**当执行器（走 `pi --mode rpc`），你机器上唯一现在就能用的执行器，也是"换厂商要第二意见"的常备位 |

## 四个外部 CLI 的真实状态（都不是代码问题，是账号/环境问题）

| provider | 实测结果 | 修法 |
|---|---|---|
| **grok** | `Not signed in` | ✅ **正在等你授权**，手机上直接开：<br>https://accounts.x.ai/oauth2/device?user_code=YAH2-DW77<br>码：`YAH2-DW77`（进程还在等，授权完我立刻重跑验证） |
| **codex** | `The 'gpt-6.1-sol' model is not supported when using Codex with a ChatGPT account`（试了 gpt-5.1-codex / gpt-5-codex / gpt-5.1 / codex-mini-latest 全部同样报错） | 当前 ChatGPT 登录**没有 Codex 模型权限** → 需要 `codex login --api-key <你的OPENAI_API_KEY>`，或换一个带 Codex 权益的账号 |
| **gemini** | `IneligibleTierError: This client is no longer supported for Gemini Code Assist for individuals`（0.46.0 已被 Google 判死，要迁 Antigravity）；另有 "current folder is not trusted" 把 `--yolo` 降级 | 换 Antigravity 套件，或改用 `GEMINI_API_KEY`（provider 已留 envAllow），或直接弃用 gemini |
| **claude** | 挂死 150s 零输出 → 查出根因：`~/.claude/settings.json` 把 `ANTHROPIC_BASE_URL` 指向 **`http://127.0.0.1:15721`** 这个本地中转代理，而**该代理当前没在跑**（netstat 无监听） | 把那个代理软件起起来，或给 fleet 传一个不带该 env 的 settings 覆盖 |

## 你现在怎么用

1. 在 pi 里敲 **`/reload`**（扩展是本次会话之后才装的，不 reload 看不到 `assign_model` 和 `/fleet`）
2. 直接说人话即可，模型会自己调工具：「**让 codex 审一下这个仓库的 diff**」「**让 pi 用另一个模型独立复核这段结论**」
3. 手动：`/fleet providers` / `/fleet list` / `/fleet show <job-id>` / `/fleet run gemini 你的任务`
4. 手机端：你已经配好的 `pi-reach` PWA 里选这个会话，照样发指令，job 结果回传到手机

⚠️ **安全现状**：`assign_model` 的执行器在目标目录里有**完整工具权限**（`--yolo` / `--dangerously-bypass-approvals-and-sandbox` / `--always-approve`），目前只有"显式 cwd + env 清洗"两层保护。Step 2 会补：git worktree 隔离、工具白名单、`pi.on("tool_call")` 人工确认钩子。

**建议下一步**：你把 grok 授权掉（手机上 30 秒），我立刻用 grok 跑一个真任务补齐第二家厂商的证据；随后要么走 Step 2 补隔离，要么按今早路线先接 `@amaster.ai/pi-task-scheduler` 做定时排程。你定。

## 👤 用户 · 第 10 轮

要怎么把这个功能和deepseek bot，脸书的musr，grok bot这样的超频结合起来。也就是你可以综合应用pi cli的大模型和其他大模型，自动开展某一个项目

## 🤖 助手 · 回复 18

我查证了你说的三家的真实形态（Muse 是 Meta 2026-09-08 发布的个人 Agent；DeepSeek 那边是 `dsh-superagent-prototype` 研究原型；Grok 你本机就有 CLI），先说结论：

## 先纠正前提：这三个不是同类东西，不能"合并"，得分层

| 层 | 谁 | 独有能力 | 致命短板 | 可编程性 |
|---|---|---|---|---|
| **外壳层**<br>(眼睛+嘴) | **Muse** / Grok App / DeepSeek App / 钉钉 / 微信 / 邮件 | 主动发现需求、手机推送、跨设备、长期记忆、能读你的消息/日历/邮件/浏览器 | **碰不到你的仓库和本机** | ≈ 0（Muse 无公开 API，只有 App/Web + 自己的邮箱） |
| **编排层**<br>(脑) | **pi-superagent（要我们自己在 pi CLI 里建）** | 决定做什么、派给谁、验收、记账、决定何时叫人 | 自己不写代码 | ✅ 完全自有 |
| **执行层**<br>(手) | **codex / grok cli / gemini cli / claude code / pi**（= 今天做的 pi-model-fleet） | 真改代码、跑测试、提 PR、开浏览器 | 不理解全局、不会自己排序 | ✅ 全可编程 |

> Muse 跑在 Meta 云端 VM 里、只能聊天/转发邮件；dsh-superagent 官方声明"**研究原型、非官方产品**"。所以"超集"的正确含义不是把三个 bot 塞进一个进程，而是：**让它们当"眼睛和嘴"，让 pi CLI 当"脑和手"，中间用一本 Ticket 账本连起来**。

---

## 一、每个外部件到底怎么接进来（三条完全不同的路径）

### 1. Muse（Meta）— 只能当**触发器 + 通知器**，不能当执行器
- 它跑在 Meta 云 VM、有 Sentinel 读写权限分级、有自己的邮箱地址（可转发邮件给它）、能看浏览器操作、支持 GitHub/Notion 合作
- **无公开 API/CLI** → 脚本无法驱动它。所以接法只有一条：**它发邮件/消息 → 你的 Source 解析成 Ticket**（你本机已有 `agently-mail` skill 可收发邮件）
- 反向：需要人决策时，你的 pi-superagent 把卡片/邮件推到你的 inbox（手机邮件推送 = 第二个到达通道，pi-reach PWA 是第一个）
- 值得抄的设计：**Sentinel 的读写分级** → 正好是我们今早定的"授权三档"

### 2. Grok — 有**一条真正可编程的路**
- 消费级 Grok App = 外壳（同 Muse，只能聊天）
- 但你本机的 `grok agent` 有三个可编程形态（我刚查过 help）：
  - `grok agent serve --bind 127.0.0.1:2419 --secret <token>` → **WebSocket 后端**
  - `grok agent stdio` → stdio 协议（可当 ACP 客户端被驱动）
  - `grok agent leader --leader-socket ~/.grok/leader.sock` → **多客户端共享一个后端**
- 这就是今早文档里"脑共享手"的落地：**pi-superagent 当 grok 的一个 client，多个入口（手机 PWA / 钉钉 / Muse 转发）共享同一个 grok 会话与上下文**，而不是每次新起进程重读一遍仓库

### 3. DeepSeek — 借**领域模型**，别抄代码
`dsh-superagent` 的 000~008 文档是这波最好的"自主 Agent 说明书"，我把它逐条映射到 pi：

| dsh 文档 | 机制 | 在 pi 里的落点 |
|---|---|---|
| 001-domain | Source→Thread→Ticket→Mandate→Decision→Assignment→Report | 新建 `~/.pi/agent/superagent/superagent.db`（7 表） |
| 002-authorization | 授权三档 explicit / inferred / not-admitted | fleet 的 `assign_model` 默认=inferred；push/删库/外发=explicit（人工钩子） |
| 003-execution | **每 Ticket 一个 Executor Session + 独立目录**；stage 表（person/answer、person/review、blocked…）**每档一个 Panel 标签** | 每 Ticket 一个 git worktree；stage 标签直接渲染成手机 PWA 的一行 |
| 003-execution | 前台命令 5 秒转后台、worker slot 保留、后台作业 30 分钟上限、Assignment 结束杀作业 | fleet 的 job 要加"slot + 超时 + 清理"语义 |
| 005-panel | 只显示"需要人"的东西 | **pi-reach PWA 就是现成的 Panel 载体**（今天刚打通） |
| 006-deployment | Watchdog / 部署形态 | `@amaster.ai/pi-task-scheduler` + cron 驱动 |

dsh 的 GitHub / 飞书 Source，对应你手上现成的：钉钉（`dws` skill）、飞书（`pi-feishu`）、企微（`pi-remote-wecom`）、邮件（`agently-mail`）、手机（pi-reach PWA）、GitHub issue。

---

## 二、真正的"超"在哪：执行器要分**两级**

今天 fleet 里五个 provider 其实混了两种性质：

| 级别 | 形态 | 能力 | 成本 | 登录 |
|---|---|---|---|---|
| **T1 API 级** | pi 原生 provider（`models.json` 写 `api:"openai-completions"` + baseUrl）→ **DeepSeek / xAI(Grok) / Kimi / 通义 / 智谱 / OpenRouter** | 只做"聪明的对话/推理"，**不改文件、不跑命令** | 极低、快、可高并发 | 一个 API Key（无 CLI 授权问题） |
| **T2 CLI 级** | pi-model-fleet 现有五个 | **真 agent**：改代码、跑测试、用工具、提 PR | 高、慢 | 各家 CLI 授权（你现在三个都卡在这） |

组合拳的正确姿势：**Router 用 T1 便宜模型做调度与验收；只有需要动文件/跑命令时才升级到 T2**。这样"超集"不是"堆模型"，而是**按能力分层调度 + 证据裁决**。

---

## 三、要变成"自动开展一个项目"，今天这套还差 4 块

| # | 缺什么 | 具体形态 | 大概工作量 |
|---|---|---|---|
| 1 | **Ticket 账本** | sqlite：tickets / assignments / reports / events（node:sqlite ✅ 已验证可用） | 2h |
| 2 | **每 Ticket 一个 worktree** | fleet 的 `cwd` 从"随便一个目录"升级为"自动建 worktree + 用完清理" | 1h |
| 3 | **报告契约 + 验收** | worker 必须回 `Report{status: ready｜waiting｜blocked｜failed, evidence[], impact}`；Router 只验收 evidence（Simon Willison 的"验证优先"） | 1.5h |
| 4 | **常驻 Router + Watchdog** | `pi --mode rpc` 守护进程做事件循环；Watchdog 独立 cron 每 5 分钟查停滞/需人/可自动推进；多模型 council（出题→2~3 个独立作答→按证据裁决） | 1 天 |

加上今天已有的：fleet（手）、pi-reach（人在环入口）、pi-mobile/pi-reach（手机）、pi-task-scheduler（定时）。

---

## 四、落地顺序（每步都能独立验收）

| 步 | 做什么 | 验收标准 |
|---|---|---|
| **A（今天，1.5h）** | Ticket 表 + 每 Ticket 自动建 worktree + `assign_model` 接 ticket id + 报告契约雏形 | 一个 Ticket 真实跑完 → 产出 worktree 里的改动 + 一份带 evidence 的报告 |
| **B（1 天）** | 常驻 Router（rpc）+ Source 接入（钉钉/飞书/GitHub issue/邮件/手机）+ PWA Panel（按 stage 标签

…（本条回复共 4940 字，已截断；完整内容见原始 jsonl）

## 👤 用户 · 第 11 轮

https://mp.weixin.qq.com/s/8GP8w-lbKN3kgtnKt3XURw，详细看看这个文章，你开发的这套逻辑哪些借鉴了

## 🤖 助手 · 回复 19

文章我读完了（讲 dsh-superagent 的 5 个设计 + 作者自己系统的 5 处自省）。为对照准确，我再核对一下 dsh 的对应文档：

## 🤖 助手 · 回复 20

文章我通读了（讲 dsh-superagent 的 5 个设计 + 作者拿自己系统对照的 5 处硬伤），也把 dsh 的 `001-domain.md` / `003-execution.md` / `005-panel.md` 原文调出来对照。**结论先给：真正落到我们代码里的只有 1.5 条，其余 4 条还停在今早的文档层。**

## 一、逐条对照（原文 ↔ 我们的代码）

| 文章的5 个设计 | 我们的落地状态 | 证据 |
|---|---|---|
| **1. Router-Worker 前后台分离 + 注意力纪律** | ⚠️ **形似神不似** | 形态上 pi 主会话=Router、fleet worker=子进程，已分离。**但 `assign_model` 同步阻塞最多 900 秒**——Router 会被干活占死，正是文章第一句话骂的那种情况。注意力纪律（只在"要人拍板/有成果"时开口、每次只问一个结构化问题）也只有 pi-reach 的 ask/confirm 桥接，**没有统一收敛层**，pi-reach / 邮件 / 钉钉各喊各的 |
| **2. 事件驱动 + 按来源分 Thread 串行 Eval** | ❌ **只有雏形** | ProviderSpec 声明式 + 能力标签路由 = "准入条件机器可读"的雏形。**Trigger / Thread / Eval / Decision / Subscription / 幂等（"同一 Trigger 接两次只建一个 Ticket"）全都没有**，现在是"模型一句话 → 直接 spawn" |
| **3. 异步 ReAct（5 秒规则 + 唤醒 + Watchdog + 30 分钟硬超时）** | ❌ **基本没做** | 只有 timeout 字段（900s）和今早文档里提过的 Watchdog 设想。**5 秒转后台、完成后唤醒、30 分钟硬上限、Watchdog 兜底退避/拉起，一个都没实现** |
| **4. 版本化 Policy + Mandate授权单 + 影子模式** | ⚠️ **半条** | ✅ 已落地：env 密钥白名单（凭据不进模型上下文）、显式 cwd、沙箱优先级"worktree > 官方沙箱 > 工具白名单 > yolo"（= 先窄后宽）。❌ 缺：版本化 Policy、不可变可审计的 Mandate、影子模式；授权三档只写在今早文档里，代码中没有 |
| **5. Stored Work 先记账后动手 + 全链路恢复** | ✅ **落地最扎实的一条（但只做了一半）** | ✅ **"动作未动，账本先行"是真做了**：`writeJob(status=running)` 在 spawn **之前**落库；job 记录 provider/task/cwd/status/exitCode/起止时间/输出；原始 stdout+stderr 落 `output.log`。❌ 缺：Outbox（外部消息先落盘、按序发、指数退避、不重不丢）、恢复便签（重启后先查目录和 git 历史再决定要不要重跑）、幂等键 |

**一句话**：我们目前是一个**"记账做得不错、但完全同步、没有任何事件层和恢复能力"的雏形**。

## 二、和 dsh 有 3 处**不能照抄**的语义差别

1. **Worker 的形态不同**：dsh 的 Worker 是 Harness 自己的 session（自己跑 shell，所以需要"5 秒转后台"）；我们的 Worker 是 codex/claude/grok 这些**自带 agent 循环的 CLI**，它们内部已经处理了长命令和测试。所以"5 秒规则"在我们这层应该翻译成：**不要在 pi 的工具调用里阻塞 pi 的主回合**——`assign_model` 应该"派单即返回 jobId"，CLI 在后台跑，结束再唤醒 Router。
2. **Router 不需要独立进程**：pi 的会话本身就是 Router + 界面，我们不用再套一层 harness。dsh 的 `main Session` + `worker-<ticket id>` 的"一 Ticket 一 Session 一目录"，我们用**一 Ticket 一 worktree + 一个 CLI进程**等效。
3. **Executor 在域外**：dsh 明确"Executor 在领域模型之外，通过 Assignment 连接"。这正好匹配我们——**CLI 是手，Ticket/Assignment 才是账**，别把 provider 的状态当业务状态。

## 三、作者那 5 处自省，在我们身上同样成立

| 作者的痛点 | 我们对应的现状 |
|---|---|
| 闹钟驱动 vs 事件驱动 | 我们的 Watchdog 计划是 cron 驱动 = **还是闹钟驱动**；dsh 是事件队列 + Watchdog 兜底 |
| 体检 vs 监工 | `/fleet list` 是**体检**（只报告），缺**监工**（自己退避重试/拉起重启） |
| 散文规约 vs 机器可读授权 | provider 是机器可读的 ✅，但"这活该派给谁、能不能改文件、能不能联网"目前还是**模型自由裁量 = 散文** |
| 崩溃重来 vs 断点续跑 | job 有 startedAt/status，但**重启后不会续跑**，也没恢复便签 |
| 通知轰炸 vs 统一出口 | pi-reach 是唯一出口 ✅，但**没有过滤纪律**（哪个 job 值得打断你，没规则） |

## 四、下一步建议：一次改造同时补齐设计 3 和 5

把 fleet 从"同步工具"升级成"**Stored Work + 异步 job + 唤醒**"，这是性价比最高的一步：

1. **`assign_model` 改为异步**：派单即返回 `jobId`，CLI 在扩展进程内后台跑，不阻塞 pi 主回合
2. **job 升级为 sqlite**（照抄 dsh 的表名）：`tickets / assignments / reports / outbox / events / mandates / policies`，带**幂等键**
3. **唤醒机制**：CLI 退出时，扩展用 `pi.sendMessage()` 把结果注回主会话——这就是 dsh 的"后台任务完成唤醒 Worker"在 pi 里的对应物（pi 原生支持，不需要轮询）
4. **Outbox**：所有"要人拍板"的消息先进 outbox 表，由**唯一出口**（pi-reach PWA / 钉钉）按序发送，指数退避，绝不重发5. **Watchdog**：独立 cron 每 5 分钟扫 running job——超时/失败/限流 → 退避重试 → 换等价 provider → 标 `blocked` 等人
6. **恢复便签**：pi 启动时扫 running 状态的 job，查该 job 的 worktree `git log`，生成"别从头来，先看第 N 步已完成"的便签
7. **影子模式**：文章说它还在蓝图阶段 → 我们也**先不做**，但 Policy 版本号 + Mandate 不可变签名要留位置

工作量：约 1 天（sqlite 表 + 异步改造 + 唤醒 + outbox + Watchdog + 恢复），验收标准是"断电重启一次，job 能续跑而不是重跑；一天下来手机只收到 2~3 条需要你看的消息"。

---

要我现在就开工这次改造吗？另外补充一个**必须先解决的前置**：你的 grok / codex / gemini / claude 四个 CLI 现在都卡在授权（grok 的设备码 `YAH2-DW77` 还在等你手机确认、codex 需要 API Key 登录、gemini 被 Google 判死、claude 的本地代理 127.0.0.1:15721 没在跑）。我建议**先把 T1 API 级 provider 配进 `models.json`**（DeepSeek / xAI 各一个 key，OpenAI 兼容、免 CLI 授权），这样 Router 和 council 立刻就有能用的模型，再回头修 CLI 级。

## 👤 用户 · 第 12 轮

https://x.com/khazix0918/status/2117054043868860521?a=myzwOm4zSWQ8LyQyB1s&s=46，也看看这个，提炼信息，并看如何借鉴

## 🤖 助手 · 回复 21

这篇是**数字生命卡兹克**（AIHOT 作者）今天（2026-11-02）发的长文《折腾了整整1年，毫无保留地分享一下我这套Agent自动化系统》。我用 jina 抓了全文，提炼如下。

## 一、要点提炼（8 条）

| # | 模块 | 关键设计 |
|---|---|---|
| 1 | **命题** | 引 DeepSeek 那句"一个人只能同时跟进 3~5 个会话，**多任务的上限取决于人的注意力**"→ 朱元璋废丞相、六部直通、8 天 1660 件奏札、"朕一人处此多务，岂能一一周遍"→ **Agent 时代的领导力**：把任务起点从人身上拿掉 |
| 2 | **自动化中台** | 独立小服务（线上轻量服务器）。所有事件先进中台，**统一格式**（从哪来/什么类型/对象是谁/一句话摘要/回原处的链接，如 `feedback.new#12`）；**rules.json** 规则表决定"这事件交给哪个 Agent、在哪个目录、用哪个 skill、并发上限、是否要问我" |
| 3 | **叫醒 Agent** | Mac 在内网不暴露公网 → **反向长轮询**：每台 Mac 跑接单程序挂在中台上，一次最长等 50 秒，有活立刻接走 |
| 4 | **中台5 收益** | ①接新事件 = rules.json 加一行 ②换 Agent = 改一行 ③**统一去重**（网络抖动重发、同一意见补一句话+贴图）④**所有消息只有一个出口**（飞书"小卡"）⑤**数据沉淀**（可点回当时的 agent 会话、能统计"哪条流水线最忙/哪个 agent 干得最多/哪类事老出问题"→ 换模型改规则有数据依据） |
| 5 | **模型分工** | Claude Opus 5.5=主力开发；GPT-6.1 Sol=运维（告警/日报/查 bug 直接修）；GPT-6.1 Terra=浏览器与电脑操控。**明确观点：做决策和管理的模型必须最强，"不能用笨逼来指挥聪明的"**；反对用 Grok 指挥 Claude |
| 6 | **全本地不上云** | 两台 Mac Mini（日常机 + 自动化机），局域网互通。理由：凭据复制到每家云麻烦且不安全 / 海外云跨境访问国内服务器慢且超时 / 微信这类浏览器任务在云上直接崩 |
| 7 | **每任务一个专属 Skill** | Skill = 给 Agent 的 SOP（规则+参考+脚本）。**改任务改 Skill，不用改 Agent 执行逻辑** |
| 8 | **CI 中台五步** | 审查 → 检查 → 合并 → 发布 → **核实**。审查规矩：Codex **只读、不能改、不能联网、读不到钥匙**、只报真会错的问题不报风格、**最多审 3 轮**（引 Anthropic《How the Claude Code team does code review》）；两周 298 个 PR / 报 333 条问题 / 合并前修掉 306 条；**每个任务开一台全新虚拟机，跑完连机器带身份一起删，Agent 的代码从不在本机直接跑**；中位 2~3 分钟全程无人管 |

**还有两个概念直接可抄**：①**票拟 + 批红**——决定卡片就是 Agent 写的"票拟"，人只点选；②**「卡兹克定的事」+「定了不做的事」**——只记亲口决定（原话+日期）和拒绝清单，Agent 再碰到直接照答，**不会问第二遍**；只有删数据/停服/花钱/对外发消息/改产品方向/轮换密钥/改权限 这 7 类才推给人。

## 二、这篇和 dsh 那篇的关系

**同一内核的两条独立路径**：dsh 是工程化论文（Source/Thread/Eval/Mandate/Ticket/Assignment + Policy + Watchdog + 影子模式），卡兹克是国内个人版（事件中台 + rules.json + 飞书票拟 + CI 五步 + 模型分工）。两篇的交集恰好是**"把人的注意力当最稀缺资源"**。

两条路殊途同归 → **我们抄的方向是对的**。而且他独立印证了我们上一轮的两个判断：①"Grok Bot 之类的 Personal Agent 来找人很麻烦" → 我们的"Muse/Grok App 只能当触发器、别指望它们做执行器"✅ ②"全部本地、凭据不上云、别暴露公网" → 我们今天关掉 Tailscale serve、选 pi-reach ✅

## 三、对我们系统的对照与修正

### 3.1 已经对上的
统一出口（pi-reach PWA）、事件源清单（钉钉/飞书/GitHub/邮件/手机）、worktree 隔离计划、job 表=数据沉淀雏形、env密钥不进上下文。

### 3.2 缺的（按价值排序）

| 缺什么 | 卡片兹克的做法 | 对我们的具体补丁 |
|---|---|---|
| **① 路由不该由弱模型自由裁量** | 规则写死在 rules.json，哪类事件→哪个模型+什么强度 | 我们今早的"能力标签路由"让 MiniMax-Flash 自己猜 —— **违反他的原则**。改成显式规则表：`事件类型 → provider + 模型 + 强度 + cwd + skill + 并发上限` |
| **② 报告契约太弱** | CI 五步：审查（只读/限3轮/只报真问题）→ 检查（类型+测试+构建+硬规矩）→ 合并 → 发布 → **核实** | 我们今天只有"extract output"。证据必须升级为 **测试结果 + diff 摘要 + 落地确认**；审查轮次上限 3（引 Anthropic 那篇）；审查者只读、不给钥匙 |
| **③ 没有"人的决策记忆"** | 「定过的事」+「定了不做的事」，带原话和日期 | 我们建 `decisions` 表：`decided`（我亲口定的）/ `rejected`（拒绝清单，Agent 再碰到直接照答不烦我）。这是把"人的偏好"变成可审计资产 |
| **④ 推送阈值没有白名单** | 只有 7 类危险事才推人，其余自决 | 我们现在 job 一失败就可能喊你 → 加 `notify_policy`：默认静默，只在"要人拍板/有可交付成果/触及 7 类红线"时才出卡片 |
| **⑤ 没有去重/幂等** | 中台统一去重 | 我们 job 表要加幂等键（同事件接两次只建一个 Ticket） |
| **⑥ 没有任务级 Skill绑定** | 每个任务配专属 Skill | pi 原生有 skills → 每个事件类型绑一个 skill 目录，**规则在 skill、provider 只做通用动作**（解耦，与我们的 provider 通用化完美契合） |
| **⑦ 成本闸门** | 200 刀会员 3 天烧 90%；一次审查中位 2 分钟、占该任务 5~15% token | 我们今早的"每日三闸"落地，并按此比例给审查任务定预算 |

### 3.3 **不该抄**的
- ❌ **云端中台 + 反向长轮询**：那是他的网络约束（Mac 在内网）。我们**本机直连**（钉钉/飞书/GitHub/邮件/手机全在本机），不需要中转层 —— 我们要抄的是"统一事件格式 + rules.json + 去重 + 数据沉淀"，不是"把中台放云上"。
- ❌ **他的规模**：1000 PR/月、每天二三十个 PR、自建 CI 中台。我们是单人/小团队，只抄**五步的结构**，别抄复杂度。
- ❌ **让弱模型当 Router/裁决**：他明确反对，我们也不能这么干。

## 四、结论：上一轮的改造清单要加 3 条

上次说的"Stored Work + 异步 job + 唤醒 + Watchdog + Outbox"仍然成立，现在**追加**：

1. **路由规则外置**：`~/.pi/agent/fleet/rules.json`（事件类型 → provider/模型/强度/cwd/skill/并发/是否要人），**不让模型自己决定派给谁**；Router/裁决用强模型
2. **验收升格为五步**：审查（只读、限 3 轮、只报真问题）→ 检查（测试/构建/硬规矩）→ 合并 → 发布 → **核实**（确认改动真的落地，写回状态）；证据 = 测试结果 + diff + 落地确认
3. **决策记忆 + 推送白名单**：`decisions` 表（定过的事 / 定了不做的事）+ 只有 7 类红线与"需要拍板"才推卡片

这三条**不增加新的外部依赖**，全在 `pi-model-fleet` 包内，可以和上次那批改造一起做。

## 五、顺带一个佐证

他文中用的模型是 **Claude Opus 5.5 / GPT-6.1 Sol / GPT-6.1 Terra** —— 和我们今天 codex 报错的 `gpt-6.1-sol` 对得上，也再次确认：**你当前这个 ChatGPT 登录确实没有 Codex 侧的模型权益**（我们试了 6 个模型全部 `model_not_found`），要接 codex 必须换 API Key 登录。

---

要我现在按这份清单开工吗？建议的落地顺序：

1. **T1 API provider**（DeepSeek / xAI 写进 `models.json`，一个 key 即通，绕开四个 CLI 的授权坑）—— 30 分钟
2. **fleet 改造第一批**：异步 job + 唤醒 + Outbox

…（本条回复共 4158 字，已截断；完整内容见原始 jsonl）

## 👤 用户 · 第 13 轮

https://github.com/anightmonarch/grokbot-guide。也吸收一下这个

## 🤖 助手 · 回复 22

这份是 **xAI 官方 Grok Bot 的中文实践手册**（VuePress 站，源码在 GitHub，每页都标了 `verified` 日期和对官方文档的出处）——不是二手解读，是把 `docs.x.ai/grok-bot` 翻译+实测了一遍。我把 15 个关键页面拉下来了。

## 一、Grok Bot 到底是什么（提炼）

| 概念 | 内容 |
|---|---|
| **Bot** | 有名字、职责、长期上下文的 AI 队友；跑在 **Cursor 云端电脑**上，合上笔记本仍在干活 |
| **三个执行面** | ①**云电脑**（默认，账号内**所有 Bot 共享一台**）②**本地执行**（在你的电脑上跑命令，**默认 Ask every time**，审批卡显示完整命令）③**Cloud Agents**（把重编码任务外包到**另一台独立电脑**，产出 PR，合并仍要人点头） |
| **Skill / Routine** | Skill =「怎么做」（步骤、决策规则、预期输出、安全边界）；Routine =「何时做、归哪个 Bot」（cron + 事件 listener）。**官方顺序：一次性任务跑通 → 存 Skill → 做成 Routine**；`Teach a task` 演示一遍学出草稿（≤10 分钟，草稿要补决策规则和审批边界） |
| **例程六要素** | 归属哪个 Bot / 时间表与时区 / 输入来源 / 预期结果 / 审批边界 / **数据源缺失怎么办（不要静默用旧数据）** |
| **Test run 先行** | 真做事；五条检查：数据是不是当前值、输出格式、每步可追溯、**是否停在审批点**、失败状态写清没写清 |
| **写意图不写菜谱** | 别把某次成功的点击序列/临时 URL 粘进例程当永久剧本；可复用步骤沉到 Skill，Routine 只写"何时调哪条 Skill"；源系统改版 → **暂停 → 手动跑通 → 更新 Skill → Test run → 恢复** |
| **审批三态** | Allow once / Always allow / Deny；`Ask first` 规则永远赢；**无人值守的审批约 10 分钟过期 → 显示 Expired = 没放行**（不是"已经发过了"）；过期卡上的"以后总是允许"**只加规则、不补做那次** |
| **双保险** | 「Bot 描述管常设规矩，审批卡管具体动作，两者一起用才稳」 |
| **共享电脑 ≠ 隔离** | 文件、浏览器会话、命令行凭证在账号内共享；**"换一个 Bot"不是安全边界**；管家模式也不是隔离 |
| **最小权限 6 步** | 只连需要的工具 → 先从只读和草稿开始 → 外发/购买/删除/生产变更留在审批后 → 临时敏感文件用完删 → 不用的服务退出登录+源站撤权 → 定期回顾连接器与例程 |
| **它不擅长** | 官方原话：**在本地项目目录做复杂漫长编码，Grok Bot 不如专门的编码工具**；更稳的做法是"让 Bot 在云电脑上装 CLI 工具指挥它们干活，用完把结果拿回来，不要直接改你本地正在进行的工程"；公司代码别拷进云电脑（**云电脑在美国**，跨境合规）；网站挡自动化 → **Take over 交回人**，不绕过 |
| **多 Bot** | 群 2~6 个、@ 指向、异步交接、**每阶段一个负责人、交接链 >2 跳该合并**；**审批卡/密钥/草稿卡不会出现在群里**；并行 computer-use 会抢同一屏幕 |

## 二、怎么借鉴（对我们最有价值的 8 条）

**关键判断：不要去"集成 Grok Bot"（它的云电脑在美国、不能碰你本地凭据、它自己都说本地编码不行），而要把它当"人机边界规范"抄 —— 我们的执行面留在 pi。**

| # | 抄什么 | 落到我们的哪一处 | 状态 |
|---|---|---|---|
| 1 | **描述（常设规矩）+ 审批卡（具体动作）双保险** | 我们的 `rules.json` 承载"常设规矩"；`pi.on("tool_call")` 钩子做"具体动作"审批（push/删库/对外发消息 → 停） | 缺，待做 |
| 2 | **审批过期 = 未放行** | 异步 job 必须有 `waiting_approval` 状态 + `expires_at`；过期 = 停在那儿等人，**绝不能"过期即通过"** | 缺，上轮清单要加 |
| 3 | **例程六要素 + 缺源显式失败** | 我们的 `rules.json` 每条规则补：归属/触发/输入/预期/边界/**源挂了怎么办**（不许用旧数据凑数） | 缺 |
| 4 | **Test run 先行 + 写意图不写菜谱** | 给 fleet 加 **dry-run 模式**（跑一遍不落盘）；规则由人写，**模型只执行不自由发挥** | 缺 |
| 5 | **一次性任务 → Skill → Routine** | 我们的落地顺序**天然一致**：fleet 单次任务已跑通 ✅ → 下一步把每类事件沉淀成 **pi skill** → 再挂 `@amaster.ai/pi-task-scheduler` 例程 | 顺序已对，skill 那步缺 |
| 6 | **共享电脑不是隔离边界** | 直接支持我们"grok 的 `--always-approve` 不能当安全边界"的判断；隔离只能靠 **worktree + 独立凭据 + env 白名单 + 目录 ACL** | 计划中（Step 2） |
| 7 | **别让云端 Agent 直接改你的工程；让它指挥 CLI，完事把结果拿回来** | **这正是我们 fleet 的形态**——我们就是"本机装 CLI 指挥 CLI"。所以我们的定位很清楚：**pi = Grok Bot 官方承认自己不擅长的那一格**（本地项目长编码） | 定位已成立 |
| 8 | **别把密钥写进描述/群消息** | 我们 provider 侧 env 清洗已做 ✅；还要保证 **job 报告与日志里不出现 token** | 半成品 |

### 顺带解决了一个悬案：审批卡放哪？

Grok Bot 用聊天卡片（Allow once / Always allow / Deny），卡兹克用飞书票拟。我们有三种载体：

| 载体 | 可行性 |
|---|---|
| **飞书 / 钉钉卡片** | ⭐ 推荐：国内可达、卡片带按钮、点选可回填、**与卡兹克方案同构**（你本机有 `dws` 钉钉 skill、飞书有 `pi-feishu`/`pi-remote-wecom`） |
| pi-mobile 弹窗 | 能原生承载扩展 select/confirm，但**要 HTTPS 地址**（我们刚把 Tailscale serve 关了，得配 `publicUrl` 隧道） |
| pi-reach 文字 + 命令 | 最省事但最弱（pi-reach 不渲染扩展弹窗），只适合低频确认 |

## 三、我们比它强、该守住的三点

1. **它在官方文档里承认"本地项目长编码不如专门编码工具"** → 这正是我们的战场
2. **它的云电脑在美国** → 你的仓库、凭据、微信生态都不会出境的强需求，我们全本地天然满足
3. **它的例程上限 50 条、间隔 ≥5 分钟、审批 10 分钟过期** → 我们可以贴着真实项目节奏设计，不必受这套节流限制

## 四、更新后的落地清单（在上轮那份上加 4 条）

上轮清单（异步 job + 唤醒 + Outbox + 幂等 + rules.json 路由外置 + 验收五步 + 决策记忆 + 推送白名单 + Watchdog + 恢复便签）之上追加：

- **审批卡三态 + `expires_at` + `waiting_approval` 状态**（Grok Bot 语义：过期 = 未放行）
- **规则六要素**（归属/触发/输入/预期/边界/缺源策略）+ **dry-run 模式**
- **先 Skill 后 Routine**：把每类事件沉淀成 pi skill 目录（规则、验收、边界写在 skill 里，provider 只做通用动作）
- **报告与日志脱敏**：任何 token/密钥不得进 job 记录与推给手机的文本

同时新增一个**只抄不做的红线**：不引入 Grok Bot 云电脑作为执行面（跨境 + 无本地凭据 + 官方自己说本地编码不行）。

---

三篇材料（dsh 论文 / 卡兹克实践 / Grok Bot 手册）看下来，结论高度一致：**瓶颈不是模型能力，是人的注意力**。所以我们系统的验收标准也应该是"**一天下来手机只收到 2~3 条真正需要你拍板的消息**"，而不是"模型多强"。

要我现在开工吗？我建议这轮直接做：**T1 API provider（DeepSeek/xAI，绕开四个 CLI 的授权坑）→ 异步 job + 唤醒 + 审批卡（先飞书/钉钉）+ rules.json 六要素 + dry-run**，这样明天你就有一个"事件进来 → 自动派单 → 要人时推一张卡片 → 点完继续"的完整闭环。

## 👤 用户 · 第 14 轮

总结这三篇文章，你再review我的需求，我确认一下

## 🤖 助手 · 回复 23

# 一、三篇文章的共同内核

|维度 | ① 微信文（dsh-superagent 解读） | ② X 长文（卡兹克 1 年实践） | ③ Grok Bot 中文指南 |
|---|---|---|---|
| **核心命题** | 自主 Agent架构；Router/Worker/Trigger/授权/恢复 | **瓶颈是人的注意力**；朱元璋批奏折 → Agent 时代的领导力 | 产品化的"AI 队友"该长什么样 |
| **分层** | Router（脑）+ Worker（手）+ Trigger + Watchdog | 自动化中台（事件/规则/派单/收口）+ Agent 执行 + CI 中台 + 飞书票拟 | 云电脑 / 本地执行 / Cloud Agents **三个执行面** |
| **触发** | 事件驱动，Source→Thread→Eval 串行 | 事件中台统一收口，**rules.json** 决定派给谁 | Routine（cron + 事件 listener），**Test run 先行** |
| **人机边界** | 注意力纪律：只在要人拍板/有成果时开口，一次只问一个结构化问题 | 票拟+批红；只有 7 类事才推人；「定过的事」不问第二遍 | **描述（常设规矩）+ 审批卡（具体动作）双保险**；审批 10 分钟过期=未放行 |
| **执行隔离** | 每 Ticket 一个 Executor Session + 独立目录 | 每任务一台新虚拟机，跑完连身份一起删 | 共享云电脑**不是**安全边界；本地执行默认 Ask every time |
| **状态** | Stored Work：先记账后动手 + 恢复便签 + Outbox | 中台数据库沉淀一切，可点回当时的会话 | — |
| **模型分工** | Worker 由外部执行器承担 | 明确：Claude 干活/GPT 运维/GPT 操控浏览器；**"不能用笨逼指挥聪明的"** | — |
| **独特贡献** | 领域模型与状态机（最硬） | **落地范式**（中台/规则表/票拟/CI 五步） | **人机边界的产品级规范**（最细） |

### 三篇交集出的8 条"设计公理"（可直接作为我们的地基）

1. 瓶颈是**人的注意力**，不是模型能力 → 系统的验收指标是"一天只打扰你 2~3 次"
2. 任务起点从人身上拿掉 → **事件驱动**，不是人下命令
3. **脑手分离**：决策层与执行层隔离，决策层不阻塞
4. **默认不打扰**：只在"必须人拍板 / 有可交付成果"时开口，一次只问一个**结构化**问题
5. **先记账后动手**：状态外置、可断点续跑、不重复不丢
6. **权限机器可读 + 越窄越好**：不可变授权单、影子模式先记录不执行
7. **交付要有证据**：只验收可复现的验证结果，不接受自述
8. **本地优先、凭据不出本机**：代码、身份、浏览器会话都留在自己的机器

### 三篇的关键差异（决定我们抄谁）

- dsh = **论文**（模型完备，实现未竟，影子模式还在蓝图）→ 抄领域模型，不抄代码
- 卡兹克 = **个人规模实践**（云端中台 + 反向长轮询，因为他的 Mac 在内网）→ 我们本机直连，**不抄云端中台**
- Grok Bot = **产品规范**（官方文档逐条实测）→ 抄审批语义、Test run、上线纪律，**不接它的云电脑**

---

# 二、你的需求复盘（我理解的版本 + 当前状态）

| # | 你的需求 | 出处 | 状态 |
|---|---|---|---|
| **R1** | 在 **pi CLI** 上部署一个"类 Grok Bot"的机器人——不是聊天窗，是主动干活的队友 | 今早 session | 🔶 骨架级：有 fleet + job 账本；缺 Router / 事件层 / Ticket / 审批 / 统一出口 / Panel |
| **R2** | 通过 pi 指挥**其他大模型 CLI**：gemini、grok、codex 首批，**预留其他** | 今早 session | ✅ `pi-model-fleet` 5 个 provider（gemini/grok/codex/claude/pi），真跑通；❌ 4 个外部 CLI 卡授权；❌ T1 API 级未配 |
| **R3** | **手机远程查看 + 安排任务** | 今早 session + 今天 | 🔶 **查看/发指令 ✅**（pi-reach 已配对）；**安排任务 ❌**（排程未接） |
| **R4** | 定位纠正：这是 **pi CLI 上的项目**，不进 Myπ、不改现有业务代码 | 今早 session（你的纠正） | ✅ 全部产物都在 `~/.pi/agent/packages/` 与 `E:\...\60.pi-Super-agent\` |
| **R5** | 方案落盘 `E:\00.sincetech\10.knowledge\Sintech\00.david\10.AI项目\60.pi-Super-agent\` | 今早 session | ✅ 已有 554 行架构方案（**今天三篇文章的新增结论还没回写**） |
| **R6** | **超集**：综合 pi 的大模型 + 其他大模型，**自动开展某一个项目** | 今天 | 🔶 有"手"（fleet），没有"脑"（Router/Ticket/验收/Watchdog/触发） |
| **R7** | 结合 DeepSeek / Meta Muse / Grok Bot 这类"bot" | 今天 | 🔶 已定性：**Muse/Grok App 无 API → 只能当触发器；Grok 的 `agent serve/leader` 是唯一可编程接入点**；dsh 只抄领域模型 |

### 现实约束（必须一起确认）

- 你的 4 个外部 CLI：**grok** 等设备码授权（`YAH2-DW77`）｜**codex** ChatGPT 登录无 Codex 权益（6 个模型全 `model_not_found`）｜**gemini** 被 Google 判死要迁 Antigravity｜**claude** 的本地代理 `127.0.0.1:15721` 没在跑（挂死 150s）
- **可用的只有 `pi` provider**（走 MiniMax，已 E2E 跑通）

---

# 三、需求 ↔ 三篇 ↔ 现状 缺口矩阵

| 需求 | 三篇给的答案 | 我们现状 | 缺口 | 优先级 |
|---|---|---|---|---|
| R6 自动开展项目 | dsh：Router/Worker/Ticket/Mandate/Report；卡兹克：事件中台+rules.json | 只有 fleet | **Ticket 账本 + Router 常驻** | 🔴 P0 |
| R1 主动干活 | 卡兹克：事件驱动（rules.json）；Grok Bot：Routine | 无事件层 | **规则表 + 触发器 + dry-run** | 🔴 P0 |
| R1 不打扰人 | 三篇一致：只在拍板时开口、一次一问 | 无 | **决策卡 + 统一出口 + 推送白名单** | 🔴 P0 |
| R2 多模型 | 卡兹克：分工 + "强模型做决策" | fleet 会自由裁量 | **路由规则外置 + 强模型验收** | 🔴 P0 |
| R2 执行质量 | 卡兹克 CI 五步；Grok Bot：Test run + 证据 | 只 extract output | **五步验收 + 证据契约 + dry-run** | 🟠 P1 |
| R2 授权 | Grok Bot：审批三态+过期；dsh：三档+影子模式 | 无 | **审批钩子 + expires_at + 决策记忆** | 🟠 P1 |
| R3 安排任务 | Grok Bot：Routine；卡兹克：cron | 无 | **pi-task-scheduler + skill 沉淀** | 🟠 P1 |
| R2 可靠性 | dsh：Stored Work + 恢复便签；卡兹克：去重 | 有账本、无恢复 | **异步+唤醒+幂等+Outbox+Watchdog** | 🟠 P1 |
| R7 外部 bot | 三篇：无 API 的只能当触发器 | 已定性 | **邮箱/GitHub 当 Source（低优先）** | 🟢 P2 |

---

# 四、请你拍板的 6 个决策点

| # | 决策 | 我的建议 | 你选 |
|---|---|---|---|
| **D1** | 是否坚持"**全部本地**、不接 Grok Bot/Muse 的云电脑"（它们在美国机房、无你的本地凭据、官方自认不擅长本地长编码）？ | ✅ 坚持（卡兹克同样全部本地） | ☐ |
| **D2** | **Router/裁决用哪个模型**？卡兹克原则："不能用笨逼指挥聪明的"。现在 pi 默认是 MiniMax-M3.1-**Flash** | 调度/验收用 **MiniMax-M3**（非 Flash），或 T1 的 DeepSeek；Flash 只做提取类杂活 | ☐ |
| **D3** | **4 个外部 CLI 授权烂摊子怎么处理**？ | (c) **混合**

…（本条回复共 5478 字，已截断；完整内容见原始 jsonl）

## 👤 用户 · 第 15 轮

那我和你说一下，我想做的最终是，给你一个任务，你可以调用我所有的大模型来去以自动执行，你pi cli来做统一资源调配和部分工作。例如，做一个独立站或app，你根据我的需求从代码开发，各社媒推广，付费渠道搭建，社媒交流等都自主完成。并以半小时为周期回复进度，每十二小时回复进展及下十二小时你的计划等等

## 🤖 助手 · 回复 24

收到，这个目标很清晰。我先把它翻译成工程语言，再把其中**真正有风险的部分**单独拎出来，最后给你一份可确认的方案。

---

# 一、你的需求（我的理解，请校对）

>给我一个任务 → 系统调用我所有的大模型 → **pi CLI 做统一资源调配 + 承担一部分工作** → 例如做一个独立站/App：**代码开发 → 各社媒推广 → 付费渠道搭建 → 社媒交流**，全程自主完成。
> **汇报节奏：每 30 分钟回报进度；每 12 小时回报进展 + 下 12 小时计划。**

拆成 6 条能力：

| # | 能力 | 现状 |
|---|---|---|
| C1 | **统一资源调配**：跨模型选型、预算、并发、熔断、重试 | 🔶 只有 `assign_model`（无预算/配额/熔断/规则表） |
| C2 | **任务分解与自主推进**：目标 → Ticket → 派单 → 证据 → 下一件事 | ❌ 无 Ticket 账本、无 Router 循环 |
| C3 | **多面执行**：代码 / 内容 / 推广 / 付费渠道 / 社交 | ❌ 代码面有 fleet；内容、推广、付费、社媒**全无** |
| C4 | **30 分钟进度心跳** | ❌ 无（且要注意：这条与三篇文章的"注意力纪律"冲突，见下） |
| C5 | **12 小时进展 + 下阶段计划** | ❌ 无 |
| C6 | **手机/多通道出口 + 人在环审批** | 🟡 pi-reach ✅（只读+发指令）、审批卡 ❌ |

---

# 二、三个必须先说清的现实问题### ❶ "调用我所有的大模型" —— 现在只有1 个能用| provider | 状态 | 证据 |
|---|---|---|
| **pi（MiniMax）** | ✅ 可用 | E2E 跑通（8.2s 返回） |
| claude | ⚠️ 挂死 | `~/.claude/settings.json` 指向 `127.0.0.1:15721`，该代理**没在跑** |
| codex | ❌ 无权益 | ChatGPT 登录下 6 个模型全部 `model_not_found` |
| gemini | ❌ 被判死 | `IneligibleTierError`，需迁 Antigravity |
| grok | ⏳ 待授权 | 设备码 `YAH2-DW77` 还在等 |

→ **务实路径**：主力走 **T1 API 级**（DeepSeek / xAI / 任何 OpenAI 兼容端点，一个 key 即通、免授权、可高并发），**T2 CLI 级**（codex/claude/grok/gemini）作为"能改文件、能跑命令"的执行器逐步补授权。这正好落在你要的"**统一资源调配**"里：把 provider 分级、标价、限额、熔断。

### ❷ "社媒推广 / 付费渠道 / 社媒交流" —— 这是**账号与钱**的事，不是模型的事

这一块必须分层，否则会同时踩到三个坑：

- **合规**：AWS 封 Meta Muse（因为 agent 没声明身份就抓凭据）、亚马逊封 Muse、Grok Bot 官方把**云电脑放在美国**并明确"公司代码慎上云"。你的项目、社媒号、支付资质都在国内 → **必须本地执行**。
- **平台协议**：自动发帖/私信/评论是各平台封号重灾区（X 的自动化账号、抖音的群控）。Grok Bot 官方也把"发布/购买/删除/生产变更"一律留给审批。
- **资质**：微信支付/支付宝/Google Play/Apple 开发者账号，**没法由 agent 自己开通**——需要你的法人主体、实名、ICP备案。

→ 我的建议：**把"对外动作"定义成 L3，默认人工点头**（见下），但用一个设计避免"每次都烦你"：

> **批量授权窗口**：agent 先产出 7 天的内容排期 → 你一次性审批这批 → 之后按排期自动发/自动投，中途可一键暂停。

（这就是 Grok Bot 的 `Always allow`、卡兹克的"7 类红线"、dsh 的 Mandate scope 三者的交集。）

### ❸ "每 30 分钟汇报" vs 三篇文章的"注意力纪律"

卡兹克踩的坑正是这个：**一天几十条 → 全设免打扰 → 真报警也被忽略**。但你的需求是明确的（值班心跳）。折中方案：

| 通道 | 内容 | 是否要求你回应 | 频率 |
|---|---|---|---|
| **流水通道**（钉钉群 / pi-reach 日志流） | 30 分钟**模板化快照**：本时段完成/在跑/待审批/花钱/风险 | ❌ 不要求，可折叠、不升级为强通知 | 48 条/天，**零 token**（不调模型，只读账本） |
| **决策通道**（钉钉卡片 / pi-reach 置顶） | 12 小时**进展 + 下 12 小时计划**（带"批准/修改"按钮） | ✅ 要求你点一次 | 2 条/天，2 次 LLM 调用 |

心跳**不调模型**（只做账本快照），所以"每半小时"几乎不花 token；12 小时汇报由 Router 生成，且**"下 12 小时的计划"落成可批准的 12 小时任务窗口**，而不是一段漂亮话——这样计划有约束、有预算、有验收。

---

# 三、目标架构

```
                    ┌──────── 人：给一个任务 ────────┐
                    ▼ │
        ┌───────────── Router（pi 常驻，强模型）─────────────┐
        │  · 把目标拆成 Ticket（带验收标准、预算、授权范围）  │
        │  · 每 12h 生成「进展 + 下 12h 计划」→ 需人批准       │
        └───────────────┬───────────────────────────────────┘
                        │调度（rules.json + 配额闸门 + 熔断）
        ┌───────────────▼───────────────────────────────────┐
        │ T2 执行器（能改文件/跑命令）                       │
        │ codex · claude · grok · gemini · pi              │
        │ T1 执行器（快、便宜、并发高）                       │
        │   deepseek · xai · minimax · 任何 OpenAI 兼容端点   │
        │ 外壳（受限，默认需审批）                            │
        │   浏览器自动化 · 平台连接器 · 邮件/社媒草稿           │
        └───────────────┬───────────────────────────────────┘
                        ▼
        ┌──── 五步验收（审查→检查→合并→发布→核实）────┐
        │ 证据 = 测试结果 + diff + 落地确认（只读审查限3轮）│
        └───────────────┬───────────────────────────────┘
                        ▼
     ┌──────────账本 sqlite（tickets/assignments/reports/events/outbox/decisions/plans）──────────┐
        │                          │ │
        ▼ ▼                                ▼
  30min 心跳(模板) 12h 计划(需批准)              审批卡 / 决策记忆 流水通道·零token 决策通道·2次/天               L3 红线 / 定过的事
```

###核心机制（三篇共识的落地）

1. **能力目录 + 预算闸门**：每个 provider 标 T1/T2、每日次数/token/时长上限、连续失败 N 次自动降权；选型由**规则表**决定（不让弱模型自由裁量——卡兹克："不能用笨逼指挥聪明的"）
2. **分级自主（Autonomy Levels）**——我建议这是你的系统能真正"自主"又不翻车的关键：

| 级别 | 含义 | 例子 | 默认 |
|---|---|---|---|
| L0 观察 | 只读、不留外部痕迹 | 读仓库、抓竞品、查资料 | 自动 |
| L1 起草 | 生成产物供人取用 | 文案、方案、代码草稿 | 自动 |
| L2 可逆执行 | 能撤销的写操作 | 建分支/提 PR/写平台草稿箱/改本地配置 | 自动 |
| L3 不可逆/对外 | 发布、合并主干、花钱、发帖私信、删数据、轮换密钥 | 上线、投放、群发 | **必须审批**（可批量授权窗口） |

3. **Stored Work**：先记账后动手 + Outb

…（本条回复共 6222 字，已截断；完整内容见原始 jsonl）

## 👤 用户 · 第 16 轮

已点击授权

## 🤖 助手 · 回复 25

授权码过期了（我 5 小时前发起，设备码有效期很短），重新发一个：

## 🤖 助手 · 回复 26

新设备码已生成，请**尽快**点（有效期很短）：

**https://accounts.x.ai/oauth2/device?user_code=FXCM-M6X2**
码：`FXCM-M6X2`

我在后台盯着，授权一完成就会自动继续验证 grok 执行器：

## 🤖 助手 · 回复 27

登录进程被回收了，用 nohup 重发一个：

## 🤖 助手 · 回复 28

第三个码（这次进程已用 `nohup` 固定住，不会被回收）：

**https://accounts.x.ai/oauth2/device?user_code=5B9G-3FYE**
码：`5B9G-3FYE`

点完回我一句"好了"，我立刻验证 grok 执行器；同时我先把 **M0 的活干了**，不等授权。

## 🤖 助手 · 回复 29

等授权的同时我开始 **M0**。先建账本与能力目录：

## 🤖 助手 · 回复 30

Now 把 fleet 接上账本（工单关联 + 预算闸门 + 报告与心跳）：

## 🤖 助手 · 回复 31

**M0 完成并已验证**（grok 授权还没成功，稍后说）。

## M0 交付（账本 + 能力目录 + 预算闸门 + 30 分钟心跳）

```
~/.pi/agent/packages/pi-model-fleet/
├── extensions/superagent.ts    新增：new_ticket / record_decision 工具 + /super 命令
├── store/db.ts                 新增：sqlite 账本（7 张表）
├── store/ledger.ts             新增：tickets/assignments/reports/events/outbox/decisions
├── store/catalog.ts            新增：rules.json 能力目录 + 每日预算闸门
└── extensions/fleet.ts         改动：assign_model 接 ticket_id / 预算闸门 / 写账本 / 出报告 /触发心跳
~/.pi/agent/superagent/superagent.db   账本落盘（node:sqlite ✅）
```

### 实测证据（模型自主调用，全链路）

| 表 | 实际写入 |
|---|---|
| `tickets` | `tk-20261102-223553-DQX4` · M0 ledger smoke test · **queued→running→done** |
| `assignments` | `as-...N4WV` · 挂到该 ticket · provider=pi · **succeeded** · exit=0 · 3568ms · 输出 `LEDGER OK` |
| `reports` | `rp-...CKRP` · status=**ready** · evidence={exitCode, durationMs, logPath} |
| `budget` | pi: 1 call / 4 sec（每日上限 60 calls / 90 min） |
| `events` | 6 条审计事件：created → ticket.running → assignment.started → ticket.done → assignment.finished → report.added |
| `outbox` | 心跳已入队（pending）：`⏱ 心跳 · 22:35 · 过去 30 分钟｜完成 1｜失败 0｜在跑 0｜待办 0｜需你 0` |

### 现在已经具备的 4 件事

1. **可审计的工作单元**：任何工作先开 ticket（意图 + 验收 + 预算），再派单，产出自动落报告
2. **路由不再由弱模型自由裁量**：`/super catalog` → `code → codex > claude > pi`、`review → claude > grok > pi`…（规则表在 `~/.pi/agent/superagent/rules.json`，可改）
3. **预算闸门**：超日限额直接拒绝派单（`Budget stop for X: daily call cap reached`）
4. **30 分钟心跳**：纯模板读账本，**零 token**，48 条/天不花钱

## grok 授权：你点的是**已过期**的那个码

设备码有效期很短，我 5 小时前发起的那批已经失效（`Device code expired`）。中间发了两个新码，中间那个进程被 shell 回收了。**现在有效的**：

**https://accounts.x.ai/oauth2/device?user_code=5B9G-3FYE**　码 `5B9G-3FYE`

（进程已用 `nohup` 固定，不会再被回收。请在几分钟内点。）

## 继续推进还缺你三样东西

| 需要 | 用途 | 没有会怎样 |
|---|---|---|
| **DeepSeek + xAI 的 API key** | T1 主力（一个 key 即通，绕开 codex/gemini/claude 的授权坑）；key 直接给我，我写进 `models.json` | 只能靠 `pi` provider 单线程干活，多模型分工无法真正展开 |
| **试点项目**（独立站：仓库地址/技术栈/域名/部署目标） | M5 的真实闭环 | 只能用假任务验证 |
| **审批卡通道**（钉钉 or 飞书） | L3 动作要你点头 | 只能用 pi-reach 文字代替 |

另外四个待确认点（上一条问你还没回）：**D2 调度/裁决用强模型还是 Flash**、**D3 四个坏 CLI 是修还是弃**、**D4 审批卡通道**、**D5 首批触发源**。

**我的建议节奏**：你现在点 grok 码 + 给我两个 key，我今晚把 **M1** 做掉（异步 job + 完成唤醒 + 幂等去重 + 12 小时计划窗口），这样明天你就能"给一个任务 → 它自己跑 → 30 分钟心跳 → 12 小时计划要你点头"。要我继续吗？

## 👤 用户 · 第 17 轮

来，你现在可以连上哪些，逐项汇报，codex，gemini，grok，grok bot，deepseek

## 🤖 助手 · 回复 32

逐项实测，不靠记忆。开始探测：

## 🤖 助手 · 回复 33

逐项实测完毕（全部现场跑过，不是查文档）。**关键发现：你的代理（Clash）现在完全没开** —— 这是 codex/gemini/grok 三项同时失败的共同根因。

## 网络实测（一切的根因）

| 目标 | 结果 | 判定 |
|---|---|---|
| `api.deepseek.com` | **HTTP 401 / 0.95s** | ✅ 唯一可达（401=只是缺 key） |
| `chatgpt.com` | HTTP 000 / 0.10s | ❌ 不通 |
| `generativelanguage.googleapis.com` | 12s 超时 | ❌ 不通 |
| `accounts.x.ai` | 12s 超时 | ❌ 不通 |
| `api.x.ai` | 12s 超时 | ❌ 不通 |

代理状态：**无 `HTTP_PROXY` 环境变量、无 clash/mihomo/v2ray 进程、7890/1080/7897 等端口无监听** → 代理没开。

---

## 逐项汇报

### 1️⃣ codex — ❌ 双重阻断（网络 + 权益）

-存在：`codex-cli 0.146.0-alpha.3.1`（`~/.codex/.sandbox-bin/codex.exe`，**不在 PATH**）
- 登录：`Logged in using ChatGPT` ✅
- 实跑：`stream disconnected before completion: error sending request for url (https://chatgpt.com/backend-api/codex/responses)`，重连 5 次全败
- **但**代理还开着时我拿到过 API 的 400：`The 'gpt-6.1-sol' model is not supported when using Codex with a ChatGPT account`（试过 6 个模型全部同样报错）→ **即便网络通了，你的 ChatGPT 登录也没有 Codex 模型权益**
- 修法：①开代理 ②`codex login --api-key <你的OPENAI_API_KEY>`（或换带权益的账号）

### 2️⃣ gemini — ⚠️ 官方 CLI 已废，但**我发现你装了 Antigravity CLI**（这格能救）

- 官方 `gemini-cli 0.46.0` 在 PATH；实跑 **12s 超时零输出**（Google 域名不通）
- 网络通时拿到的错误很明确：`IneligibleTierError: This client is no longer supported for Gemini Code Assist for individuals. Please migrate to the Antigravity suite`
- 🔎 **但我扒到三个 Antigravity 资产**：
  - `D:\ai\Antigravity CLI\agy.exe` —— **完整的 agentic CLI**：`--print/-p`、`--model`、`--effort`、`--sandbox`、`--dangerously-skip-permissions`、`--output-format stream-json`、**`--remote-control`**
  - 桌面版 `AppData\Local\Programs\antigravity\Antigravity.exe`
  - 状态目录 `~/.gemini/antigravity{,-cli}`（含 skills/plugins）
- 实跑 `agy.exe -p "..."` → `Authentication required`，并给出 `accounts.google.com` 的 OAuth 链接（**该域名国内一般可达**）
- 👉 **结论：gemini 这一格改用 agy.exe（Antigravity CLI），不要用废掉的 gemini CLI**。授权一次即可接入 fleet（还是唯一自带 `--remote-control` 的执行器）

### 3️⃣ grok（CLI）— ❌ 未授权，且登录域名不可达

- `grok 0.2.112`（`~/.grok/bin/grok.exe`）在 PATH；同目录还有 `agent.exe`（`grok agent stdio/serve/leader`）
- 凭据：`~/.grok/auth.json` **不存在** → 未登录
- 实跑：`Not signed in. To authenticate... grok login --device-code`
- **三个设备码都没落地**：① `YAH2-DW77` 过期 ② `FXCM-M6X2` 进程被 shell 回收 ③ `5B9G-3FYE` 进程也已消失（当前 0 个登录进程）
- 🔑 **而且 `accounts.x.ai` 本身12s 超时** → 你就算点了码，回调大概率也走不通
- 修法：**先开代理** → 我重新发码（用 `start /b` 或任务计划方式彻底脱离 shell 回收）→ 或直接给 `XAI_API_KEY`

### 4️⃣ grok bot（xAI 的 Grok Bot 产品）— ⚠️ 装过，但当前不可用，且**它不是接口**

- `AppData\Roaming\Grok Bot` 存在（Chromium/Electron 缓存，最后活动 10-19）→ 你装过、跑过
- 但**找不到任何可执行入口**（Program Files / Local\Programs / 开始菜单 / 桌面都没有）
- 官方形态 = 桌面 App + **Cursor 云端电脑** + 聊天/Web 入口，**无公开 API / 无 CLI** → 我们无法脚本化它
- 网络：`api.x.ai` 12s 超时 → 云端当前也不可达
- 👉 结论：它是**产品不是接口**，只能当"外壳/触发器"；本轮不接

### 5️⃣ deepseek — ✅ 唯一现在就能打通的（只缺一个 key）

- `api.deepseek.com` → **HTTP 401 / 0.95s**，网络完全通
- 机器上**没有任何 DeepSeek 凭据**（env 无、`models.json` 只有 `minimax`、无 `~/.deepseek`）
- 也没有 DeepSeek CLI / harness（pip 无 `deepseek|dsh`，npm 无）—— **但不需要**：pi 原生支持 OpenAI 兼容端点，`models.json` 加一个 `api:"openai-completions"` 的 provider 就能直连
- 👉 **这是唯一"现在就能用"的大模型**，你给我一个 key 我5 分钟接上

### 附：我们自己的状态

| 组件 | 状态 |
|---|---|
| `pi` provider（MiniMax） | ✅ **可用**，E2E 通过（8.2s / 3.6s，输出 `LEDGER OK`） |
| 账本 + 能力目录 + 预算闸门 + 30 分钟心跳 | ✅ M0 已验证（ticket/assignment/report/events/budget/outbox 全部落库） |
| `grok`/`codex`/`gemini`/`claude` 四个 fleet provider | ⚠️ 已注册但**全部跑不通**（原因如上） |

---

## 结论与行动顺序（按"投入产出"排）

| 优先级 | 动作 | 需要你 |
|---|---|---|
| **①** | **开代理**（Clash 之类）→ codex/gemini/grok 三项的网络问题一次性解决 | 开一下即可 |
| **②** | 给我 **DeepSeek key** → 立刻接成 T1 主力（现在唯一通的） | 一个 key |
| **③** | 我给 `agy.exe`（Antigravity）做一次 OAuth 授权 → **gemini 这一格复活**（还自带 `--remote-control`） | 点一次 Google 授权链接 |
| **④** | `codex login --api-key` | 一个 OpenAI API key |
| **⑤** | 重新 `grok login --device-code`（**必须在代理开启后**） | 点一次码 |
| **⑥** | grok bot | 暂不接（无接口 + 网络不通 + 云端在境外） |

要不要我现在做一件**不用等你的事**：把 `agy`（Antigravity CLI）正式加成 fleet 的第 6 个 provider，并把 `codex`/`grok`/`gemini` 三个 provider 的 buildArgs 改成**按能力自适应**（探测到网络/授权不通就自动降级到 `pi`，而不是直接报错卡死）？这样你开代理、给 key 的过程中，系统也不会因为某一个 provider 挂掉而整条链断掉。

## 👤 用户 · 第 18 轮

你先存档，也同时写到E:\00.sincetech\10.knowledge\Sintech\00.david\10.AI项目

## 🤖 助手 · 回复 34

开始存档。先把本次会话导出成可读 Markdown：


---

> 统计：用户消息 18 条，助手回复 34 条。
