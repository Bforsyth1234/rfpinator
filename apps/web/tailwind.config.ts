import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#F7DC6F",
          100: "#F2C464",
          200: "#F0B27A",
          500: "#B8860B",
          600: "#A87333",
          700: "#8B4513",
          900: "#754975",
        },
        surface: {
          DEFAULT: "#2E8B57",
          muted: "#3E8E41",
          border: "#2F4F4F",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};

export default config;

