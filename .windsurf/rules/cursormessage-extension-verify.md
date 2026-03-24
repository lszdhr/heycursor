---
description: "本仓库扩展 dist 校验与终端命令约定（避免超长 node -e 被取消/无输出）"
trigger: always
---

# Cursor Messenger 扩展仓库：验证与终端约定

**主力扩展为 HeyCursor**：日常维护以 `heycursor/extension/dist/`（`webview.js`、`webview.css`、`extension.js` 等）为准。侧栏版 `vsix_extracted/extension/dist/` 仅在需要单独打侧栏 VSIX 时同步。

## 不要用超长 `node -e`

- **禁止**用一行极长的 `node -e "…readFileSync(…whole file…)…"` 去检查大文件（尤其是 **单行压缩** 的 `dist/webview.js`）。
- 这类命令在 Agent/集成终端里易被标为 **Canceled** 或超时，**没有输出不等于「验证失败」**，也不等于内容不存在。

## 推荐做法（按优先顺序）

1. **用编辑器/Agent 的搜索能力**：对 `heycursor/extension/dist/webview.js` 等文件使用 **grep / 全文搜索** 查找关键字（如 `autoQuota`、`z.autoQuota.detailText`、`Auto + Composer（分项）`），比跑巨型 `node -e` 更稳。
2. **用仓库内脚本**：在项目根执行  
   `node vsix_extracted/tools/verify-webview.cjs`  
   （默认检查 `heycursor/extension/dist/webview.js`；可用环境变量 `MESSENGER_WEBVIEW_JS` 指定其它文件。）  
   脚本会逐条打印 `OK` / `NO` 并以**退出码 0/1** 表示是否全部命中。
3. **终端快速搜**：PowerShell `Select-String`，或 `rg` / `findstr` 对路径搜索子串，避免整文件读进 `console.log`。

## 打包提醒

- 修改 `dist` 后需 **重载窗口** 或 **重新打 VSIX 并安装**，运行中的扩展才会加载新资源。
- `vsix_extracted/tools/verify-webview.cjs` 用于**开发自检**，默认**不会**打进 VSIX（打包目录一般为 `extension` + `extension.vsixmanifest`）。
