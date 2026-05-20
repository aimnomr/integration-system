/**
 * Branding — single source of truth for the visual identity of the app.
 *
 * Tailwind reads this at build time via tailwind.config.ts; MUI reads it at
 * runtime when AppProviders builds the theme. Change the values here and the
 * whole UI updates — the AppBar title, the favicon caption, the colour
 * palette, the dark/light bias.
 *
 * Palette inherits the previous-generation interface (dark gray surfaces +
 * indigo accent) so the v2 looks familiar to existing operators.
 */
export const BRAND = {
  appName: import.meta.env.VITE_APP_NAME || 'AMR Console',
  logoPath: '/logo.svg',

  // Accent colours (used by AppBar buttons, focus rings, nav highlights).
  primary: '#6366f1', // indigo-500
  secondary: '#a855f7', // purple-500
  accent: '#06b6d4', // cyan-500

  // Surface tiers (background depth). 0 = page, 1 = panels, 2 = elevated cards.
  surface: {
    0: '#0f172a', // slate-900
    1: '#1e293b', // slate-800
    2: '#334155', // slate-700
  },

  // Status colours used by StatusPill.
  status: {
    ok: '#22c55e', // green-500
    warn: '#eab308', // yellow-500
    error: '#ef4444', // red-500
    idle: '#64748b', // slate-500
  },

  // Layout
  navWidth: 240, // px when expanded
  navWidthCollapsed: 64, // px when collapsed
  appBarHeight: 56, // px
} as const;

export type Brand = typeof BRAND;
