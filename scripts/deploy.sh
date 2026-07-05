#!/bin/bash
# Build and deploy to GitHub Pages (gh-pages branch). Usage: npm run deploy
set -euo pipefail
cd "$(dirname "$0")/.."
npm run build
cd dist
git init -q && git checkout -qb gh-pages && git add -A && git commit -qm "deploy $(date -u +%Y-%m-%dT%H:%MZ)"
git push -f https://github.com/Asiantown/databallr-knockout.git gh-pages
rm -rf .git
echo "Deployed -> https://asiantown.github.io/databallr-knockout/"
