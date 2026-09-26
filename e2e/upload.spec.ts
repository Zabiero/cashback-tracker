import { expect, test } from '@playwright/test';
import PDFDocument from 'pdfkit';

/** A small password-protected PDF with plain (non-bank) text, generated in the test — no real samples. */
function protectedPdf(password: string): Promise<Buffer> {
  return new Promise((resolve) => {
    const doc = new PDFDocument({ userPassword: password, ownerPassword: 'owner-e2e', pdfVersion: '1.7' });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.text('Sample statement for testing', 72, 100);
    doc.end();
  });
}

test('upload a password-protected PDF and reach the review form', async ({ page }) => {
  const buffer = await protectedPdf('e2e-pass');
  await page.goto('/');
  await page.getByRole('link', { name: 'Cards', exact: true }).click();
  await page.getByRole('button', { name: 'Add card', exact: true }).click();
  await page.getByRole('button', { name: /^Add \S/ }).first().click();
  await page.getByRole('link', { name: 'Bills' }).click();
  await page.getByRole('button', { name: 'Upload statement' }).click();
  await page.getByLabel('Statement PDF').setInputFiles({ name: 'statement.pdf', mimeType: 'application/pdf', buffer });

  await page.getByLabel('PDF password').fill('wrong');
  await page.getByRole('button', { name: 'Open' }).click();
  await expect(page.getByRole('alert')).toHaveText('Password incorrect.');

  await page.getByLabel('PDF password').fill('e2e-pass');
  await page.getByRole('button', { name: 'Open' }).click();
  await expect(page.getByText("Couldn't read this statement — please fill in.")).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save statement' })).toBeVisible();
  await page.getByText('Show extracted text').click();
  await expect(page.getByText('Sample statement for testing')).toBeVisible();
});
