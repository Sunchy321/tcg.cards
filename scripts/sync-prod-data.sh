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
#   ./scripts/sync-prod-data.sh [--dry-run]
#
# Or override inline:
#   SOURCE="..." TARGET="..." ./scripts/sync-prod-data.sh

: "${SOURCE:?SOURCE connection string is required. Set in scripts/.env or export SOURCE.}"
: "${TARGET:?TARGET connection string is required. Set in scripts/.env or export TARGET.}"

# Long COPY transfers over proxied connections can be silently dropped; TCP
# keepalives make the dead socket fail within ~1 minute instead of hanging a
# psql session forever. application_name marks these sessions in
# pg_stat_activity so they are easy to find and terminate.
augment_conn() {
  case "$1" in
    postgres://* | postgresql://*)
      local sep='?'
      case "$1" in *\?*) sep='&' ;; esac
      printf '%s%skeepalives=1&keepalives_idle=30&keepalives_interval=10&keepalives_count=6&application_name=sync-prod-data' "$1" "$sep"
      ;;
    *) printf '%s' "$1" ;;
  esac
}
SOURCE="$(augment_conn "$SOURCE")"
TARGET="$(augment_conn "$TARGET")"
export PGCONNECT_TIMEOUT="${PGCONNECT_TIMEOUT:-30}"

# TRUNCATE waits for ACCESS EXCLUSIVE on every table in the schema; any stray
# reader holding a lock would otherwise block the load forever.
LOCK_TIMEOUT="${LOCK_TIMEOUT:-30s}"

# ── Sync scope ──
# Only the tables that existing desktop publish tasks write to the remote
# database are synced, nothing else. When a publish task starts writing a new
# remote table, add it here; tables without a publish task (e.g. yugioh today)
# must not be listed.
#
#   hearthstone: publish (card_data) -> entities, entity_localizations,
#               entity_relations, cards
#               reference-publish   -> sets, formats, patches, tags
#               announcement-publish -> announcements, announcement_items
#   magic:       publish (PUBLISH_TABLES in lib/magic/magic-publish.ts)
HEARTHSTONE_TABLES=(
  entities
  entity_localizations
  entity_relations
  cards
  patches
  sets
  formats
  tags
  announcements
  announcement_items
)

MAGIC_TABLES=(
  cards
  card_parts
  card_localizations
  card_part_localizations
  prints
  print_parts
)

SCHEMAS=(
  hearthstone
  magic
)

DRY_RUN=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    *) echo "Unknown argument: $arg (supported: --dry-run)" >&2; exit 2 ;;
  esac
done

TOTAL_START=$SECONDS

# ── Presentation ──
# A live status line redraws in place when stdout is a terminal; piped output
# stays quiet and only shows per-table count rows and per-schema summaries.
IS_TTY=0
if [ -t 1 ]; then
  IS_TTY=1
  C_RESET=$'\033[0m' C_BOLD=$'\033[1m' C_DIM=$'\033[2m'
  C_GREEN=$'\033[32m' C_CYAN=$'\033[36m' C_RED=$'\033[31m'
else
  C_RESET='' C_BOLD='' C_DIM='' C_GREEN='' C_CYAN='' C_RED=''
fi

section() {
  printf '\n%s── %s ──%s\n' "$C_BOLD" "$1" "$C_RESET"
}

# Redraw the live status line in place.
status() {
  if [ "$IS_TTY" -eq 1 ]; then
    printf '\r\033[K%s' "$1"
  fi
}

# Close the live line and print a stable line.
finish_line() {
  if [ "$IS_TTY" -eq 1 ]; then
    printf '\r\033[K'
  fi
  printf '%s\n' "$1"
}

bar() { # $1 filled, $2 empty
  local out="" i
  for ((i = 0; i < $1; i++)); do out+="█"; done
  for ((i = 0; i < $2; i++)); do out+="░"; done
  printf '%s' "$out"
}

human_rows() {
  local n=$1
  if [ "$n" -ge 1000000 ]; then
    printf '%d.%dM' $((n / 1000000)) $(((n % 1000000) / 100000))
  elif [ "$n" -ge 1000 ]; then
    printf '%d.%dk' $((n / 1000)) $(((n % 1000) / 100))
  else
    printf '%d' "$n"
  fi
}

# Animate a spinner while the background pid $1 is running.
spin() {
  local frames='|/-\' i=0
  while kill -0 "$1" 2>/dev/null; do
    status "  ${C_CYAN}${frames:$((i % 4)):1}${C_RESET} $2"
    i=$((i + 1))
    sleep 0.15
  done
}

# psql swallows ^C ("Cancel request sent") and keeps running, so a dead
# connection or a lock wait would wedge the run forever. The trap kills the
# in-flight psql/pg_dump outright instead; the server rolls the open
# transaction back on connection close.
child_pid=""
interrupted() {
  if [ -n "$child_pid" ]; then
    kill "$child_pid" 2>/dev/null || true
    wait "$child_pid" 2>/dev/null || true
  fi
  finish_line "${C_RED}✗ Interrupted by signal; nothing was committed — the remote transaction (if any) rolled back.${C_RESET}"
  exit 130
}
trap interrupted INT TERM

