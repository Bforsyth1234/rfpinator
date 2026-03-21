/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@rfpinator/shared"],
  output: "standalone",
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // exceljs relies on Node.js stream/buffer polyfills that webpack 5
      // doesn't provide by default. Provide the necessary fallbacks so the
      // dynamic import("exceljs") can resolve at runtime in the browser.
      config.resolve.fallback = {
        ...config.resolve.fallback,
        stream: require.resolve("stream-browserify"),
        buffer: require.resolve("buffer/"),
        crypto: false,
        fs: false,
        path: false,
      };

      const webpack = require("webpack");
      config.plugins.push(
        new webpack.ProvidePlugin({
          Buffer: ["buffer", "Buffer"],
          process: "process/browser",
        }),
      );
    }
    return config;
  },
};

module.exports = nextConfig;

