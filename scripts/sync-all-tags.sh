#!/bin/bash

# Sync all historical tags from local hsdata repo to Cloudflare R2
# Usage: ./sync-all-tags.sh [--dry-run] /path/to/hsdata/repo

set -e

# Configuration
R2_BUCKET="${R2_BUCKET_NAME:-}"
R2_PATH="hearthstone/hsdata"
UPSTREAM_FILE="CardDefs.xml"
DRY_RUN=false
LOCAL_REPO=""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Counters
SUCCESS_COUNT=0
SKIP_COUNT=0
FAIL_COUNT=0
TOTAL_COUNT=0
GENERATED_COUNT=0

# Cache for existing files in R2
EXISTING_FILES=""

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --bucket)
            R2_BUCKET="$2"
            shift 2
            ;;
        -h|--help)
            echo "Usage: $0 [--dry-run] [--bucket BUCKET_NAME] /path/to/hsdata/repo"
            echo ""
            echo "Options:"
            echo "  --dry-run         - Only list tags, don't upload"
            echo "  --bucket NAME     - R2 bucket name (or set R2_BUCKET_NAME env)"
            echo ""
            echo "Environment variables:"
            echo "  R2_BUCKET_NAME    - R2 bucket name (required)"
            exit 0
            ;;
        -*)
            echo "Unknown option: $1"
            exit 1
            ;;
        *)
            LOCAL_REPO="$1"
            shift
            ;;
    esac
done

# Check requirements
if [[ -z "$R2_BUCKET" ]]; then
    echo -e "${RED}Error: R2_BUCKET_NAME not set${NC}"
    echo "Set it via environment variable or --bucket flag"
    exit 1
fi

if [[ -z "$LOCAL_REPO" ]]; then
    echo -e "${RED}Error: Local repo path required${NC}"
    echo "Usage: $0 [--dry-run] /path/to/hsdata/repo"
    exit 1
fi

if [[ ! -d "$LOCAL_REPO/.git" ]]; then
    echo -e "${RED}Error: $LOCAL_REPO is not a git repository${NC}"
    exit 1
fi

# Update local repo to latest state
echo -e "${BLUE}Updating local repo to latest state...${NC}"
cd "$LOCAL_REPO"
if ! git reset --hard HEAD 2>/dev/null || ! git pull origin master 2>/dev/null; then
    echo -e "${YELLOW}Warning: Could not update repo, continuing with current state${NC}"
fi
cd - > /dev/null
echo ""

if ! command -v rclone &> /dev/null; then
    echo -e "${RED}Error: rclone not found${NC}"
    echo "Install it from https://rclone.org/"
    exit 1
fi

if ! command -v jq &> /dev/null; then
    echo -e "${RED}Error: jq not found${NC}"
    echo "Install it via: brew install jq (macOS) or apt-get install jq (Linux)"
    exit 1
fi

# Check rclone config
if ! rclone config show r2 &> /dev/null; then
    echo -e "${YELLOW}Warning: rclone 'r2' remote not configured${NC}"
    echo "Please run: rclone config"
    echo "Create a new S3 remote with Cloudflare provider"
    echo ""
    echo "Make sure to add: no_check_bucket = true"
    exit 1
fi

# Fetch all tags from local repo
fetch_tags() {
    echo -e "${BLUE}Fetching all tags from local repo: $LOCAL_REPO${NC}" >&2

    cd "$LOCAL_REPO"

    # Get all tags and sort numerically
    git tag -l | grep -E '^[0-9]+$' | sort -n | jq -R . | jq -s 'sort_by(tonumber)'
}

# Fetch all existing files from R2 (run once)
fetch_existing_files() {
    echo -e "${BLUE}Fetching existing files from R2...${NC}" >&2
    # Use 'rclone ls' (fast) instead of 'lsjson' (slow) - just get filenames
    rclone ls "r2:$R2_BUCKET/$R2_PATH/data/" 2>/dev/null | awk '{print $2}' || echo ""
}

# Check if file exists in R2 (using cached list)
check_exists() {
    local tag="$1"
    local filename="${tag}.xml.gz"
    echo "$EXISTING_FILES" | grep -qx "$filename"
}

# Get commit for tag
get_commit() {
    local tag="$1"
    cd "$LOCAL_REPO"
    git rev-list -n1 "$tag"
}

# Generate .gz file for a tag
generate_tag() {
    local tag="$1"
    local index="$2"
    local total="$3"

    # Check if already exists in R2
    if check_exists "$tag"; then
        ((SKIP_COUNT++))
        return 0
    fi

    ((GENERATED_COUNT++))

    echo "[$index/$total] Generating: $tag"

    if [[ "$DRY_RUN" == true ]]; then
        return 0
    fi

    # Get commit
    local commit
    commit=$(get_commit "$tag")

    if [[ -z "$commit" ]]; then
        echo -e "${RED}  ❌ Failed to resolve commit for tag $tag${NC}"
        ((FAIL_COUNT++))
        return 1
    fi

    # Extract XML file from local repo
    cd "$LOCAL_REPO"
    if ! git show "$commit:$UPSTREAM_FILE" > "$OLDPWD/temp/${tag}.xml" 2>/dev/null; then
        echo -e "${RED}  ❌ Failed to read file for tag $tag${NC}"
        ((FAIL_COUNT++))
        cd - > /dev/null
        return 1
    fi
    cd - > /dev/null

    # Compress
    if ! gzip -c "temp/${tag}.xml" > "temp/${tag}.xml.gz" 2>/dev/null; then
        echo -e "${RED}  ❌ Failed to compress tag $tag${NC}"
        ((FAIL_COUNT++))
        rm -f "temp/${tag}.xml" "temp/${tag}.xml.gz"
        return 1
    fi

    rm -f "temp/${tag}.xml"
    ((SUCCESS_COUNT++))
}

