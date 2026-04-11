#!/bin/bash
# =============================================================================
# Mentra Notes - Backup Script
# =============================================================================
# Creates backups of MongoDB and app storage.
#
# Usage:
#   ./scripts/backup.sh                    # Backup to ./backups/
#   BACKUP_DIR=/mnt/backup ./scripts/backup.sh  # Custom backup location
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="${BACKUP_DIR:-$DEPLOY_DIR/backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

cd "$DEPLOY_DIR"

# Load environment
if [ -f ".env" ]; then
    source .env
fi

mkdir -p "$BACKUP_DIR"

echo "📦 Creating backup..."
echo "   Timestamp: $TIMESTAMP"
echo "   Location:  $BACKUP_DIR"
echo ""

# Check if services are running
if ! docker compose ps --quiet app &> /dev/null; then
    echo "❌ Services are not running. Start them first with ./scripts/start.sh"
    exit 1
fi

# Backup MongoDB
echo "  → Backing up MongoDB..."
docker compose exec -T mongodb mongodump \
    --archive \
    --gzip \
    --authenticationDatabase admin \
    -u "${MONGO_USER:-admin}" \
    -p "${MONGO_PASSWORD:-changeme}" \
    > "$BACKUP_DIR/mongodb_$TIMESTAMP.archive.gz"

echo "    ✓ MongoDB backed up"

# Backup app storage
echo "  → Backing up app storage..."
docker compose exec -T app tar czf - -C /app/data storage \
    > "$BACKUP_DIR/storage_$TIMESTAMP.tar.gz"

echo "    ✓ Storage backed up"

# Backup configuration (without exposing secrets in filename)
echo "  → Backing up configuration..."
cp "$DEPLOY_DIR/.env" "$BACKUP_DIR/env_$TIMESTAMP.backup"

echo "    ✓ Configuration backed up"

echo ""
echo "✅ Backup completed!"
echo ""
echo "Files created:"
ls -lh "$BACKUP_DIR"/*_$TIMESTAMP* 2>/dev/null | while read line; do
    echo "   $line"
done

echo ""
echo "💡 To restore:"
echo "   1. Stop services: ./scripts/stop.sh"
echo "   2. Restore MongoDB: cat mongodb_$TIMESTAMP.archive.gz | docker compose exec -T mongodb mongorestore --archive --gzip"
echo "   3. Restore storage: cat storage_$TIMESTAMP.tar.gz | docker compose exec -T app tar xzf - -C /app/data"
echo "   4. Start services: ./scripts/start.sh"
