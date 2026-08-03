# Contributing to DolphinCloud

## 开始前

1. 阅读 `AGENTS.md` 和 `docs/`。
2. 领取一个状态为 `Ready` 的 GitHub Issue。
3. 从最新 `origin/main` 创建符合规范的短分支。
4. 在 Issue 留言说明负责人和预计完成时间。

## 实时协作

- 开工后完成第一个有效 checkpoint 立即推送功能分支并创建 Draft PR。
- 后续每完成一个可验证步骤或最长 90 分钟提交并推送一次。
- checkpoint 应当有明确目的；禁止上传密钥、真实数据和完全无法运行的随手快照。
- 推送后更新 Draft PR 的“当前进度、验证结果、下一步和已知问题”。
- 需要 C 测试时评论 `[READY_FOR_QA] <commit SHA>`。
- C 的测试结果必须评论对应 SHA；新推送不会自动使旧 SHA 的测试结论继续有效。

完整规则见 `docs/09-实时协作与测试反馈规范.md`。

## 本地检查

提交 PR 前至少执行：

```bash
pnpm install --frozen-lockfile
pnpm verify:deps
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm smoke:web
pnpm smoke:android
```

涉及数据库时额外执行 `pnpm database:test`。涉及 UI 时完成目标角色的真实路径验证。完整 M0 基线见 `docs/QA-M0首轮冒烟清单.md`。

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
