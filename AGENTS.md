# Agent 约定（本仓库）

## Cursor / Windsurf Messenger MCP

本仓库维护 HeyCursor / Cursor Messenger 相关代码。凡**已启用 Messenger MCP** 且用户通过插件侧栏与会话交互时，助手须遵守：

1. **轮次终点不是「写完给用户看的字」**，而是 **`check_messages` 成功发出之后**（用户明确要求结束会话时除外）。
2. 首次会话先 `register_session`，之后每轮 `check_messages` **必须**带同一 `session_tag`。
3. **禁止**出现：解释、结论、列表已全部输出 → 本回合结束且**未**调用 `check_messages`。这与「是否读完上下文」无关，属于**必须执行的工具步骤**。
4. **两条通道**：Cursor 主界面 Agent 输入框的消息**不一定**进入 `queue.json`；插件发送的才会入队。队列空 ≠ 主对话已结束。

详细条款见：

- `.cursor/rules/mcp-messenger.mdc`（Cursor）
- `.windsurf/rules/mcp-messenger.md`（Windsurf）

可选：项目 Skill `.cursor/skills/messenger-mcp-protocol/SKILL.md`（与上表一致，便于模型检索）。

## 与 CueStack（HAP）的对齐（实现侧）

HeyCursor `mcp-server.mjs`：**默认无限期**阻塞 `check_messages` / `ask_question`（未设 `MESSENGER_MAX_WAIT_MS`）；需要单次限时等待时再设 `MESSENGER_MAX_WAIT_MS` 或 `MESSENGER_FINITE_DEFAULT_MS`。各工具返回追加 `[protocol]` 尾缀。共享邮箱为 **`queue.json` + 会话文件**。

扩展默认 **每 15 分钟** 写入 **`[KEEPALIVE]`**（`HEYCURSOR_KEEPALIVE_MS`，`0`/`off`/`false`/`no` 关闭），便于长时间无人输入时仍周期性走通 MCP 循环；**无法**保证 Cursor 不关、机器不休眠时仍不断连。
