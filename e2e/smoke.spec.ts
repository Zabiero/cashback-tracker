import { expect, test } from '@playwright/test';

async function addFirstCatalogCard(page: import('@playwright/test').Page) {
  await page.getByRole('link', { name: 'Cards', exact: true }).click();
  await page.getByRole('button', { name: 'Add card', exact: true }).click();
  await page.getByRole('button', { name: /^Add \S/ }).first().click();
}

test('add a card, log spend, see it on the dashboard', async ({ page }) => {
  await page.goto('/');
  await addFirstCatalogCard(page);
  await page.getByRole('link', { name: 'Transactions' }).click();
  await page.getByLabel('Amount (RM)').fill('100');
  await page.getByRole('button', { name: 'Petrol' }).click();
  await page.getByRole('button', { name: 'Save transaction' }).click();
  await page.getByRole('link', { name: 'Dashboard' }).click();
  await expect(page.getByTestId('recent')).toContainText('RM100.00');
  await expect(page.getByTestId('period-total')).toBeVisible();
});

test('a backup restores data in a fresh browser', async ({ page, browser }) => {
  await page.goto('/');
  await addFirstCatalogCard(page);
  await page.getByRole('link', { name: 'Settings' }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export backup' }).click()]);
  const path = await download.path();

  const fresh = await browser.newContext();
  const page2 = await fresh.newPage();
  await page2.goto('http://localhost:4173/#/settings');
  await page2.getByLabel('Import backup file').setInputFiles(path!);
  await page2.getByRole('button', { name: 'Replace my data' }).click();
  await expect(page2.getByText('Backup imported.')).toBeVisible();
  await page2.getByRole('link', { name: 'Cards', exact: true }).click();
  await expect(page2.getByRole('heading', { level: 2 })).toHaveCount(1);
  await fresh.close();
});

test('add a bill manually, see it on the dashboard, mark it paid', async ({ page }) => {
  await page.goto('/');
  await addFirstCatalogCard(page);
  await page.getByRole('link', { name: 'Bills' }).click();
  await page.getByRole('button', { name: 'Add manually' }).click();
  await page.getByLabel('Card').selectOption({ index: 1 });
  const today = new Date();
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const stmt = new Date(today); stmt.setDate(stmt.getDate() - 15);
  const due = new Date(today); due.setDate(due.getDate() + 5);
  await page.getByLabel('Statement date').fill(iso(stmt));
  await page.getByLabel('Payment due date').fill(iso(due));
  await page.getByLabel('Statement balance (RM)').fill('500');
  await page.getByLabel('Minimum due (RM)').fill('25');
  await page.getByRole('button', { name: 'Save statement' }).click();
  await page.getByRole('link', { name: 'Dashboard' }).click();
  await expect(page.getByRole('region', { name: 'Upcoming payments' })).toContainText('Due in 5 days');
  await page.getByRole('link', { name: 'Bills' }).click();
  await page.getByRole('button', { name: 'Mark paid' }).click();
  await page.getByRole('button', { name: 'Save payment' }).click();
  await page.getByRole('link', { name: 'Dashboard' }).click();
  await expect(page.getByRole('region', { name: 'Upcoming payments' })).toHaveCount(0);
});
