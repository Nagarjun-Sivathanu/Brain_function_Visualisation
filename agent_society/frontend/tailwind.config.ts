import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      fontFamily: {
        pixel: ["var(--font-pixel)", "monospace"],
      },
      colors: {
        office: {
          bg: "#0f172a",
          floor: "#1e293b",
          wall: "#334155",
          accent: "#475569",
        },
      },
    },
  },
  plugins: [],
};

export default config;
