/** @type {import('tailwindcss').Config} */
// Dark only. Colours follow gustoaruba.com: near-black purple surfaces, Gusto gold accents.
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#07040d',
          900: '#0c0716',
          850: '#110a1e',
          800: '#160e26',
          700: '#211735',
          600: '#2e2247',
        },
        line: 'rgb(255 255 255 / 0.08)',
        gold: { DEFAULT: '#e4b11a', soft: '#f3cf5f', deep: '#b8890b' },
        purple: { DEFAULT: '#2b094c', deep: '#1a0530' },
        ok: '#5ee08a',
        warn: '#ffb648',
        bad: '#ff6b6b',
        mute: 'rgb(255 255 255 / 0.56)',
      },
      fontFamily: {
        sans: ['"Archivo Variable"', 'Archivo', 'system-ui', 'sans-serif'],
        display: ['"Syne Variable"', 'Syne', 'system-ui', 'sans-serif'],
      },
      borderRadius: { xl: '14px', '2xl': '20px' },
      boxShadow: {
        pop: '0 24px 60px -20px rgb(0 0 0 / 0.8), 0 0 0 1px rgb(255 255 255 / 0.08)',
      },
      keyframes: {
        'fade-up': { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'none' } },
        'sheet-up': { from: { transform: 'translateY(100%)' }, to: { transform: 'none' } },
        shimmer: { from: { backgroundPosition: '-200% 0' }, to: { backgroundPosition: '200% 0' } },
      },
      animation: {
        'fade-up': 'fade-up .3s cubic-bezier(.2,.8,.2,1) both',
        'sheet-up': 'sheet-up .35s cubic-bezier(.2,.8,.2,1) both',
        shimmer: 'shimmer 1.6s linear infinite',
      },
    },
  },
  plugins: [],
};
