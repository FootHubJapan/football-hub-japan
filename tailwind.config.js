/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./public/**/*.html",
    "./public/**/*.js",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        "primary": "#00bdc7",
        "dark-pro": "#0f172a",
        "slate-900": "#0f172a",
        "slate-800": "#1e293b",
        "var-blue": "#3b82f6",
        "goal-gold": "#fbbf24",
        "card-yellow": "#fbbf24",
        "card-red": "#ef4444",
        "sub-in": "#22c55e",
        "sub-out": "#ef4444"
      },
      fontFamily: {
        "sans": ["Inter", "Noto Sans", "sans-serif"]
      }
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/container-queries'),
  ],
}
