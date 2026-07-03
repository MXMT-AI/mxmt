import type { Config } from "tailwindcss";

export default {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: "#0f1419",
          2: "#161d26",
        },
        accent: {
          cyan: "#00e5c4",
          orange: "#ff6b35",
          purple: "#a78bfa",
          yellow: "#fbbf24",
        },
      },
    },
  },
  plugins: [require("@tailwindcss/forms")],
} satisfies Config;
