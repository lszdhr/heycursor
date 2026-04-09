# Task Tracker

> Goal: 优化 HeyCursor 保活机制，借鉴 CueStack 策略，确保单次 Cursor 会话永续不断

## Subtasks

- [x] **T1**: 缩短 Slice 周期 300s → 120s（mcp-server.mjs）
  - Depends: none
  - Done-when: SLICE_WAIT_MS 默认值改为 120000；check_messages 工具描述中的 "300000"/"5 分钟"/"300s" 同步更新
  - Result: 修改 mcp-server.mjs L21040,L21048 默认值 3e5→12e4；L21459 工具描述 300000→120000, 5分钟→2分钟, 300s→120s

- [x] **T2**: 缩短断连检测 180s → 90s（extension.js）
  - Depends: none
  - Done-when: SUSPECTED_DISCONNECT_MS 从 18e4 改为 9e4
  - Result: 修改 extension.js L314 `18e4` → `9e4`

- [x] **T3**: 添加 todo_list 劫持策略到 SYSTEM_SUFFIX（mcp-server.mjs）
  - Depends: none
  - Done-when: SYSTEM_SUFFIX 中追加类似 CueStack 的约束文本，要求模型在计划最后一步写"调用 check_messages"
  - Result: 修改 mcp-server.mjs L21061 SYSTEM_SUFFIX 追加【强制】段落，要求模型检查计划最后一步为"调用 check_messages"

- [x] **T4**: 精简 MESSENGER_PROTOCOL_TAIL（mcp-server.mjs）
  - Depends: none
  - Done-when: protocol tail 压缩为一行精简提醒，减少每轮 token 消耗
  - Result: 修改 mcp-server.mjs L21052 MESSENGER_PROTOCOL_TAIL 从 ~80 字压缩为 ~30 字（"→ check_messages(...) 未调用则禁止结束本轮"）

- [x] **T5**: 轮询间隔 100ms → 300ms（mcp-server.mjs）
  - Depends: none
  - Done-when: POLL_INTERVAL 默认值从 100 改为 300
  - Result: 修改 mcp-server.mjs L21015 默认值 100→300

- [x] **T6**: 同步更新 bundled 规则中的 Slice 描述（mcp-messenger-bundled.mdc）
  - Depends: T1
  - Done-when: 规则第 20/21 条中关于 slice 的描述与新默认值一致
  - Result: 修改 mcp-messenger-bundled.mdc L42 第21条添加 "默认启用 MESSENGER_SLICE_WAIT_MS=120000（约 2 分钟切片）"

- [x] **T7**: 语法验证
  - Depends: T1,T2,T3,T4,T5,T6
  - Done-when: node --check 通过 extension.js 和 mcp-server.mjs 无语法错误
  - Result: `node --check extension.js` 和 `node --check mcp-server.mjs` 均 exit 0

- [x] **T8**: 追加规则35 - 禁止终端写长命令，改用脚本文件
  - Depends: none
  - Done-when: bundled 规则中有明确的长命令限制条目
  - Result: 添加到 mcp-messenger-bundled.mdc，>120字符或复杂逻辑须写临时脚本

- [x] **T9**: 重构 bundled 规则为分层结构
  - Depends: T8
  - Done-when: 规则分为 5 条核心（C1-C5）+ 指导规则（6-21），无冗余重复
  - Result: 从 35 条压缩为 21 条（5 核心 + 16 指导），合并原 1/4/19/23→C1、20/22→C2，按主题分组

## Task-driven-dev

### Keepalive Cleanup

- [x] **T10**: 重建保活任务追踪并梳理当前真实机制
  - Depends: none
  - Done-when: 明确当前 keepalive / auto_ping / force_return / heartbeat 的实际职责、默认时序与冲突点，并把后续修复任务记录到 tracker
  - Result: 当前链路为「扩展侧 5 分钟 keepalive 静默续命 + 15 分钟 auto_ping 主动唤醒 + MCP 侧 15 分钟 force_return 兜底返回 + 8 秒 heartbeat 日志保活」；核心冲突不是单个定时器过快，而是同一 session_tag 可并发进入多个 check_messages，导致轮次/唤醒被放大

