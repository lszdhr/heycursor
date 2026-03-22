# Windsurf Messenger

基于 Cursor Messenger 改编的 Windsurf 版 MCP 旁路通信插件。

## 功能

通过文件 IPC + MCP 协议，实现用户与 AI 之间的持续对话（"卡对话"）：

- **check_messages**: AI 轮询用户消息，形成永续循环
- **ask_question**: 向用户提出选择题并等待回答
- **register_session**: 注册会话标识，支持多会话隔离
- **send_progress**: 推送多步骤任务进度摘要

## 安装

1. 在 Windsurf 中打开命令面板 (`Ctrl+Shift+P`)
2. 输入 `Extensions: Install from VSIX...`
3. 选择 `windsurf-mcp-messenger-1.0.0.vsix`

## 路径说明

| 项目 | 路径 |
|------|------|
| 数据目录 | `~/.windsurf-mcp-messenger/` |
| 全局 MCP 配置 | `~/.codeium/windsurf/mcp_config.json` |
| 工作区 MCP 配置 | `.windsurf/mcp.json` |
| 工作区规则 | `.windsurf/rules/mcp-messenger.md` |

## 与 Cursor 版的差异

- 数据目录从 `.cursor-mcp-messenger` 改为 `.windsurf-mcp-messenger`
- MCP 配置路径适配 Windsurf (`~/.codeium/windsurf/mcp_config.json`)
- 规则文件从 `.mdc` 改为 `.md`，frontmatter 使用 `trigger: always`
- 移除了 Cursor 用量查询功能（Windsurf 不适用）
- 工作区配置从 `.cursor/` 改为 `.windsurf/`
