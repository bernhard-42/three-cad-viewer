import process from "process";
import resolve from "@rollup/plugin-node-resolve";
import css from "rollup-plugin-import-css";
import terser from "@rollup/plugin-terser";
import serve from "rollup-plugin-serve";
import livereload from "rollup-plugin-livereload";
import image from "@rollup/plugin-image";
import { string } from "rollup-plugin-string";
import postcss from "rollup-plugin-postcss";
import url from "postcss-url";

const pkg = {
  main: "dist/three-cad-viewer.js",
  module: "dist/three-cad-viewer.esm.js",
};

function addMin(name) {
  return `${name.slice(0, -3)}.min.js`;
}

const umdName = "CadViewer";

const default_plugins = [
  postcss({
    plugins: [
      url({
        url: "inline", // inline all files as data URI
        maxSize: 10, // KB limit for inlining files (optional, defaults to 14kb)
        fallback: "copy", // if file too large, falls back to copy
      }),
    ],
    extract: "three-cad-viewer.css", // or your desired filename
  }),
  resolve(),
  css({ output: "three-cad-viewer.css" }),
  image(),
  string({ include: "src/index.html" }),
];

var config;

if (process.env.BUILD === "production") {
  config = [
    {
      input: "src/index.js",
      plugins: [...default_plugins],
      output: [
        {
          format: "es",
          file: pkg.module,
        },
        {
          format: "umd",
          name: umdName,
          file: pkg.main,
        },
      ],
    },
    {
      input: "src/index.js",
      plugins: [...default_plugins, terser()],
      output: [
        {
          format: "es",
          file: addMin(pkg.module),
        },
        {
          format: "umd",
          name: umdName,
          file: addMin(pkg.main),
        },
      ],
    },
  ];
} else {
  config = {
    input: "src/index.js",
    plugins: [
      ...default_plugins,
      serve({
        host: "localhost",
        port: 8082,
      }),
      livereload(),
    ],
    output: {
      format: "es",
      file: pkg.module,
    },
  };
}

export default config;
