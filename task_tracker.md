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
- [x] **T10**: 新增终端包装脚本
  - Depends: none
  - Done-when: 仓库新增统一的 agent 命令包装器，支持超时、静默超时、明确结束标记和退出码
  - Result: 新增 scripts/agent-run.ps1 与 scripts/agent-run.cmd，支持开始/心跳/结束标记、超时和静默超时
- [x] **T11**: 同步终端调用规则
  - Depends: none
  - Done-when: Cursor/Windsurf/扩展内置规则都要求优先使用包装脚本并避免直接裸跑终端
  - Result: 同步 .cursor/.windsurf/扩展内置规则，要求优先使用 agent-run 包装脚本并避免裸跑终端
- [x] **T12**: 补充终端防卡死说明
  - Depends: none
  - Done-when: README 或说明文档解释推荐 shell、包装器用法和限制
  - Result: README 新增终端防卡死章节，说明推荐 shell、包装器调用方式和超时语义
- [x] **T13**: 官方额度链路补 refresh token 自动刷新重试
  - Depends: none
  - Done-when: 当官方接口返回认证失败时，自动用本地 refresh token 刷新 access token 后重试一次
-  - Result: `heycursor/extension/dist/extension.js`：`fetchCursorUsage()` 捕获 `OFFICIAL_AUTH` 后调用 `refreshAccessTokenOfficial()` + `persistRefreshedAuth()`，并重试获取 usage summary / meta / stripe
- [x] **T14**: 刷新成功后落盘并复用新 token
  - Depends: T13
  - Done-when: 刷新成功后更新本地 token 存储（injected token 或 sidecar）并用于后续额度请求
-  - Result: `persistRefreshedAuth()` 已更新 `injected-token.json` 与 `cursor.auth.json`（包含 `refreshToken`）供后续复用
- [x] **T15**: 验证与文档对齐
  - Depends: T13,T14
  - Done-when: 语法检查通过；README「额度统计」与代码实现一致
  - Result: README 已有 refreshToken 说明；已对 `extension.js` 执行 `node --check` 通过

## Summary

- 新增 agent-run 包装脚本，统一终端命令的开始/心跳/结束标记。
- 包装脚本支持总超时与静默超时，超时后主动杀掉子进程树。
- Cursor/Windsurf/扩展内置规则与 README 已同步到终端包装器优先策略。
- 新增官方额度 token 刷新重试：`OFFICIAL_AUTH` 时走 refreshToken 刷新 accessToken 并重试 usage/meta/stripe；刷新后落盘复用。
