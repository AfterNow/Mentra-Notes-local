# =============================================================================
# Mentra Notes - Production Dockerfile
# =============================================================================
# Multi-stage build for optimized production image
#
# Usage:
#   docker build -f deploy/Dockerfile -t mentra-notes .
#   docker run -p 3000:3000 --env-file .env mentra-notes
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Build
# -----------------------------------------------------------------------------
FROM oven/bun:1 AS builder

WORKDIR /app

# Copy package files first for better caching
COPY package.json bun.lock* ./

# Copy display-utils workspace package
COPY packages/display-utils/package.json packages/display-utils/tsconfig.json ./packages/display-utils/
COPY packages/display-utils/src ./packages/display-utils/src

# Install dependencies
RUN bun install --frozen-lockfile

# Build display-utils
WORKDIR /app/packages/display-utils
RUN bunx tsc -p tsconfig.json

# Return to app root and reinstall (picks up built display-utils)
WORKDIR /app
RUN bun install

# Copy source code
COPY src ./src
COPY tsconfig.json ./

# -----------------------------------------------------------------------------
# Stage 2: Production Runtime
# -----------------------------------------------------------------------------
FROM oven/bun:1-slim AS runtime

WORKDIR /app

# Install curl for healthcheck
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# Copy built application from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/src ./src
COPY --from=builder /app/package.json ./
COPY --from=builder /app/tsconfig.json ./

# Create data directories
RUN mkdir -p /app/data/storage && chown -R bun:bun /app/data

# Set environment defaults
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV LOCAL_STORAGE_PATH=/app/data/storage

# Run as non-root user
USER bun

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

EXPOSE 3000

CMD ["bun", "run", "src/index.ts"]
