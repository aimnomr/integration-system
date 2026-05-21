import { test, expect } from '@playwright/test';

// Phase 9 G18 / Phase 10 — CORS verified from the browser's perspective.
// Newman covers the response-header shape; here we confirm that, with the
// app running on :5173, *no* console error mentions CORS.

test('no CORS errors in the browser console after AppShell loads', async ({ page }) => {
  const corsHits: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' && /CORS/i.test(msg.text())) corsHits.push(msg.text());
  });
  page.on('pageerror', (err) => {
    if (/CORS/i.test(err.message)) corsHits.push(err.message);
  });
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  expect(corsHits, `console errors mentioning CORS:\n${corsHits.join('\n')}`).toHaveLength(0);
});
