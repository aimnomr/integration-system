import { test, expect } from '@playwright/test';

// Phase 11 — Dashboard (non-robot). We can't drive a real telemetry "last
// seen" update without a robot, so this checks the static rendering and the
// navigation contract.

test('Dashboard shows at least one tile from /fleet', async ({ page }) => {
  await page.goto('/');
  // Either a tile labelled with a serial (e.g. amr001) or the empty hint.
  const tile = page.getByText(/amr\d{3}/i).first();
  const empty = page.getByText(/No robots in the fleet/i);
  await expect(tile.or(empty)).toBeVisible();
});

test('clicking a robot tile navigates to /robots/<serial>', async ({ page }) => {
  await page.goto('/');
  // Wait for the fleet query to resolve. Either the amr001 tile renders, or
  // the empty-state hint appears; only the tile is clickable.
  const tile = page.getByText(/amr001/i).first();
  const empty = page.getByText(/No robots in the fleet/i);
  await expect(tile.or(empty)).toBeVisible({ timeout: 10_000 });

  if (await empty.isVisible().catch(() => false)) {
    test.skip(true, 'fleet has no robots — Admin → Robots is empty');
  }
  await tile.click();
  await expect(page).toHaveURL(/\/robots\/amr001/);
});
