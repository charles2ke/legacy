import assert from 'node:assert/strict';
import test from 'node:test';
import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { STATIC_PAGES, buildPages, staticRemovalContact } from '../scripts/build-pages.js';

async function tempDir(t) {
  const dir = await mkdtemp(path.join(tmpdir(), 'legacy-pages-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

test('builds a static copy of the public pages and profiles', async (t) => {
  const out = path.join(await tempDir(t), '_site');
  const { count } = await buildPages({ out });
  assert.ok(count >= 1);

  for (const page of STATIC_PAGES) {
    const html = await readFile(path.join(out, page), 'utf8');
    assert.match(html, /<html lang="en" data-legacy-static>/);
  }
  const { profiles } = JSON.parse(await readFile(path.join(out, 'data', 'profiles.json'), 'utf8'));
  assert.equal(profiles.length, count);
  assert.ok(profiles.some((profile) => profile.slug === 'example-river-okonkwo'));
  assert.deepEqual(JSON.parse(await readFile(path.join(out, 'data', 'config.json'), 'utf8')), {
    removalContact: null,
  });

  // Account pages and their browser code need the server, so they are not published.
  const published = await readdir(out);
  for (const page of ['login.html', 'signup.html', 'dashboard.html', 'editor.html', 'moderator.html']) {
    assert.ok(!published.includes(page), `${page} should not be published`);
  }
  await assert.rejects(access(path.join(out, 'assets', 'js', 'app.js')));
});

test('refuses to publish a profile that is not public', async (t) => {
  const root = await tempDir(t);
  const profilesDir = path.join(root, 'profiles');
  await mkdir(profilesDir);
  const profile = (slug, extra = {}) => ({
    slug,
    name: 'Someone',
    introduction: 'Hello.',
    story: 'A story.',
    carryForward: 'Keep going.',
    ...extra,
  });
  await writeFile(path.join(profilesDir, '_template.json'), JSON.stringify(profile('your-chosen-slug')));
  await writeFile(path.join(profilesDir, 'index.json'), JSON.stringify({ profiles: ['secret'] }));
  await writeFile(path.join(profilesDir, 'secret.json'), JSON.stringify(profile('secret', { visibility: 'private' })));

  const out = path.join(root, '_site');
  await assert.rejects(buildPages({ root, out }), /Profile validation failed/);
  await assert.rejects(access(out));
});

test('only an https or mailto removal contact is published', () => {
  assert.equal(staticRemovalContact(undefined), null);
  assert.equal(staticRemovalContact(''), null);
  assert.equal(staticRemovalContact(' https://example.org/remove '), 'https://example.org/remove');
  assert.equal(staticRemovalContact('mailto:removals@example.org'), 'mailto:removals@example.org');
  assert.throws(() => staticRemovalContact('http://example.org/remove'), /https/);
  assert.throws(() => staticRemovalContact('javascript:alert(1)'), /https/);
});
