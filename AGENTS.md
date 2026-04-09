# Agent 约定（本仓库）

## Cursor Messenger MCP

本仓库维护 HeyCursor / Cursor Messenger 相关代码。凡**已启用 Messenger MCP** 且用户通过插件侧栏与会话交互时，助手须遵守：

1. **轮次终点不是「写完给用户看的字」**，而是 **`check_messages` 成功发出之后**（用户明确要求结束会话时除外）。
2. 首次会话先 `register_session`，之后每轮 `check_messages` **必须**带同一 `session_tag`。
3. **禁止**出现：解释、结论、列表已全部输出 → 本回合结束且**未**调用 `check_messages`。这与「是否读完上下文」无关，属于**必须执行的工具步骤**。
4. **两条通道**：Cursor 主界面 Agent 输入框的消息**不一定**进入 `queue.json`；插件发送的才会入队。队列空 ≠ 主对话已结束。

详细条款见：

- `.cursor/rules/mcp-messenger.mdc`（Cursor）

可选：项目 Skill `.cursor/skills/messenger-mcp-protocol/SKILL.md`（与上表一致，便于模型检索）。

## 与 CueStack（HAP）的对齐（实现侧）

HeyCursor `mcp-server.mjs`：`check_messages` 默认 `MESSENGER_MAX_WAIT_MS=90000`（90 秒短超时循环），与 CursorMr 策略一致。超时返回标记 `isError: true`，帮助弱模型正确识别并重调。`MESSENGER_FORCE_RETURN_MS`（默认 15 分钟）作为兜底。各工具返回追加 `[→ check_messages]` 尾缀。共享邮箱为 **`queue.json` + 会话文件**。补充工具：`propose_session_tag`、`register_session` 的 `label`、`recall_sessions`（按 `hints` 筛 `session_tag`/`label`）；`writeQueue` 对 `queue.json` 使用临时文件再 rename，降低半写风险。

扩展默认会在会话空闲 **5 分钟**后向队列写入 **`type: "keepalive"`** 结构化保活项（`HEYCURSOR_KEEPALIVE_MS`，`0`/`off`/`false`/`no` 关闭），作为短超时循环之外的补充保活手段。
