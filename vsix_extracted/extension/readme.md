# Cursor Messenger

与 MCP 旁路通信扩展：文件 IPC、`check_messages` / `ask_question`，无外部依赖（无卡密/API）。使用独立命名与数据目录，可与 xw 插件并存。

## 功能

- **左侧面板**：输入消息（文字、图片、文件），待发队列，AI 提问与回复摘要弹窗，最近发送历史。
- **MCP 工具**：`register_session(session_id)`（注册当前对话的会话 ID，同工作区多会话时必用）、`check_messages(session_id?, reply?)`（轮询用户消息，可带 `reply` 推送摘要；多会话时需带 `session_id`）、`ask_question`（向用户提问并等待选择）。
- **等待与超时**：单次最多等待 `MAX_WAIT_MS`（默认 30 分钟，与 1.1.1 / wait30m 一致），超时后返回 [system] 要求再次调用；等待期间每 `HEARTBEAT_INTERVAL`（默认 8 秒）发日志不 return，避免掉线。
- **规则**：安装 MCP 配置时写入 `~/.cursor/rules/mcp-messenger.mdc`。
- **全局安装**：MCP 配置安装到全局（`~/.cursor/mcp.json` 与规则），Win/Mac 通用（`os.homedir()` 跨平台）；激活时若检测到全局或工作区无配置，自动安装到全局。
- **数据目录**：全局安装时使用 `~/.cursor-mcp-messenger/`；**有工作区时**为首个工作区写入 `.cursor/mcp.json` 并使用该工作区独立数据目录（`~/.cursor-mcp-messenger/<hash>/`），多窗口/多会话互不串消息。
- **多窗口隔离**：有工作区时扩展与 MCP 均使用按工作区路径 hash 的数据目录，不同窗口的队列与问答互不干扰。
- **同工作区多会话隔离**：同一工作区下多个聊天标签（多会话）时，AI 需先调用 `register_session(session_id)` 注册本对话，之后每次 `check_messages` 都传入同一 `session_id`；插件侧发送的消息会绑定到「最后注册的会话」，只有带匹配 `session_id` 的会话会收到，避免串消息。

## 安装

1. 构建：`npm run compile`（或 `npm run package` 生成 .vsix）。
2. 在 Cursor 中：扩展 → 从 VSIX 安装，选择 `cursor-mcp-messenger-0.1.0.vsix`；或开发时打开本目录，F5 启动扩展开发主机。
3. 扩展激活时会自动检测：若全局 `~/.cursor/mcp.json` 和工作区 `.cursor/mcp.json` 均无本扩展配置，则**自动安装到全局**；也可手动执行 **「Cursor Messenger: 安装 MCP 配置」** 写入全局。
4. 重启 Cursor 使 MCP 生效。

## 数据目录与环境变量

- **数据目录**：全局安装时用 `~/.cursor-mcp-messenger/`；工作区安装时用 `~/.cursor-mcp-messenger/<hash>/`（hash 为首工作区路径 MD5 前 12 位）。Win 下 `~` 为 `%USERPROFILE%`，Mac 为 `/Users/用户名`。文件：`queue.json`、`question.json`、`answer.json`、`reply.json`、`server.log`。
- **MCP 等待**：`MESSENGER_MAX_WAIT_MS` 单次最长等待（默认 1800000，30 分钟，最大不超过 30 分钟）；`MESSENGER_HEARTBEAT_INTERVAL_MS` 心跳日志间隔（默认 8000，8 秒，仅打日志不 return）。

## 使用

1. 打开左侧 **Cursor Messenger** 面板。
2. 在输入框输入文字，Enter 发送，Shift+Enter 换行；可粘贴图片、点击「图片」/「文件」选择附件。
3. 在 Cursor 中开一个 Agent 对话，发一条消息让 AI 启动；AI 会按规则在对话首轮调用 `register_session` 生成并注册 `session_id`，之后每轮回复后调用 `check_messages(session_id)`，形成永续循环。同一工作区多会话时，每个会话使用自己的 `session_id`，消息不会串。
4. 若 AI 调用 `ask_question`，面板会显示问题与选项，提交后 AI 继续；若 AI 调用 `check_messages` 时传入 `reply`，面板会弹窗展示摘要。

## 与 xw 的差异

- **命名**：MCP 显示名为「Cursor Messenger」，数据目录为 `~/.cursor-mcp-messenger`。
- **无卡密**：不实现卡密激活与外部 API，发送不依赖任何激活步骤。

## 开发

- `npm run compile`：编译 extension、webview、mcp-server。
- `npm run watch:ext` / `npm run watch:webview`：监听源码变更。
- `npm run package`：编译并打包为 .vsix。

## 技术栈

- Extension / MCP：TypeScript，Node.js，`@modelcontextprotocol/sdk`，stdio 传输。
- Webview：React 18，与扩展通过 `postMessage` 通信；扩展与 MCP 通过文件 IPC 通信。
