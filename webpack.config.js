const path = require('path');
const os = require('os');
const { mainModule } = require('process');
const LicenseWebpackPlugin = require('license-webpack-plugin').LicenseWebpackPlugin;

const isProduction = process.env.NODE_ENV == 'production';

const config = {
    entry: './src/index.js',
    output: {
        path: path.resolve(__dirname, 'dist'),
        library: "CadViewer"
    },
    devServer: {
        open: true,
        host: os.hostname(),
        port: 8083,
    },
    plugins: [
        new LicenseWebpackPlugin({
            stats: {
                warnings: true,
                errors: true
            },
            unacceptableLicenseTest: (licenseType) => (licenseType === 'GPL')
        })
    ],
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
        config.output.filename = '[name].min.js'
    } else {
        config.mode = 'development';
        config.output.filename = '[name].js'
    }
    return config;
};