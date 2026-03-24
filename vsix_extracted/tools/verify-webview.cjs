/**
 * 快速检查 dist/webview.js 是否包含预期片段（避免在终端里跑超长 node -e 被误判超时/Cancel）。
 * 默认校验主力路径：heycursor/extension/dist/webview.js
 * 用法：在仓库根目录执行  node vsix_extracted/tools/verify-webview.cjs
 * 环境变量 MESSENGER_WEBVIEW_JS 可指定其它 webview.js 绝对/相对路径。
 */
"use strict";
const fs = require("fs");
const path = require("path");
const repoRoot = path.join(__dirname, "..", "..");
const primary = path.join(repoRoot, "heycursor", "extension", "dist", "webview.js");
const legacy = path.join(__dirname, "..", "extension", "dist", "webview.js");
const webviewPath = process.env.MESSENGER_WEBVIEW_JS
  ? path.resolve(process.cwd(), process.env.MESSENGER_WEBVIEW_JS)
  : fs.existsSync(primary)
    ? primary
    : legacy;
if (!fs.existsSync(webviewPath)) {
  console.error("missing:", webviewPath);
  process.exit(2);
}
const s = fs.readFileSync(webviewPath, "utf8");
const needles = ["autoQuota", "z.autoQuota.detailText", "Auto + Composer（分项）"];
let ok = true;
for (const k of needles) {
  const hit = s.includes(k);
  console.log(hit ? "OK " : "NO ", k);
  if (!hit) ok = false;
}
process.exit(ok ? 0 : 1);
