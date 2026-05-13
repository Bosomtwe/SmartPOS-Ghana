// tailwind.config.js
import forms from '@tailwindcss/forms';

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Primary Green Scale
        'primary': {
          DEFAULT: '#0F6B3E',
          light: '#1A8B54',
          dark: '#0A4F2E',
        },
        // Accent Gold
        'accent-gold': '#E6A817',
        // Neutral Grays (spec compliant)
        'neutral': {
          50: '#F9FAFB',
          100: '#F3F4F6',
          200: '#E5E7EB',
          500: '#6B7280',
          700: '#374151',
          900: '#111827',
        },
        // Semantic Colors
        'error': '#DC2626',
        'warning': '#F59E0B',
        'success': '#10B981',
        'info': '#3B82F6',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      borderRadius: {
        'xl': '12px',
        '2xl': '16px',
        '3xl': '20px',
        '4xl': '24px',
      },
      boxShadow: {
        'card': '0 4px 12px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.05)',
        'card-hover': '0 12px 24px rgba(0,0,0,0.08)',
        'button-primary': '0 2px 8px rgba(15,107,62,0.08)',
        'button-primary-hover': '0 8px 16px rgba(15,107,62,0.15)',
      },
      keyframes: {
        'fly-to-cart': {
          '0%': { transform: 'scale(1) translate(0, 0)', opacity: '1' },
          '100%': { transform: 'scale(0.2) translate(100px, -200px)', opacity: '0' },
        },
        'pulse-gentle': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
        'slide-up-fade': {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fly-to-cart': 'fly-to-cart 0.4s ease-out forwards',
        'pulse-gentle': 'pulse-gentle 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'slide-up-fade': 'slide-up-fade 0.2s ease-out',
      },
      transitionTimingFunction: {
        'in-out-custom': 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
      minHeight: {
        '12': '48px', // touch target minimum
      },
    },
  },
  plugins: [
    forms({ strategy: 'class' }),
  ],
};