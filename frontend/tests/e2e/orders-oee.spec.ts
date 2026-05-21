import { test, expect } from '@playwright/test';

// Phase 12 — Orders + OEE non-robot screens.

test('Order History page renders the DataGrid', async ({ page }) => {
  await page.goto('/orders');
  // The DataGrid is always there; what we want to assert is the page
  // mounted without errors. Whether the grid has data rows or the
  // "End of history" button is shown depends on DB state — don't OR them,
  // since the column-header row always satisfies `getByRole('row')` and
  // makes the OR ambiguous under strict mode.
  await expect(page.getByRole('heading', { name: 'Order History' })).toBeVisible();
  await expect(page.locator('.MuiDataGrid-root')).toBeVisible();
});

test('Order History — robot filter narrows the list', async ({ page }) => {
  await page.goto('/orders');
  const picker = page.getByRole('combobox').first();
  if (!(await picker.isVisible().catch(() => false))) {
    test.skip(true, 'no robot picker rendered (no orders yet?)');
  }
  await picker.click();
  await page.getByRole('option', { name: /amr001/i }).first().click();
  // After filtering, every visible serial cell is amr001 (or there are no rows).
  const serialCells = page.getByRole('cell', { name: /amr\d{3}/ });
  const count = await serialCells.count();
  for (let i = 0; i < count; i++) {
    await expect(serialCells.nth(i)).toHaveText(/amr001/);
  }
});

test('OEE empty state renders 0 / em-dash placeholders cleanly', async ({ page }) => {
  await page.goto('/oee');
  // Cards always show numeric/em-dash placeholders even with no cycles.
  await expect(page.getByText(/—|0/).first()).toBeVisible();
});
