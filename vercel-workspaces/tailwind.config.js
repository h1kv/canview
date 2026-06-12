/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html"],
  theme: {
    extend: {
      colors: {
        background: "#F8FAFC",
        surface: "#FFFFFF",
        accent: {
          DEFAULT: "#2563EB",
          hover: "#3B82F6"
        },
        text: {
          DEFAULT: "#1E293B",
          muted: "#64748B"
        },
        divider: "#E2E8F0",
        hero: "#E0E7EF"
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"]
      },
      boxShadow: {
        surface: "0 2px 12px rgba(16, 30, 54, 0.06)",
        "surface-hover": "0 8px 24px rgba(16, 30, 54, 0.10)"
      },
      borderRadius: {
        card: "12px"
      },
      maxWidth: {
        content: "800px"
      },
      letterSpacing: {
        heading: "-0.01em"
      },
      backgroundImage: {
        "avatar-gradient": "linear-gradient(135deg, #2563EB 0%, #3B82F6 100%)",
        "hero-gradient": "linear-gradient(180deg, #F8FAFC 0%, #E0E7EF 100%)"
      }
    }
  },
  plugins: []
};


---

## Branch: Create Tailwind CSS File
