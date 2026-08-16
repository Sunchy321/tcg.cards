#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Load connection strings from .env if present
if [ -f "$SCRIPT_DIR/.env" ]; then
  set -a
  source "$SCRIPT_DIR/.env"
  set +a
fi

# SOURCE: database with data ready to sync (e.g. remote dev)
# TARGET: production database
# Both should be PostgreSQL connection strings, either from .env or exported.
#
# Usage:
#   ./scripts/sync-prod-data.sh
#
# Or override inline:
#   SOURCE="..." TARGET="..." ./scripts/sync-prod-data.sh

: "${SOURCE:?SOURCE connection string is required. Set in scripts/.env or export SOURCE.}"
: "${TARGET:?TARGET connection string is required. Set in scripts/.env or export TARGET.}"

TABLES=(
  "hearthstone.entities"
  "hearthstone.entity_localizations"
  "hearthstone.entity_relations"
  "hearthstone.cards"
  "hearthstone.patches"
)

echo "=== Truncating target tables ==="
for table in "${TABLES[@]}"; do
  psql "$TARGET" -c "TRUNCATE $table;"
done

echo "=== Dumping and restoring ==="
for table in "${TABLES[@]}"; do
  echo "  $table ..."
  pg_dump --data-only --format=plain --no-owner --no-acl \
    --dbname="$SOURCE" \
    --table="$table" \
  | grep -v "^SET transaction_timeout" \
  | grep -v "^SET default_table_access_method" \
  | grep -v "^SET row_security" \
  | psql "$TARGET"
done

echo "=== Done ==="
psql "$TARGET" -c "
  SELECT 'entities' AS tbl, count(*) FROM hearthstone.entities
  UNION ALL
  SELECT 'entity_localizations', count(*) FROM hearthstone.entity_localizations
  UNION ALL
  SELECT 'entity_relations', count(*) FROM hearthstone.entity_relations
  UNION ALL
  SELECT 'cards', count(*) FROM hearthstone.cards
  UNION ALL
  SELECT 'patches', count(*) FROM hearthstone.patches;
"
