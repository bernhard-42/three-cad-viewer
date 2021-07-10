const path = require('path');
const os = require('os');
const { mainModule } = require('process');

const isProduction = process.env.NODE_ENV == 'production';

const config = {
    entry: './src/index.js',
    devtool: false,
    output: {
        filename: "main.js",
        path: path.resolve(__dirname, 'dist'),
        library: "CadViewer",
    },
    devServer: {
        open: true,
        host: os.hostname(),
        port: 8083,
    },
    plugins: [],
    module: {
        rules: [
            {
                test: /\.css$/i,
                use: ['style-loader', 'css-loader'],
            },
            {
                test: /\.(eot|svg|ttf|woff|woff2|png|jpg|gif)$/i,
                use: 'svg-inline-loader',
            }
        ]
    }
};

module.exports = () => {
    if (isProduction) {
        config.mode = 'production';
    } else {
        config.mode = 'development';
    }
    return config;
};