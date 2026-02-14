#!/bin/bash
cd "$(dirname "$0")/.."

CURRENT_VERSION=$(cat package.json | jq -r .version)

if [[ "$GITHUB_TOKEN" == "" ]]; then
    echo "Set GITHUB_TOKEN first"
    exit 1
fi

echo v$CURRENT_VERSION

echo "pushing this release"
git tag v$CURRENT_VERSION
git push
git push --tags

echo "creating github release"

github-release release -u bernhard-42 -r three-cad-viewer -t v$CURRENT_VERSION -n three-cad-viewer-$CURRENT_VERSION
sleep 5

# Upload only the distributable bundles (not .d.ts folders)
RELEASE_FILES=(
    "dist/three-cad-viewer.js"
    "dist/three-cad-viewer.min.js"
    "dist/three-cad-viewer.esm.js"
    "dist/three-cad-viewer.esm.min.js"
    "dist/three-cad-viewer.css"
)

for f in "${RELEASE_FILES[@]}"; do
    echo $f
    github-release upload -u bernhard-42 -r three-cad-viewer -t v$CURRENT_VERSION -n $(basename $f) -f $f
done
