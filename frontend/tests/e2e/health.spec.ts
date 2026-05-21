import { test, expect } from '@playwright/test';

// Phase 10 — Health page (non-robot). The pills themselves are exercised
// indirectly here; this test focuses on the dedicated Health screen showing
// one row per subsystem.

test('Health page lists every subsystem row', async ({ page }) => {
  await page.goto('/health');
  for (const label of ['FastAPI', 'MQTT', 'PostgreSQL', 'rosbridge', 'Node-RED']) {
    await expect(page.getByText(new RegExp(label, 'i')).first()).toBeVisible();
  }
});

test('FastAPI row shows a "Last response at" timestamp that updates', async ({ page }) => {
  await page.goto('/health');
  const stamp = page.getByText(/Last response at/i).first();
  await expect(stamp).toBeVisible();
  const initial = (await stamp.textContent()) ?? '';
  // Health polls /system/status every 5 s. The displayed time is
  // toLocaleTimeString() — second precision — so two polls landing in the
  // same wall-second produce identical strings. Poll until it changes,
  // with enough headroom for at least two cycles to roll over a second
  // boundary.
  await expect.poll(
    async () => (await stamp.textContent()) ?? '',
    { timeout: 20_000, intervals: [1_000, 2_000, 2_000] },
  ).not.toBe(initial);
});
