# 1. OBJECTIVE

Create a production-ready Docker deployment setup for Mentra Notes that is:
- Easy to deploy on any server with Docker
- Self-contained with all dependencies (MongoDB, app, optional llama.cpp)
- Configurable for different environments (dev, staging, production)
- Supports both Cloudflare Tunnel and direct HTTPS (via reverse proxy)
- Includes persistent storage for data

**Target:** Single `docker compose up` command to start the entire stack.

# 2. CONTEXT SUMMARY

## Current Infrastructure

### Existing Docker Setup:
- **Dev Container** (`.devcontainer/Dockerfile`): NVIDIA CUDA-based, includes cloudflared, Node.js, Bun
- **Production Dockerfile** (`docker/Dockerfile`): Bun-based, lightweight
- **Porter Config** (`porter.yaml`): Cloud deployment config (not needed for self-hosted)

### Current Manual Setup:
1. MongoDB running in separate Docker container:
   ```bash
   docker run --name mongodb-ainotes \
     -e MONGO_INITDB_ROOT_USERNAME=admin \
     -e MONGO_INITDB_ROOT_PASSWORD=phil217 \
     -e MONGO_INITDB_DATABASE=ainotes \
     -p 27017:27017 \
     -d mongo --bind_ip_all
   ```

2. App running in VS Code dev container with:
   - Cloudflare tunnel for HTTPS: `cloudflared tunnel run --token <token>`
   - Port forwarding: 27017 (MongoDB), 30000 (llama.cpp)

3. llama.cpp server (external, on network at 192.168.1.185:30000)

### Key Configuration (from env.example):
- `MONGODB_URI` - MongoDB connection string
- `AGENT_PROVIDER` - LLM provider (llamacpp, ollama, gemini, etc.)
- `LLAMACPP_BASE_URL` - llama.cpp server URL
- `STORAGE_PROVIDER` - local or r2
- `LOCAL_STORAGE_PATH` - Local file storage path
- `HOST` - Server binding (0.0.0.0 for Docker)
- `PORT` - Server port (default 3000)

## Deployment Goals:
1. **Single docker-compose.yml** for entire stack
2. **Persistent volumes** for MongoDB and local storage
3. **Optional services** (llama.cpp can be external)
4. **Easy configuration** via .env file
5. **HTTPS support** via Cloudflare Tunnel or Caddy reverse proxy
6. **Production-ready** with proper logging and restart policies

# 3. APPROACH OVERVIEW

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Docker Compose Stack                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────┐ │
│  │  Cloudflare │    │   Caddy     │    │     (Alternative)   │ │
│  │   Tunnel    │ OR │  (Reverse   │    │   Direct Port       │ │
│  │  (HTTPS)    │    │   Proxy)    │    │   Exposure          │ │
│  └──────┬──────┘    └──────┬──────┘    └──────────┬──────────┘ │
│         │                  │                       │            │
│         └──────────────────┼───────────────────────┘            │
│                            ▼                                    │
│                  ┌─────────────────┐                            │
│                  │   Mentra Notes  │                            │
│                  │   (Bun Server)  │                            │
│                  │   Port 3000     │                            │
│                  └────────┬────────┘                            │
│                           │                                     │
│              ┌────────────┼────────────┐                        │
│              ▼            ▼            ▼                        │
│    ┌─────────────┐ ┌───────────┐ ┌──────────────┐              │
│    │  MongoDB    │ │  Local    │ │  llama.cpp   │              │
│    │  (Data)     │ │  Storage  │ │  (Optional)  │              │
│    │  Port 27017 │ │  Volume   │ │  Port 8080   │              │
│    └─────────────┘ └───────────┘ └──────────────┘              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

