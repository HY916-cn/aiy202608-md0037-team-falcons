# RC1 构建与验收记录

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

数据库暂时不可用时可以先省略 `--database` 验证客户端，但不得将结果标为 RC 通过。预检包含依赖对齐、格式、Lint、类型、单元测试、Web 静态导出和 Android Hermes 导出。

## 3. 构建物

### Web

```bash
pnpm release:web
```

输出到 `artifacts/release/`，脚本拒绝脏工作区，自动运行 Web 冒烟、生成 ZIP 和 SHA-256。

### Android APK

```bash
pnpm dlx eas-cli@21.5.0 login
pnpm build:android:apk
```

下载生成的 APK 后重命名为 `dolphincloud-android-v0.1.0-<sha>.apk`，在真实 Android 设备验证安装、冷启动、登录、家庭端、文件打开和 AI 降级，再将 SHA-256 追加到 `checksums-v0.1.0.txt`。

### iOS 本地模拟器

```bash
pnpm dlx eas-cli@21.5.0 login
pnpm build:ios:simulator
```

本项目只承诺模拟器或已配置设备本地测试，不将产物描述为可公开安装 IPA。记录 Xcode、iOS 版本、设备和登录/家庭端/文件/角色切换结果。

### Windows EXE

Electron 封装由 #22 独立 PR 交付。必须确认 `contextIsolation=true`、`nodeIntegration=false`、导航白名单和同一生产后端后再打包。最终文件命名为 `dolphincloud-windows-v0.1.0-<sha>.exe` 并记录 SHA-256。

## 4. 主演示路径

| 端 | 必测路径 | 结果 / 证据 |
| --- | --- | --- |
| 教师端 | 登录 → 发课件 → 发作业 → 发布成绩 → 学生分 | 待验证 |
| 班级端 | 登录 → 收课件 → 看作业 → 看班内排行 | 待验证 |
| 家庭端 | 登录 → 今日摘要 → 作业 → 成绩 → 本人名次与海豚币 | 待验证 |
| 银行端 | 登录 → 海豚币流水 → 罚款单 → 处理状态 | 待验证 |
| 自治会端 | 登录 → 班级分 → 排行 → 更正申请 | 待验证 |
| 管理端 | 登录 → 账号班级 → 权限规则 → 操作审计 | 待验证 |
| AI 降级 | 禁用服务端 Coze 配置 → 普通页面继续完成核心操作 | 待验证 |

## 5. 发布判定

- [ ] `main` 的 Secret scan、Quality、Database and RLS、Expo export smoke 全绿。
- [ ] 治理数据库从空库执行成功，pgTAP 实际执行数不为零。
- [ ] 六角色均使用合成数据完成主演示路径。
- [ ] Web、APK、iOS 本地版和 EXE 均记录版本、完整 SHA 与证据。
- [ ] 所有可分发构建物记录 SHA-256。
- [ ] Coze 正常与禁用降级路径均通过。
- [ ] P0 / P1 清零；未阻塞演示的 P2 已登记 Issue。
- [ ] 五分钟脚本至少完整彩排两次，并保存一次备用录屏。
