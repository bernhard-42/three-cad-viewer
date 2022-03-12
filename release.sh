#!/bin/bash
CURRENT_VERSION=$(cat package.json | jq -r .version)

echo v$CURRENT_VERSION

echo "pushing this release"
git tag v$CURRENT_VERSION
git push
git push --tags

echo "creating github release"

github-release release -u bernhard-42 -r three-cad-viewer -t v$CURRENT_VERSION -n three-cad-viewer-$CURRENT_VERSION
sleep 2
for f in dist/*; do
    echo $f
    github-release upload  -u bernhard-42 -r three-cad-viewer -t v$CURRENT_VERSION -n $(basename $f) -f $f
done