External (optional):
┌─────────────────┐
│  llama.cpp or   │
│  Ollama Server  │
│  (192.168.x.x)  │
└─────────────────┘
```

## Deployment Profiles

### Profile 1: Minimal (App + MongoDB)
- Mentra Notes app
- MongoDB
- Uses external llama.cpp/Ollama
- HTTPS via Cloudflare Tunnel

### Profile 2: Full Local (App + MongoDB + llama.cpp)
- Everything self-contained
- Includes llama.cpp server with CUDA support
- Good for air-gapped environments

### Profile 3: Development
- Hot reload enabled
- Mounted source code
- Debug ports exposed

## File Structure
```
deploy/
├── docker-compose.yml          # Main production compose file
├── docker-compose.dev.yml      # Development overrides
├── docker-compose.llm.yml      # Optional llama.cpp service
├── .env.example                # Environment template
├── Dockerfile                  # Production app image
├── Dockerfile.llm              # llama.cpp with CUDA (optional)
├── scripts/
│   ├── setup.sh               # Initial setup script
│   ├── backup.sh              # Backup script
│   └── restore.sh             # Restore script
└── README.md                  # Deployment documentation
```

# 4. IMPLEMENTATION STEPS

## Step 1: Create Deploy Directory Structure
**Goal:** Set up the deployment directory with all necessary files.

**Create:** `deploy/` directory in repo root

**Files to create:**
```
deploy/
├── docker-compose.yml
├── docker-compose.dev.yml
├── docker-compose.tunnel.yml
├── .env.example
├── Dockerfile
├── scripts/
│   ├── setup.sh
│   ├── start.sh
│   ├── stop.sh
│   ├── backup.sh
│   └── logs.sh
└── README.md
```

---

## Step 2: Create Production Dockerfile
**Goal:** Optimized Dockerfile for production deployment.

**File:** `deploy/Dockerfile`

```dockerfile
# Build stage
FROM oven/bun:1 AS builder

WORKDIR /app

# Copy package files
COPY package.json bun.lock* ./
COPY packages/display-utils/package.json packages/display-utils/tsconfig.json ./packages/display-utils/
COPY packages/display-utils/src ./packages/display-utils/src

# Install dependencies
RUN bun install --frozen-lockfile

# Build display-utils
WORKDIR /app/packages/display-utils
RUN bunx tsc -p tsconfig.json

WORKDIR /app
RUN bun install

# Copy source code
COPY . .

# Production stage
FROM oven/bun:1-slim

WORKDIR /app

# Copy built application
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/src ./src
COPY --from=builder /app/package.json ./

# Create data directory
RUN mkdir -p /app/data/storage

# Set environment
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

EXPOSE 3000

CMD ["bun", "run", "start"]
```

---

## Step 3: Create Main Docker Compose File
**Goal:** Production docker-compose with all services.

**File:** `deploy/docker-compose.yml`

```yaml
version: '3.8'

