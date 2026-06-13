/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        themeBg: "var(--color-bg)",
        themeSidebar: "var(--color-sidebar)",
        themeCard: "var(--color-card)",
        themeBorder: "var(--color-border)",
        themeBubbleAi: "var(--color-bubble-ai)",
        themeTextPrimary: "var(--color-text-primary)",
        themeTextSecondary: "var(--color-text-secondary)",
        themeAccent: "var(--color-accent)",
        themeAccentHover: "var(--color-accent-hover)",
        themeAccentLight: "var(--color-accent-light)",
      },
      animation: {
        'pulse-subtle': 'pulseSubtle 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        pulseSubtle: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '.7' },
        }
      }
    },
  },
  plugins: [],
}
