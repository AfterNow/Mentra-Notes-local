#!/bin/bash
# =============================================================================
# Mentra Notes - Initial Setup Script
# =============================================================================
# Sets up the deployment environment, creates .env, builds, and starts services.
#
# Usage:
#   ./scripts/setup.sh           # Interactive setup
#   ./scripts/setup.sh --quick   # Use defaults, just build and start
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(dirname "$SCRIPT_DIR")"

cd "$DEPLOY_DIR"

echo "🚀 Mentra Notes - Docker Setup"
echo "==============================="
echo ""

# Check for Docker
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    echo "   https://docs.docker.com/get-docker/"
    exit 1
fi

# Check for Docker Compose
if ! docker compose version &> /dev/null; then
    echo "❌ Docker Compose is not available. Please install Docker Compose."
    exit 1
fi

echo "✅ Docker and Docker Compose found"
echo ""

# Create .env if it doesn't exist
if [ ! -f ".env" ]; then
    echo "📝 Creating .env from template..."
    cp .env.example .env
    
    if [ "$1" != "--quick" ]; then
        echo ""
        echo "⚠️  Please edit .env with your configuration:"
        echo "   - MENTRAOS_API_KEY (from console.mentra.glass)"
        echo "   - COOKIE_SECRET (generate with: openssl rand -hex 32)"
        echo "   - MONGO_PASSWORD (choose a secure password)"
        echo ""
        read -p "Press Enter to open .env in editor, or Ctrl+C to edit manually later... "
        
        # Try to open in editor
        if command -v nano &> /dev/null; then
            nano .env
        elif command -v vim &> /dev/null; then
            vim .env
        else
            echo "Please edit .env manually before starting."
            exit 0
        fi
    else
        echo "   (Using default values - edit .env before production use)"
    fi
else
    echo "✅ .env already exists"
fi

echo ""

# Build the application
echo "🔨 Building Mentra Notes..."
docker compose build

echo ""

# Start services
echo "🚀 Starting services..."
docker compose up -d

echo ""
echo "⏳ Waiting for services to be healthy..."
sleep 5

# Check service status
docker compose ps

echo ""
echo "==============================="
echo "✅ Setup complete!"
echo ""
echo "🌐 Access Mentra Notes at: http://localhost:${PORT:-3000}"
echo ""
echo "📋 Useful commands:"
echo "   ./scripts/start.sh         - Start services"
echo "   ./scripts/stop.sh          - Stop services"
echo "   ./scripts/logs.sh          - View app logs"
echo "   ./scripts/logs.sh mongodb  - View MongoDB logs"
echo "   ./scripts/backup.sh        - Create backup"
echo ""
echo "📖 For HTTPS with Cloudflare Tunnel:"
echo "   1. Set CLOUDFLARE_TUNNEL_TOKEN in .env"
echo "   2. Run: ./scripts/start.sh --tunnel"
echo ""
