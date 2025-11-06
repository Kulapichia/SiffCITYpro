# 声明构建参数，用于多架构构建
ARG BUILDPLATFORM
ARG TARGETPLATFORM

# ---- 第 1 阶段：安装依赖 ----
# 使用 slim 镜像以获得更好的原生模块兼容性
# 移除 --platform=$BUILDPLATFORM 以使用目标平台架构
FROM node:20-slim AS deps

# 启用 corepack 并激活 pnpm（Node20 默认提供 corepack）
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# 仅复制依赖清单，提高构建缓存利用率
COPY package.json pnpm-lock.yaml ./

# 先清理pnpm缓存，并且不安装可选依赖，减小依赖体积
# 安装所有依赖（含 devDependencies，后续会裁剪）
RUN pnpm store prune && pnpm install --frozen-lockfile --no-optional

# ---- 第 2 阶段：构建项目 (增加详细日志) ----
# 移除 --platform=$BUILDPLATFORM 以使用目标平台架构，确保 standalone 输出正确生成
FROM node:20-slim AS builder
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# 显示当前构建的平台信息
ARG TARGETPLATFORM
RUN echo "=== Building for platform: ${TARGETPLATFORM} ==="

# 复制package files和源代码
COPY package.json pnpm-lock.yaml ./
COPY . .

# 复制预先安装好的依赖
COPY --from=deps /app/node_modules ./node_modules

# 验证依赖完整性，防止缓存不一致问题
# 尝试使用离线模式快速验证，如果失败则重新安装，确保依赖绝对正确
RUN pnpm install --frozen-lockfile --offline || pnpm install --frozen-lockfile

# 删除敏感文件和目录，保留构建所需的配置文件
RUN rm -rf .git .github docs *.md .gitignore .env.example && \
    find . -name "*.test.js" -delete && \
    find . -name "*.test.ts" -delete && \
    find . -name "*.spec.js" -delete && \
    find . -name "*.spec.ts" -delete && \
    rm -rf scripts/convert-changelog.js 2>/dev/null || true && \
    echo "=== Checking critical config files ===" && \
    ls -la tailwind.config.* postcss.config.* autoprefixer.* 2>/dev/null || echo "Some config files not found" && \
    echo "=== Checking source structure ===" && \
    ls -la src/ && \
    find src -type f -name "*.css" -o -name "*.scss" | head -10

# 在构建阶段也显式设置 DOCKER_ENV
ENV DOCKER_ENV=true

# 确保 Next.js 在编译时选择 Node Runtime 而不是 Edge Runtime
RUN find ./src -type f -name "route.ts" -print0 \
  | xargs -0 sed -i "s/export const runtime = 'edge';/export const runtime = 'nodejs';/g"
# 强制动态渲染以读取运行时环境变量
RUN sed -i "/const inter = Inter({ subsets: \['latin'] });/a export const dynamic = 'force-dynamic';" src/app/layout.tsx

# 添加 NEXT_PRIVATE_STANDALONE 环境变量以确保 standalone 输出正确生成
ENV NEXT_PRIVATE_STANDALONE=true

# 为 Node.js 构建进程增加内存限制，防止因内存不足而构建失败
ENV NODE_OPTIONS="--max-old-space-size=4096"

# ==================== 日志增强部分 ====================
# 1. 打印环境信息，确认基础工具版本
RUN echo "=== Node Version ===" && \
    node -v && \
    echo "=== PNPM Version ===" && \
    pnpm -v && \
    echo "=== TypeScript Version ===" && \
    pnpm exec tsc --version

# 2. 列出当前目录文件，检查代码是否已正确复制
RUN echo "=== Listing Files in /app ===" && \
    ls -la
    
RUN echo "vvv DEBUG: Displaying content of route.ts vvv" && \
    cat src/app/api/proxy/segment/route.ts && \
    echo "^^^ DEBUG: End of content for route.ts ^^^"
    
# 3. 独立运行类型检查，将类型错误和构建错误分离
RUN echo "=== Running TypeScript Type Check ===" && \
    pnpm exec tsc --noEmit --pretty && \
    echo "=== TypeScript Check Completed Successfully ==="

