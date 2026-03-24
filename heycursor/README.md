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

## 额度统计（第三方代理）

「额度统计」默认请求 `MCP_API_BASE`（未设置时为 `https://api.yidachuang.top/api`）的 `POST /subscriptions/local-token-info`，将本机 `state.vscdb` 中的 Cursor access token 发给该服务解析。**会外传 token，请自行评估信任与隐私**；可自建兼容接口后设置环境变量 `MCP_API_BASE` 指向你的基址（勿尾斜杠）。

## 打 VSIX

```powershell
cd C:\Code\cursormessage\heycursor
$zip = "_pack-heycursor.zip"
if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -LiteralPath @(".\extension", ".\extension.vsixmanifest") -DestinationPath $zip -Force
Move-Item $zip ..\heycursor-1.0.0.vsix -Force
```
