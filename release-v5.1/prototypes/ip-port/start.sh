#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
if [[ ! -d ../../applaunchpad/node_modules/next ]]; then
  printf '%s\n' '请先执行：cd release-v5.1 && pnpm install --frozen-lockfile'
  exit 1
fi
if [[ ! -e node_modules ]]; then
  ln -s ../../applaunchpad/node_modules node_modules
fi
exec node node_modules/next/dist/bin/next dev -p 3218
