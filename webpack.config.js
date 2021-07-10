const path = require('path');
const { mainModule } = require('process');

const isProduction = process.env.NODE_ENV == 'production';

const config = {
    entry: './src/index.js',
    devtool: false,
    output: {
        filename: "main.js",
        path: path.resolve(__dirname, 'dist'),
    },
    devServer: {
        open: true,
        host: process.env.WEBPACK_HOST ? process.env.WEBPACK_HOST : "localhost",
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
