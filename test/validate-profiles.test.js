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
async function fixture(t, { files = {}, index = [] } = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), 'legacy-profiles-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await writeFile(path.join(dir, '_template.json'), JSON.stringify(exampleProfile('your-chosen-slug')));
  await writeFile(path.join(dir, 'index.json'), JSON.stringify({ profiles: index }));
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
