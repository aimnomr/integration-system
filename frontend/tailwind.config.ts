import type { Config } from 'tailwindcss';
import { BRAND } from './src/branding/branding';

export default {
  // `important: 'html'` raises Tailwind utility specificity so they win
  // against MUI's component-internal styles. Required when mixing the two.
  important: 'html',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          primary: BRAND.primary,
          secondary: BRAND.secondary,
          accent: BRAND.accent,
        },
        surface: {
          0: BRAND.surface[0],
          1: BRAND.surface[1],
          2: BRAND.surface[2],
        },
      },
    },
  },
} satisfies Config;
