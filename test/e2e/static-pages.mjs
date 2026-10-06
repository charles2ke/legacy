// Serves the GitHub Pages build under /legacy/, the way a project Pages site is
// served, and checks the read-only directory in a real browser.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { chromium } from 'playwright';

import { buildPages } from '../../scripts/build-pages.js';

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const PREFIX = '/legacy/';

const work = await mkdtemp(path.join(tmpdir(), 'legacy-pages-e2e-'));
const out = path.join(work, '_site');
await buildPages({ out });

const server = createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  const relative = pathname.startsWith(PREFIX) ? pathname.slice(PREFIX.length) || 'index.html' : null;
  const file = relative && path.resolve(out, relative);
  if (!file || !file.startsWith(out + path.sep)) {
    res.writeHead(404).end('Not found');
    return;
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' }).end(body);
  } catch {
    res.writeHead(404).end('Not found');
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const baseUrl = `http://127.0.0.1:${server.address().port}${PREFIX}`;

await mkdir('test-results', { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const failedRequests = [];
page.on('response', (response) => {
  if (response.status() >= 400) failedRequests.push(`${response.status()} ${response.url()}`);
});

// Links to account pages are in the HTML but must not be shown on Pages.
async function assertHidden(locator, expected) {
  assert.equal(await locator.count(), expected);
  for (const element of await locator.all()) assert.equal(await element.isVisible(), false);
}

try {
  await page.goto(`${baseUrl}index.html`);
  await assertHidden(page.locator('a[href="login.html"], a[href="signup.html"]'), 2);
  await page.screenshot({ path: 'test-results/pages-home.png', fullPage: true });

  await page.getByRole('link', { name: 'Read the profiles' }).click();
  await page.getByRole('link', { name: 'River Okonkwo (fictional example)' }).waitFor();
  assert.match(await page.locator('[data-profile-list]').textContent(), /Page 1 of 1 · 1 profile/);
  await page.screenshot({ path: 'test-results/pages-profiles.png', fullPage: true });

  await page.getByLabel('Search approved profiles').fill('nobody-matches-this');
  await page.getByRole('button', { name: 'Search' }).click();
  await page.getByText('No profiles have been published yet.').waitFor();

  await page.goto(`${baseUrl}profiles.html?fictional=true`);
  await page.getByRole('link', { name: 'River Okonkwo (fictional example)' }).click();
  await page.getByRole('heading', { level: 1, name: 'River Okonkwo (fictional example)' }).waitFor();
  assert.match(await page.title(), /River Okonkwo/);
  await page.screenshot({ path: 'test-results/pages-profile.png', fullPage: true });

  await page.goto(`${baseUrl}profile.html?slug=not-a-profile`);
  await page.getByText('This profile could not be found.').waitFor();

  await page.goto(`${baseUrl}contribute.html`);
  await page.getByText('This is a read-only copy of the archive').waitFor();
  await assertHidden(page.locator('a[href="signup.html"]'), 2);
  await page.getByText('Private removal contact is not configured.').waitFor();
  await page.screenshot({ path: 'test-results/pages-contribute.png', fullPage: true });

  assert.deepEqual(
    failedRequests.filter((request) => !request.includes('not-a-profile')),
    [],
    'every published page should load without missing files',
  );
  console.log('Static Pages browser check passed');
} finally {
  await browser.close();
  server.close();
  await rm(work, { recursive: true, force: true });
}
