---
description: "通用：终端/Agent 跑命令时的稳妥写法，避免超时、Canceled、无输出误判"
trigger: always
---

# 终端命令（通用约定）

在 Agent 或集成终端里执行命令时，遵循下列约定，减少 **超时、Canceled、无输出** 以及 **「没输出 = 失败」的误判**。

## 1. 避免「一行巨长」的内联脚本

- **少用** `node -e "..."` / `python -c "..."` / `bash -c '...'` 塞整段逻辑，尤其内含 **大段字符串、正则、多引号嵌套** 时，易被 shell 转义弄坏，或触发工具超时。
- **优先**：在仓库里放小脚本（如 `scripts/check-foo.mjs`），终端只执行 `node scripts/check-foo.mjs`，脚本内 **`process.exit(0|1)`** 表示成败。
- 若必须内联：保持 **短**（单行或几行），避免在 `-e` 里 `readFileSync` 超大文件再整段 `console.log`。

## 2. 大文件 / 单行压缩资源：不要「整文件打印」

- **不要**为「检查是否包含某字符串」而 `node -e` 读入整个 `dist/*.js` 再 log 布尔值；文件极大或单行极长时，容易慢、易被取消、输出缓冲异常。
- **优先**：`rg "pattern" path`、`grep`、`Select-String`（PowerShell）等 **流式/索引** 方式。
- 验证「补丁是否打进产物」：用 **搜索工具** 或 **专用校验脚本**（短、只打印 OK/NO + 退出码）。

## 3. 对「无输出」与 Canceled 的解释

- 终端显示 **Canceled**、**Taking longer than expected** 或 **No output**：可能是 **超时/用户取消/环境限制**，**不等于**命令逻辑上的失败，也**不等于**目标文件里一定没有某内容。
- 结论前应用 **另一种方式交叉验证**（例如改 grep、改小脚本、读文件片段）。

## 4. PowerShell 与引号

- Windows 下默认 **PowerShell**：`node -e` 里双引号与 `$` 易被提前解析；复杂脚本 **写入 .js/.cjs 再执行** 比拼一层层转义更可靠。
- 需要退出码时，可在命令后加：`; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }` 或先跑脚本再看 `$LASTEXITCODE`。

## 5. 长时间任务

- 可能超过工具默认等待时长的构建/测试：在说明里标注 **预期较久**，或拆成 **后台/分步**，避免单次调用被平台掐断后无法区分「失败」与「未完成」。

## 6. 优先顺序（自检类需求）

1. 编辑器 / Agent **Grep / 搜索**  
2. 仓库内 **短脚本**（明确退出码）  
3. **`rg` / `Select-String` / `findstr`**  
4. 最后才考虑 **短** 的 `node -e` / `python -c`
