# ── Stage 1: Dependencies ───────────────────────────────────────
FROM node:24-alpine3.23 AS deps

RUN apk add --no-cache libc6-compat

WORKDIR /app

COPY package.json package-lock.json* ./

# Update npm to patched version
RUN npm install -g npm@latest

# Clean install
RUN npm ci

# ── Stage 2: Builder ──────────────────────────────────────────────
FROM node:24-alpine3.23 AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build

# ── Stage 3: Runner ───────────────────────────────────────────────
FROM node:24-alpine3.23 AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Security hardening: remove unused package managers to reduce attack surface, then add unprivileged user
RUN rm -rf /usr/local/lib/node_modules/npm \
           /usr/local/bin/npm \
           /usr/local/bin/npx \
           /usr/local/lib/node_modules/corepack \
           /usr/local/bin/corepack \
           /opt/yarn* \
           /usr/local/bin/yarn \
           /usr/local/bin/yarnpkg && \
    addgroup -S nodejs -g 1001 && \
    adduser -S nextjs -u 1001

# Copy only production files
COPY --from=builder --chown=nextjs:nodejs /app/out ./out
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts

# Switch to non-root user
USER nextjs

EXPOSE 3000

CMD ["node", "scripts/serve-export.mjs"]
