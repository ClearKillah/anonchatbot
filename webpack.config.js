const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const webpack = require('webpack');
const dotenv = require('dotenv');

// Загружаем переменные окружения из .env
const env = dotenv.config().parsed || {};

// Создаем объект с переменными для клиента
const clientEnv = {
  'process.env.FIREBASE_PROJECT_ID': JSON.stringify(env.FIREBASE_PROJECT_ID || 'sdnfjsidf'),
  'process.env.FIREBASE_DATABASE_URL': JSON.stringify(env.FIREBASE_DATABASE_URL || 'https://sdnfjsidf.firebaseio.com')
};

module.exports = {
  entry: './src/index.js',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'bundle.[contenthash].js',
    publicPath: '/'
  },
  module: {
    rules: [
      {
        test: /\.(js|jsx)$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env', '@babel/preset-react']
          }
        }
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader']
      }
    ]
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './public/index.html'
    }),
    // Добавляем плагин DefinePlugin для замены переменных окружения
    new webpack.DefinePlugin(clientEnv)
  ],
  resolve: {
    extensions: ['.js', '.jsx']
  },
  performance: {
    hints: false
  }
}; 