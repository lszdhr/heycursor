# HeyCursor（底部面板扩展）

- **扩展 ID**：`heycursor`（完整：`local.heycursor`）
- **与侧栏版**：`cursor-mcp-messenger`（`local.cursor-mcp-messenger`）**不同 ID，可同时安装**。

## 主力开发路径（约定）

本仓库以 **HeyCursor** 为主：日常请直接改 **`heycursor/extension/dist/`** 下的 `webview.js`、`webview.css`、`extension.js`（以及按需改 `mcp-server.mjs`）。校验 webview 片段：

```bash
# 在仓库根目录
node vsix_extracted/tools/verify-webview.cjs
```

## 从侧栏版同步 dist（可选）

若侧栏 `vsix_extracted/extension/dist/` 先有更新，可拷到本扩展再打补丁：

```bash
# 将 vsix_extracted/extension/dist/ 复制到 heycursor/extension/dist/ 后：
node tools/patch-extension-id.cjs
```

## 额度统计

读取本机 `state.vscdb` / 注入 token 后：

1. **优先**官方 `GET https://cursor.com/api/usage-summary`
2. 再读取 `https://api2.cursor.sh/aiserver.v1.AuthService/GetUserMeta`、`https://api2.cursor.sh/auth/full_stripe_profile`、`https://api2.cursor.sh/auth/stripe_profile` 补齐套餐、账单周期与用户信息
3. 若官方会话过期，则自动用本地 `refreshToken` 请求 `https://api2.cursor.sh/oauth/token` 刷新 `accessToken` 后重试

## MCP 服务端：长等待与协议提醒（借鉴 CueStack HAP）

`mcp-server.mjs` 通过 **阻塞轮询** `queue.json` / `answer.json` 等待用户，与 Cue 的 `cue()` 等用户在共享存储上落库类似。

| 环境变量 | 作用 |
|----------|------|
| （默认） | **未设置** `MESSENGER_MAX_WAIT_MS` 时，服务端 **无限期** 阻塞等待，适合「一早挂上 MCP、整天不讲话也尽量不断」 |
| `MESSENGER_MAX_WAIT_MS` | 设为有限毫秒数时，单次 `check_messages` / `ask_question` / `messenger_pause` 最长等待该时长，超时返回系统提示后须**同轮再次**调用 |
| `MESSENGER_SLICE_WAIT_MS` | **默认 `300000`（约 5 分钟）**：`check_messages` 在无新消息时每隔该时长返回一次**内部切片**（非用户消息），模型须**同轮再调** `check_messages`，以降低单次工具调用挂死时间、利于保活。设为 `0` / `off` / `false` 可关闭切片（恢复单次调用内长等）。与 `MESSENGER_MAX_WAIT_MS` 同时存在时，**先达到**较短者生效 |
| `MESSENGER_FINITE_DEFAULT_MS` | 在未设置 `MESSENGER_MAX_WAIT_MS` 时仍希望有默认上限时使用（一般不必） |
| `MESSENGER_POLL_INTERVAL_MS` | 轮询队列间隔（毫秒），默认 `100` |
| `MESSENGER_HEARTBEAT_INTERVAL_MS` | 向客户端发 logging heartbeat 间隔，默认 `8000` |

工作区 **`setupMcp` 写入的 `mcp.json`** 会在未配置有限等待时带上 **`MESSENGER_INFINITE_WAIT":"1"`**（与默认行为一致，便于阅读配置）。

工具返回末尾会追加 `[protocol] …` 短提醒，强制模型继续 `check_messages`（类似 cuemcp 在返回里夹带约束文案）。

其它 MCP 工具（节选）：`propose_session_tag`、`register_session`（可选 `label`）、`recall_sessions`、`messenger_pause`（单按钮「继续」，与 `ask_question` 共用问答管道）。扩展内置规则正文为 `extension/dist/mcp-messenger-bundled.mdc`，应与仓库 `.cursor/rules/mcp-messenger.mdc` 同步。

## 扩展内无感保活（默认开启）

扩展进程会按 **`current_session.json`** 里的 `session_tag`，在会话空闲 **5 分钟**后向队列写入一条结构化 **`type: "keepalive"`** 静默项，而不是用户可见的 `[KEEPALIVE]` 文本。若用户仍在 HeyCursor 输入框里编辑，则会跳过本次保活。该机制用于在长时间无人说话时周期性唤醒 `check_messages` 循环，降低部分环境下 MCP / 长阻塞被闲置回收的概率。

| 环境变量 | 作用 |
|----------|------|
| （默认） | **5 分钟**（`300000` ms）空闲后注入一条结构化 `keepalive` 静默项 |
| `HEYCURSOR_KEEPALIVE_MS` | 自定义空闲保活阈值（毫秒，≥`60000` 生效）；设为 **`0`** / **`off`** / **`false`** / **`no`** 可**关闭**保活 |

说明：能否「从早挂到晚」仍取决于 **Cursor 是否关闭、电脑是否休眠、网络 / 进程是否被系统杀掉**；保活只是降低闲置断连概率，**不能**违背客户端或操作系统的生命周期。

## 终端防卡死建议

如果需要让 Cursor / Composer 执行终端命令，建议优先使用更干净的 shell：

- Windows 默认终端优先 `cmd`
- 若必须用 PowerShell，优先 `PowerShell -NoLogo -NoProfile`

仓库提供了统一包装脚本，避免直接裸跑终端命令：

```powershell
scripts\agent-run.cmd -TimeoutSec 60 -IdleTimeoutSec 15 -CommandLine "node --check heycursor\extension\dist\mcp-server.mjs"
```

```powershell
powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -File .\scripts\agent-run.ps1 -TimeoutSec 90 -IdleTimeoutSec 20 -CommandLine "git status --short"
```

```bash
./scripts/agent-run.sh -TimeoutSec 60 -IdleTimeoutSec 15 -CommandLine 'node --check heycursor/extension/dist/mcp-server.mjs'
```

包装脚本会：

- 打印明确的开始、心跳、结束标记
- 对无输出的命令按 `IdleTimeoutSec` 进行静默超时
- 对整体执行时间按 `TimeoutSec` 做硬超时
- 超时后主动杀掉子进程树并返回非零退出码

推荐做法：

- 非必要不要让 Agent 直接拼长串终端命令
- 优先用包装脚本执行一次性、会明确退出的命令
- 不要用它跑 watch、dev server、交互式命令
- 若包装器返回 `__AGENT_RUN_TIMEOUT__` 或 `__AGENT_RUN_IDLE_TIMEOUT__`，就改为更短的命令或直接做静态分析，不要原样重试长挂起命令

## 打 VSIX

Windows:

```powershell
cd C:\Code\cursormessage\heycursor
$zip = "_pack-heycursor.zip"
if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -LiteralPath @(".\extension", ".\extension.vsixmanifest") -DestinationPath $zip -Force
Move-Item $zip ..\heycursor-1.2.0.vsix -Force
```

macOS / Linux:

```bash
cd /path/to/cursormessage/heycursor
zip="_pack-heycursor.zip"
rm -f "$zip" ../heycursor-1.2.0.vsix
zip -qr "$zip" extension extension.vsixmanifest
mv "$zip" ../heycursor-1.2.0.vsix
```
