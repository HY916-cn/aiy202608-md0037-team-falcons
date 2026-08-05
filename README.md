# 海豚云 · DolphinCloud

> 面向校园日常协作的 AI 平台，让教学、成长评价、激励与自治在同一个可信空间中完成。

- 🏆 **AIY 黑客松 2026 深圳站**参赛作品
- 🏷 **命题企业 / 赛道：** Coze · 校园生活 AI 助手
- 👥 **团队：** Team Falcons
- 🔢 **团队编号：** MD0037
- 🌐 **正式交付：** Web

![海豚云登录页](./docs/assets/product-login.png)

## 👥 团队分工

| 成员 | GitHub | 负责内容 |
| --- | --- | --- |
| Haoyu Huang | [@HY916-cn](https://github.com/HY916-cn) | 产品设计、架构协调、代码审查、测试构建与路演 |
| Lilun Yan | [@Simen111216](https://github.com/Simen111216) | Supabase、治理账本、权限安全与发布工程 |
| Qiteng Jiang | [@cskunkuncskk](https://github.com/cskunkuncskk) | Web 前端、六角色工作台、教学与成绩体验 |

## ✨ 它能做什么

- **六角色协作：** 教师端、班级端、家庭端、银行端、自治会端和管理端共享同一套业务事实，同时保持权限隔离。
- **教学闭环：** 教师向班级发送课件、发布作业与成绩单；家庭端只能查看绑定学生的数据。
- **三套独立体系：** 学生分、班级分和海豚币分别授权、分别记账，不互相混算。
- **治理可追溯：** 支持罚款、班级排行、操作审计及指定历史操作撤销。
- **AI 中心：** 通过服务端网关直连 DeepSeek，结合当前角色和范围整理信息；写操作先生成确认草稿，用户确认后才调用海豚云服务。
- **今日摘要：** 汇总当前角色真正有权查看的课件、作业、成绩与治理动态。

## 🎬 演示

最终路演只使用 Web 版。建议按以下路线体验核心闭环：

1. 教师切换授权班级，发送课件、发布作业与成绩单，并记录学生分。
2. 班级端查看课件、作业、学生分排行与班级表现。
3. 家庭端验证只能查看绑定学生的成绩、成长记录和海豚币信息。
4. 自治会端查看班级分；银行端处理罚款并对指定记录执行撤销。
5. AI 中心在当前角色与范围内查询信息，并展示写操作草稿的确认边界。

> 在线体验地址将在完成公网 HTTPS 部署后补充。仓库不提供真实学生数据、演示账号密码或服务端密钥。

路演与提交材料：

- [10 分钟路演讲稿](./docs/十分钟路演讲稿.md)
- [3–4 分钟实机演示路径与专家问答](./docs/实机演示路径与专家问答.md)
- [断网、AI 离线与服务器故障备用方案](./docs/故障备用方案.md)
- [AIY 赛事提交自查](./docs/10-AIY赛事提交自查.md)

## 🛠 技术与 AI 工具

| 层级 | 技术 |
| --- | --- |
| Web 客户端（正式交付） | React Native、Expo Router、TypeScript |
| 身份与数据 | Supabase Auth、PostgreSQL、RLS、RPC、Storage |
| AI 运行时 | DeepSeek，经海豚云服务端 AI Gateway 受控接入 |
| AI 方案验证 | Coze 对话、Agent、Skill 与 Workflow 思路，用于校园场景拆解和助手流程验证 |
| 质量保障 | Vitest、pgTAP、ESLint、GitHub Actions、Gitleaks |
| 协作开发 | Git、GitHub、Codex |

DeepSeek 只承担意图理解和回复生成。客户端不保存模型密钥，AI 不可用时课件、作业、成绩和治理功能仍可使用；查询和写操作都由海豚云服务端重新校验权限，任何 AI 写操作都不能绕过用户确认。

开发过程中，团队实际使用 Coze 对话及 Agent、Skill、Workflow 思路拆解六角色校园场景、验证“自然语言意图 → 操作草稿 → 人工确认”的助手流程，并使用 [Coze Coding 项目](https://www.coze.cn/p/7670490311071858688)复核最终仓库的 AI 工具与运行时口径。Coze 不参与线上请求；产品运行时模型服务为 DeepSeek。

## 🚀 怎么跑起来

环境要求：Node.js 22.13 或更高版本、pnpm 11.9。

```bash
pnpm install --frozen-lockfile
cp apps/client/.env.example apps/client/.env
pnpm web
```

浏览器打开终端输出的本地地址。连接真实服务前，请在 `apps/client/.env` 配置自己的 Supabase 公共地址与匿名密钥；`DEEPSEEK_API_KEY` 等服务端机密只能配置在部署平台的 Secret 中，不能写入仓库。

提交前运行完整 Web 质量门禁：

```bash
pnpm verify:deps
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm database:test
pnpm smoke:web
```

更详细的工程入口见 [START_HERE.md](./START_HERE.md)，架构、权限和协作规范位于 [docs](./docs)。

## 🔐 安全与隐私

- 认证身份来自 Supabase JWT，客户端声明的角色和用户 ID 不作为授权依据。
- 成绩、学生分、班级分、海豚币、罚款和文件均受角色范围及 RLS 约束。
- 写操作具备服务端授权、幂等控制和审计；指定撤销生成新的补偿记录，不修改历史流水。
- `.env`、Token、密码、真实学生信息和命题企业私有数据禁止提交。
- GitHub Actions 对仓库完整历史执行 Secret scan。

如发现安全问题，请不要在公开 Issue 中粘贴凭据或个人信息，改用仓库维护者提供的私密联系方式报告。

## 📌 交付边界与后续计划

- 完成公网 HTTPS Web 部署与可公开访问的体验入口。
- 完成 DeepSeek AI 网关的公网部署与线上回归。
- 增加关键业务路径的浏览器端自动化回归。
- 持续改善无障碍、移动端排版和低网速体验。

本次赛事只正式交付 Web。仓库中保留的其他平台工程与历史构建记录不属于本次提交承诺，也不会在路演中表述为已交付产品。

## 📄 版权与许可

本作品版权归 **Haoyu Huang、Lilun Yan、Qiteng Jiang** 共同所有，采用 [MIT License](./LICENSE) 开源，使用请署名。

> 本项目为 AIY 黑客松参赛作品，作品归团队所有；AIY 组委会仅作收录与展示。
