# QA｜M0 首轮构建冒烟清单

## 适用范围

本清单由负责人 C 维护，用于记录 M0 工程骨架以及后续身份登录合并包的可追溯测试结果。每次结论必须绑定完整 commit SHA；不得用旧 SHA 的结果替代新提交。

## 自动检查

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

当仓库包含 `supabase/config.toml` 后，还必须执行：

```bash
pnpm database:test
```

缺少 Supabase 工作区时，CI 的 `Database and RLS tests` job 会明确记录“pending”；一旦配置文件存在，该 job 自动执行并在测试缺失或失败时阻止通过。

## 六端 Web 冒烟

依次将 `apps/client/.env` 的 `EXPO_PUBLIC_MOCK_ROLE` 设置为：

1. `teacher`：显示“教师端”。
2. `class_terminal`：显示“班级端”。
3. `family`：显示“家庭端”。
4. `bank_operator`：显示“银行端”。
5. `council`：显示“自治会端”。
6. `admin`：显示“管理端”。

每个角色检查：

- 页面可打开，控制台无 error。
- 固定名称、图标和两色主题符合 `docs/07-产品语言与视觉规范.md`。
- 刷新后仍能进入对应路由。
- 班级端不显示成绩、海豚币余额或罚款详情。
- 页面不包含 token、密钥或真实学生信息。

## Android 冒烟

- `pnpm smoke:android` 产生非空 Hermes 或 JavaScript bundle。
- 实机或模拟器冷启动、文件选择和会话恢复在对应功能合并后复测。
- APK 安装与 SHA-256 记录属于 F-206，不在 M0 基线内。

## M0 记录模板

```text
[QA_PASS|QA_BLOCKED] <完整 commit SHA>
环境：macOS/Node/pnpm/Web/Android bundle/数据库
通过：<验收项>
命令：<实际命令>
未测：<实机、登录、RLS 或其他边界>
结论：允许继续开发 / 需要修复 / 可转 Ready
```

## 当前验证边界

工程骨架可验证六个静态角色路由和 Web/Android 导出。真实登录、角色切换、Supabase 身份范围和 RLS 必须在 A-BUNDLE-01 提交 `[READY_FOR_QA] <SHA>` 后按该 SHA 执行，不得提前标记通过。
