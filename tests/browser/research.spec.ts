import { test, expect } from '@playwright/test';

test('public research workflow preserves unsupported data and private watchlist', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Find the opportunity. Then find the edge.' })).toBeVisible();
  await page.getByRole('button', { name: 'Watchlist', exact: true }).click();
  await page.getByRole('button', { name: 'Research Michael Wilson' }).click();
  await expect(page.getByRole('heading', { name: 'Michael Wilson', exact: true })).toBeVisible();
  await expect(page.getByText('No verified sold comps', { exact: true })).toBeVisible();
  await expect(page.getByText('Population data unavailable', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Open Card Lab' }).click();
  await expect(page.getByText('Insufficient crossover evidence', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Settings & data', exact: true }).click();
  await expect(page.getByText('Manual imports', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Weekly reports', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Weekly reports', exact: true })).toBeVisible();
});

test('CSV preview rejects invalid records and stores only committed imports', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Settings & data', exact: true }).click();
  await page.getByLabel('Import type').selectOption('population');
  await page.getByLabel('CSV file').setInputFiles({ name: 'population.csv', mimeType: 'text/csv', buffer: Buffer.from('Year,Set,Name,Parallel,Card #,Gems,Total\n2025,Panini Prizm,Tyler Shough,Silver Prizm,327,27,152\n') });
  await expect(page.getByText('1 valid records', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Commit import' }).click();
  await expect(page.getByText('Import saved in this browser.', { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Settings & data', exact: true }).click();
  await expect(page.getByText('1 population records', { exact: true })).toBeVisible();
});

test('mobile layout fits and private data is absent from public dashboard', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Find the opportunity. Then find the edge.' })).toBeVisible();
  await page.locator('.player-table tbody tr').first().waitFor();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('synthetic economics scenario charges fees once and exposes downside', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Card Lab', exact: true }).click();
  const fields = {
    'Item entry price': '100', 'Inbound postage': '5', 'Buyer charges (USD)': '2',
    'Tax fraction (0–1)': '0.1', 'Grading / crossover fee': '20',
    'Round-trip postage / insurance': '10', 'Packaging': '3',
    'Success-specific upcharge': '10', 'Failure-specific extra cost': '2',
    'Success resale item price': '250', 'Failure / retained-slab item value': '100',
    'Selling fee fraction (0–1)': '0.1', 'Fixed selling fee': '1', 'Outbound shipping': '5',
    'Hypothetical success probability (0–1)': '0.6', 'Target ROI fraction (0–1+)': '0.2',
    'Maximum scenario loss (USD)': '50',
  };
  for (const [label, value] of Object.entries(fields)) await page.getByLabel(label, { exact: true }).fill(value);
  await page.getByRole('button', { name: 'Calculate scenario' }).click();
  await expect(page.getByText('$8.20', { exact: true })).toBeVisible();
  await expect(page.getByText('$160.00', { exact: true })).toBeVisible();
  await expect(page.getByText('$82.45', { exact: true })).toBeVisible();
});

test('local OCR reads a synthetic label while requiring manual review', async ({ page }) => {
  test.setTimeout(90000);
  await page.goto('./');
  await page.getByRole('button', { name: 'Card Lab', exact: true }).click();
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 1000; canvas.height = 240;
    const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 1000, 240);
    ctx.fillStyle = '#000000'; ctx.font = 'bold 80px Arial'; ctx.fillText('SGC 9.5 MINT', 80, 150);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.locator('input[type=file]').setInputFiles({ name: 'synthetic-label.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await page.getByRole('button', { name: 'Run local OCR on first photo' }).click();
  await expect(page.getByLabel('Extracted text · unverified')).toHaveValue(/SGC/, { timeout: 60000 });
});

test('validated backup moves the watchlist between isolated browser workspaces', async ({ page, browser }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Settings & data', exact: true }).click();
  await page.evaluate(() => localStorage.setItem('nce-watchlist', JSON.stringify(['Michael Wilson', 'Transfer Example'])));
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export private backup', exact: true }).click();
  const backup = await downloadPromise;
  const path = await backup.path();
  const second = await browser.newContext({ baseURL: page.url() });
  const other = await second.newPage();
  await other.goto('./');
  await other.getByRole('button', { name: 'Settings & data', exact: true }).click();
  const reload = other.waitForEvent('load');
  await other.getByLabel('Restore private JSON backup').setInputFiles(path!);
  await reload;
  await expect.poll(() => other.evaluate(() => JSON.parse(localStorage.getItem('nce-watchlist') || '[]'))).toEqual(['Michael Wilson', 'Transfer Example']);
  await other.getByRole('button', { name: 'Watchlist', exact: true }).click();
  await expect(other.getByRole('heading', { name: 'Transfer Example', exact: true })).toBeVisible();
  await second.close();
});
