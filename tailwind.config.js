const withBrandOpacity = (cssVariable) => ({ opacityValue }) => {
  if (opacityValue === undefined) {
    return `var(${cssVariable})`;
  }

  const parsed = Number(opacityValue);
  if (Number.isNaN(parsed)) {
    return `var(${cssVariable})`;
  }

  const opacity = Math.max(0, Math.min(1, parsed));
  return `color-mix(in srgb, var(${cssVariable}) ${opacity * 100}%, transparent)`;
};

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50: withBrandOpacity('--brand-50'),
          100: withBrandOpacity('--brand-100'),
          200: withBrandOpacity('--brand-200'),
          300: withBrandOpacity('--brand-300'),
          400: withBrandOpacity('--brand-400'),
          500: withBrandOpacity('--brand-500'),
          600: withBrandOpacity('--brand-600'),
          700: withBrandOpacity('--brand-700'),
          800: withBrandOpacity('--brand-800'),
          900: withBrandOpacity('--brand-900'),
          950: withBrandOpacity('--brand-950'),
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Menlo', 'monospace'],
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
        'glow-pulse': {
          '0%, 100%': { boxShadow: '0 0 4px currentColor' },
          '50%': { boxShadow: '0 0 12px currentColor, 0 0 20px currentColor' },
        },
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'spin-slow': 'spin 2s linear infinite',
        'float': 'float 3s ease-in-out infinite',
        'glow-pulse': 'glow-pulse 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
