#!/bin/bash
cd "$(dirname "$0")/.."

rm -fr docs
mkdir -p docs/dist
jsdoc -d docs -R Readme.md src/core/viewer.ts src/core/types.ts src/ui/display.ts src/camera/camera.ts src/camera/controls.ts
cp dist/three-cad-viewer.css dist/three-cad-viewer.esm.js docs/dist
cp -R examples docs
cp index.html docs/example.html
