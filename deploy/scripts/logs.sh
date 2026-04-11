#!/bin/bash
# =============================================================================
# Mentra Notes - View Logs
# =============================================================================
# Streams logs from services.
#
# Usage:
#   ./scripts/logs.sh           # All logs
#   ./scripts/logs.sh app       # App logs only
#   ./scripts/logs.sh mongodb   # MongoDB logs only
#   ./scripts/logs.sh -n 100    # Last 100 lines
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(dirname "$SCRIPT_DIR")"

cd "$DEPLOY_DIR"

# Default to following all logs
docker compose logs -f "$@"
