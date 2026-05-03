import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "#18181b",
        "on-primary": "#ffffff",
        "accent-blue": "#2563eb",
        ink: "#09090b",
        "ink-muted": "#71717a",
        canvas: "#ffffff",
        "surface-1": "#fafafa",
        "surface-2": "#f4f4f5",
        hairline: "#e4e4e7",
        "hairline-soft": "#f4f4f5",
        "inverse-canvas": "#09090b",
        "inverse-ink": "#ffffff",
        "gradient-magenta": "#fbcfe8", // Lighter pastel for light mode
        "gradient-violet": "#ddd6fe",
        "gradient-orange": "#fed7aa",
        "gradient-coral": "#fecdd3",
        "semantic-success": "#16a34a",
      },
      fontFamily: {
        sans: ["var(--font-plus-jakarta)", "sans-serif"],
        display: ["var(--font-plus-jakarta)", "sans-serif"],
      },
      fontSize: {
        "display-xxl": ["110px", { lineHeight: "1.0", letterSpacing: "-0.04em", fontWeight: "700" }],
        "display-xl": ["67px", { lineHeight: "1.1", letterSpacing: "-0.03em", fontWeight: "700" }], // GR: 16 * 1.618^3
        "display-lg": ["42px", { lineHeight: "1.15", letterSpacing: "-0.02em", fontWeight: "700" }], // GR: 16 * 1.618^2
        "display-md": ["32px", { lineHeight: "1.2", letterSpacing: "-0.01em", fontWeight: "600" }],
        headline: ["22px", { lineHeight: "1.3", letterSpacing: "0", fontWeight: "600" }],
        subhead: ["26px", { lineHeight: "1.3", letterSpacing: "0", fontWeight: "600" }], // GR: 16 * 1.618
        "body-lg": ["18px", { lineHeight: "1.5", letterSpacing: "0", fontWeight: "400" }],
        body: ["16px", { lineHeight: "1.5", letterSpacing: "0", fontWeight: "400" }], // Base
        "body-sm": ["14px", { lineHeight: "1.5", letterSpacing: "0", fontWeight: "500" }],
        caption: ["10px", { lineHeight: "1.5", letterSpacing: "0.02em", fontWeight: "500" }], // GR: 16 / 1.618
        micro: ["12px", { lineHeight: "1.5", letterSpacing: "0", fontWeight: "400" }],
        button: ["14px", { lineHeight: "1.0", letterSpacing: "0", fontWeight: "600" }],
      },
      borderRadius: {
        xs: "4px",
        sm: "6px",
        md: "10px",
        lg: "15px",
        xl: "20px",
        xxl: "30px",
        pill: "100px",
        full: "9999px",
      },
      spacing: {
        hair: "1px",
        xxs: "4px",
        xs: "8px",
        sm: "16px", // Base
        md: "26px", // GR
        lg: "42px", // GR
        xl: "68px", // GR
        xxl: "110px", // GR
        section: "110px",
      },
    },
  },
  plugins: [],
};
export default config;
