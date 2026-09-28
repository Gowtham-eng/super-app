const { test, expect } = require('@playwright/test');

const providers = [
  { id: 'venwind', label: 'Venwindrefex', email_domains: ['venwindrefex.com'] },
  { id: 'extrovis', label: 'Extrovis', email_domains: ['extrovis.com'] },
  { id: 'kavis', label: 'Kavis Pharma', email_domains: ['kavispharma.com'] },
];

for (const provider of providers) {
  test(`Microsoft company choice routes ${provider.label} without an email field`, async ({ page }) => {
    await page.route('**/api/azure-ad/providers', (route) => route.fulfill({ json: providers }));
    await page.route('**/api/google-oauth/providers', (route) => route.fulfill({ json: [] }));
    await page.route('**/api/auth/azure/login?*', (route) => route.abort());
    await page.goto('/login');
    await expect(page.getByTestId('email-input')).toHaveCount(0);
    await expect(page.getByText('Select your company')).toHaveCount(0);
    await page.getByTestId('microsoft-login-button').click();
    await expect(page.getByText('Select your company')).toBeVisible();
    const redirect = page.waitForRequest((request) => request.url().includes('/api/auth/azure/login?'));
    await page.getByTestId(`microsoft-company-${provider.id}`).click();
    expect(new URL((await redirect).url()).searchParams.get('config_id')).toBe(provider.id);
  });
}
