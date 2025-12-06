const path = require("path");
const rootDir = path.join(__dirname, "..");
const { version } = require(path.join(rootDir, "package.json"));
require("fs").writeFileSync(
  path.join(rootDir, "src/_version.js"),
  `export const version = "${version}";\n`,
);
