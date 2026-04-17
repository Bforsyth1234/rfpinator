/** @type {import('next').NextConfig} */
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

const nextConfig = {
  transpilePackages: ["@rfpinator/shared"],
  output: "standalone",

  async rewrites() {
    return [
      {
        source: "/query/:path*",
        destination: `${API_URL}/query/:path*`,
      },
      {
        source: "/ingestion/:path*",
        destination: `${API_URL}/ingestion/:path*`,
      },
      {
        source: "/evaluation/:path*",
        destination: `${API_URL}/evaluation/:path*`,
      },
    ];
  },

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
