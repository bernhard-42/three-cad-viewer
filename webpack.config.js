// const path = require('path');

module.exports = {
    entry: './src/index.js',
    // output: {
    //     filename: 'main.js',
    //     path: path.resolve(__dirname, 'dist'),
    // },
    target: false,
    // plugins: [
    //     WebExtensionTarget(nodeConfig)
    // ],
    resolve: {
        fallback: {
            "fs": false,
            "tls": false,
            "net": false,
            "path": false,
            "zlib": false,
            "http": false,
            "https": false,
            "stream": false,
            "crypto": false,
            "crypto-browserify": false,
            "util": false,
            "os": false,
            "buffer": false,
            "vm": false,
            "tty": require.resolve("tty-browserify"),
            "child_process": false,
            "worker_threads": false,
            "process": false,
            "pnpapi": false,
            "constants": false,
            "assert": false,
        }
    }
};