To release a new version, call:

1. Clean dist folder

   ```shell
   yarn run clean
   ```

2. Build package

   Edit version in `package.json` (the build script automatically updates `src/_version.js`)

   ```shell
   yarn run build
   ```

3. Run tests

   ```shell
   yarn test:run
   ```

4. Create docs

   ```shell
   yarn run docs
   ```

5. Publish package

   ```shell
   npm publish
   ```

6. Push release, e.g. 4.0.0

   Ensure GITHUB_TOKEN is set!

   ```shell
   yarn run release
   ```
