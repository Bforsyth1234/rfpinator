import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#FFF3ED",
          100: "#FFE0CC",
          200: "#FFC49E",
          500: "#FF6B35",
          600: "#E85A24",
          700: "#C44A18",
          900: "#7C2D12",
          primary: "#FF6B35",
        },
        accent: {
          50: "#F0EDFF",
          100: "#DDD6FE",
          200: "#C4B5FD",
          500: "#7B68EE",
          600: "#6A55E0",
          700: "#5B45C9",
          900: "#3B2D7E",
          primary: "#7B68EE",
        },
        surface: {
          DEFAULT: "#ffffff",
          muted: "#f8fafc",
          border: "#e2e8f0",
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

