import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

import { chromium } from 'playwright';

const baseUrl = process.env.BROWSER_BASE_URL || 'http://127.0.0.1:3000';
const ownerEmail = process.env.BROWSER_OWNER_EMAIL;
const ownerPassword = process.env.BROWSER_OWNER_PASSWORD;
const moderatorEmail = process.env.MODERATOR_EMAIL;
const moderatorPassword = process.env.MODERATOR_PASSWORD;
if (![ownerEmail, ownerPassword, moderatorEmail, moderatorPassword].every(Boolean)) {
  throw new Error('Browser owner and moderator test credentials must be provided through environment variables');
}

await mkdir('test-results', { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

try {
  await page.goto(`${baseUrl}/signup.html`);
  await page.getByLabel('Email').fill(ownerEmail);
  await page.getByLabel('Password (at least 12 characters)').fill(ownerPassword);
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForURL('**/dashboard.html');
  await page.getByRole('link', { name: 'Create profile' }).click();
  await page.getByLabel('Profile address', { exact: true }).fill('browser-river');
  await page.locator('#name').fill('Browser River');
  await page.getByLabel('Short introduction').fill('A profile created by the browser test.');
  await page.getByLabel('Story').fill('This story verifies the guided editor and moderation flow.');
  await page.getByLabel('Longer autobiography (optional)').fill('A longer account added after merging main.');
  await page.getByLabel('Values (one per line, up to 10)').fill('Care\nAccuracy');
  await page.getByLabel('What should readers carry forward?').fill('Test what you publish.');
  await page.getByLabel('Link label').fill('Example link');
  await page.getByLabel('Link URL (http, https or mailto)').fill('https://example.com');
  await page.getByLabel('Relationship').selectOption('chosen-family');
  await page.locator('#familyName').fill('Example Friend');
  await page.getByRole('button', { name: 'Preview data' }).click();
  assert.match(await page.locator('[data-profile-preview]').textContent(), /Browser River/);
  await page.getByRole('button', { name: 'Save private draft' }).click();
  await page.waitForURL('**/editor.html?id=*');
  await page.getByLabel(/I explicitly consent/).check();
  await page.getByRole('button', { name: 'Submit for moderator review' }).click();
  await page.getByRole('alert').filter({ hasText: 'Submitted' }).waitFor();
  await page.screenshot({ path: 'test-results/owner-submitted.png', fullPage: true });

  await page.goto(`${baseUrl}/dashboard.html`);
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.waitForURL('**/index.html');
  await page.goto(`${baseUrl}/login.html`);
  await page.getByLabel('Email').fill(moderatorEmail);
  await page.getByLabel('Password').fill(moderatorPassword);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/dashboard.html');
  await page.getByRole('link', { name: 'Moderation' }).click();
  await page.getByRole('heading', { name: /Browser River/ }).waitFor();
  await page.screenshot({ path: 'test-results/moderation-review.png', fullPage: true });
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes('/api/moderation/profiles/') &&
        response.url().endsWith('/decision') &&
        response.status() === 200,
    ),
    page.getByRole('button', { name: 'Approve' }).click(),
  ]);

  await page.goto(`${baseUrl}/profiles.html`);
  await page.getByRole('link', { name: 'Browser River' }).waitFor();
  await page.screenshot({ path: 'test-results/public-directory.png', fullPage: true });
  await page.getByRole('link', { name: 'Browser River' }).click();
  await page.getByRole('heading', { name: 'Browser River', level: 1 }).waitFor();
  assert.match(await page.locator('main').textContent(), /This story verifies/);
  await page.screenshot({ path: 'test-results/public-profile.png', fullPage: true });
  console.log('Playwright owner, moderator, directory, and profile flow passed');
} finally {
  await browser.close();
}
