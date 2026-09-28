#!/usr/bin/env bash
# Build the Chrome Web Store upload: dist/markup-<version>.zip with only the runtime files.
set -euo pipefail
cd "$(dirname "$0")/.."

version=$(python3 -c "import json; print(json.load(open('manifest.json'))['version'])")
out="dist/markup-${version}.zip"
files=(manifest.json background.js content.js vendor/liquid-glass.js vendor/LICENSE-liquid-glass LICENSE icons/icon-16.png icons/icon-32.png icons/icon-48.png icons/icon-128.png)

for f in "${files[@]}"; do
  [[ -f "$f" ]] || { echo "missing: $f" >&2; exit 1; }
done
node --check background.js
node --check content.js
node --check vendor/liquid-glass.js

mkdir -p dist
rm -f "$out"
zip -q -X "$out" "${files[@]}"
echo "$out ($(du -h "$out" | cut -f1 | tr -d ' '))"
unzip -l "$out" | tail -n +4 | sed '$d' | sed '$d' | awk '{print "  " $4}'
