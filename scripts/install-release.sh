#!/usr/bin/env bash
# Backward-compatible wrapper — use scripts/goldbuslight-pi.sh directly.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$SCRIPT_DIR/goldbuslight-pi.sh" update "$@"
