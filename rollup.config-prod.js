import resolve from '@rollup/plugin-node-resolve';
import { terser } from 'rollup-plugin-terser';
import css from 'rollup-plugin-import-css'
import svg from 'rollup-plugin-svg-import';

const default_plugins = [
    resolve(),
    css(),
    svg({ stringify: true })
]

export default [
    {
        input: 'src/index.js',
        plugins: [
            ...default_plugins
        ],
        output: {
            file: 'dist/three-cad-viewer.module.js',
            format: 'esm',
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