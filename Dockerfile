# Production Dockerfile for DolphinCloud Web
# Note: Ensure you have built the web artifact or run this in a CI environment where the dist folder is generated.
# For standalone building, we use a multi-stage build.

FROM node:22.13.0-alpine AS builder
# Enable pnpm
RUN corepack enable pnpm

WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./

# Copy all workspaces
COPY apps ./apps
COPY packages ./packages
COPY scripts ./scripts

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build web export
RUN pnpm web:export

# Production server stage
FROM nginx:alpine

# Copy custom Nginx configuration
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

# Copy exported static web files from builder
COPY --from=builder /app/apps/client/dist/web /usr/share/nginx/html

# Expose port 80 (listening on 0.0.0.0 by default in Nginx)
EXPOSE 80

# Start Nginx
CMD ["nginx", "-g", "daemon off;"]
