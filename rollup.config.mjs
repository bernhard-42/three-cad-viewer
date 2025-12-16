import process from "process";
import resolve from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";
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
const sourcemap = process.env.SOURCEMAP !== "false"; // Enable by default

const default_plugins = [
  typescript({
    tsconfig: "./tsconfig.json",
    declaration: true,
    declarationDir: "./dist",
  }),
  postcss({
    plugins: [
      url({
        url: "inline", // inline all files as data URI
        maxSize: 10, // KB limit for inlining files (optional, defaults to 14kb)
        fallback: "copy", // if file too large, falls back to copy
      }),
    ],
    extract: "three-cad-viewer.css",
  }),
  resolve(),
  image(),
  string({ include: "src/ui/index.html" }),
];

var config;

if (process.env.BUILD === "production") {
  config = [
    {
      input: "src/index.ts",
      plugins: [...default_plugins],
      output: [
        {
          format: "es",
          file: pkg.module,
          sourcemap,
        },
        {
          format: "umd",
          name: umdName,
          file: pkg.main,
          sourcemap,
        },
      ],
    },
    {
      input: "src/index.ts",
      plugins: [...default_plugins, terser()],
      output: [
        {
          format: "es",
          file: addMin(pkg.module),
          sourcemap,
        },
        {
          format: "umd",
          name: umdName,
          file: addMin(pkg.main),
          sourcemap,
        },
      ],
    },
  ];
} else {
  config = {
    input: "src/index.ts",
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
      sourcemap: "inline",
    },
  };
}

export default config;
