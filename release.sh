#!/bin/bash
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
for f in dist/*; do
    echo $f
    github-release upload  -u bernhard-42 -r three-cad-viewer -t v$CURRENT_VERSION -n $(basename $f) -f $f
done
