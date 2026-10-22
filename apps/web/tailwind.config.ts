import type { Config } from 'tailwindcss';

const withVar = (name: string) => `hsl(var(${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: withVar('--bg'),
        surface: withVar('--surface'),
        'surface-2': withVar('--surface-2'),
        border: withVar('--border'),
        text: withVar('--text'),
        'text-dim': withVar('--text-dim'),
        accent: withVar('--accent'),
        'accent-2': withVar('--accent-2'),
        danger: withVar('--danger'),
      },
      borderColor: { DEFAULT: 'hsl(var(--border))' },
      fontFamily: {
        ui: 'var(--font-ui)',
        mono: 'var(--font-mono)',
      },
      keyframes: {
        'row-in': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-dot': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.35' },
        },
      },
      animation: {
        'row-in': 'row-in 0.28s ease both',
        'pulse-dot': 'pulse-dot 1.2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
} satisfies Config;
