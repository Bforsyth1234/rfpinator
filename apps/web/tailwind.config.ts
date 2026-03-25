import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#faf5ff",
          100: "#f3e8ff",
          200: "#e9d5ff",
          500: "#a855f7",
          600: "#7c3aed",
          700: "#5b21b6",
          900: "#4c1d95",
        },
        secondary: {
          50: "#fffbeb",
          100: "#fef3c7",
          300: "#fcd34d",
          500: "#f59e0b",
          600: "#d97706",
          700: "#b45309",
        },
        surface: {
          DEFAULT: "#ffffff",
          muted: "#fafaf9",
          border: "#e7e5e4",
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

