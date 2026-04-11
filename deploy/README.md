# Mentra Notes - Docker Deployment

Self-hosted deployment of Mentra Notes with MongoDB, local AI, and optional Cloudflare Tunnel.

## Quick Start

```bash
# 1. Enter deploy directory
cd deploy

# 2. Run setup (creates .env, builds, starts)
./scripts/setup.sh

# 3. Access at http://localhost:3000
```

## Requirements

- **Docker** 20.10+
- **Docker Compose** 2.0+
- **2GB RAM** minimum (4GB recommended)
- **llama.cpp or Ollama** server for AI features

## Configuration

### 1. Copy and Edit Environment File

```bash
cp .env.example .env
nano .env  # or your preferred editor
```

### 2. Required Settings

| Variable | Description | Where to get |
|----------|-------------|--------------|
| `PACKAGE_NAME` | MentraOS package name | [console.mentra.glass](https://console.mentra.glass) |
| `MENTRAOS_API_KEY` | API key for glasses | [console.mentra.glass](https://console.mentra.glass) |
| `COOKIE_SECRET` | Session encryption | `openssl rand -hex 32` |
| `MONGO_PASSWORD` | Database password | Choose a strong password |

### 3. AI Provider Configuration

For local AI, you need either llama.cpp or Ollama running:

**llama.cpp (recommended):**
```bash
# In .env:
AGENT_PROVIDER=llamacpp
LLAMACPP_BASE_URL=http://host.docker.internal:8080
```

**Ollama:**
```bash
# In .env:
AGENT_PROVIDER=ollama
OLLAMA_BASE_URL=http://host.docker.internal:11434
OLLAMA_MODEL_FAST=llama3.1
```

**Remote server:**
```bash
# If llama.cpp runs on another machine:
LLAMACPP_BASE_URL=http://192.168.1.185:30000
```

## Commands

### Basic Operations

```bash
# Start all services
./scripts/start.sh

# Stop all services
./scripts/stop.sh

# View logs (follow mode)
./scripts/logs.sh

# View specific service logs
./scripts/logs.sh app
./scripts/logs.sh mongodb
```

### With Cloudflare Tunnel (HTTPS)

```bash
# 1. Get tunnel token from https://one.dash.cloudflare.com/
# 2. Add to .env: CLOUDFLARE_TUNNEL_TOKEN=your_token

# 3. Start with tunnel
./scripts/start.sh --tunnel
```

### Development Mode

```bash
# Hot reload with source mounting
./scripts/start.sh --dev
```

### Backup & Restore

```bash
# Create backup
./scripts/backup.sh

# Backups stored in ./backups/
ls backups/
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Docker Compose Stack                     │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐      ┌─────────────────────────────────┐  │
│  │  Cloudflare  │─────▶│         Mentra Notes            │  │
│  │   Tunnel     │      │         (Port 3000)             │  │
│  │  (optional)  │      └────────────┬────────────────────┘  │
│  └──────────────┘                   │                       │
│                        ┌────────────┼────────────┐          │
│                        ▼            ▼            ▼          │
│              ┌─────────────┐ ┌───────────┐ ┌──────────────┐ │
│              │  MongoDB    │ │  Storage  │ │  llama.cpp   │ │
│              │  (27017)    │ │  Volume   │ │  (external)  │ │
│              └─────────────┘ └───────────┘ └──────────────┘ │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Persistent Volumes

| Volume | Purpose | Docker Name |
|--------|---------|-------------|
| MongoDB Data | Database files | `mentra-mongodb-data` |
| MongoDB Config | DB configuration | `mentra-mongodb-config` |
| App Storage | Transcripts, photos | `mentra-app-storage` |

Data persists across container restarts and updates.

## Updating

```bash
# Pull latest code
git pull

# Rebuild and restart
./scripts/start.sh --build
```

## Troubleshooting

### App can't connect to MongoDB

```bash
# Check MongoDB status
docker compose ps

# View MongoDB logs
./scripts/logs.sh mongodb

# Test MongoDB connection
docker compose exec mongodb mongosh --eval "db.adminCommand('ping')"
```

### App can't connect to llama.cpp

```bash
# Verify llama.cpp is running on host
curl http://localhost:8080/health

# Test from container
docker compose exec app curl http://host.docker.internal:8080/health

# If using external server
docker compose exec app curl http://192.168.1.185:30000/health
```

### Container won't start

```bash
# Check logs
docker compose logs app

# Rebuild from scratch
docker compose build --no-cache
docker compose up -d
```

### Reset everything

```bash
# WARNING: This deletes all data!
./scripts/stop.sh --clean

# Start fresh
./scripts/setup.sh
```

## Security Notes

1. **Change default passwords** in `.env` before production use
2. **Use Cloudflare Tunnel** instead of exposing ports directly
3. **Enable LOCAL_ONLY_MODE** to prevent any cloud API usage
4. **Backup regularly** using `./scripts/backup.sh`

## File Structure

```
deploy/
├── docker-compose.yml          # Main compose file
├── docker-compose.tunnel.yml   # Cloudflare Tunnel overlay
├── docker-compose.dev.yml      # Development overlay
├── Dockerfile                  # Production image
├── .env.example                # Environment template
├── .env                        # Your configuration (git-ignored)
├── scripts/
│   ├── setup.sh               # Initial setup
│   ├── start.sh               # Start services
│   ├── stop.sh                # Stop services
│   ├── logs.sh                # View logs
│   └── backup.sh              # Create backup
├── backups/                   # Backup files (git-ignored)
└── README.md                  # This file
```

## Support

For issues or questions, please open a GitHub issue.
