import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#FFF3ED",
          100: "#FFE4D4",
          200: "#FFC5A3",
          500: "#FF8C5A",
          600: "#FF6B35",
          700: "#E5551F",
          900: "#8B3315",
          primary: "#FF6B35",
        },
        accent: {
          50: "#FFFBEB",
          100: "#FFF3C4",
          200: "#FFEB99",
          500: "#FFD93D",
          600: "#F5C800",
          700: "#D4A800",
          800: "#A68500",
        },
        surface: {
          DEFAULT: "#ffffff",
          muted: "#FFFAF5",
          border: "#F0E0D0",
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

