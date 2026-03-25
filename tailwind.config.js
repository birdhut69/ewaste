/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#edf9f5',
          100: '#d2f1e6',
          200: '#a8e2d0',
          300: '#73ceb3',
          400: '#39b592',
          500: '#00946c',
          600: '#007b5b',
          700: '#056f5c',
          800: '#0e5348',
          900: '#12353a'
        },
        accent: {
          50: '#ecf3ff',
          100: '#dbe9ff',
          200: '#bad2ff',
          300: '#8db2ff',
          400: '#5f8be7',
          500: '#2f5fb8',
          600: '#214a98',
          700: '#1b3c78',
          800: '#152f5c',
          900: '#101f3d'
        },
        role: {
          citizen: '#00946c',
          driver: '#1f5fae',
          pmc: '#734ab4'
        }
      },
      fontFamily: {
        sans: ['Manrope', 'system-ui', '-apple-system', 'sans-serif'],
        heading: ['Sora', 'Manrope', 'sans-serif']
      },
      borderRadius: {
        soft: '12px',
        panel: '18px',
        shell: '24px'
      },
      boxShadow: {
        soft: '0 8px 24px rgba(22, 44, 39, 0.07)',
        medium: '0 18px 44px rgba(22, 44, 39, 0.13)',
        glow: '0 14px 28px rgba(5, 111, 92, 0.26)'
      },
      animation: {
        'fade-in': 'fadeIn 0.45s cubic-bezier(0.22, 1, 0.36, 1)',
        'slide-up': 'slideUp 0.35s cubic-bezier(0.22, 1, 0.36, 1)',
        'slide-in-right': 'slideInRight 0.28s cubic-bezier(0.22, 1, 0.36, 1)',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'bounce-subtle': 'bounceSubtle 1s ease-in-out infinite'
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' }
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        },
        slideInRight: {
          '0%': { opacity: '0', transform: 'translateX(20px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' }
        },
        bounceSubtle: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-5px)' }
        }
      }
    }
  },
  plugins: []
}
