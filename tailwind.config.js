/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'bounce-in': 'bounceIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
        'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'spin-slow': 'spin 8s linear infinite',
        'speak': 'speak 0.4s ease-in-out infinite alternate',
        'listen': 'listen 1.5s ease-in-out infinite alternate',
        'blink': 'blink 3s ease-in-out infinite',
        'wave-1': 'wave 0.5s ease-in-out infinite alternate',
        'wave-2': 'wave 0.7s ease-in-out infinite alternate',
        'wave-3': 'wave 0.6s ease-in-out infinite alternate',
        'bounce-delay-1': 'bounceDelay 1.4s ease-in-out infinite',
        'bounce-delay-2': 'bounceDelay 1.4s ease-in-out 0.2s infinite',
        'bounce-delay-3': 'bounceDelay 1.4s ease-in-out 0.4s infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        bounceIn: {
          '0%': { opacity: '0', transform: 'scale(0.3)' },
          '50%': { opacity: '1', transform: 'scale(1.05)' },
          '100%': { transform: 'scale(1)' },
        },
        speak: {
          '0%': { transform: 'scale(1)' },
          '100%': { transform: 'scale(1.04)' },
        },
        listen: {
          '0%': { transform: 'scale(1)' },
          '100%': { transform: 'scale(1.02)' },
        },
        blink: {
          '0%, 90%, 100%': { transform: 'scaleY(1)' },
          '95%': { transform: 'scaleY(0.1)' },
        },
        wave: {
          '0%': { transform: 'scaleY(0.3)' },
          '100%': { transform: 'scaleY(1)' },
        },
        bounceDelay: {
          '0%, 80%, 100%': { transform: 'translateY(0)', opacity: '0.5' },
          '40%': { transform: 'translateY(-6px)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
};
