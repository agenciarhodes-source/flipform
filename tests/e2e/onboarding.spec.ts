// @ts-nocheck
const { test, expect } = require('@playwright/test');

test('onboarding page loads', async ({ page }) => {
  await page.goto('/register');
  await expect(page.getByText('Informe seu e-mail autorizado')).toBeVisible();
});
