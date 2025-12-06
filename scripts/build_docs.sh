#!/bin/bash
cd "$(dirname "$0")/.."

rm -fr docs
mkdir -p docs/dist
jsdoc -d docs -R Readme.md src/camera.js src/controls.js src/viewer.js src/display.js src/types.js
cp dist/three-cad-viewer.css dist/three-cad-viewer.esm.js docs/dist
cp -R examples docs
cp index.html docs/example.html