- [x] **T11**: 为 `check_messages` 增加同 session 单飞保护
  - Depends: T10
  - Done-when: 同一 `session_tag` 下已有等待中的 `check_messages` 时，不再并发开启第二个长期监听；日志可区分重复进入
  - Result: 在 mcp-server.mjs 中新增 `checkMessagesFlights` 单飞表；同一 session_tag 的重复调用不再进入第二个 while 轮询，而是 join 已有 promise，并记录 `last_check_messages_duplicate_at` 与 duplicate joined 日志；`node --check heycursor/extension/dist/mcp-server.mjs` 已通过

- [x] **T12**: 收敛重复保活机制，减少无效重入
  - Depends: T11
  - Done-when: 去掉重复的 15 分钟重入路径，保留单一主导机制；相关 dead path 一并清理
  - Result: 扩展侧已移除 `HEYCURSOR_AUTO_PING_MS` 驱动的 `auto_ping` 注入，仅保留 5 分钟 keepalive；MCP 侧对遗留 `auto_ping` 包改为静默消费并继续轮询，不再返回额外唤醒文本；`node --check heycursor/extension/dist/extension.js` 与 `node --check heycursor/extension/dist/mcp-server.mjs` 均通过

- [x] **T13**: 清理失效配置与误导文案
  - Depends: T12
  - Done-when: 移除/修正文档和代码里已失效的 slice / round / infinite_wait 等描述，使 README 与运行逻辑一致
  - Result: mcp-server.mjs 已移除未使用的 `SLICE_WAIT_MS` / `getSliceText` / `getKeepaliveText` 与 `check_messages.round` 参数；README、AGENTS.md、`.cursor/skills/messenger-mcp-protocol/SKILL.md` 已改为当前真实机制：服务端 `MESSENGER_FORCE_RETURN_MS` + 扩展侧 5 分钟 `keepalive`；`node --check heycursor/extension/dist/extension.js` 与 `node --check heycursor/extension/dist/mcp-server.mjs` 均通过

- [x] **T14**: 修正 workspace MCP 配置自愈逻辑并完成验证打包
  - Depends: T11,T12,T13
  - Done-when: `.cursor/mcp.json` 的生成逻辑能稳定写回当前机器的有效 entry；语法检查通过并重新打包 VSIX
  - Result: extension.js 中 `buildMessengerMcpEntry` 已改为使用真实存在的 `getServerEntryPath()`，并在生成 env 时清理遗留 `MESSENGER_INFINITE_WAIT`，从而恢复 `.cursor/mcp.json` 的自动自愈重写能力；已执行 `zip -qr _pack-heycursor.zip extension extension.vsixmanifest && mv _pack-heycursor.zip ../heycursor-1.2.0.vsix` 生成新 VSIX；为保持迁移友好，本次未将工作区 `.cursor/mcp.json` 直接写死为本机绝对路径，后续由扩展启动 / `setupMcp` 自动重写

## Summary

- **T1**: Slice 切片周期 300s → 120s，降低被 Cursor 内部 tool call 超时杀死的风险
- **T2**: 断连检测 180s → 90s，更快发现并提示用户恢复
- **T3**: 借鉴 CueStack 的 todo_list 劫持策略，在 SYSTEM_SUFFIX 中强制要求模型把"调用 check_messages"写入计划
- **T4**: MESSENGER_PROTOCOL_TAIL 从长段文字压缩为一行，每轮节省 ~50 token
- **T5**: 轮询间隔 100ms → 300ms，减少长会话的 CPU/磁盘负载
- **T6**: bundled 规则同步更新 Slice 描述
- **T7**: 语法验证通过
- **T8**: 追加终端长命令限制规则
- **T9**: 规则分层重构：35 条 → 5 核心 + 16 指导 = 21 条
