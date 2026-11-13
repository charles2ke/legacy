import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';

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
// Each context has its own cookies, so the owner and the moderator are signed
// in at the same time, as they would be on two computers. This keeps the run
// to four rate-limited sign-in and account requests.
const pageErrors = [];
async function newPage(name) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.on('pageerror', (error) => pageErrors.push(`${name}: ${error.message}`));
  return page;
}
const owner = await newPage('owner');
const moderator = await newPage('moderator');
const visitor = await newPage('visitor');

const shot = (page, name) => page.screenshot({ path: `test-results/${name}.png`, fullPage: true });
// Clears the page's message first, so an earlier identical message is not
// mistaken for the result of this action.
async function act(page, target, expected) {
  await page.locator('[data-message]').evaluate((node) => {
    node.textContent = '';
  });
  await target.click();
  await page.getByRole('alert').filter({ hasText: expected }).waitFor();
}
// The editor reveals the status panel only once it has loaded the profile and
// filled in the text, so wait for it rather than reading a just-loaded page.
const statusText = async () => {
  const status = owner.locator('[data-status-text]');
  await status.waitFor();
  return status.textContent();
};
const firstStory = 'This story verifies the guided editor and moderation flow.';

try {
  await owner.goto(`${baseUrl}/signup.html`);
  await owner.getByLabel('Email').fill(ownerEmail);
  await owner.getByLabel('Password (at least 12 characters)').fill(ownerPassword);
  await owner.getByRole('button', { name: 'Create account' }).click();
  await owner.waitForURL('**/dashboard.html');
  await owner.getByRole('link', { name: 'Create profile' }).click();
  await owner.getByLabel('Profile address', { exact: true }).fill('browser-river');
  await owner.locator('#name').fill('Browser River');
  await owner.getByLabel('Short introduction').fill('A profile created by the browser test.');
  await owner.getByLabel('Story').fill(firstStory);
  await owner.getByLabel('Longer autobiography (optional)').fill('Years as a harbourmaster taught patience.');
  await owner.getByLabel('Values (one per line, up to 10)').fill('Care\nAccuracy');

  // Several entries of each kind. Adding one moves focus to its first field.
  const group = (name) => owner.getByRole('group', { name, exact: true });
  await owner.getByRole('button', { name: 'Add a work item' }).click();
  await owner.keyboard.type('River guide');
  await owner.getByRole('button', { name: 'Add a work item' }).click();
  await owner.keyboard.type('Tide tables');
  await group('Work item 2').getByLabel('Link (optional; http, https or mailto)').fill('https://example.com/tides');
  await owner.getByRole('button', { name: 'Add a work item' }).click();
  await group('Work item 3').getByLabel('Description (optional)').fill('A work entry without a title.');
  assert.equal(await group('Work item 1').getByLabel('Title').inputValue(), 'River guide');
  const links = [
    ['Example link', 'https://example.com'],
    ['Photo gallery', 'https://example.org/photos'],
    ['Added by mistake', 'https://example.net'],
  ];
  for (const [index, [label, url]] of links.entries()) {
    await owner.getByRole('button', { name: 'Add a link' }).click();
    await owner.keyboard.type(label);
    await group(`Link ${index + 1}`).getByLabel('URL').fill(url);
  }
  await owner.getByRole('button', { name: 'Remove link 3' }).click();
  assert.equal(await owner.evaluate(() => document.activeElement.textContent), 'Add a link');
  assert.equal(await owner.getByRole('group', { name: /^Link \d+$/ }).count(), 2);
  await owner.getByRole('button', { name: 'Add a family member' }).click();
  await group('Family member 1').getByLabel('Relationship').selectOption('chosen-family');
  await group('Family member 1').getByLabel('Public name').fill('Example Friend');

  const preview = owner.locator('[data-profile-preview]');
  await owner.getByRole('button', { name: 'Preview profile' }).click();
  await preview.getByText(/^Fix (this problem|these \d+ problems) before saving:$/).waitFor();
  await owner.getByLabel('What should readers carry forward?').fill('Test what you publish.');
  await owner.getByRole('button', { name: 'Preview profile' }).click();
  await preview.getByText(/^No problems found\./).waitFor();
  await preview.getByRole('heading', { name: 'Browser River', level: 3 }).waitFor();
  await preview.getByRole('link', { name: 'Photo gallery' }).waitFor();
  await shot(owner, 'editor-preview');

  await owner.getByRole('button', { name: 'Save private draft' }).click();
  await owner.getByRole('alert').filter({ hasText: 'Private draft saved.' }).waitFor();
  assert.match(owner.url(), /\/editor\.html\?id=\d+$/);
  assert.equal(await statusText(), 'Private draft. It has not been submitted for review.');
  const saved = await owner.evaluate(async () => (await fetch('/api/me/profiles')).json());
  assert.deepEqual(saved.profiles[0].draft.work[2], { description: 'A work entry without a title.' });

  // Submitting with unsaved changes saves them first.
  await owner.getByLabel('Short introduction').fill('A profile created and submitted by the browser test.');
  // An edit after previewing must not leave the old preview looking current.
  await preview.getByText(/^You have changed the profile since this preview\./).waitFor();
  assert.equal(await preview.getByRole('heading', { name: 'Browser River' }).count(), 0);
  await owner.getByLabel(/I explicitly consent/).check();
  await act(
    owner,
    owner.getByRole('button', { name: 'Submit for moderator review' }),
    'Saved your latest changes and submitted them for moderator review.',
  );
  assert.match(await statusText(), /^Waiting for moderator review\./);
  await shot(owner, 'owner-submitted');

  await moderator.goto(`${baseUrl}/login.html`);
  await moderator.getByLabel('Email').fill(moderatorEmail);
  await moderator.getByLabel('Password').fill(moderatorPassword);
  await moderator.getByRole('button', { name: 'Sign in' }).click();
  await moderator.waitForURL('**/dashboard.html');
  await moderator.getByRole('link', { name: 'Moderation' }).click();
  const card = moderator.getByRole('article', { name: 'Browser River' });
  await card.getByText('New profile · address browser-river').waitFor();
  await card.getByRole('link', { name: 'https://example.org/photos' }).waitFor();
  await shot(moderator, 'moderation-review');

  // The owner changes the profile while the moderator is reading it. Approving
  // what the moderator loaded must not publish the newer, unreviewed text.
  await owner.getByLabel('Story').fill(`${firstStory}\n\nA second paragraph added during review.`);
  await owner.getByLabel(/I explicitly consent/).check();
  await act(
    owner,
    owner.getByRole('button', { name: 'Submit for moderator review' }),
    'Saved your latest changes and submitted them for moderator review.',
  );
  await act(
    moderator,
    card.getByRole('button', { name: 'Approve Browser River' }),
    'This profile was changed after you loaded it',
  );
  await moderator.reload();
  await act(
    moderator,
    moderator.getByRole('button', { name: 'Approve Browser River' }),
    'Approved Browser River. It is now public.',
  );
  await moderator.getByText('No profiles are awaiting review.').waitFor();

  await visitor.goto(`${baseUrl}/profiles.html`);
  await visitor.getByRole('link', { name: 'Browser River' }).waitFor();
  await shot(visitor, 'public-directory');
  await visitor.getByLabel('Search approved profiles').fill('harbourmaster');
  await visitor.getByRole('button', { name: 'Search' }).click();
  await visitor.getByRole('link', { name: 'Clear search and filters' }).waitFor();
  await visitor.getByRole('link', { name: 'Browser River' }).waitFor();
  assert.equal(await visitor.getByLabel('Search approved profiles').inputValue(), 'harbourmaster');
  await visitor.getByLabel('Search approved profiles').fill('nobody-matches-this');
  await visitor.getByRole('button', { name: 'Search' }).click();
  await visitor.getByText('No profiles match your search.').waitFor();
  await visitor.getByRole('link', { name: 'Clear search and filters' }).click();
  await visitor.getByRole('link', { name: 'Browser River' }).click();
  await visitor.getByRole('heading', { name: 'Browser River', level: 1 }).waitFor();
  const published = await visitor.locator('main').textContent();
  assert.match(published, /A second paragraph added during review\./);
  assert.match(published, /Tide tables/);
  assert.match(published, /Example Friend/);
  await shot(visitor, 'public-profile');

  // An edit to a published profile shows the moderator what changed.
  await owner.reload();
  assert.equal(await statusText(), 'Published. A moderator approved this version.');
  await owner.getByRole('link', { name: 'View the published version' }).waitFor();
  assert.equal(await owner.getByLabel('Profile address', { exact: true }).isEditable(), false);
  await owner.getByLabel('Story').fill(`${firstStory}\n\nThe ending was rewritten after publication.`);
  await owner.getByLabel('Values (one per line, up to 10)').fill('Care\nAccuracy\nPatience');
  await owner.getByLabel(/I explicitly consent/).check();
  await act(
    owner,
    owner.getByRole('button', { name: 'Submit for moderator review' }),
    'Saved your latest changes and submitted them for moderator review.',
  );

  await moderator.reload();
  const update = moderator.getByRole('article', { name: 'Browser River' });
  await update.getByText('Update to a published profile').waitFor();
  await update.getByRole('heading', { name: 'Story (changed)', level: 4 }).waitFor();
  await update.locator('del', { hasText: 'A second paragraph added during review.' }).waitFor();
  await update.locator('ins', { hasText: 'The ending was rewritten after publication.' }).waitFor();
  await update.getByRole('heading', { name: 'Values (changed)', level: 4 }).waitFor();
  await update.locator('ins', { hasText: 'Patience' }).waitFor();
  await shot(moderator, 'moderation-changes');
  await update.getByLabel(/^Feedback for the owner/).fill('Please keep the original ending.');
  await act(
    moderator,
    update.getByRole('button', { name: 'Reject Browser River' }),
    'Sent Browser River back to its owner with your feedback.',
  );

  await owner.reload();
  assert.equal(
    await statusText(),
    'A moderator asked for changes. Edit the draft and submit it again. The previously approved version is still public.',
  );
  assert.equal(
    await owner.locator('[data-status-feedback]').textContent(),
    'Latest moderator feedback: Please keep the original ending.',
  );
  await visitor.reload();
  await visitor.getByRole('heading', { name: 'Browser River', level: 1 }).waitFor();
  assert.doesNotMatch(await visitor.locator('main').textContent(), /The ending was rewritten/);

  await moderator.getByRole('link', { name: 'Audit log' }).click();
  const audit = moderator.getByRole('table');
  await audit.waitFor();
  const auditText = await audit.textContent();
  for (const event of ['Draft created', 'Draft saved', 'Submitted for review', 'Approved', 'Changes requested']) {
    assert.match(auditText, new RegExp(event));
  }
  await audit.getByRole('link', { name: 'browser-river' }).first().waitFor();
  await shot(moderator, 'audit-log');

  await owner.getByRole('link', { name: 'Account', exact: true }).click();
  await owner.getByText(`Signed in as ${ownerEmail}`).waitFor();
  const [download] = await Promise.all([
    owner.waitForEvent('download'),
    owner.getByRole('link', { name: 'Download my data' }).click(),
  ]);
  assert.match(download.suggestedFilename(), /^legacy-export-\d{4}-\d{2}-\d{2}\.json$/);
  const exportText = await readFile(await download.path(), 'utf8');
  const exported = JSON.parse(exportText);
  assert.equal(exported.format, 'legacy-export/1');
  assert.equal(exported.account.email, ownerEmail);
  assert.deepEqual(
    exported.profiles.map((profile) => profile.slug),
    ['browser-river'],
  );
  assert.deepEqual(
    exported.profiles[0].moderation.map(({ decision, feedback }) => [decision, feedback || null]),
    [
      ['approved', null],
      ['rejected', 'Please keep the original ending.'],
    ],
  );
  assert.ok(!exportText.includes(moderatorEmail), 'the export must not name the moderator');

  const newPassword = `${ownerPassword}-changed`;
  await owner.getByLabel('Current password').fill(ownerPassword);
  await owner.getByLabel('New password (12 to 200 characters)').fill(newPassword);
  await owner.getByRole('button', { name: 'Change password' }).click();
  await owner.getByRole('alert').filter({ hasText: 'Password changed.' }).waitFor();
  await shot(owner, 'account');

  await owner.getByLabel('Password', { exact: true }).fill(newPassword);
  await owner.getByLabel(/I understand that my account/).check();
  await owner.getByRole('button', { name: 'Delete my account' }).click();
  await owner.getByRole('heading', { name: 'Account deleted', level: 1 }).waitFor();
  await shot(owner, 'account-deleted');
  await owner.goto(`${baseUrl}/dashboard.html`);
  await owner.waitForURL('**/login.html');
  await visitor.reload();
  await visitor.getByText('This profile could not be found.').waitFor();
  await moderator.reload();
  await moderator.getByRole('cell', { name: 'Account deleted by owner' }).waitFor();
  assert.equal(await moderator.getByRole('link', { name: 'browser-river' }).count(), 0);
  await moderator.getByRole('button', { name: 'Sign out' }).click();
  await moderator.waitForURL('**/index.html');

  assert.deepEqual(pageErrors, [], 'no page should throw');
  console.log('Playwright owner, moderator, directory, audit and account flow passed');
} finally {
  await browser.close();
}
