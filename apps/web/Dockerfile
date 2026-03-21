# ── Stage 1: Install + Build ──────────────────────
FROM node:20-slim AS builder
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app

# Copy workspace root files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared/ packages/shared/
COPY apps/web/ apps/web/

# Install all deps (including devDeps for build)
RUN pnpm install --frozen-lockfile

# NEXT_PUBLIC_API_URL is set at build time for Next.js static optimization
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

# Build shared package first, then Next.js app
RUN pnpm --filter @rfpinator/shared build && \
    pnpm --filter @rfpinator/web build

# ── Stage 3: Production image ─────────────────────
FROM node:20-slim AS runner
WORKDIR /app

ENV NODE_ENV=production

# Copy Next.js standalone output
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static

EXPOSE 3000

CMD ["node", "apps/web/server.js"]

