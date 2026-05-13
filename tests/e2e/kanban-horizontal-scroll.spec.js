const { test, expect } = require('@playwright/test');

test('kanban horizontal scroll reaches last columns', async ({ page }) => {
  await page.goto('/kanban');
  const board = page.locator('.kanban-scroll-area').first();
  await expect(board).toBeVisible();

  const dims = await board.evaluate((el) => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }));
  expect(dims.scrollWidth).toBeGreaterThan(dims.clientWidth);

  await board.evaluate((el) => {
    el.scrollLeft = el.scrollWidth;
  });

  const scrolled = await board.evaluate((el) => ({ scrollLeft: el.scrollLeft, max: el.scrollWidth - el.clientWidth }));
  expect(scrolled.scrollLeft).toBeGreaterThan(0);
  expect(scrolled.scrollLeft).toBeGreaterThanOrEqual(scrolled.max - 2);
});
