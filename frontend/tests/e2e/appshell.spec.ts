import { test, expect } from '@playwright/test';

// Phase 10 — AppShell + routing (non-robot items only).

test.describe('AppShell + routing', () => {
  test('AppBar renders with brand + 4 health pills', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('AMR Console')).toBeVisible();
    for (const label of ['API', 'MQTT', 'DB', 'ROS']) {
      // Each StatusPill renders its label as visible text.
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
    }
  });

  test('LeftNav swaps the main pane and updates URL', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Dispatch' }).click();
    await expect(page).toHaveURL(/\/dispatch$/);

    await page.getByRole('link', { name: 'Orders' }).click();
    await expect(page).toHaveURL(/\/orders$/);

    await page.getByRole('link', { name: 'Health' }).click();
    await expect(page).toHaveURL(/\/health$/);
  });

  test('unknown route renders the 404 page', async ({ page }) => {
    await page.goto('/this-is-not-a-route');
    await expect(page.getByText(/404/)).toBeVisible();
  });

  test('each pill carries a descriptive title attribute', async ({ page }) => {
    await page.goto('/');
    // StatusPill renders <span title="..."> directly, so reading the title
    // off the located element itself is correct — no xpath ancestor walk.
    const mqttPill = page.locator('span[title*="Mosquitto" i]').first();
    await expect(mqttPill).toBeVisible();
    await expect(mqttPill).toHaveAttribute('title', /Mosquitto/i);
  });
});
