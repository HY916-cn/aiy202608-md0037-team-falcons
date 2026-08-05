# 海豚云班级端桌面封装

本 workspace 使用 Electron 封装 `apps/client` 的同一份 Expo Web 静态导出，不复制业务页面，也不加载可变的公网网站。

## 本地开发

在仓库根目录运行：

```bash
pnpm desktop:dev
```

该命令先验证 Web 导出，再启动 Electron。应用内静态服务器只监听 `127.0.0.1` 的随机可用端口，并默认进入班级端路由。

## Windows portable EXE

在 Windows PowerShell 或 GitHub Windows Runner 上运行：

```powershell
pnpm desktop:dist:win
pnpm desktop:verify:win
```

构建结果位于 `apps/desktop/dist/windows`，校验后的交付副本和 SHA-256 位于 `artifacts/desktop`。当前构建不包含商业代码签名证书，因此 Windows 可能显示未知发布者提示。

## 安全边界

- 渲染进程关闭 Node 集成，启用 `contextIsolation`、sandbox 与 `webSecurity`。
- preload 只提供只读应用版本查询。
- 应用拒绝新窗口、WebView、权限申请和非本地页面导航。
- 只有 `https` 外部链接可以交给系统浏览器打开。
- 本地静态服务器拒绝路径穿越与非 GET/HEAD 请求，并在应用退出时关闭。