# 4. 执行构建命令，启用Next.js调试输出
RUN echo "=== Starting Next.js Build with Debug Output ===" && \
    pnpm run build:debug && \
    echo "=== Checking build output ===" && \
    ls -la .next/ && \
    ls -la .next/static/ || echo "No static directory found" && \
    echo "=== Verifying standalone output ===" && \
    if [ ! -d ".next/standalone" ]; then \
      echo "ERROR: .next/standalone directory not found!" && \
      echo "This usually means the Next.js build failed or output:'standalone' is not configured" && \
      echo "Listing .next directory contents:" && \
      find .next -maxdepth 2 -type d && \
      exit 1; \
    fi && \
    echo "✓ Standalone directory found successfully" && \
    ls -la .next/standalone/
# ======================================================

# ---- 第 3 阶段：生成运行时镜像 ----
FROM node:20-slim AS runner

# 创建非 root 用户 (使用 Debian 兼容的语法)
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 --ingroup nodejs --no-create-home --disabled-password nextjs

WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
ENV WS_PORT=3001
ENV DOCKER_ENV=true

# 从构建器中复制 standalone 输出
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
# 从构建器中复制 scripts 目录
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts
# 从构建器中复制启动脚本和WebSocket相关文件
COPY --from=builder --chown=nextjs:nodejs /app/start.js ./start.js
COPY --from=builder --chown=nextjs:nodejs /app/websocket.js ./websocket.js
COPY --from=builder --chown=nextjs:nodejs /app/production.js ./production.js
COPY --from=builder --chown=nextjs:nodejs /app/production-final.js ./production-final.js
COPY --from=builder --chown=nextjs:nodejs /app/standalone-websocket.js ./standalone-websocket.js
# 复制 package.json 以便 start.js 内的脚本可以读取版本等元数据
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nextjs:nodejs /app/pnpm-lock.yaml ./pnpm-lock.yaml
# 复制 tsconfig.json 以确保路径解析正确
COPY --from=builder --chown=nextjs:nodejs /app/tsconfig.json ./tsconfig.json
# 从构建器中复制 public 和 .next/static 目录，确保静态资源正确复制
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# 检查静态资源是否正确复制
RUN echo "=== Checking static assets ===" && \
    ls -la .next/static/ || echo "No static directory" && \
    ls -la public/ || echo "No public directory"

# 安装必要的WebSocket生产依赖
USER root
RUN corepack enable && corepack prepare pnpm@latest --activate && \
    pnpm install --prod --no-optional ws && \
    pnpm store prune

# 创建更健壮的 Node.js 健康检查脚本
RUN echo '#!/usr/bin/env node\n\
const http = require("http");\n\
const options = {\n\
  hostname: "localhost",\n\
  port: 3000,\n\
  path: "/api/health",\n\
  method: "GET",\n\
  timeout: 5000\n\
};\n\
\n\
const req = http.request(options, (res) => {\n\
  if (res.statusCode === 200) {\n\
    console.log("Health check passed");\n\
    process.exit(0);\n\
  } else {\n\
    console.log(`Health check failed with status: ${res.statusCode}`);\n\
    process.exit(1);\n\
  }\n\
});\n\
\n\
req.on("error", (err) => {\n\
  console.log(`Health check error: ${err.message}`);\n\
  process.exit(1);\n\
});\n\
\n\
req.on("timeout", () => {\n\
  console.log("Health check timeout");\n\
  req.destroy();\n\
  process.exit(1);\n\
});\n\
\n\
req.setTimeout(5000);\n\
req.end();' > /app/healthcheck.js && \
    chmod +x /app/healthcheck.js && \
    chown nextjs:nodejs /app/healthcheck.js

# 切换到非特权用户
USER nextjs

# 仅暴露统一服务的3000端口
EXPOSE 3000

# 为容器编排系统提供健康检查端点
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node /app/healthcheck.js
    
# 使用集成的启动脚本，同时启动Next.js和WebSocket服务
CMD ["node", "production-final.js"]
