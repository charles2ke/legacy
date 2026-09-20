import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { validateProfilesDirectory } from '../scripts/validate-profiles.js';

const exampleProfile = (slug) => ({
  slug,
  name: 'Someone',
  introduction: 'Hello.',
  story: 'A story.',
  carryForward: 'Keep going.',
});

/** Creates a throwaway profiles directory that is deleted when the test ends. */
async function fixture(t, { files = {}, index = [], rawIndex } = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), 'legacy-profiles-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await writeFile(path.join(dir, '_template.json'), JSON.stringify(exampleProfile('your-chosen-slug')));
  await writeFile(
    path.join(dir, 'index.json'),
    rawIndex === undefined ? JSON.stringify({ profiles: index }) : rawIndex,
  );
  for (const [name, content] of Object.entries(files)) {
    await writeFile(path.join(dir, name), typeof content === 'string' ? content : JSON.stringify(content));
  }
  return dir;
}

test('the profiles shipped in this repository are valid', async () => {
  const result = await validateProfilesDirectory();
  assert.deepEqual(result.errors, []);
  assert.ok(result.count >= 1);
});

test('a valid directory passes', async (t) => {
  const dir = await fixture(t, {
    files: { 'someone.json': exampleProfile('someone') },
    index: ['someone'],
  });
  const result = await validateProfilesDirectory(dir);
  assert.deepEqual(result.errors, []);
  assert.equal(result.count, 1);
});

test('a profile missing from index.json is reported', async (t) => {
  const dir = await fixture(t, { files: { 'someone.json': exampleProfile('someone') }, index: [] });
  const result = await validateProfilesDirectory(dir);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes('missing "someone"')));
});

test('an index entry without a profile file is reported', async (t) => {
  const dir = await fixture(t, { index: ['ghost'] });
  const result = await validateProfilesDirectory(dir);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes('profiles/ghost.json does not exist')));
});

test('a slug that does not match its file name is reported', async (t) => {
  const dir = await fixture(t, {
    files: { 'someone.json': exampleProfile('someone-else') },
    index: ['someone'],
  });
  const result = await validateProfilesDirectory(dir);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes('must match the file name')));
});

test('an invalid template is reported', async (t) => {
  const dir = await fixture(t);
  await writeFile(path.join(dir, '_template.json'), JSON.stringify({ slug: 'x' }));
  const result = await validateProfilesDirectory(dir);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.startsWith('_template.json:')));
});

test('invalid JSON is reported rather than thrown', async (t) => {
  const dir = await fixture(t, { files: { 'broken.json': '{ not json' }, index: ['broken'] });
  const result = await validateProfilesDirectory(dir);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes('broken.json: is not valid JSON')));
});

test('duplicate slugs in index.json are reported', async (t) => {
  const dir = await fixture(t, {
    files: { 'someone.json': exampleProfile('someone') },
    index: ['someone', 'someone'],
  });
  const result = await validateProfilesDirectory(dir);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes('duplicate slugs')));
});

test('an index.json without a profiles array is reported', async (t) => {
  for (const rawIndex of ['null', '[]', '"nope"', '{ "profiles": "someone" }']) {
    const dir = await fixture(t, { rawIndex });
    const result = await validateProfilesDirectory(dir);
    assert.equal(result.valid, false, `${rawIndex} should be rejected`);
    assert.ok(result.errors.some((error) => error.includes('must contain a "profiles" array of slugs')));
  }
});
