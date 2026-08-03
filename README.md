# 海豚云 · DolphinCloud

海豚云是一套使用 React Native、Expo、Supabase 和 Electron 构建的校园协作应用，计划交付 Web、Android APK、iOS 本地测试版和 Windows EXE。

当前仓库已进入工程实现阶段：使用 pnpm workspace 管理 Expo 客户端与共享 package，工程规范和 GitHub 协作约束继续作为实现边界。

## 开发团队

| 成员 | GitHub | 职责 |
| --- | --- | --- |
| 开发者 A | `@cskunkuncskk` | Expo 客户端、六端导航、课件、作业、成绩和共享 UI |
| 开发者 B | `@Simen111216` | Supabase、学生分、班级分、银行、罚款、撤销和 AI 网关 |
| 负责人 C | `@HY916-cn` | 代码 Review、测试、缺陷修复、CI 和 Web/APK/iOS/EXE 构建 |

A、B 的功能 PR 由 C 主审；C 提交的修复或构建 PR 必须由 A 或 B Review，禁止自审自合并。

## 重要边界

- 三位成员使用 Codex 完成开发、Review、测试、修复和构建。
- GitHub 是需求、代码、审查和发布状态的唯一协作中心。
- 开发过程中禁止使用 Coze、Coze CLI 或外部代码生成服务。
- Coze 只作为应用运行时 AI 服务，通过海豚云后端受控接口接入。
- Coze 不可用时，普通页面和核心业务必须继续工作。
- `main` 必须保持可构建、可演示；禁止直接推送。

## 新成员如何开始

只需要把本仓库地址和一段角色提示词交给 Codex：

1. 打开 [START_HERE.md](./START_HERE.md)。
2. 选择开发者 A、开发者 B 或负责人 C 的提示词。
3. 将仓库地址和提示词一起发给 Codex。
4. Codex 会读取 `AGENTS.md`、文档、当前 Issue 和 Git 状态后开始工作。

更完整的开发、Review、修复和构建提示词位于 [Codex 提示词库](./prompts/CODEX提示词库.md)。

## 文档导航

| 文档 | 内容 |
| --- | --- |
| [START_HERE.md](./START_HERE.md) | 三位成员最快开工方式和可复制提示词 |
| [AGENTS.md](./AGENTS.md) | 所有 Codex 会话必须遵守的仓库规则 |
| [CONTRIBUTING.md](./CONTRIBUTING.md) | 本地检查和 PR 贡献流程 |
| [00-项目介绍与交付方案](./docs/00-项目介绍与交付方案.md) | 最新项目介绍、六端、三套体系、工期与演示 |
| [01-产品范围与验收](./docs/01-产品范围与验收.md) | MVP 范围、角色、功能和验收 |
| [02-架构与数据设计](./docs/02-架构与数据设计.md) | 工程结构、数据模型、权限、账务与撤销 |
| [03-API与Coze接入](./docs/03-API与Coze接入.md) | API 契约和 Coze 运行时安全边界 |
| [04-GitHub协作规范](./docs/04-GitHub协作规范.md) | Issue、分支、提交、PR、Review 和发布规范 |
| [05-三人开发计划](./docs/05-三人开发计划.md) | 两位开发者和一位质量构建负责人的十天排期 |
| [06-测试发布与应急](./docs/06-测试发布与应急.md) | CI、QA、四端构建、RC 和演示应急 |
| [07-产品语言与视觉规范](./docs/07-产品语言与视觉规范.md) | 固定名称、导航、颜色、图标、状态和界面文案 |
| [08-代码与资源命名规范](./docs/08-代码与资源命名规范.md) | TypeScript、API、数据库、文件、测试和资源命名 |
| [09-实时协作与测试反馈规范](./docs/09-实时协作与测试反馈规范.md) | A/B 持续推送、Draft PR 和 C 按 SHA 测试的流程 |
| [ADR 模板](./docs/ADR模板.md) | 跨模块技术决策记录模板 |
| [GitHub 所有权模板](./docs/CODEOWNERS模板.md) | A、B、C 的路径所有权参考 |

## 产品核心

六种角色界面：教师端、班级端、家庭端、银行端、自治会端、管理端。

三套独立体系：

1. 学生分：教师端和授权班级端管理，教师、班级、家庭查看。
2. 班级分：自治会端管理，教师端和班级端查看。
3. 海豚币：银行端管理，教师端和家庭端查看。

学生成绩不计入学生分，学生分不自动兑换海豚币，班级分不分摊给个人。

## 仓库管理

- 一项 GitHub Issue 对应一个短生命周期分支和一个 Pull Request。
- A、B 开工后建立 Draft PR，每完成一个可验证小步骤或最长 90 分钟提交并推送一次。
- C 对 Draft PR 持续测试，所有测试结论必须标明 commit SHA。
- 分支从最新 `main` 创建，格式为 `feat/<issue>-<name>` 等。
- 提交遵循 Conventional Commits。
- PR 必须通过 lint、typecheck、测试和负责人 Review。
- 新页面、字段、状态、图标和颜色必须遵守 `docs/07` 与 `docs/08`，不得自行创建同义名称。
- 四端构建只能来自已验收的干净 tag，不从本地脏工作区构建。

## 工程启动

```bash
pnpm install --frozen-lockfile
pnpm web
# 可选的跨端 bundle 验证
pnpm web:export
pnpm android:export
```

默认启动后会进入 Mock 登录页，可依次选择教师端、班级端、家庭端、银行端、自治会端和管理端，验证角色切换、退出与路由守卫：

```bash
pnpm web
```

开发阶段也可在 `apps/client/.env` 设置 `EXPO_PUBLIC_MOCK_ROLE` 为 `teacher`、`class_terminal`、`family`、`bank_operator`、`council` 或 `admin`，自动进入对应角色首页。该变量只控制客户端 Mock 演示入口，不作为服务端授权依据；删除该变量即可恢复未登录入口。

认证与跨端导出验证命令：

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm web:export
pnpm android:export
```

工程能力与可运行端点会随对应 Issue 和 Pull Request 持续更新。
