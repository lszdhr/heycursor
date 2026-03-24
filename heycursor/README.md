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

1. **优先**官方 `GET https://cursor.com/api/usage-summary`（`WorkosCursorSessionToken` Cookie，学自 cockpit-tools）
2. **失败则回退**第三方代理 `POST {MCP_API_BASE}/subscriptions/local-token-info`（默认 `MCP_API_BASE=https://api.yidachuang.top/api`；可自建并改环境变量）
3. `HEYCURSOR_QUOTA_PROXY_ONLY=1` 时跳过官方、只走代理

## MCP 服务端：长等待与协议提醒（借鉴 CueStack HAP）

`mcp-server.mjs` 通过 **阻塞轮询** `queue.json` / `answer.json` 等待用户，与 Cue 的 `cue()` 等用户在共享存储上落库类似。

| 环境变量 | 作用 |
|----------|------|
| （默认） | **未设置** `MESSENGER_MAX_WAIT_MS` 时，服务端 **无限期** 阻塞等待，适合「一早挂上 MCP、整天不讲话也尽量不断」 |
| `MESSENGER_MAX_WAIT_MS` | 设为有限毫秒数时，单次 `check_messages` / `ask_question` 最长等待该时长，超时返回系统提示后须**同轮再次**调用 |
| `MESSENGER_FINITE_DEFAULT_MS` | 在未设置 `MESSENGER_MAX_WAIT_MS` 时仍希望有默认上限时使用（一般不必） |
| `MESSENGER_POLL_INTERVAL_MS` | 轮询队列间隔（毫秒），默认 `100` |
| `MESSENGER_HEARTBEAT_INTERVAL_MS` | 向客户端发 logging heartbeat 间隔，默认 `8000` |

工作区 **`setupMcp` 写入的 `mcp.json`** 会在未配置有限等待时带上 **`MESSENGER_INFINITE_WAIT":"1"`**（与默认行为一致，便于阅读配置）。

工具返回末尾会追加 `[protocol] …` 短提醒，强制模型继续 `check_messages`（类似 cuemcp 在返回里夹带约束文案）。

## 扩展内无感保活（默认开启）

扩展进程会按 **`current_session.json`** 里的 `session_tag`，默认 **每 15 分钟** 向队列写入一条 **`[KEEPALIVE]…`**（不依赖外部脚本），用于在长时间无人说话时仍周期性唤醒 `check_messages` 循环，减轻部分环境下 MCP/长阻塞被闲置回收的概率。

| 环境变量 | 作用 |
|----------|------|
| （默认） | **15 分钟**（`900000` ms）一条 `[KEEPALIVE]` |
| `HEYCURSOR_KEEPALIVE_MS` | 自定义间隔（毫秒，≥`60000` 生效）；设为 **`0`** / **`off`** / **`false`** / **`no`** 可**关闭**保活 |

说明：能否「从早挂到晚」仍取决于 **Cursor 是否关闭、电脑是否休眠、网络/进程是否被系统杀掉**；保活只是降低闲置断连概率，**不能**违背客户端或操作系统的生命周期。

## 打 VSIX

```powershell
cd C:\Code\cursormessage\heycursor
$zip = "_pack-heycursor.zip"
if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -LiteralPath @(".\extension", ".\extension.vsixmanifest") -DestinationPath $zip -Force
Move-Item $zip ..\heycursor-1.0.0.vsix -Force
```
