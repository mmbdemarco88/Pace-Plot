/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,html}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Plus Jakarta Sans', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      colors: {
        terracotta: {
          DEFAULT: '#E15A2B',
          hover: '#CD4C20',
          dark: '#B33C14',
          light: '#FAECE6',
        },
        obsidian: {
          900: '#121418',
          950: '#0B0C0E',
        },
        cream: {
          DEFAULT: '#FBF9F7',
          darker: '#F3EFEA',
        },
      },
      spacing: {
        '0.2': '0.05rem',
      },
      boxShadow: {
        xs: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
      },
    },
  },
  plugins: [],
};