# Fills the global `tables` array with the synced tables of one schema.
schema_tables() {
  case "$1" in
    hearthstone) tables=("${HEARTHSTONE_TABLES[@]}") ;;
    magic)       tables=("${MAGIC_TABLES[@]}") ;;
    *) echo "Unknown schema: $1" >&2; exit 2 ;;
  esac
}

# SQL listing every synced table with its column set, one `table|columns` line.
# Used to preflight schema drift between SOURCE and TARGET.
preflight_sql() {
  local values=""
  for schema in "${SCHEMAS[@]}"; do
    schema_tables "$schema"
    for t in "${tables[@]}"; do
      values="${values}('$schema','$t'),"
    done
  done
  values="${values%,}"
  echo "WITH want(schemaname, tablename) AS (VALUES $values)"
  echo "SELECT w.schemaname || '.' || w.tablename || '|' ||"
  echo "       coalesce(string_agg(c.column_name, ',' ORDER BY c.column_name), 'MISSING')"
  echo "FROM want w"
  echo "LEFT JOIN information_schema.columns c"
  echo "  ON c.table_schema = w.schemaname AND c.table_name = w.tablename"
  echo "GROUP BY w.schemaname, w.tablename ORDER BY 1;"
}

# Row count of one `schema.table` from the SOURCE side snapshot.
rows_of() {
  awk -F'|' -v k="$1" '$1 == k { print $2 }' "$WORKDIR/counts.source"
}

# Count every synced table on both sides, one table at a time, printing one
# result row per table. With $1 = 1, flag rows whose counts differ.
collect_counts() {
  local show_mark=$1
  local idx=0 key s d mark
  : > "$WORKDIR/counts.source"
  : > "$WORKDIR/counts.target"
  for schema in "${SCHEMAS[@]}"; do
    schema_tables "$schema"
    for t in "${tables[@]}"; do
      idx=$((idx + 1))
      key="$schema.$t"

      psql "$SOURCE" -v ON_ERROR_STOP=1 -At -c "SELECT count(*) FROM $key" \
        > "$WORKDIR/one.source" &
      count_pid=$!
      child_pid=$count_pid
      spin $count_pid "[$idx/$total_tables] counting $key (source)"
      if ! wait $count_pid; then
        finish_line "  ${C_RED}✗ count failed: $key (source)${C_RESET}"
        exit 1
      fi
      child_pid=""

      psql "$TARGET" -v ON_ERROR_STOP=1 -At -c "SELECT count(*) FROM $key" \
        > "$WORKDIR/one.target" &
      count_pid=$!
      child_pid=$count_pid
      spin $count_pid "[$idx/$total_tables] counting $key (target)"
      if ! wait $count_pid; then
        finish_line "  ${C_RED}✗ count failed: $key (target)${C_RESET}"
        exit 1
      fi
      child_pid=""

      s=$(cat "$WORKDIR/one.source")
      d=$(cat "$WORKDIR/one.target")
      echo "$key|$s" >> "$WORKDIR/counts.source"
      echo "$key|$d" >> "$WORKDIR/counts.target"

      mark=""
      if [ "$show_mark" -eq 1 ] && [ "$s" != "$d" ]; then
        mark="  ${C_RED}MISMATCH${C_RESET}"
      fi
      finish_line "  $(printf '%-40s %12s %12s' "$key" "$s" "$d")$mark"
    done
  done
}

