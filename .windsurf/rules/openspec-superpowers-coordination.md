---
trigger: always
---

# OpenSpec + Superpowers 协调规则

## 零、新项目检测（每次对话首轮自动执行）

对话开始时，检查当前项目根目录是否存在 `openspec/` 目录：
- **若不存在** → 立即提醒用户：「检测到当前项目尚未配置 OpenSpec。建议在终端运行 `openspec init --tools windsurf` 初始化。是否现在执行？」
- **若存在** → 不提醒，正常工作

本项目同时使用两个 AI 开发框架，分层协作：
- **OpenSpec**（主导）：宏观工作流治理 — 需求、设计、任务规划、归档
- **Superpowers**（增强）：微观执行质量 — TDD、调试、验证、代码审查

## 一、分工边界

### OpenSpec 负责（规划层）

| 场景 | 使用命令/技能 |
|------|--------------|
| 探索需求、调研问题 | `/opsx:explore` |
| 创建变更（proposal + specs + design + tasks） | `/opsx:propose` |
| 按任务清单实现代码 | `/opsx:apply` |
| 归档已完成的变更 | `/opsx:archive` |

### Superpowers 负责（执行层）

| 场景 | 使用技能 |
|------|---------|
| 实现功能或修 bug 时，写代码前先写测试 | `test-driven-development` |
| 遇到 bug、测试失败、异常行为 | `systematic-debugging` |
| 即将声称工作完成前 | `verification-before-completion` |
| 完成任务后自查 | `requesting-code-review` |
| 收到代码审查反馈时 | `receiving-code-review` |

## 二、统一工作流

```
/opsx:explore（需求调研）
    ↓
/opsx:propose（生成 proposal + specs + design + tasks）
    ↓  提出 2-3 种技术方案并给推荐（融合 brainstorming 精华）
    ↓  分段展示设计让用户逐段确认
    ↓
/opsx:apply（逐个 task 实现）
    ├── 每个 task 内：遵循 TDD 红绿重构（test-driven-development）
    ├── 遇到 bug：切换到 systematic-debugging 四阶段分析
    └── task 完成前：执行 verification-before-completion 验证
    ↓
requesting-code-review（自查代码质量）
    ↓
/opsx:archive（归档变更，合并 specs）
```

## 三、冲突规避

### 禁用的 Superpowers 技能

以下 Superpowers 技能与 OpenSpec 工作流冲突，**不要使用**：
- `brainstorming` → 由 `/opsx:explore` + `/opsx:propose` 替代
- `writing-plans` → 由 OpenSpec `tasks.md` 替代
- `executing-plans` → 由 `/opsx:apply` 替代
- `subagent-driven-development` → 由 `/opsx:apply` 替代
- `using-superpowers` → 强制调用规则与 OpenSpec 流程冲突，不使用

已退役的旧工作流（由 OpenSpec 替代）：
- `spec-driven-dev` → 由 `/opsx:propose` 替代（精华已融入本规则）
- `task-driven-dev` → 由 `/opsx:apply` 替代（精华已融入本规则）

## 四、Superpowers 自动匹配

当用户说"用 superpower 帮我"、"superpower"或类似触发词时，根据上下文自动选择最匹配的 skill：

| 上下文线索 | 匹配 skill |
|-----------|-----------|
| 要写代码、实现功能、修 bug | `test-driven-development` |
| 有 bug、测试失败、行为异常、排查问题 | `systematic-debugging` |
| 做完了、要提交、确认结果 | `verification-before-completion` |
| review、审查、检查代码质量 | `requesting-code-review` |
| 收到别人的 review 反馈 | `receiving-code-review` |

匹配后：先告诉用户"使用 [skill 名称]"，然后读取该 skill 的 SKILL.md 并严格遵循。

## 五、`/opsx:propose` 增强（融合 spec-driven-dev 精华）

执行 `/opsx:propose` 时，除了 OpenSpec 标准流程，还必须遵守：

### 1. 先探索后提案
- 先探索项目上下文（检查文件、文档、近期提交）
- 提出 2-3 种方案（带权衡分析和推荐）
- 分段展示设计让用户逐段确认

### 2. 阶段门控
- proposal.md 生成后 → **暂停，等用户确认**后才生成 design.md
- design.md 生成后 → **暂停，等用户确认**后才生成 tasks.md
- 未获用户确认前，不得跳到下一个 artifact

### 3. 自审 Checklist（生成每个 artifact 前必须自检）

**生成 specs / proposal 时：**
- [ ] 枚举所有涉及的数据字段，确认每个字段至少被一条 AC 覆盖
- [ ] 对每个数值计算型 AC，追问：重复执行 N 次后是否仍然正确？
- [ ] 对每个扣减型 AC，追问：扣到 0 时行为是否明确？
- [ ] 每个列表展示的 AC，确认数据到前端的映射规则已说明

**生成 design.md 时：**
- [ ] 每个接口都有设计细节（包括"简单"的 CRUD），至少包含输入校验、默认值、返回格式
- [ ] 遍历每条 AC，确认 design.md 中都有对应实现方案覆盖
- [ ] 若多个模块共享同一配置，确认是否抽取到单一位置

### 4. 零静默扩展
- 不得生成 specs 未提及的功能设计
- 若发现需要扩展范围，暂停询问用户

## 六、`/opsx:apply` 增强（融合 task-driven-dev 精华）

执行 `/opsx:apply` 时，除了 OpenSpec 标准流程，还必须遵守：

### 1. 单任务自审（标记 `[x]` 前必须完成）
- 用 read_file 重新读取刚修改的文件，确认改动正确、完整
- 检查是否引入新问题（边界、类型、拼写）
- 检查是否破坏了其他已完成任务的结果
- 若发现问题，先修复再标记完成

### 2. Git 绑定
- 每个 task 完成后立即 commit：`git add -A && git commit -m "feat(T<n>): <简短描述>"`
- 保留回退能力

### 3. 结构化回退
- 执行 Tn 前，验证所有依赖任务是否仍然成立
- 若依赖失效：重置 `[x]` → `[ ]`，追加 `Reset: <原因>`，修复后重新标记
- 若回退超过 2 层依赖，暂停并询问用户

### 4. 全量自审（所有 task 标记 `[x]` 后，归档前执行）
- 重新读取 tasks.md，逐条核对每个 Done-when 是否真正满足
- 对每个任务涉及的文件，read_file 抽查关键修改点
- 检查任务之间是否存在遗漏的衔接问题

### 5. 验收报告（全量自审通过后，追加到 tasks.md 末尾）

```markdown
## 验收报告

| 验收标准 | 实现位置 | 验证方式 | 状态 |
|----------|----------|----------|------|
| AC-1     | src/xxx.py:42 | `pytest tests/test_xxx.py` | ✅ |
| AC-2     | src/yyy.py:88 | 界面显示 X | ✅ |
```

### 6. 发现新问题时
- 可在当前 spec 范围内解决 → 追加新 task
- 需修改 design.md → 暂停，告知用户，更新设计后继续

## 七、触发规则

- 用户说"做一个功能"/"改一个需求" → 走 OpenSpec 流程
- 用户说"写代码"/"实现 task X" → 触发 TDD skill
- 用户说"有个 bug"/"测试挂了" → 触发 systematic-debugging skill
- 用户说"完成了"/"提交吧" → 触发 verification-before-completion skill
- 用户说"review 一下" → 触发 requesting-code-review skill
