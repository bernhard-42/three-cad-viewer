import process from 'process'
import os from 'os'
import resolve from '@rollup/plugin-node-resolve';
import css from 'rollup-plugin-import-css'
import svg from 'rollup-plugin-svg-import';
import { terser } from 'rollup-plugin-terser';
import serve from 'rollup-plugin-serve'
import livereload from 'rollup-plugin-livereload'


const default_plugins = [
    resolve(),
    css(),
    svg({ stringify: true })
]

var config;

if (process.env.BUILD === 'production') {
    config = [
        {
            input: 'src/index.js',
            plugins: [
                ...default_plugins,
            ],
            output: {
                format: 'esm',
                file: 'dist/three-cad-viewer.module.js',
            }
        },
        {
            input: 'src/index.js',
            plugins: [
                ...default_plugins
            ],
            output: {
                format: 'umd',
                name: "CadCViewer",
                file: 'dist/three-cad-viewer.js',
                indent: '\t'
            }
        },
        {
            input: 'src/index.js',
            plugins: [
                ...default_plugins,
                terser(),
            ],
            output: {
                format: 'umd',
                name: "CadCViewer",
                file: 'dist/three-cad-viewer.min.js',
            }
        },
    ];
} else {
    config = {
        input: 'src/index.js',
        plugins: [
            ...default_plugins,
            serve({
                host: os.hostname(),
                port: 8082,
            }),
            livereload()
        ],
        output: {
            format: 'esm',
            file: 'dist/three-cad-viewer.module.js',
        }
    }
}

export default config