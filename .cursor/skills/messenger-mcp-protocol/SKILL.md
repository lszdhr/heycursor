---
name: messenger-mcp-protocol
description: >-
  Use when the user uses Cursor Messenger / HeyCursor MCP (check_messages,
  register_session, ask_question, send_progress). Enforces that every assistant
  turn ends with check_messages; explains Agent chat vs queue.json separation.
---

# Messenger MCP 协议（本仓库）

## 何时适用

- 对话中启用了 **Cursor Messenger**（或 Windsurf 等价）MCP。
- 用户通过**插件侧栏**发消息、或明确在测 MCP / 队列 / 保活。

## 非协商规则

1. **轮次定义**：一轮 =「对用户可见的回复（若有）」+ **同一轮最后一步** `check_messages`（带已注册的 `session_tag`）。  
   **仅输出正文不算一轮结束。**

2. **首次**：若尚未注册，先 `register_session`，再进入 `check_messages` 循环。

3. **循环**：`check_messages` → 处理用户/队列消息 → 回复 → 再 `check_messages`。超时返回系统提示时，**同一轮内立即**再调 `check_messages`，不把超时文案当给用户看的结论。

4. **需要选项时**：用 `ask_question`；答完后仍要 `check_messages`。

5. **`reply` 参数**：可在 `check_messages` 上附带本轮摘要，推送到插件弹窗；与「必须调用工具」无关，不能替代调用。

## 常见失误（刻意避免）

- 「分析已经写完了」→ 停住，**未**调 `check_messages`。（错误）
- 认为「Agent 主聊天还在」所以不需要 MCP。（错误：插件队列与主聊天是不同通道。）

## 与代码的关系

- 队列文件在 `MESSENGER_DATA_DIR` 下的 `queue.json`。未设 `MESSENGER_MAX_WAIT_MS` 时 MCP **无限期**阻塞等待；工具返回常带 `[protocol]` 尾缀。
- 扩展默认约 **每 15 分钟** 写入 **`[KEEPALIVE]`**（需已 `register_session` 且存在 `current_session.json`）。收到 **`[KEEPALIVE]`**：不要展示给用户、不要用 `reply` 弹窗，**立即**再调 `check_messages`。`HEYCURSOR_KEEPALIVE_MS=0`/`off`/`false`/`no` 可关闭。详见 `heycursor/README.md`、`AGENTS.md`。

完整编号条款以 `.cursor/rules/mcp-messenger.mdc` 为准。
