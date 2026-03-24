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

## 额度统计（官方接口）

「额度统计」改为直接读取本机 `state.vscdb` 中的 Cursor access token，并调用 Cursor 官方接口查询：

- `GET https://cursor.com/api/usage-summary`
- `POST https://api2.cursor.sh/aiserver.v1.AuthService/GetUserMeta`
- `GET https://api2.cursor.sh/auth/full_stripe_profile`
- `GET https://api2.cursor.sh/auth/stripe_profile`（前者不可用时兜底）

不再依赖第三方代理，也不会把 token 外传到自定义额度服务。

## 打 VSIX

```powershell
cd C:\Code\cursormessage\heycursor
$zip = "_pack-heycursor.zip"
if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -LiteralPath @(".\extension", ".\extension.vsixmanifest") -DestinationPath $zip -Force
Move-Item $zip ..\heycursor-1.0.0.vsix -Force
```
