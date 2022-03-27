To release a new version, call:

1. Clean dist folder

   ```shell
   yarn run clean
   ```

2. Build package

   Edit version in package.json and index.html

   ```shell
   yarn run build
   ```

3. Create docs

   ```shell
   yarn run docs
   ```

4. Publish package

   ```shell
   npm publish
   ```

5. Push release, e.g. 1.2.5

   Ensure GITHUB_TOKEN is set!

   ```shell
   yarn run release
   ```
