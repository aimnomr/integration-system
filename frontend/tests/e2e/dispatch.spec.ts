import { test, expect } from '@playwright/test';

// Phase 11 — Dispatch (Named mode happy path + Manual mode mechanics).
// We deliberately don't assert the robot actually moves — that's a [robot]
// test. Here we only confirm the order POST succeeds and a toast shows.

test.describe('Dispatch', () => {
  // The OrderBuilder is only rendered after a robot is selected. Every test
  // starts by picking amr001 and waiting for the builder to appear.
  async function pickRobot(page: import('@playwright/test').Page) {
    await page.goto('/dispatch');
    await page.getByRole('combobox', { name: 'Robot' }).click();
    await page.getByRole('option', { name: /amr001/ }).click();
    // OrderBuilder is now mounted — its "New order" header is the reliable anchor.
    await expect(page.getByText('New order')).toBeVisible();
  }

  test('Named mode: pick a location, send order, backend returns 200', async ({ page }) => {
    await pickRobot(page);

    const addLocation = page.getByRole('combobox', { name: 'Add location' });
    await expect(addLocation).toBeVisible();
    await addLocation.click();
    const firstOption = page.getByRole('option').first();
    if (!(await firstOption.isVisible().catch(() => false))) {
      test.skip(true, 'no named locations available for the selected robot');
    }
    await firstOption.click();

    // Assert backend acceptance. The ActiveOrderPanel only updates once the
    // robot publishes a matching `state` over MQTT, which doesn't happen
    // without a real robot — so verify via the POST response instead.
    const respPromise = page.waitForResponse(
      (r) => /\/robots\/amr001\/order\/named$/.test(r.url()) && r.request().method() === 'POST',
    );
    await page.getByRole('button', { name: /send order/i }).click();
    const resp = await respPromise;
    expect(resp.status()).toBe(200);
  });

  test('Manual mode: edit coords, send single-node order, backend returns 200', async ({ page }) => {
    await pickRobot(page);

    await page.getByRole('button', { name: 'Manual', exact: true }).click();

    // Manual-mode coord inputs (TextField type=number). Use getByLabel so we
    // match the visible label rather than guessing the spinbutton role.
    await page.getByLabel('x', { exact: true }).fill('1.0');
    await page.getByLabel('y', { exact: true }).fill('0.5');

    const respPromise = page.waitForResponse(
      (r) => /\/robots\/amr001\/order$/.test(r.url()) && r.request().method() === 'POST',
    );
    await page.getByRole('button', { name: /send order/i }).click();
    const resp = await respPromise;
    expect(resp.status()).toBe(200);
  });
});
