# ── Stage 1: Install + Build ──────────────────────
FROM node:20-slim AS builder
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app

# Copy workspace root files and source
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared/ packages/shared/
COPY apps/api/ apps/api/

# Install all deps (including devDeps for build)
RUN pnpm install --frozen-lockfile

# Build shared package first, then API
RUN pnpm --filter @rfpinator/shared build && \
    pnpm --filter @rfpinator/api build

# ── Stage 3: Production image ─────────────────────
FROM node:20-slim AS runner
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app

ENV NODE_ENV=production

# Copy built output and production deps
COPY --from=builder /app/package.json /app/pnpm-workspace.yaml /app/pnpm-lock.yaml ./
COPY --from=builder /app/packages/shared/package.json packages/shared/
COPY --from=builder /app/packages/shared/dist packages/shared/dist/
COPY --from=builder /app/apps/api/package.json apps/api/
COPY --from=builder /app/apps/api/dist apps/api/dist/

# Install production deps only
RUN pnpm install --frozen-lockfile --prod

# Create data directory for eval runs
RUN mkdir -p /app/data/eval_runs

EXPOSE 3001

CMD ["node", "apps/api/dist/main.js"]