# Main
main() {
    echo "========================================"
    echo "Sync All Tags to R2"
    echo "========================================"
    echo "Bucket: $R2_BUCKET"
    echo "Path: $R2_PATH"
    echo "Dry run: $DRY_RUN"
    echo "Source: Local repo at $LOCAL_REPO"
    echo ""

    # Create temp directory
    mkdir -p temp

    # Fetch existing files from R2 (once)
    EXISTING_FILES=$(fetch_existing_files)
    local existing_count
    existing_count=$(echo "$EXISTING_FILES" | grep -c . || echo "0")
    echo "Found $existing_count existing files in R2"
    echo ""

    # Fetch tags
    local tags_json
    tags_json=$(fetch_tags)
    TOTAL_COUNT=$(echo "$tags_json" | jq 'length')

    echo "Total tags to process: $TOTAL_COUNT"
    echo "First 5: $(echo "$tags_json" | jq -r '.[:5] | join(", ")')"
    echo "Last 5: $(echo "$tags_json" | jq -r '.[-5:] | join(", ")')"
    echo ""

    if [[ "$DRY_RUN" == true ]]; then
        echo -e "${BLUE}DRY RUN MODE - No files will be generated or uploaded${NC}"
        echo ""
    fi

    # Phase 1: Generate all .gz files
    echo "========================================"
    echo "Phase 1: Generating .gz files"
    echo "========================================"

    for i in $(seq 0 $((TOTAL_COUNT - 1))); do
        local tag
        tag=$(echo "$tags_json" | jq -r ".[$i]")
        local index=$((i + 1))

        generate_tag "$tag" "$index" "$TOTAL_COUNT" || true
    done

    echo ""
    echo "Generated: $SUCCESS_COUNT, Skipped (exists): $SKIP_COUNT, Failed: $FAIL_COUNT"
    echo ""

    # Phase 2: Upload all files in one rclone command
    local upload_success=false
    if [[ "$DRY_RUN" == false ]] && [[ "$SUCCESS_COUNT" -gt 0 ]]; then
        echo "========================================"
        echo "Phase 2: Uploading to R2"
        echo "========================================"

        echo "Uploading all files with rclone..."
        if rclone copy "temp/" "r2:$R2_BUCKET/$R2_PATH/data/" --progress --transfers 8 --exclude ".DS_Store"; then
            echo -e "${GREEN}✅ Upload complete${NC}"
            upload_success=true
        else
            echo -e "${RED}❌ Upload failed${NC}"
        fi
    elif [[ "$SUCCESS_COUNT" -eq 0 ]]; then
        echo "No new files to upload"
    fi

    # Phase 3: Update state.json
    if [[ "$upload_success" == true ]] && [[ "$DRY_RUN" == false ]]; then
        echo ""
        echo "========================================"
        echo "Phase 3: Updating state.json"
        echo "========================================"

        # Get the latest tag (last in the sorted list)
        local last_tag
        last_tag=$(echo "$tags_json" | jq -r '.[-1]')
        local last_commit
        last_commit=$(get_commit "$last_tag")

        # Fetch existing state for history preservation
        local existing_state
        existing_state=$(rclone cat "r2:$R2_BUCKET/$R2_PATH/state.json" 2>/dev/null || echo '{"history":[]}')

        # Validate existing state
        if ! echo "$existing_state" | jq empty 2>/dev/null; then
            existing_state='{"history":[]}'
        fi

        # Build new state
        jq -n \
            --arg tag "$last_tag" \
            --arg commit "$last_commit" \
            --arg short "${last_commit:0:7}" \
            --arg synced_at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
            --arg type "bulk" \
            --argjson count "$SUCCESS_COUNT" \
            --argjson existing "$existing_state" \
            '{
                tag: $tag,
                commit: $commit,
                short: $short,
                synced_at: $synced_at,
                type: $type,
                file_count: $count,
                history: ([{
                    tag: $tag,
                    commit: $commit,
                    type: $type,
                    date: $synced_at,
                    count: $count
                }] + ($existing.history // []))[:50]
            }' > state.json

        if rclone copyto state.json "r2:$R2_BUCKET/$R2_PATH/state.json" 2>/dev/null; then
            echo -e "${GREEN}✅ State updated${NC}"
        else
            echo -e "${YELLOW}⚠️  Failed to update state${NC}"
        fi

        rm -f state.json
    fi

    # Cleanup
    rm -rf temp

    # Summary
    echo ""
    echo "========================================"
    echo -e "${GREEN}Sync Complete!${NC}"
    echo "========================================"
    echo -e "Generated: ${GREEN}$SUCCESS_COUNT${NC}"
    echo -e "Skipped:   ${YELLOW}$SKIP_COUNT${NC}"
    echo -e "Failed:    ${RED}$FAIL_COUNT${NC}"
    echo "========================================"
}

# Run
main "$@"
