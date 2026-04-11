#!/bin/bash
# =============================================================================
# Mentra Notes - Start Services
# =============================================================================
# Starts the Mentra Notes stack.
#
# Usage:
#   ./scripts/start.sh           # Start app + MongoDB
#   ./scripts/start.sh --tunnel  # Start with Cloudflare Tunnel
#   ./scripts/start.sh --dev     # Start in development mode
#   ./scripts/start.sh --build   # Rebuild before starting
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(dirname "$SCRIPT_DIR")"

cd "$DEPLOY_DIR"

# Parse arguments
USE_TUNNEL=false
USE_DEV=false
REBUILD=false

for arg in "$@"; do
    case $arg in
        --tunnel)
            USE_TUNNEL=true
            ;;
        --dev)
            USE_DEV=true
            ;;
        --build)
            REBUILD=true
            ;;
    esac
done

# Check for .env
if [ ! -f ".env" ]; then
    echo "❌ .env file not found. Run ./scripts/setup.sh first."
    exit 1
fi

# Build compose command
COMPOSE_CMD="docker compose"
COMPOSE_FILES="-f docker-compose.yml"

if [ "$USE_DEV" = true ]; then
    COMPOSE_FILES="$COMPOSE_FILES -f docker-compose.dev.yml"
    echo "🔧 Development mode enabled"
fi

if [ "$USE_TUNNEL" = true ]; then
    COMPOSE_FILES="$COMPOSE_FILES -f docker-compose.tunnel.yml"
    echo "🔒 Cloudflare Tunnel enabled"
fi

COMPOSE_CMD="$COMPOSE_CMD $COMPOSE_FILES"

# Rebuild if requested
if [ "$REBUILD" = true ]; then
    echo "🔨 Rebuilding..."
    $COMPOSE_CMD build
fi

# Start services
echo "🚀 Starting Mentra Notes..."
$COMPOSE_CMD up -d

echo ""
echo "⏳ Waiting for services..."
sleep 3

# Show status
$COMPOSE_CMD ps

echo ""
if [ "$USE_TUNNEL" = true ]; then
    echo "✅ Services started with Cloudflare Tunnel"
    echo "   Check tunnel status: docker compose logs cloudflared"
else
    echo "✅ Services started"
    echo "   Access at: http://localhost:${PORT:-3000}"
fi
