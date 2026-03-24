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
| `MESSENGER_MAX_WAIT_MS` | 单次 `check_messages` / `ask_question` 最长等待（毫秒）。**未设置时默认 600000（10 分钟）**，超时返回系统提示后须**同轮再次**调用（避免部分客户端对「无限期阻塞」不友好） |
| `MESSENGER_INFINITE_WAIT=1` | 且未设置 `MESSENGER_MAX_WAIT_MS` 时，恢复**无限期**等待（旧行为） |
| `MESSENGER_POLL_INTERVAL_MS` | 轮询队列间隔（毫秒），默认 `100` |
| `MESSENGER_HEARTBEAT_INTERVAL_MS` | 向客户端发 logging heartbeat 间隔，默认 `8000` |

工具返回末尾会追加 `[protocol] …` 短提醒，强制模型继续 `check_messages`（类似 cuemcp 在返回里夹带约束文案）。

## 扩展内无感保活（可选）

若 MCP 会话已 `register_session` 且存在 `current_session.json`，可设 **`HEYCURSOR_KEEPALIVE_MS`**（毫秒，建议 ≥600000）：扩展进程定时向队列写入 `[KEEPALIVE]…`（带当前 `session_tag`），不依赖外部终端脚本，避免被 IDE 回收终端时断掉。

## 打 VSIX

```powershell
cd C:\Code\cursormessage\heycursor
$zip = "_pack-heycursor.zip"
if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -LiteralPath @(".\extension", ".\extension.vsixmanifest") -DestinationPath $zip -Force
Move-Item $zip ..\heycursor-1.0.0.vsix -Force
```
