const { test, expect } = require('@playwright/test');

const AUTH_EMAIL = 'allowed.e2e@example.com';

test.describe('secure onboarding', () => {
  test('authorized user completes onboarding with OTP', async ({ page }) => {
    await page.goto('/register');
    await page.getByLabel('E-mail').fill(AUTH_EMAIL);
    await page.getByRole('button', { name: 'Enviar código' }).click();
    await expect(page.getByText('Enviamos um código para o e-mail informado.')).toBeVisible();

    // In test env, OTP provider should be mocked and deterministic by test setup.
    await page.getByLabel('Código (6 dígitos)').fill('123456');
    await page.getByRole('button', { name: 'Validar código' }).click();
    await expect(page.getByText('Crie sua senha de acesso')).toBeVisible();

    await page.getByLabel('Senha').fill('SenhaSegura123');
    await page.getByLabel('Confirmar senha').fill('SenhaSegura123');
    await page.getByRole('button', { name: 'Ativar acesso' }).click();

    await expect(page).toHaveURL(/dashboard/);
  });

  test('unauthorized user cannot complete onboarding', async ({ page }) => {
    await page.goto('/register');
    await page.getByLabel('E-mail').fill('unauthorized@example.com');
    await page.getByRole('button', { name: 'Enviar código' }).click();
    await expect(page.getByText('Enviamos um código para o e-mail informado.')).toBeVisible();

    await page.getByLabel('Código (6 dígitos)').fill('000000');
    await page.getByRole('button', { name: 'Validar código' }).click();
    await expect(page.getByText('Código inválido ou expirado')).toBeVisible();
  });
});
