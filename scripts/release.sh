#!/bin/bash
cd "$(dirname "$0")/.."

CURRENT_VERSION=$(jq -r .version package.json)

echo "v$CURRENT_VERSION"

echo "pushing this release"
git tag "v$CURRENT_VERSION"
git push
git push --tags

echo "creating github release"

gh release create "v$CURRENT_VERSION" \
    --title "three-cad-viewer-$CURRENT_VERSION" \
    --notes "v$CURRENT_VERSION" \
    --target master \
    dist/three-cad-viewer.js \
    dist/three-cad-viewer.min.js \
    dist/three-cad-viewer.esm.js \
    dist/three-cad-viewer.esm.min.js \
    dist/three-cad-viewer.css
