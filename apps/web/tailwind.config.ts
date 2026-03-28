import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  "#f5eeff",
          100: "#e9d8ff",
          200: "#d3b0ff",
          500: "#7c3aad",
          600: "#4A0E78",
          700: "#3a0b5e",
          900: "#1e0033",
        },
        accent: {
          50:  "#fff7ed",
          100: "#ffe8c8",
          200: "#ffd08a",
          500: "#FF8C00",
          600: "#e07800",
          700: "#b85f00",
          900: "#6b3600",
        },
        surface: {
          DEFAULT: "#ffffff",
          muted:   "#faf8fc",
          border:  "#e4dced",
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
