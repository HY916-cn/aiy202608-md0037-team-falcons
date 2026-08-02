# Contributing to DolphinCloud

## 开始前

1. 阅读 `AGENTS.md` 和 `docs/`。
2. 领取一个状态为 `Ready` 的 GitHub Issue。
3. 从最新 `origin/main` 创建符合规范的短分支。
4. 在 Issue 留言说明负责人和预计完成时间。

## 本地检查

提交 PR 前至少执行：

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm --filter client export:web
```

涉及数据库时额外执行项目定义的 Supabase 本地启动、重置和数据库测试命令。涉及 UI 时完成目标角色的真实路径验证。

## PR

- 一项 Issue 对应一个 PR。
- 填写 PR 模板，提供验证结果和界面证据。
- A/B 的功能 PR 请求 C Review。
- C 的修复 PR 请求 A 或 B Review。
- CI、必需 Review 和对话解决完成前不得合并。

## 安全

- 只使用合成演示数据。
- 不提交 `.env`、token、真实学生数据和未脱敏日志。
- 发现越权、密钥或账务问题时按 P0 处理，不在公开 Issue 粘贴敏感细节。

