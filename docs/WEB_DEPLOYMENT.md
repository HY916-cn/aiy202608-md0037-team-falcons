# DolphinCloud Web Deployment Guide

## 部署概览
海豚云 Web 端支持通过 Docker Compose 快速完成静态站点的生产环境部署。构建产物为一个不可变版本 ZIP 包，通过 Nginx 托管提供高性能的分发与 SPA (Single Page Application) 路由回退。

## 环境要求
- Docker (20.10+)
- Docker Compose (v2+)
- 公网 IP 并且拥有对应的域名
- **不要** 在生产环境使用 `.env` 提供 Mock 数据或本地演示配置。

## 端口与防火墙
- **默认监听**: 容器内监听 `80` 端口。`docker-compose.yml` 示例将容器端口映射到宿主机 `127.0.0.1:8080` (推荐，以便在前面部署 HTTPS 反向代理) 或者 `0.0.0.0:8080`。
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
Web 端的每个版本都是一个静态镜像/压缩包，所有状态通过 API 获取。回滚过程非常轻量：
1. 修改 `docker-compose.yml` 中 `image` 标签至上一个稳定的版本。
2. 运行 `docker compose up -d` 重新部署即可。
3. 由于 HTML 配置了 `no-cache`，用户刷新页面即可立即载入回滚后的稳定版本静态资源。
