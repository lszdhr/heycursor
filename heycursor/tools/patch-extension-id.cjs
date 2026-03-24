"use strict";
/**
 * 将侧栏版 extension.js（cursorMcpMessenger.*）中的视图/命令 ID 替换为 HeyCursor（heycursor.*）。
 * 主力在 heycursor 上开发时，若从 vsix_extracted/extension/dist/ 拷入新的 extension.js，需再执行本脚本。
 */
const fs = require("fs");
const path = require("path");
const p = path.join(__dirname, "..", "extension", "dist", "extension.js");
let s = fs.readFileSync(p, "utf8");
s = s.replace(/cursorMcpMessenger\.mainView/g, "heycursor.mainView");
s = s.replace(/cursorMcpMessenger\.setupMcp/g, "heycursor.setupMcp");
s = s.replace(/cursorMcpMessenger\.removeMcp/g, "heycursor.removeMcp");
s = s.replace(/cursorMcpMessenger\.sendFile/g, "heycursor.sendFile");
s = s.replace(/cursorMcpMessenger\.openConsole/g, "heycursor.openConsole");
s = s.replace(
  /var WEBVIEW_STATE_KEY = "messengerWebviewState"/,
  'var WEBVIEW_STATE_KEY = "heycursorWebviewState"'
);
fs.writeFileSync(p, s);
console.log("OK", p);
