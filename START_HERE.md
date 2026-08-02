# START HERE｜把仓库地址交给 Codex 即可开工

## 使用方法

1. 确认仓库所有者已经把你的 GitHub 账号添加为私密仓库协作者。
2. 将仓库地址和与你职责对应的提示词一起发给 Codex。
3. 每人使用独立 clone 或独立 Git worktree，不共用未提交目录。
4. 每次只处理一个 GitHub Issue。
5. Codex 完成后先检查 diff 和验证结果，再单独授权 commit 与 push。

## 所有人通用的仓库地址格式

```text
项目地址：https://github.com/HY916-cn/dolphin-cloud
```

如果仓库地址发生变化，只替换这一行即可。

---

## 提示词一｜开发者 A 开始项目

```text
项目地址：https://github.com/HY916-cn/dolphin-cloud

我是海豚云开发者 A，负责 Expo 客户端、六端导航、共享 UI、课件、作业和成绩。

请使用当前已登录的 GitHub 身份获取这个私密仓库。在开始修改前：
1. 完整阅读 README.md、START_HERE.md、AGENTS.md、docs/00 至 docs/08，以及当前 GitHub Issue。
2. 检查仓库默认分支、git status、最近提交和 GitHub Issues。
3. 领取或确认第一个 Ready 任务 F-001：Monorepo、pnpm、Expo 与共享配置。如果 F-001 已完成，则选择分配给 A 的下一个无阻塞 Issue。
4. 从最新 origin/main 创建符合规范的 feat/<issue>-<short-name> 分支。

开发要求：
- 严格按 Issue 范围工作，不实现 Issue 外功能。
- 开发过程中禁止调用 Coze、Coze CLI 或外部代码生成服务；Coze 只允许作为后续运行时服务接入。
- 不覆盖其他成员修改，不做全仓库无关重构。
- 使用 TypeScript strict、pnpm workspace 和 feature-first 结构。
- 普通功能不得依赖 Coze 可用性。
- 页面名称、按钮文案、状态、颜色和图标必须复用 docs/07；代码、API、数据库和资源命名必须复用 docs/08。
- 完成前运行相关 lint、typecheck、测试和目标角色路径。

先给出你读取到的当前状态、目标 Issue、拟修改文件和验证计划，然后直接开始安全明确的实现。暂不 commit、push、merge或发布；完成后提供 diff 摘要、验证结果、风险和 PR 草稿，等待我授权提交。
```

---

## 提示词二｜开发者 B 开始项目

```text
项目地址：https://github.com/HY916-cn/dolphin-cloud

我是海豚云开发者 B，负责 Supabase、权限、学生分、班级分、海豚币、罚款、指定撤销和 AI 网关。

请使用当前已登录的 GitHub 身份获取这个私密仓库。在开始修改前：
1. 完整阅读 README.md、START_HERE.md、AGENTS.md、docs/00 至 docs/08，以及当前 GitHub Issue。
2. 检查仓库默认分支、git status、最近提交和 GitHub Issues。
3. 领取或确认第一个 Ready 任务 F-002：核心身份表、角色范围与 RLS 基线。如果 F-002 已完成，则选择分配给 B 的下一个无阻塞 Issue。
4. 从最新 origin/main 创建符合规范的 feat/<issue>-<short-name> 分支。

硬性要求：
- 开发过程中禁止调用 Coze、Coze CLI 或外部代码生成服务。
- 若任务涉及 AI，只实现海豚云自己的运行时网关、适配器或 Skill API；Coze 不得直连数据库或执行未经确认的写操作。
- 不信任客户端提供的 actor、role、class_id 或 student_id。
- 学生分、班级分、海豚币和成绩完全独立。
- 币账写入必须原子且余额不得为负；关键写操作必须幂等和可审计。
- 撤销新增反向流水并保留原记录，必须防止并发重复撤销。
- 新增迁移，不编辑已经合并的迁移；权限变化必须有 RLS 正反测试。
- 业务实体、状态、错误码、表和字段必须使用 docs/08 的固定命名，不创建同义字段。

先给出当前状态、目标 Issue、数据与权限影响、拟修改文件和验证计划，再开始实现。暂不 commit、push、merge或发布；完成后提供迁移/API说明、验证结果、风险和 PR 草稿，等待我授权提交。
```

---

## 提示词三｜负责人 C 开始 Review、测试与构建工作

```text
项目地址：https://github.com/HY916-cn/dolphin-cloud

我是海豚云质量与构建负责人 C，负责 Review A/B 的代码、执行测试、修复集成与构建缺陷，并完成 Web、APK、iOS 本地测试版和 Windows EXE 构建。

请使用当前已登录的 GitHub 身份获取这个私密仓库。首先：
1. 完整阅读 README.md、START_HERE.md、AGENTS.md、docs/00 至 docs/08 和 prompts/CODEX提示词库.md。
2. 检查 main、打开的 Issues、Pull Requests、CI 和当前里程碑。
3. 如果已有 A/B 的 PR，按质量负责人 Review 提示词先做只读审查和实际验证。
4. 如果尚无 PR，领取 F-003：CI、PR 门禁、测试命令和秘密扫描；等待工程骨架后实现。

审查优先级：越权或密钥、余额与数据损坏、幂等和并发撤销、核心流程、Coze 故障降级、跨端回归。

同时检查新代码是否擅自改变固定名称、图标、颜色、状态或数据库命名。

工作规则：
- 开发、Review、测试和构建过程禁止调用 Coze 或 Coze CLI；运行时 Coze 只能作为被测外部服务。
- A/B 的业务 PR 由我主审；我提交的修复或构建 PR 必须由 A 或 B Review，禁止自审自合并。
- 一般业务缺陷退回原作者；测试、CI、构建、跨模块或紧急阻塞问题由我建立独立 fix Issue 和分支。
- 构建只能来自已验收 tag 和干净工作区，不能把未验证产物标为成功。

先输出当前仓库、Issues、PR、CI 和依赖状态，并说明你准备 Review 或领取的唯一任务。未获得明确授权前，不要 commit、push、merge、tag、发布或上传构建物。
```

---

## 提示词四｜通用单 Issue 开发

```text
项目地址：https://github.com/HY916-cn/dolphin-cloud
我的角色：【开发者 A / 开发者 B / 负责人 C】
任务：GitHub Issue #<编号>《<标题>》

请获取仓库并完整阅读 AGENTS.md、Issue 和 Issue 引用文档。检查当前分支、工作区、相关实现、测试和调用关系，然后只处理这个 Issue。

允许修改：<明确路径>
禁止修改：<明确路径>
验收标准：<粘贴 Issue 验收标准>
必须验证：<lint/typecheck/unit/RLS/角色路径/构建>

开发过程中禁止调用 Coze、Coze CLI 或外部代码生成服务；Coze 仅是应用运行时依赖。保留他人修改，不做无关重构，不提交密钥或真实学生数据。

先给出计划，再实现和验证。最后检查 git diff，提供变更摘要、验证结果、风险和 PR 描述草稿。不要自动 commit、push、merge、tag 或发布。
```

---

## 完成后授权提交

开发者确认 Codex 的 diff 和验证结果后，再单独发送：

```text
我已确认当前 diff 和验证结果。现在授权你只暂存本 Issue 的明确文件，检查 staged diff 和密钥，然后使用 Conventional Commit 创建提交并推送当前功能分支。禁止 force push、禁止推送 main、禁止合并、禁止创建 tag 或发布。推送后返回 commit SHA 和 GitHub 分支地址，并准备 Pull Request 草稿。
```
