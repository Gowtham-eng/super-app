const { test, expect } = require('@playwright/test');

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || 'gowtham.s@refex.co.in';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || 'Admin123!';
const BACKEND_URL = (process.env.REACT_APP_BACKEND_URL || 'http://localhost:8000').replace(/\/$/, '');

async function login(page) {
  await page.goto('/login');
  await page.getByTestId('email-input').fill(ADMIN_EMAIL);
  await page.getByTestId('password-input').fill(ADMIN_PASSWORD);
  await page.getByTestId('submit-button').click();
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 20000 });
}

test.describe('HR Sync', () => {
  test('admin can trigger sync without protocol error', async ({ page, request }) => {
    const health = await request.get(`${BACKEND_URL}/api/health`);
    expect(health.ok()).toBeTruthy();

    await login(page);
    await page.goto('/hr-sync');
    await expect(page.getByTestId('hr-sync-page')).toBeVisible();

    const triggerResponse = page.waitForResponse(
      (res) => res.url().includes('/hr-sync/trigger') && res.request().method() === 'POST',
      { timeout: 180000 }
    );

    await page.getByTestId('trigger-sync-btn').click();
    const response = await triggerResponse;
    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    expect(body.total).toBeGreaterThan(0);
    expect(body.errors?.join(' ') || '').not.toMatch(/missing an 'http:\/\/' or 'https:\/\/' protocol/i);

    await expect(page.getByTestId('sync-stats')).toBeVisible();
    await expect(page.locator('text=Request URL is missing')).toHaveCount(0);
    await expect(page.getByText(String(body.total)).first()).toBeVisible();
  });
});
