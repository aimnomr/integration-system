import { test, expect } from '@playwright/test';

// Phase 12 — Admin → Maps CRUD + 409 toast on referenced map delete.

const TEST_MAP_ID = 'map-e2e';

test.describe.serial('Admin — Maps', () => {
  test.afterAll(async ({ request }) => {
    // Defensive cleanup if a test bailed mid-flow.
    await request.delete(`http://localhost:8000/maps/${TEST_MAP_ID}`).catch(() => {});
  });

  test('lists seeded maps map-001 + map-002', async ({ page }) => {
    await page.goto('/admin/maps');
    await expect(page.getByText('map-001', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('map-002', { exact: true }).first()).toBeVisible();
  });

  test('Add → create → toast → row visible', async ({ page }) => {
    await page.goto('/admin/maps');
    await page.getByRole('button', { name: 'Add' }).click();

    // The EditDrawer is the form. Use role-based selectors so the DataGrid's
    // column-header menu buttons (aria-label="Label column menu" etc.) don't
    // trip strict-mode duplicates.
    await page.getByRole('textbox', { name: 'Map ID' }).fill(TEST_MAP_ID);
    await page.getByRole('textbox', { name: 'Label' }).fill('E2E Test Map');
    // The drawer renders two "Save" buttons — the form's enabled submit and
    // the EditDrawer footer's disabled passthrough. Scope to the form.
    await page.locator('form').getByRole('button', { name: 'Save' }).click();

    await expect(page.getByText(/map created/i)).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(TEST_MAP_ID, { exact: true }).first()).toBeVisible();
  });

  test('Delete referenced map-001 → 409 toast', async ({ page }) => {
    await page.goto('/admin/maps');

    // Row for map-001 → trash button. Scope the search to the row.
    const row = page.getByRole('row').filter({ hasText: 'map-001' }).first();
    await row.getByRole('button').last().click();   // delete is the last button in the action cell
    await page.getByRole('button', { name: /delete/i }).click();   // confirm dialog

    await expect(page.getByText(/cannot delete|still in use|409/i).first())
      .toBeVisible({ timeout: 5_000 });
    await expect(page.getByText('map-001', { exact: true }).first()).toBeVisible();
  });

  test('Delete the e2e-created map → succeeds', async ({ page }) => {
    await page.goto('/admin/maps');
    const row = page.getByRole('row').filter({ hasText: TEST_MAP_ID }).first();
    await row.getByRole('button').last().click();
    await page.getByRole('button', { name: /delete/i }).click();

    await expect(page.getByText(/map deleted/i)).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(TEST_MAP_ID, { exact: true })).toHaveCount(0);
  });
});
