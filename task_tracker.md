# Task Tracker

> Goal: 借鉴 CueStack 落地 recall / pause / 可读 session、禁止假工具调用、队列原子写；规则与扩展内置规则同源。

## Subtasks

- [x] **T1**: 更新 `.cursor/rules` / `.windsurf/rules`（新工具与禁止虚假调用）
  - Depends: none
  - Done-when: 含 recall_sessions、messenger_pause、propose_session_tag、register_session label 说明
  - Result: 已追加规则 26–30

- [x] **T2**: `mcp-server.mjs` — `readKnownSessionsList`、`recall_sessions`、`propose_session_tag`、`messenger_pause`、`register_session` 的 `label`
  - Depends: T1
  - Done-when: 工具可调用且 pause 复用 question 管道
  - Result: 已实现

- [x] **T3**: `writeQueue` 原子替换（tmp + rename）
  - Depends: none
  - Done-when: `writeQueue` 使用临时文件
  - Result: 已实现

- [x] **T4**: 扩展从 `dist/mcp-messenger-bundled.mdc` 加载规则，与仓库规则文件同步
  - Depends: T1
  - Done-when: `RULES_CONTENT` 来自磁盘副本
  - Result: 已实现

- [x] **T5**: 更新 README / AGENTS / Skill；提交 git
  - Depends: T2–T4
  - Done-when: 文档与提交完成
  - Result: 已更新 `AGENTS.md`、`.cursor/skills/messenger-mcp-protocol/SKILL.md`、`heycursor/README.md`；本提交纳入规则与实现变更

## Deferred（本迭代不实现）

- **SQLite 邮箱**：与 `queue.json` 并存迁移工作量大，记在后续里程碑。

## Summary

- **MCP**：`recall_sessions`、`messenger_pause`、`propose_session_tag`；`register_session` 支持 `label`；`ask_question` 与 `messenger_pause` 共用 `waitForAnswerOrTimeout`；`writeQueue` 原子写；`propose_session_tag` 文案修正。
- **规则**：`.cursor`/`.windsurf` 增至 30 条（含反虚假调用、pause/recall/label、规则同步）；新增 `mcp-messenger-bundled.mdc`，`extension.js` 运行时从该文件读取规则正文。
- **文档**：`AGENTS.md`、Skill、`heycursor/README.md` 与 tracker 已对齐。
