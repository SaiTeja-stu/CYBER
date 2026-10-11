/** @type {import('tailwindcss').Config} */

// Every colour is an RGB-channel CSS variable (see index.css), so the whole dashboard switches between the
// light theme (white + orange, default) and the dark theme (black + green) by flipping data-theme on <html>.
// Opacity modifiers such as bg-cyber-accent/10 keep working through <alpha-value>.
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;
const scale = (prefix, steps) => Object.fromEntries(steps.map((s) => [s, v(`${prefix}-${s}`)]));

export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // "white" is the strongest text colour: white on dark, ink on light.
        white: v('ink'),
        paper: v('paper'),
        cyber: {
          dark: v('bg'),
          panel: v('panel'),
          card: v('card'),
          border: v('border'),
          hover: v('hover'),
          accent: v('accent'),
          indigo: v('accent-2'),
          rose: v('danger'),
          amber: v('warn'),
          yellow: v('caution'),
          emerald: v('safe'),
        },
        slate: scale('slate', [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]),
        cyan: scale('cyan', [300, 400, 500]),
        red: scale('red', [200, 300, 400, 500]),
        emerald: scale('emerald', [300, 400, 500]),
        yellow: scale('yellow', [300, 400, 500]),
        amber: scale('amber', [200, 300, 400, 500]),
        orange: scale('orange', [400, 500]),
        purple: scale('purple', [400, 500]),
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        'cyber-glow': '0 8px 28px rgb(var(--accent) / 0.22)',
        'rose-glow': '0 0 18px rgb(var(--danger) / 0.16)',
        'amber-glow': '0 0 18px rgb(var(--warn) / 0.16)',
        'emerald-glow': '0 0 18px rgb(var(--safe) / 0.16)',
      },
    },
  },
  plugins: [],
};