services:
  # ===========================================
  # Mentra Notes Application
  # ===========================================
  app:
    build:
      context: ..
      dockerfile: deploy/Dockerfile
    container_name: mentra-notes-app
    restart: unless-stopped
    ports:
      - "${PORT:-3000}:3000"
    environment:
      - NODE_ENV=production
      - HOST=0.0.0.0
      - PORT=3000
      - MONGODB_URI=mongodb://${MONGO_USER:-admin}:${MONGO_PASSWORD:-changeme}@mongodb:27017/${MONGO_DB:-ainotes}?authSource=admin
      - PACKAGE_NAME=${PACKAGE_NAME}
      - MENTRAOS_API_KEY=${MENTRAOS_API_KEY}
      - COOKIE_SECRET=${COOKIE_SECRET}
      - AGENT_PROVIDER=${AGENT_PROVIDER:-llamacpp}
      - LLAMACPP_BASE_URL=${LLAMACPP_BASE_URL:-http://host.docker.internal:8080}
      - LLAMACPP_MODEL=${LLAMACPP_MODEL:-local-model}
      - OLLAMA_BASE_URL=${OLLAMA_BASE_URL:-http://host.docker.internal:11434}
      - STORAGE_PROVIDER=${STORAGE_PROVIDER:-local}
      - LOCAL_STORAGE_PATH=/app/data/storage
      - LOCAL_ONLY_MODE=${LOCAL_ONLY_MODE:-true}
      - ENABLE_ANALYTICS=${ENABLE_ANALYTICS:-false}
    volumes:
      - app-storage:/app/data/storage
    depends_on:
      mongodb:
        condition: service_healthy
    networks:
      - mentra-network
    extra_hosts:
      - "host.docker.internal:host-gateway"

  # ===========================================
  # MongoDB Database
  # ===========================================
  mongodb:
    image: mongo:7
    container_name: mentra-notes-mongodb
    restart: unless-stopped
    environment:
      - MONGO_INITDB_ROOT_USERNAME=${MONGO_USER:-admin}
      - MONGO_INITDB_ROOT_PASSWORD=${MONGO_PASSWORD:-changeme}
      - MONGO_INITDB_DATABASE=${MONGO_DB:-ainotes}
    volumes:
      - mongodb-data:/data/db
      - mongodb-config:/data/configdb
    ports:
      - "${MONGO_PORT:-27017}:27017"
    healthcheck:
      test: ["CMD", "mongosh", "--eval", "db.adminCommand('ping')"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 10s
    networks:
      - mentra-network

volumes:
  mongodb-data:
    driver: local
  mongodb-config:
    driver: local
  app-storage:
    driver: local

networks:
  mentra-network:
    driver: bridge
```

---

## Step 4: Create Cloudflare Tunnel Compose Override
**Goal:** Add Cloudflare Tunnel for HTTPS access.

**File:** `deploy/docker-compose.tunnel.yml`

```yaml
version: '3.8'

services:
  # ===========================================
  # Cloudflare Tunnel (for HTTPS)
  # ===========================================
  cloudflared:
    image: cloudflare/cloudflared:latest
    container_name: mentra-notes-tunnel
    restart: unless-stopped
    command: tunnel run
    environment:
      - TUNNEL_TOKEN=${CLOUDFLARE_TUNNEL_TOKEN}
    depends_on:
      - app
    networks:
      - mentra-network
```

**Usage:**
```bash
# Start with Cloudflare Tunnel
docker compose -f docker-compose.yml -f docker-compose.tunnel.yml up -d
```

---

## Step 5: Create Development Compose Override
**Goal:** Development configuration with hot reload.

**File:** `deploy/docker-compose.dev.yml`

```yaml
version: '3.8'

services:
  app:
    build:
      context: ..
      dockerfile: deploy/Dockerfile.dev
    container_name: mentra-notes-dev
    environment:
      - NODE_ENV=development
    volumes:
      # Mount source for hot reload
      - ../src:/app/src:cached
      - ../packages:/app/packages:cached
      - app-storage:/app/data/storage
    ports:
      - "${PORT:-3000}:3000"
    command: ["bun", "--hot", "src/index.ts"]
```

**File:** `deploy/Dockerfile.dev`

```dockerfile
FROM oven/bun:1

WORKDIR /app

# Install dependencies
COPY package.json bun.lock* ./
COPY packages/display-utils/package.json packages/display-utils/tsconfig.json ./packages/display-utils/
COPY packages/display-utils/src ./packages/display-utils/src

RUN bun install

# Build display-utils
WORKDIR /app/packages/display-utils
RUN bunx tsc -p tsconfig.json

WORKDIR /app
RUN bun install

# Copy source (will be overwritten by volume mount)
COPY . .

# Create data directory
RUN mkdir -p /app/data/storage

ENV NODE_ENV=development
ENV HOST=0.0.0.0
ENV PORT=3000

EXPOSE 3000

CMD ["bun", "--hot", "src/index.ts"]
```

---

## Step 6: Create Environment Template
**Goal:** Provide easy-to-configure environment file.

**File:** `deploy/.env.example`

```bash
# =============================================================================
# Mentra Notes - Docker Deployment Configuration
# =============================================================================
# Copy this file to .env and fill in your values:
#   cp .env.example .env
# =============================================================================

# -----------------------------------------------------------------------------
# Required Settings
# -----------------------------------------------------------------------------

# MentraOS Integration (get from console.mentra.glass)
PACKAGE_NAME=com.yourname.notes
MENTRAOS_API_KEY=your_api_key_here

# Security
COOKIE_SECRET=generate_a_random_string_here

# -----------------------------------------------------------------------------
# MongoDB Settings
# -----------------------------------------------------------------------------

MONGO_USER=admin
MONGO_PASSWORD=changeme_to_secure_password
MONGO_DB=ainotes
MONGO_PORT=27017

# -----------------------------------------------------------------------------
# AI Provider Settings
# -----------------------------------------------------------------------------

# Provider: llamacpp, ollama, gemini, anthropic, openai
AGENT_PROVIDER=llamacpp

# llama.cpp settings (if using llamacpp)
# Use host.docker.internal for services on host machine
# Or use actual IP/hostname for remote servers
LLAMACPP_BASE_URL=http://host.docker.internal:8080
LLAMACPP_MODEL=local-model

# Ollama settings (if using ollama)
# OLLAMA_BASE_URL=http://host.docker.internal:11434
# OLLAMA_MODEL_FAST=llama3.1
# OLLAMA_MODEL_SMART=llama3.1:70b

# -----------------------------------------------------------------------------
# Storage Settings
# -----------------------------------------------------------------------------

# Storage provider: local (recommended) or r2
STORAGE_PROVIDER=local

# Local storage is mounted at /app/data/storage inside container
# This is persisted via Docker volume

# -----------------------------------------------------------------------------
# Privacy Settings
# -----------------------------------------------------------------------------

# Disable cloud services (recommended for self-hosted)
LOCAL_ONLY_MODE=true

# Disable analytics/telemetry
ENABLE_ANALYTICS=false

# -----------------------------------------------------------------------------
# Network Settings
# -----------------------------------------------------------------------------

# App port (exposed on host)
PORT=3000

# Cloudflare Tunnel (optional, for HTTPS)
# Get token from Cloudflare Zero Trust dashboard
# CLOUDFLARE_TUNNEL_TOKEN=your_tunnel_token_here

# -----------------------------------------------------------------------------
# Optional: Cloud Services (only if LOCAL_ONLY_MODE=false)
# -----------------------------------------------------------------------------

# Gemini API
# GEMINI_API_KEY=your_gemini_api_key

# Anthropic API
# ANTHROPIC_API_KEY=your_anthropic_api_key

# OpenAI API
# OPENAI_API_KEY=your_openai_api_key

# Email (Resend)
# RESEND_API_KEY=your_resend_api_key
```

---

## Step 7: Create Setup Script
**Goal:** One-command initial setup.

**File:** `deploy/scripts/setup.sh`

```bash
#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(dirname "$SCRIPT_DIR")"

echo "========================================"
echo "  Mentra Notes - Setup Script"
echo "========================================"
echo ""

# Check Docker
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

if ! command -v docker compose &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

echo "✅ Docker and Docker Compose are installed"
echo ""

# Check/create .env file
if [ ! -f "$DEPLOY_DIR/.env" ]; then
    echo "📝 Creating .env file from template..."
    cp "$DEPLOY_DIR/.env.example" "$DEPLOY_DIR/.env"
    echo ""
    echo "⚠️  IMPORTANT: Edit $DEPLOY_DIR/.env with your configuration"
    echo "   Required fields:"
    echo "   - PACKAGE_NAME"
    echo "   - MENTRAOS_API_KEY"
    echo "   - COOKIE_SECRET"
    echo "   - MONGO_PASSWORD (change from default!)"
    echo ""
    read -p "Press Enter after editing .env to continue..."
fi

# Load environment
source "$DEPLOY_DIR/.env"

# Validate required vars
if [ -z "$PACKAGE_NAME" ] || [ "$PACKAGE_NAME" = "com.yourname.notes" ]; then
    echo "❌ Please set PACKAGE_NAME in .env"
    exit 1
fi

if [ -z "$MENTRAOS_API_KEY" ] || [ "$MENTRAOS_API_KEY" = "your_api_key_here" ]; then
    echo "❌ Please set MENTRAOS_API_KEY in .env"
    exit 1
fi

echo "✅ Configuration validated"
echo ""

# Build and start
echo "🏗️  Building Docker images..."
cd "$DEPLOY_DIR"
docker compose build

echo ""
echo "🚀 Starting services..."
docker compose up -d

echo ""
echo "⏳ Waiting for services to be healthy..."
sleep 10

# Check health
if docker compose ps | grep -q "healthy"; then
    echo ""
    echo "========================================"
    echo "  ✅ Mentra Notes is running!"
    echo "========================================"
    echo ""
    echo "  Access the app at: http://localhost:${PORT:-3000}"
    echo ""
    echo "  Useful commands:"
    echo "    View logs:    ./scripts/logs.sh"
    echo "    Stop:         ./scripts/stop.sh"
    echo "    Backup:       ./scripts/backup.sh"
    echo ""
else
    echo "⚠️  Services may still be starting. Check logs with: ./scripts/logs.sh"
fi
```

---

## Step 8: Create Helper Scripts
**Goal:** Convenient management scripts.

**File:** `deploy/scripts/start.sh`

```bash
#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(dirname "$SCRIPT_DIR")"

cd "$DEPLOY_DIR"

# Check for tunnel flag
if [ "$1" = "--tunnel" ] || [ "$1" = "-t" ]; then
    echo "🚀 Starting with Cloudflare Tunnel..."
    docker compose -f docker-compose.yml -f docker-compose.tunnel.yml up -d
else
    echo "🚀 Starting Mentra Notes..."
    docker compose up -d
fi

echo "✅ Services started. View logs with: ./scripts/logs.sh"
```

**File:** `deploy/scripts/stop.sh`

```bash
#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(dirname "$SCRIPT_DIR")"

cd "$DEPLOY_DIR"

echo "🛑 Stopping Mentra Notes..."
docker compose down

echo "✅ Services stopped"
```

**File:** `deploy/scripts/logs.sh`

```bash
#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(dirname "$SCRIPT_DIR")"

cd "$DEPLOY_DIR"

# Default to app logs, or specify service
SERVICE="${1:-app}"

docker compose logs -f "$SERVICE"
```

**File:** `deploy/scripts/backup.sh`

```bash
#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="${BACKUP_DIR:-$DEPLOY_DIR/backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

mkdir -p "$BACKUP_DIR"

echo "📦 Creating backup..."

# Backup MongoDB
echo "  - Backing up MongoDB..."
docker compose -f "$DEPLOY_DIR/docker-compose.yml" exec -T mongodb \
    mongodump --archive --gzip --authenticationDatabase admin \
    -u "${MONGO_USER:-admin}" -p "${MONGO_PASSWORD:-changeme}" \
    > "$BACKUP_DIR/mongodb_$TIMESTAMP.archive.gz"

# Backup app storage
echo "  - Backing up app storage..."
docker compose -f "$DEPLOY_DIR/docker-compose.yml" exec -T app \
    tar czf - /app/data/storage \
    > "$BACKUP_DIR/storage_$TIMESTAMP.tar.gz"

# Backup .env (without secrets exposed in filename)
echo "  - Backing up configuration..."
cp "$DEPLOY_DIR/.env" "$BACKUP_DIR/env_$TIMESTAMP.backup"

echo ""
echo "✅ Backup completed!"
echo "   Location: $BACKUP_DIR"
echo "   Files:"
ls -lh "$BACKUP_DIR"/*_$TIMESTAMP* 2>/dev/null || echo "   (no files found)"
```

---

## Step 9: Create Deployment Documentation
**Goal:** Comprehensive deployment guide.

**File:** `deploy/README.md`

```markdown
# Mentra Notes - Docker Deployment

Self-hosted deployment of Mentra Notes with MongoDB and optional Cloudflare Tunnel.

## Quick Start

```bash
# 1. Clone and enter deploy directory
cd deploy

# 2. Run setup (creates .env, builds, starts)
./scripts/setup.sh

# 3. Access at http://localhost:3000
```

## Requirements

- Docker 20.10+
- Docker Compose 2.0+
- 2GB RAM minimum
- llama.cpp or Ollama server (for AI features)

## Configuration

Copy `.env.example` to `.env` and configure:

### Required Settings
| Variable | Description |
|----------|-------------|
| `PACKAGE_NAME` | Your MentraOS package name |
| `MENTRAOS_API_KEY` | API key from console.mentra.glass |
| `COOKIE_SECRET` | Random secret for session cookies |
| `MONGO_PASSWORD` | MongoDB password (change default!) |

### AI Provider
| Variable | Description |
|----------|-------------|
| `AGENT_PROVIDER` | `llamacpp` or `ollama` (default: llamacpp) |
| `LLAMACPP_BASE_URL` | URL to llama.cpp server |
| `OLLAMA_BASE_URL` | URL to Ollama server |

## Commands

```bash
# Start services
./scripts/start.sh

# Start with Cloudflare Tunnel (HTTPS)
./scripts/start.sh --tunnel

# Stop services
./scripts/stop.sh

# View logs
./scripts/logs.sh          # App logs
./scripts/logs.sh mongodb  # MongoDB logs

# Create backup
./scripts/backup.sh
```

## Architecture

```
┌─────────────────┐     ┌─────────────────┐
│  Cloudflare     │────▶│  Mentra Notes   │
│  Tunnel (HTTPS) │     │  (Port 3000)    │
└─────────────────┘     └────────┬────────┘
                                 │
                    ┌────────────┼────────────┐
                    ▼            ▼            ▼
          ┌─────────────┐ ┌───────────┐ ┌──────────┐
          │  MongoDB    │ │  Storage  │ │ llama.cpp│
          │  (27017)    │ │  Volume   │ │ (ext.)   │
          └─────────────┘ └───────────┘ └──────────┘
```

## Volumes

| Volume | Purpose |
|--------|---------|
| `mongodb-data` | MongoDB database files |
| `mongodb-config` | MongoDB configuration |
| `app-storage` | Transcript archives, photos |

## Connecting to External llama.cpp

If llama.cpp runs on your host machine:
```bash
LLAMACPP_BASE_URL=http://host.docker.internal:8080
```

If llama.cpp runs on another server:
```bash
LLAMACPP_BASE_URL=http://192.168.1.185:30000
```

## Troubleshooting

### App can't connect to MongoDB
```bash
# Check MongoDB is healthy
docker compose ps

# Check MongoDB logs
./scripts/logs.sh mongodb
```

### App can't connect to llama.cpp
```bash
# Verify llama.cpp is accessible from container
docker compose exec app curl http://host.docker.internal:8080/health
```

## Updating

```bash
# Pull latest code
git pull

# Rebuild and restart
docker compose build
docker compose up -d
```
```

---

## Step 10: Add Git Branch and Initial Files
**Goal:** Create deployment branch with all files.

**Commands:**
```bash
# Create new branch
git checkout -b deploy/docker-production

# Create deploy directory
mkdir -p deploy/scripts

# Create all files as specified above
# ... (files created in previous steps)

# Make scripts executable
chmod +x deploy/scripts/*.sh

# Commit
git add deploy/
git commit -m "feat: Add Docker production deployment setup

- docker-compose.yml for app + MongoDB
- docker-compose.tunnel.yml for Cloudflare Tunnel
- docker-compose.dev.yml for development
- Helper scripts (setup, start, stop, backup, logs)
- Comprehensive documentation"

# Push
git push -u origin deploy/docker-production
```

# 5. TESTING AND VALIDATION

## Deployment Tests

### Test 1: Fresh Deployment
```bash
# Clean environment test
cd deploy
rm -f .env
./scripts/setup.sh
```
**Expected:** Setup prompts for .env configuration, then builds and starts.

### Test 2: Service Health Checks
```bash
# All services should be healthy
docker compose ps
```
**Expected:** All services show "healthy" status.

### Test 3: App Connectivity
```bash
# Test health endpoint
curl http://localhost:3000/api/health
```
**Expected:** Returns 200 OK with health status.

### Test 4: MongoDB Connection
```bash
# Test MongoDB from app container
docker compose exec app curl -s "http://localhost:3000/api/health" | grep -i mongo
```
**Expected:** MongoDB connection status is "connected".

### Test 5: External llama.cpp Connection
```bash
# With llama.cpp running on 192.168.1.185:30000
# Update .env: LLAMACPP_BASE_URL=http://192.168.1.185:30000
docker compose restart app
docker compose exec app curl http://192.168.1.185:30000/health
```
**Expected:** llama.cpp responds with health status.

### Test 6: Cloudflare Tunnel
```bash
# Start with tunnel
./scripts/start.sh --tunnel

# Check tunnel status
docker compose logs cloudflared
```
**Expected:** Tunnel connects and routes traffic to app.

### Test 7: Data Persistence
```bash
# Stop and restart
./scripts/stop.sh
./scripts/start.sh

# Verify data still exists
docker compose exec mongodb mongosh --eval "db.getSiblingDB('ainotes').getCollectionNames()"
```
**Expected:** Collections and data persist across restarts.

### Test 8: Backup and Restore
```bash
# Create backup
./scripts/backup.sh

# Verify backup files exist
ls -la backups/
```
**Expected:** Backup files created for MongoDB and storage.

## Verification Checklist

### Docker Setup
- [ ] `deploy/` directory created with all files
- [ ] `docker-compose.yml` starts app + MongoDB
- [ ] `docker-compose.tunnel.yml` adds Cloudflare Tunnel
- [ ] `docker-compose.dev.yml` enables hot reload
- [ ] All scripts are executable

### Configuration
- [ ] `.env.example` has all required variables documented
- [ ] Default values work for minimal setup
- [ ] MongoDB credentials are configurable
- [ ] External llama.cpp URL is configurable

### Networking
- [ ] App binds to 0.0.0.0 inside container
- [ ] MongoDB accessible from app container
- [ ] `host.docker.internal` works for host services
- [ ] External IPs work for remote llama.cpp

### Persistence
- [ ] MongoDB data persists in named volume
- [ ] App storage persists in named volume
- [ ] Volumes survive container recreation

### Documentation
- [ ] `deploy/README.md` covers all use cases
- [ ] Quick start works for new users
- [ ] Troubleshooting section covers common issues
- [ ] Environment variables fully documented
