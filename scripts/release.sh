#!/usr/bin/env bash
# Public source builds only; no upload, credentials, Git commits, or tagging.
set -euo pipefail
ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$ROOT_DIR"
pnpm build
pnpm package
