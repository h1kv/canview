/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html"],
  theme: {
    extend: {
      colors: {
        bg: "var(--color-bg)",
        surface: "var(--color-surface)",
        "surface-alt": "var(--color-surface-alt)",
        accent: "var(--color-accent)",
        "accent-dark": "var(--color-accent-dark)",
        text: "var(--color-text)",
        muted: "var(--color-muted)",
        border: "var(--color-border)",
        award: "var(--color-award)",
        link: "var(--color-link)",
        "link-hover": "var(--color-link-hover)"
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"]
      },
      fontSize: {
        base: "var(--text-base)",
        lg: "var(--text-lg)",
        xl: "var(--text-xl)",
        "2xl": "var(--text-2xl)",
        "3xl": "var(--text-3xl)"
      },
      fontWeight: {
        semibold: "var(--font-semibold)",
        bold: "var(--font-bold)"
      },
      spacing: {
        1: "var(--space-1)",
        2: "var(--space-2)",
        3: "var(--space-3)",
        4: "var(--space-4)",
        6: "var(--space-6)",
        8: "var(--space-8)",
        12: "var(--space-12)"
      },
      borderRadius: {
        radius: "var(--radius)",
        "radius-sm": "var(--radius-sm)"
      },
      boxShadow: {
        DEFAULT: "var(--shadow)",
        card: "var(--shadow)",
        lg: "0 18px 40px rgba(8, 13, 24, 0.28)"
      },
      maxWidth: {
        portfolio: "900px"
      },
      transitionTimingFunction: {
        smooth: "cubic-bezier(0.22, 1, 0.36, 1)"
      }
    }
  },
  plugins: []
};


