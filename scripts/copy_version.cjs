const path = require("path");
const rootDir = path.join(__dirname, "..");
const { version } = require(path.join(rootDir, "package.json"));
require("fs").writeFileSync(
  path.join(rootDir, "src/_version.ts"),
  `export const version: string = "${version}";\n`,
);
