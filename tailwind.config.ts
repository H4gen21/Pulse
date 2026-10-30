import type { Config } from "tailwindcss";

// Colors resolve to the CSS variables in app/globals.css, so light/dark/data-theme all apply.
const token = (name: string) => `var(--${name})`;

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./hooks/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: Object.fromEntries(
        [
          "bg", "surface", "surface-2", "ink", "muted", "line",
          "accent", "accent-hover", "on-accent", "accent-ink", "accent-soft",
          "pulse", "pulse-soft", "ok", "ok-soft",
          "card-dark", "card-grey", "card-mint",
        ].map((n) => [n, token(n)]),
      ),
      fontFamily: {
        sans: ["var(--font-figtree)", "Figtree", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
      borderRadius: { "r-lg": token("r-lg"), "r-md": token("r-md") },
      boxShadow: { soft: token("shadow") },
      screens: { xs: "360px" },
    },
  },
  plugins: [],
};
export default config;
