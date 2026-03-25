# Task Tracker

> Goal: 完成 HeyCursor 的 Mac 适配并交付可安装的 1.2.0 扩展包

## Subtasks

- [x] **T1**: 审查现有扩展在 Mac 上的运行依赖并确认需修改的范围
  - Depends: none
  - Done-when: 列出核心功能、平台差异和目标文件
  - Result: 确认扩展主链路已按 darwin 定位 Cursor 配置目录；需补 Mac 侧 agent-run.sh 及规则/README 的平台说明
- [x] **T2**: 补充 Mac 终端包装脚本与跨平台调用约定
  - Depends: T1
  - Done-when: 新增可在 macOS shell 执行的一次性包装脚本并在规则/文档中引用
  - Result: 新增 scripts/agent-run.sh，提供 Mac/Linux 下的心跳、静默超时、总超时和进程终止包装
- [x] **T3**: 将规则与文档改为同时覆盖 Windows 和 macOS
  - Depends: T2
  - Done-when: 规则与 README 明确 macOS 用法，不再只写 Windows
  - Result: 更新 .cursor 规则、扩展内置 bundled 规则与 README，补充 Mac/Linux shell 与打包说明
- [x] **T4**: 验证扩展关键路径在 Mac 上的配置定位与打包产物
  - Depends: T1,T3
  - Done-when: 确认平台路径逻辑正确并生成新的 VSIX
  - Result: 验证 node --check 通过，并重新打包 heycursor-1.2.0.vsix；扩展主链路已保留 darwin 路径定位
