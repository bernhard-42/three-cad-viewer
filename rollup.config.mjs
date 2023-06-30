import process from "process";
import os from "os";
import resolve from "@rollup/plugin-node-resolve";
import css from "rollup-plugin-import-css";
import terser from "@rollup/plugin-terser";
import serve from "rollup-plugin-serve";
import livereload from "rollup-plugin-livereload";
import image from "@rollup/plugin-image";

const pkg = {
    "main": "dist/three-cad-viewer.js",
    "module": "dist/three-cad-viewer.esm.js"
};

function addMin(name) {
    return `${name.slice(0, -3)}.min.js`;
}

const umdName = "CadViewer";

const default_plugins = [
    resolve(),
    css({ output: "three-cad-viewer.esm.css" }),
    image(),
];

var config;

if (process.env.BUILD === "production") {
    config = [
        {
            input: "src/index.js",
            plugins: [
                ...default_plugins,
            ],
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
            ]
        },
        {
            input: "src/index.js",
            plugins: [
                ...default_plugins,
                terser(),
            ],
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
            ]
        },
    ];
} else {
    config = {
        input: "src/index.js",
        plugins: [
            ...default_plugins,
            serve({
                host: os.hostname(),
                port: 8082,
            }),
            livereload()
        ],
        output: {
            format: "es",
            file: pkg.module,
        }
    };
}

export default config;