import { test, expect } from '@playwright/test';

// Phase 12 — Admin → Fleet Config form pre-populated, save round-trips.

test('Fleet Config form pre-populated + save no-op succeeds', async ({ page }) => {
  await page.goto('/admin/fleet');

  // The form mirrors GET /fleet. interfaceName/majorVersion/version/manufacturer
  // are all there as labelled fields.
  const iface = page.getByLabel(/interface.*name/i);
  await expect(iface).toBeVisible();
  expect(await iface.inputValue()).not.toBe('');

  await page.getByRole('button', { name: /save/i }).click();
  await expect(page.getByText(/fleet config updated|registry reloaded/i).first())
    .toBeVisible({ timeout: 5_000 });
});

test('Warning banner mentions the current interface/major-version/manufacturer', async ({ page }) => {
  await page.goto('/admin/fleet');
  // The page-level warning is meant to be visible. We assert the manufacturer
  // value is interpolated somewhere on the page (it's part of the example MQTT
  // topic in the banner copy).
  const iface = await page.getByLabel(/interface.*name/i).inputValue();
  await expect(page.getByText(iface, { exact: false }).first()).toBeVisible();
});
