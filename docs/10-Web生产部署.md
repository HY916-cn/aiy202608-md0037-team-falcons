# Web 生产部署

## 必需配置

Web 构建必须同时提供：

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`

AI 中心还需要 `EXPO_PUBLIC_AI_GATEWAY_FUNCTION` 指向已部署的海豚云 AI 网关。`DEEPSEEK_API_KEY`、Supabase service role key 和 JWT 签名密钥只能存在于服务端环境，禁止使用 `EXPO_PUBLIC_` 前缀。

缺少或只配置一项 Supabase 参数时，客户端只显示“服务尚未配置”，不会创建测试会话、测试角色或合成数据。AI 网关未配置或调用失败时，AI 中心显示不可用状态，普通业务页面继续使用 Supabase 服务。

## 数据边界

`supabase/seed.sql` 仅用于本地测试和隔离 CI。生产部署禁止执行 seed，必须通过受控的管理员流程创建学校、账号、角色范围和初始业务数据。生产备份或日志中不得包含测试账号密码、服务密钥或真实学生隐私数据。

## 构建与核验

```bash
pnpm install --frozen-lockfile
pnpm verify:deps
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm database:test
pnpm smoke:web
```

`smoke:web` 会验证六角色路由、Web manifest、PWA/Apple/Favicon 资产，并扫描生产 JavaScript bundle，阻止测试 Mock runtime 标记进入默认包。
