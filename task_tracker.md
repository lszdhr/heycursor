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
- [x] **T6**: 实现会话活跃状态文件
  - Depends: none
  - Done-when: extension 与 mcp-server 共享 session_activity.json 并记录消费/轮询/保活时间
  - Result: heycursor/extension/dist/extension.js 与 heycursor/extension/dist/mcp-server.mjs 共享 session_activity.json
- [x] **T7**: 将扩展保活改为结构化 keepalive 包
  - Depends: T6
  - Done-when: queue 中写入 keepalive 类型，check_messages 静默处理并续接
  - Result: 扩展写入 keepalive 队列项，mcp-server 静默消费并续接 check_messages
- [x] **T8**: 实现疑似断链检测与恢复提示
  - Depends: T6
  - Done-when: 扩展能根据活跃状态判断 suspected_disconnected 并在面板显示恢复提示
  - Result: 扩展按队列滞留和轮询时间判定疑似断链并提供恢复监听/复制指令
- [x] **T9**: 验证打包并提交当前版本
  - Depends: T7,T8
  - Done-when: 语法检查通过、VSIX 重打包并完成中文提交
  - Result: 语法检查通过并重打包 heycursor-1.1.1.vsix，准备中文提交

## Summary

- 新增 session_activity.json 作为扩展与 mcp-server 的共享活跃状态。
- 扩展保活改为结构化 keepalive 包，不再以普通文本 [KEEPALIVE] 混入用户队列。
- 当待处理消息滞留且 check_messages 轮询长期未更新时，扩展会提示疑似脱链并提供恢复监听/复制恢复指令。
