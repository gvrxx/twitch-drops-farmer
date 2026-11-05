#!/bin/bash
# macOS: double-click to install (first run) and start the farmer.
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 20 or newer is required. Get it from https://nodejs.org and try again."
  read -r -n 1 -p "Press any key to close."
  exit 1
fi
if [ ! -d node_modules ]; then npm install || { read -r -n 1 -p "Install failed. Press any key to close."; exit 1; }; fi
npx playwright install chromium || { read -r -n 1 -p "Browser download failed. Press any key to close."; exit 1; }
node src/index.js --open
