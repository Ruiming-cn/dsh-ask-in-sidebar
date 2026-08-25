#!/bin/bash
# dsh-ask-in-sidebar build: copy plain-JS source into lib/.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
node scripts/build.mjs
echo "Build complete"
