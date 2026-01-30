# syntax=docker.io/docker/dockerfile:1

FROM node:20-alpine AS base

# Basic setup shared by all stages
# Check https://github.com/nodejs/docker-node for notes on alpine compatibility
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install dependencies only when needed
FROM base AS deps

# Copy package manifests and lockfiles only — keeps layer cache effective
COPY package.json pnpm-lock.yaml* yarn.lock* package-lock.json* .npmrc* ./

# Prefer pnpm if pnpm-lock.yaml exists, then yarn, then npm.
# This ordering avoids accidentally using the wrong package manager when multiple lockfiles exist.
RUN set -eux; \
  if [ -f pnpm-lock.yaml ]; then \
    corepack enable pnpm && pnpm i --frozen-lockfile; \
  elif [ -f yarn.lock ]; then \
    yarn --frozen-lockfile; \
  elif [ -f package-lock.json ]; then \
    npm ci; \
  else \
    echo "No lockfile found." >&2; exit 1; \
  fi

# Rebuild the source code only when needed
FROM base AS builder

# Copy installed node_modules from deps (if created) and source
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build using the detected package manager (same precedence as deps)
RUN set -eux; \
  if [ -f pnpm-lock.yaml ]; then \
    corepack enable pnpm && pnpm build; \
  elif [ -f yarn.lock ]; then \
    yarn build; \
  elif [ -f package-lock.json ]; then \
    npm run build; \
  else \
    echo "No lockfile found." >&2; exit 1; \
  fi

# Production image, copy built outputs and run lithia
FROM base AS runner

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 -G nodejs lithia

# Copy only what is needed for runtime (package.json, node_modules, dist)
COPY --from=builder --chown=lithia:nodejs /app/package.json ./package.json
COPY --from=builder --chown=lithia:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=lithia:nodejs /app/dist ./dist

USER lithia

EXPOSE 3000

# By default run npm start; templates should provide a `start` script.
CMD ["node", "dist/server.mjs"]

# Notes / optional BuildKit optimization:
# - To speed up installs, enable BuildKit and use cache mounts, e.g.:
#   RUN --mount=type=cache,target=/root/.pnpm-store corepack enable pnpm && pnpm i --frozen-lockfile
# - The BuildKit `--mount` syntax is only available when BuildKit is enabled.