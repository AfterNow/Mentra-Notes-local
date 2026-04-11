#!/bin/bash
# =============================================================================
# Mentra Notes - Stop Services
# =============================================================================
# Stops all Mentra Notes services.
#
# Usage:
#   ./scripts/stop.sh         # Stop services (keeps volumes)
#   ./scripts/stop.sh --clean # Stop and remove volumes (WARNING: deletes data!)
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(dirname "$SCRIPT_DIR")"

cd "$DEPLOY_DIR"

if [ "$1" = "--clean" ]; then
    echo "⚠️  WARNING: This will delete all data (MongoDB, storage)"
    read -p "Are you sure? (y/N) " confirm
    if [ "$confirm" = "y" ] || [ "$confirm" = "Y" ]; then
        echo "🧹 Stopping and removing all data..."
        docker compose down -v
        echo "✅ All services stopped and volumes removed"
    else
        echo "Cancelled."
        exit 0
    fi
else
    echo "🛑 Stopping Mentra Notes..."
    docker compose down
    echo "✅ Services stopped (data preserved)"
fi