total_tables=0
for s in "${SCHEMAS[@]}"; do
  schema_tables "$s"
  total_tables=$((total_tables + ${#tables[@]}))
done

WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

if [ "$SOURCE" = "$TARGET" ]; then
  echo "SOURCE and TARGET are identical; nothing to do."
  exit 0
fi

section "Preflight: comparing table schemas"
psql "$SOURCE" -v ON_ERROR_STOP=1 -At -c "$(preflight_sql)" > "$WORKDIR/columns.source"
psql "$TARGET" -v ON_ERROR_STOP=1 -At -c "$(preflight_sql)" > "$WORKDIR/columns.target"
if ! diff -u "$WORKDIR/columns.source" "$WORKDIR/columns.target" > "$WORKDIR/columns.diff"; then
  echo "${C_RED}Schema drift detected between SOURCE and TARGET; aborting:${C_RESET}" >&2
  cat "$WORKDIR/columns.diff" >&2
  exit 1
fi
echo "${C_GREEN}  ✔ OK${C_RESET} ${C_DIM}($total_tables tables, no schema drift)${C_RESET}"

section "Row counts before sync"
collect_counts 0

if [ "$DRY_RUN" -eq 1 ]; then
  echo "${C_DIM}── Dry run: no changes written ──${C_RESET}"
  exit 0
fi

# pg_dump emits SET commands the target server may not know; keep the filters
# in sync with what the target rejects.
filter_dump() {
  grep -v "^SET transaction_timeout" \
    | grep -v "^SET default_table_access_method" \
    | grep -v "^SET row_security"
}

section "Dumping source tables"
dumped_tables=0
for schema in "${SCHEMAS[@]}"; do
  schema_tables "$schema"
  schema_start=$SECONDS
  schema_rows=0
  for t in "${tables[@]}"; do
    r=$(rows_of "$schema.$t")
    r=${r:-0}
    schema_rows=$((schema_rows + r))
    dumped_tables=$((dumped_tables + 1))
    filled=$((dumped_tables * 24 / total_tables))
    pg_dump --data-only --format=plain --no-owner --no-acl \
      --dbname="$SOURCE" \
      --table="$schema.$t" \
      --file="$WORKDIR/$schema.$t.raw" &
    dump_pid=$!
    child_pid=$dump_pid
    spin $dump_pid "[$dumped_tables/$total_tables] $(bar "$filled" "$((24 - filled))") dumping ${C_BOLD}$schema.$t${C_RESET} ${C_DIM}($(human_rows "$r") rows)${C_RESET}"
    if ! wait $dump_pid; then
      finish_line "  ${C_RED}✗ dump failed: $schema.$t${C_RESET}"
      exit 1
    fi
    child_pid=""
    filter_dump < "$WORKDIR/$schema.$t.raw" > "$WORKDIR/$schema.$t.sql"
  done
  finish_line "  ${C_GREEN}✔ dumped $schema${C_RESET} ${C_DIM}· ${#tables[@]} tables · $(human_rows "$schema_rows") rows · $((SECONDS - schema_start))s${C_RESET}"
done

# Every dump is complete before anything on the target is touched, so a dump
# failure cannot leave production half-loaded. Loading truncates and restores
# one schema inside a single transaction: on any error psql exits before COMMIT
# and the target rolls back to its previous state. A read-only sentinel SELECT
# after each table's data marks per-table progress from the psql log.
section "Loading target tables"
for schema in "${SCHEMAS[@]}"; do
  schema_tables "$schema"
  truncate_list=""
  for t in "${tables[@]}"; do
    truncate_list="$truncate_list $schema.$t,"
  done
  truncate_list="${truncate_list%,}"

  trx="$WORKDIR/$schema.trx.sql"
  {
    printf "SET lock_timeout = '%s';\n" "$LOCK_TIMEOUT"
    printf 'TRUNCATE TABLE %s;\n' "$truncate_list"
    for t in "${tables[@]}"; do
      cat "$WORKDIR/$schema.$t.sql"
      printf "SELECT 'TBL_DONE:%s';\n" "$t"
    done
  } > "$trx"

  schema_rows=0
  for t in "${tables[@]}"; do
    r=$(rows_of "$schema.$t")
    schema_rows=$((schema_rows + ${r:-0}))
  done
  schema_start=$SECONDS

  psql "$TARGET" -v ON_ERROR_STOP=1 -At --single-transaction -f "$trx" \
    > "$WORKDIR/load.$schema.log" 2>&1 < /dev/null &
  load_pid=$!
  child_pid=$load_pid
  while kill -0 "$load_pid" 2>/dev/null; do
    done_n=$(grep -c '^TBL_DONE:' "$WORKDIR/load.$schema.log" 2>/dev/null) || true
    done_n=${done_n:-0}
    cur=""
    if [ "$done_n" -lt "${#tables[@]}" ]; then
      cur=" · ${tables[$done_n]}"
    fi
    status "  ${C_CYAN}▶${C_RESET} [$done_n/${#tables[@]}] loading ${C_BOLD}$schema${C_RESET}${cur} ${C_DIM}· $(human_rows "$schema_rows") rows${C_RESET}"
    sleep 0.15
  done

  if ! wait $load_pid; then
    finish_line "  ${C_RED}✗ load failed: $schema (transaction rolled back)${C_RESET}"
    echo "${C_RED}Last lines of psql output:${C_RESET}" >&2
    tail -n 15 "$WORKDIR/load.$schema.log" >&2
    echo "${C_DIM}Active sessions on TARGET (check for lock holders):${C_RESET}" >&2
    psql "$TARGET" -c "SELECT pid, application_name, state, wait_event_type, wait_event,
       date_trunc('second', now()) - xact_start AS xact_age, left(query, 60) AS query
       FROM pg_stat_activity
       WHERE pid <> pg_backend_pid() AND state <> 'idle'
       ORDER BY xact_start NULLS LAST;" >&2 || true
    exit 1
  fi
  child_pid=""
  finish_line "  ${C_GREEN}✔ loaded $schema${C_RESET} ${C_DIM}· ${#tables[@]} tables · $(human_rows "$schema_rows") rows · $((SECONDS - schema_start))s${C_RESET}"
done

section "Verifying row counts (source vs target)"
collect_counts 1
if ! cmp -s "$WORKDIR/counts.source" "$WORKDIR/counts.target"; then
  echo "${C_RED}✗ Row count mismatch after sync; investigate before retrying.${C_RESET}" >&2
  exit 1
fi
echo "${C_GREEN}✔ Sync complete${C_RESET} ${C_DIM}· $total_tables tables · $((SECONDS - TOTAL_START))s${C_RESET}"
