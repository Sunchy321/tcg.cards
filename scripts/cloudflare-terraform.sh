#!/usr/bin/env bash
set -euo pipefail

if [[ $# -eq 0 ]]; then
  echo "Usage: bun run cloudflare:terraform -- <terraform arguments>" >&2
  echo "Example: bun run cloudflare:terraform -- plan -out=rate-limits.tfplan" >&2
  exit 2
fi

if ! command -v terraform >/dev/null 2>&1; then
  echo "Terraform CLI is not installed or is not on PATH." >&2
  exit 127
fi

if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
  if [[ ! -t 0 ]]; then
    echo "CLOUDFLARE_API_TOKEN is required. Run this command in an interactive terminal." >&2
    exit 2
  fi

  read -r -s -p "Cloudflare API Token: " CLOUDFLARE_API_TOKEN
  printf '\n'
  if [[ -z "$CLOUDFLARE_API_TOKEN" ]]; then
    echo "Cloudflare API Token cannot be empty." >&2
    exit 2
  fi
  export CLOUDFLARE_API_TOKEN
fi

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"

exec terraform "-chdir=$PROJECT_ROOT/infra/cloudflare" "$@"
