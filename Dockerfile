# Production Dockerfile for DolphinCloud Web
# Note: Ensure you have built the web artifact or run this in a CI environment where the dist folder is generated.
# For standalone building, we use a multi-stage build.

FROM node:22.13.0-alpine AS builder
# Enable pnpm
RUN npm install -g pnpm@11.9.0

WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./

# Copy all workspaces
COPY apps ./apps
COPY packages ./packages
COPY scripts ./scripts

# Install dependencies
RUN pnpm install --frozen-lockfile

# Inject environment variables for the build
ARG EXPO_PUBLIC_SUPABASE_URL
ARG EXPO_PUBLIC_SUPABASE_ANON_KEY
ARG EXPO_PUBLIC_AI_GATEWAY_FUNCTION
ARG EXPO_PUBLIC_APP_ENV=production

ENV EXPO_PUBLIC_SUPABASE_URL=$EXPO_PUBLIC_SUPABASE_URL
ENV EXPO_PUBLIC_SUPABASE_ANON_KEY=$EXPO_PUBLIC_SUPABASE_ANON_KEY
ENV EXPO_PUBLIC_AI_GATEWAY_FUNCTION=$EXPO_PUBLIC_AI_GATEWAY_FUNCTION
ENV EXPO_PUBLIC_APP_ENV=$EXPO_PUBLIC_APP_ENV

# Fail fast if required variables are missing
RUN if [ -z "$EXPO_PUBLIC_SUPABASE_URL" ]; then echo "Error: EXPO_PUBLIC_SUPABASE_URL is required" && exit 1; fi && \
    if [ -z "$EXPO_PUBLIC_SUPABASE_ANON_KEY" ]; then echo "Error: EXPO_PUBLIC_SUPABASE_ANON_KEY is required" && exit 1; fi && \
    if [ -z "$EXPO_PUBLIC_AI_GATEWAY_FUNCTION" ]; then echo "Error: EXPO_PUBLIC_AI_GATEWAY_FUNCTION is required" && exit 1; fi

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
