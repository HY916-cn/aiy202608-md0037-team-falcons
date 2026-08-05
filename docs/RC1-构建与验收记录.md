# RC1 构建与验收记录

> 当前状态：Web 交付工具与验收记录。本表中的冻结、生产构建、主演示、彩排和录屏证据只有在精确 RC SHA 上留证后才能标记完成。

## 1. 冻结信息

| 项目 | 记录 |
| --- | --- |
| 版本 | `0.1.0-rc.1` |
| RC 完整 commit SHA | 待冻结 |
| 构建日期 | 待填写 |
| 构建负责人 | C（`@HY916-cn`） |
| `main` CI | 待验证 |
| P0 / P1 | 必须为 `0 / 0` |

只有从干净 `main` 提交生成且完成本表验证的文件才是正式演示构建物。禁止从 A、B 或 C 的功能分支直接构建最终包。

## 2. 统一预检

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm release:preflight -- --database
```

数据库暂时不可用时可以先省略 `--database` 验证客户端，但不得将结果标为 RC 通过。预检包含依赖对齐、格式、Lint、类型、单元测试和 Web 静态导出。

## 3. 构建物

### Web

Windows PowerShell、macOS 和 Linux 使用同一条命令；脚本通过当前 pnpm 运行时启动导出，并使用仓库内置的确定性 ZIP 写入器，不要求系统安装 `zip`：

```powershell
pnpm release:web
```

输出到 `artifacts/release/dolphincloud-web-v0.1.0-<sha>.zip` 和 `artifacts/release/checksums-v0.1.0.txt`。脚本拒绝脏工作区，自动运行 Web 冒烟、生成 ZIP 和 SHA-256。

### Docker/Nginx

使用生产 Compose 构建并启动 Web 服务，验证健康检查、深层路由刷新、安全响应头、静态缓存以及桌面／平板／390px 手机布局。正式演示只承诺 Web，不把仓库保留的原生或桌面工程列为交付物。

## 4. 主演示路径

| 端 | 必测路径 | 结果 / 证据 |
| --- | --- | --- |
| 教师端 | 登录 → 发课件 → 发作业 → 发布成绩 → 学生分 | 待验证 |
| 班级端 | 登录 → 收课件 → 看作业 → 看班内排行 | 待验证 |
| 家庭端 | 登录 → 今日摘要 → 作业 → 成绩 → 本人名次与海豚币 | 待验证 |
| 银行端 | 登录 → 海豚币流水 → 罚款单 → 处理状态 | 待验证 |
| 自治会端 | 登录 → 班级分 → 排行 → 更正申请 | 待验证 |
| 管理端 | 登录 → 账号班级 → 权限规则 → 操作审计 | 待验证 |
| AI 降级 | 禁用服务端 DeepSeek 配置 → 普通页面继续完成核心操作 | 待验证 |

## 5. 发布判定

- [ ] `main` 的 Secret scan、Quality、Database and RLS、Expo export smoke 全绿。
- [ ] 治理数据库从空库执行成功，pgTAP 实际执行数不为零。
- [ ] 六角色均使用合成数据完成主演示路径。
- [ ] Web ZIP 与 Docker/Nginx 构建均记录版本、完整 SHA 与证据。
- [ ] 所有可分发构建物记录 SHA-256。
- [ ] DeepSeek 正常与禁用降级路径均通过。
- [ ] P0 / P1 清零；未阻塞演示的 P2 已登记 Issue。
- [ ] 十分钟路演至少完整彩排两次，实机段为 3—4 分钟，并保存一次备用录屏。
