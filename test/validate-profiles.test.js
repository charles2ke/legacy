import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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
async function fixture(t, { files = {}, index = [], rawIndex, instance } = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), 'legacy-profiles-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await writeFile(path.join(dir, '_template.json'), JSON.stringify(exampleProfile('your-chosen-slug')));
  await writeFile(
    path.join(dir, 'index.json'),
    rawIndex === undefined
      ? JSON.stringify(instance === undefined ? { profiles: index } : { instance, profiles: index })
      : rawIndex,
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

test('a non-slug entry in index.json is reported', async (t) => {
  const dir = await fixture(t, { rawIndex: '{ "profiles": [{ "slug": "someone" }] }' });
  const result = await validateProfilesDirectory(dir);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes('is not a valid slug')));
});

test('an invalid index entry does not produce a spurious duplicate error', async (t) => {
  const dir = await fixture(t, {
    files: { 'someone.json': exampleProfile('someone') },
    rawIndex: '{ "profiles": ["someone", 7] }',
  });
  const result = await validateProfilesDirectory(dir);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes('is not a valid slug')));
  assert.ok(!result.errors.some((error) => error.includes('duplicate slugs')));
});

test('a repository image that does not exist is reported', async (t) => {
  const dir = await fixture(t, {
    files: {
      'someone.json': {
        ...exampleProfile('someone'),
        image: { src: 'assets/images/missing.jpg', alt: 'Missing picture.' },
      },
    },
    index: ['someone'],
  });
  const result = await validateProfilesDirectory(dir);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes('does not exist in the repository')));
});

test('this repository is a public instance', async () => {
  const result = await validateProfilesDirectory();
  assert.equal(result.instance, 'public');
});

test('a profile that asks to be private cannot be committed to a public instance', async (t) => {
  for (const visibility of ['private', 'restricted']) {
    const profile = { ...exampleProfile('someone'), visibility };
    if (visibility === 'restricted') profile.allowedViewers = ['someone@example.com'];
    const dir = await fixture(t, { files: { 'someone.json': profile }, index: ['someone'] });
    const result = await validateProfilesDirectory(dir);
    assert.equal(result.valid, false, `${visibility} should be refused`);
    assert.ok(
      result.errors.some((error) => error.includes('is not allowed on a "public" instance')),
      `${visibility} should explain why`,
    );
  }
});

test('a private instance may hold every visibility mode', async (t) => {
  const dir = await fixture(t, {
    files: {
      'someone.json': exampleProfile('someone'),
      'quiet.json': { ...exampleProfile('quiet'), visibility: 'private' },
      'few.json': {
        ...exampleProfile('few'),
        visibility: 'restricted',
        allowedViewers: ['someone@example.com'],
      },
    },
    index: ['someone', 'quiet', 'few'],
    instance: 'private',
  });
  const result = await validateProfilesDirectory(dir, path.dirname(dir), { instance: 'private' });
  assert.deepEqual(result.errors, []);
  assert.equal(result.instance, 'private');
});

test('a public deployment refuses profiles.json claiming to be private', async (t) => {
  // The guard must not read its own switch out of the files it is guarding:
  // every profile pull request touches index.json, so if that file could choose
  // the instance, one line would turn the guard off in the same change that
  // adds a private profile.
  const dir = await fixture(t, {
    files: { 'quiet.json': { ...exampleProfile('quiet'), visibility: 'private' } },
    index: ['quiet'],
    instance: 'private',
  });
  const result = await validateProfilesDirectory(dir);
  assert.equal(result.valid, false);
  assert.equal(result.instance, 'public');
  assert.ok(result.errors.some((error) => error.includes('but this deployment is "public"')));
  assert.ok(result.errors.some((error) => error.includes('is not allowed on a "public" instance')));
});

test('a private deployment refuses an index that still says public', async (t) => {
  const dir = await fixture(t, {
    files: { 'someone.json': exampleProfile('someone') },
    index: ['someone'],
    instance: 'public',
  });
  const result = await validateProfilesDirectory(dir, path.dirname(dir), { instance: 'private' });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes('but this deployment is "private"')));
});

test('an instance the caller invents is treated as the strictest one', async (t) => {
  const dir = await fixture(t, {
    files: { 'quiet.json': { ...exampleProfile('quiet'), visibility: 'private' } },
    index: ['quiet'],
  });
  const result = await validateProfilesDirectory(dir, path.dirname(dir), { instance: 'priv' });
  assert.equal(result.valid, false);
  assert.equal(result.instance, 'public');
  assert.ok(result.errors.some((error) => error.includes('is not allowed on a "public" instance')));
});

test('an unrecognised instance is reported rather than silently trusted', async (t) => {
  const dir = await fixture(t, {
    files: { 'someone.json': { ...exampleProfile('someone'), visibility: 'private' } },
    index: ['someone'],
    instance: 'anything-else',
  });
  const result = await validateProfilesDirectory(dir);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes('"instance" must be one of')));
  // It also falls back to the strictest instance instead of publishing.
  assert.equal(result.instance, 'public');
  assert.ok(result.errors.some((error) => error.includes('is not allowed on a "public" instance')));
});

test('a file the validator would skip is reported, because it is published anyway', async (t) => {
  // Everything in profiles/ is uploaded to the site. A file that is not read is
  // still served, so "not a profile" has to be an error rather than a silent skip.
  for (const name of ['_river.json', 'river.json.txt', 'River.json', 'notes.md']) {
    const dir = await fixture(t, {
      files: { 'someone.json': exampleProfile('someone'), [name]: { ...exampleProfile('x'), visibility: 'private' } },
      index: ['someone'],
    });
    const result = await validateProfilesDirectory(dir);
    assert.equal(result.valid, false, `${name} should be refused`);
    assert.ok(
      result.errors.some((error) => error.startsWith(`${name}: is not a profile`)),
      `${name} should say why`,
    );
  }
});

test('the two reserved names are not reported as strays', async (t) => {
  const dir = await fixture(t, {
    files: { 'someone.json': exampleProfile('someone') },
    index: ['someone'],
  });
  const result = await validateProfilesDirectory(dir);
  assert.deepEqual(result.errors, []);
});

test('a template that asks to be private is reported', async (t) => {
  const dir = await fixture(t);
  await writeFile(
    path.join(dir, '_template.json'),
    JSON.stringify({ ...exampleProfile('your-chosen-slug'), visibility: 'private' }),
  );
  const result = await validateProfilesDirectory(dir);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.startsWith('_template.json: visibility')));
});

test('the template ships a visibility and an admins placeholder', async () => {
  const template = JSON.parse(await readFile(new URL('../profiles/_template.json', import.meta.url), 'utf8'));
  assert.equal(template.visibility, 'public');
  assert.ok(Array.isArray(template.admins) && template.admins.length > 0);
});
