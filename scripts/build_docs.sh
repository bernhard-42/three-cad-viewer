#!/bin/bash
cd "$(dirname "$0")/.."

rm -fr docs
npx typedoc --out docs --readme Readme.md --entryPoints src/core/viewer.ts src/core/types.ts src/ui/display.ts src/camera/camera.ts src/camera/controls.ts
mkdir -p docs/dist
cp dist/three-cad-viewer.css dist/three-cad-viewer.esm.js docs/dist
cp -R examples docs
cp index.html docs/example.html
