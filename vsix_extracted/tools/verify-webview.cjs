/**
 * 快速检查 dist/webview.js 是否包含预期片段（避免在终端里跑超长 node -e 被误判超时/Cancel）。
 * 用法：在仓库根目录执行  node vsix_extracted/tools/verify-webview.cjs
 * 或在 extension 目录：node ../tools/verify-webview.cjs
 */
"use strict";
const fs = require("fs");
const path = require("path");
const webviewPath = path.join(__dirname, "..", "extension", "dist", "webview.js");
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
