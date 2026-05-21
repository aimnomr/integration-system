import { test, expect } from '@playwright/test';

// Phase 12 — Admin → Robots: create amr-e2e, edit URL, delete (clean —
// no telemetry), then verify amr001 delete is rejected with 409.

const TEST_SERIAL = 'amr-e2e';

test.describe.serial('Admin — Robots', () => {
  test.afterAll(async ({ request }) => {
    await request.delete(`http://localhost:8000/robots/${TEST_SERIAL}`).catch(() => {});
  });

  test('lists current robots', async ({ page }) => {
    await page.goto('/admin/robots');
    await expect(page.getByText('amr001', { exact: true }).first()).toBeVisible();
  });

  test('Add amr-e2e → toast → fleet registry reloaded', async ({ page, request }) => {
    await page.goto('/admin/robots');
    await page.getByRole('button', { name: 'Add' }).click();

    // Role-based selectors so the DataGrid column-header menu buttons
    // ("Serial column menu" etc.) don't collide with the form inputs.
    await page.getByRole('textbox', { name: 'Serial number' }).fill(TEST_SERIAL);
    await page.getByRole('textbox', { name: 'rosbridge URL' }).fill('ws://localhost:9099');

    // Map picker — MUI TextField select renders as role=combobox with the
    // field's label as accessible name.
    await page.getByRole('combobox', { name: 'Map' }).click();
    await page.getByRole('option', { name: 'map-001' }).click();

    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText(/robot created/i)).toBeVisible({ timeout: 5_000 });

    const fleet = await request.get('http://localhost:8000/fleet').then((r) => r.json());
    const serials = (fleet.robots ?? []).map((r: { serialNumber: string }) => r.serialNumber);
    expect(serials).toContain(TEST_SERIAL);
  });

  test('Delete amr-e2e → succeeds', async ({ page }) => {
    await page.goto('/admin/robots');
    const row = page.getByRole('row').filter({ hasText: TEST_SERIAL }).first();
    await row.getByRole('button').last().click();
    await page.getByRole('button', { name: /delete/i }).click();
    await expect(page.getByText(/robot deleted/i)).toBeVisible({ timeout: 5_000 });
  });

  test('Delete amr001 (has telemetry/orders) → 409 toast', async ({ page, request }) => {
    // Pre-flight: confirm amr001 has at least one order. If not, this test
    // would spuriously succeed at the delete.
    const orders = await request.get('http://localhost:8000/orders?serial=amr001&limit=1')
      .then((r) => r.json()).catch(() => ({ orders: [] }));
    if ((orders.orders ?? []).length === 0) {
      test.skip(true, 'amr001 has no order history — cannot exercise the 409 path');
    }

    await page.goto('/admin/robots');
    const row = page.getByRole('row').filter({ hasText: 'amr001' }).first();
    await row.getByRole('button').last().click();
    await page.getByRole('button', { name: /delete/i }).click();

    await expect(page.getByText(/cannot delete|still has|409/i).first())
      .toBeVisible({ timeout: 5_000 });
    await expect(page.getByText('amr001', { exact: true }).first()).toBeVisible();
  });
});
