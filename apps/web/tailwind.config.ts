import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f5eeff",
          100: "#e8d5ff",
          200: "#d0aaff",
          500: "#7c3aad",
          600: "#5e1f8f",
          700: "#4a0e78",
          800: "#360a5c",
          900: "#220640",
        },
        accent: {
          50: "#fff7ed",
          100: "#ffedd5",
          200: "#fed7aa",
          400: "#fb923c",
          500: "#ff8c00",
          600: "#ea6c00",
          700: "#c45200",
          800: "#9a3d00",
        },
        surface: {
          DEFAULT: "#ffffff",
          muted: "#faf7ff",
          border: "#ddd0f0",
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
