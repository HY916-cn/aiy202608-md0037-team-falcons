# DolphinCloud Web Deployment Guide

> 当前交付范围仅保留 Web。Android、iOS 与 Windows 桌面安装包不进入本轮构建、验收或发布链。

## 部署概览
海豚云 Web 端支持通过 Docker Compose 快速完成静态站点的生产环境部署。CI 同时生成可归档的 Web ZIP；Docker 镜像直接封装同一份静态导出，并由 Nginx 提供缓存、安全响应头与 Expo Router 路由回退。

## 环境要求
- Docker (20.10+)
- Docker Compose (v2+)
- 公网 IP 并且拥有对应的域名
- **不要** 在生产环境使用 `.env` 提供 Mock 数据或本地演示配置。生产环境变量请参考 `apps/client/.env.production.example`。

## 端口与防火墙
- **默认监听**: 容器内监听 `80` 端口。`docker-compose.yml` 示例将容器端口映射到宿主机 `127.0.0.1:8080`。这表示服务仅在宿主机本地回环地址上可访问，非常适合部署在反向代理（如 Nginx、Caddy）后方，确保不会被意外直接通过公网 IP 访问。如果需要直接通过公网访问（不推荐），可以修改为 `0.0.0.0:8080`。
- **防火墙**: 若直接暴露，请确保服务器入站规则允许对应端口的 HTTP(S) 流量。推荐仅对公网开放 `80` 和 `443`。

## HTTPS 与反向代理
请务必在生产环境使用 HTTPS 以确保安全性，建议配合 Nginx, Caddy 或 Traefik 进行反向代理并配置 SSL 证书（如 Let's Encrypt）。
Nginx 反向代理配置示例：
```nginx
server {
    listen 443 ssl http2;
    server_name yourdomain.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## 健康检查
部署包中已预置 Nginx 健康检查端点：
- **路径**: `/healthz`
- **预期响应**: `200 OK` (内容为 `healthy`)
- 此端点已被 Docker Compose 配置文件作为内置 `healthcheck` 使用，可以无缝接入 Kubernetes 等编排工具。

## 回滚策略
Web 端的每个版本都是一个静态镜像，所有状态通过 API 获取。回滚过程非常轻量，但前提是你必须在部署新版本时保留旧版本的镜像或将所有发布的镜像推送到容器镜像仓库。

构建特定版本镜像示例：
```bash
# 首先设置生产公开环境变量
export EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
export EXPO_PUBLIC_SUPABASE_ANON_KEY=replace-with-public-anon-key
export EXPO_PUBLIC_AI_GATEWAY_FUNCTION=ai-gateway
export EXPO_PUBLIC_APP_ENV=production

# 设置版本标签
export DOLPHINCLOUD_WEB_IMAGE=dolphincloud-web:v0.1.0 # 或使用短 SHA 如 abcdef1

# 使用 docker compose 构建镜像
docker compose build web

# 启动容器
docker compose up -d --no-build
```

回滚步骤：
1. 确认要回滚的旧版本镜像在本地或远端仓库中仍然存在（例如 `dolphincloud-web:v0.0.9`）。
2. 执行带有旧版本变量的部署命令：
```bash
export DOLPHINCLOUD_WEB_IMAGE=dolphincloud-web:v0.0.9
docker compose up -d
```
3. 由于 HTML 配置了 `no-store, no-cache`，用户刷新页面即可立即载入回滚后的稳定版本静态资源。
