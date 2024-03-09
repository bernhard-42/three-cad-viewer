const { version } = require("./package.json");
require("fs").writeFileSync(
  "./src/_version.js",
  `export const version = "${version}";\n`,
);
