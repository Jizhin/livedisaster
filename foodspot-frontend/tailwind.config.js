/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        fs: {
          bg: '#FAF7F2',
          surface: '#FFFFFF',
          orange: '#C2410C',
          amber: '#D97706',
          text: '#18181B',
          muted: '#78716C',
          border: '#E7E5E4',
          success: '#4D7C0F',
        },
      },
      fontFamily: {
        sans: ['Manrope', 'Inter', 'sans-serif'],
      },
      keyframes: {
        breathe: {
          '0%, 100%': {
            transform: 'scale(1)',
            boxShadow: '0 0 0 8px rgba(217,119,6,0.16), 0 0 0 18px rgba(217,119,6,0.08), 0 28px 90px rgba(194,65,12,0.48), 0 10px 35px rgba(194,65,12,0.30)',
          },
          '50%': {
            transform: 'scale(1.03)',
            boxShadow: '0 0 0 14px rgba(217,119,6,0.22), 0 0 0 28px rgba(217,119,6,0.10), 0 36px 110px rgba(194,65,12,0.58), 0 14px 44px rgba(194,65,12,0.38)',
          },
        },
        bounceSlow: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(8px)' },
        },
        floatA: {
          '0%, 100%': { transform: 'translateY(0) rotate(-3deg)' },
          '50%': { transform: 'translateY(-14px) rotate(4deg)' },
        },
        floatB: {
          '0%, 100%': { transform: 'translateY(0) rotate(2deg)' },
          '50%': { transform: 'translateY(-10px) rotate(-5deg)' },
        },
        ringPulse: {
          '0%, 100%': { transform: 'scale(1)', opacity: '0.5' },
          '50%': { transform: 'scale(1.07)', opacity: '0.12' },
        },
        countUp: {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        breathe: 'breathe 3.5s ease-in-out infinite',
        'bounce-slow': 'bounceSlow 2s ease-in-out infinite',
        'float-a': 'floatA 6s ease-in-out infinite',
        'float-b': 'floatB 7.5s ease-in-out infinite',
        'ring-pulse': 'ringPulse 3s ease-in-out infinite',
        'count-up': 'countUp 0.6s ease-out forwards',
      },
    },
  },
  plugins: [],
}
