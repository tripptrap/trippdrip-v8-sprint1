import type { Config } from "tailwindcss";
const config: Config = {
  darkMode: 'class',
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      borderRadius: {
        // Tighter corners site-wide. `full` is untouched — pills, avatars,
        // and dots should stay circular, "sharper" only means the rectangular
        // card/button/modal radii.
        md: '4px',
        lg: '6px',
        xl: '8px',
        '2xl': '10px',
        '3xl': '14px',
      },
      colors: {
        // `sky` is the site's actual accent color everywhere (buttons, active
        // nav state, links, focus rings) — overridden here to a neutral grey
        // ramp instead of blue. Every existing bg-sky-*/text-sky-*/border-sky-*
        // class across the app picks this up automatically; no component
        // files were touched. Values are Tailwind's own `zinc` scale, chosen
        // so it stays visibly distinct in lightness from `slate` (the
        // neutral/background ramp) — otherwise active/selected states would
        // become indistinguishable from the page background.
        sky: {
          50: '#fafafa',
          100: '#f4f4f5',
          200: '#e4e4e7',
          300: '#d4d4d8',
          400: '#a1a1aa',
          500: '#71717a',
          600: '#52525b',
          700: '#3f3f46',
          800: '#27272a',
          900: '#18181b',
          950: '#09090b',
        },
        // `slate` is the site's actual page/card/border/text ramp everywhere
        // (dark:bg-slate-900 page bg, dark:bg-slate-800 cards, dark:border-
        // slate-700 borders, dark:text-slate-100/300/400 text). Overridden
        // here to the "near-black" theme the user picked from the theme-
        // comparison artifact: true near-black surfaces instead of Tailwind's
        // blue-tinted default. Light-mode stops (50-600) stay a light neutral
        // grey so light mode itself doesn't get pulled toward black; only the
        // dark-mode-relevant stops (700-950) are pushed to near-black.
        slate: {
          50: '#fafafa',
          100: '#f5f5f5',
          200: '#e5e5e5',
          300: '#d4d4d4',
          400: '#a3a3a3',
          500: '#737373',
          600: '#525252',
          700: '#262626',
          800: '#161616',
          900: '#0a0a0a',
          950: '#000000',
        },
        // Ocean Blue & Coral Theme
        primary: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#0ea5e9', // Main primary - Sky Blue
          600: '#0284c7',
          700: '#0369a1',
          800: '#075985',
          900: '#0c4a6e',
          950: '#082f49',
        },
        accent: {
          50: '#fff7ed',
          100: '#ffedd5',
          200: '#fed7aa',
          300: '#fdba74',
          400: '#fb923c', // Main accent - Coral
          500: '#f97316',
          600: '#ea580c',
          700: '#c2410c',
          800: '#9a3412',
          900: '#7c2d12',
          950: '#431407',
        },
        dark: {
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a', // Main dark - Slate
          950: '#020617',
        },
      },
    },
  },
  plugins: []
};
export default config;
