import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { validateProfilesDirectory } from '../scripts/validate-profiles.js';

test('the profiles shipped in this repository are valid', async () => {
  const result = await validateProfilesDirectory();
  assert.deepEqual(result.errors, []);
  assert.ok(result.count >= 1);
});

test('a profile missing from index.json is reported', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'legacy-profiles-'));
  await writeFile(
    path.join(dir, 'someone.json'),
    JSON.stringify({
      slug: 'someone',
      name: 'Someone',
      introduction: 'Hello.',
      story: 'A story.',
      carryForward: 'Keep going.',
    }),
  );
  await writeFile(path.join(dir, 'index.json'), JSON.stringify({ profiles: [] }));
  await writeFile(path.join(dir, '_template.json'), JSON.stringify({}));

  const result = await validateProfilesDirectory(dir);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes('missing "someone"')));
});

test('an index entry without a profile file is reported', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'legacy-profiles-'));
  await writeFile(path.join(dir, 'index.json'), JSON.stringify({ profiles: ['ghost'] }));
  await writeFile(path.join(dir, '_template.json'), JSON.stringify({}));

  const result = await validateProfilesDirectory(dir);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes('profiles/ghost.json does not exist')));
});

test('invalid JSON is reported rather than thrown', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'legacy-profiles-'));
  await writeFile(path.join(dir, 'broken.json'), '{ not json');
  await writeFile(path.join(dir, 'index.json'), JSON.stringify({ profiles: ['broken'] }));
  await writeFile(path.join(dir, '_template.json'), JSON.stringify({}));

  const result = await validateProfilesDirectory(dir);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes('broken.json: is not valid JSON')));
});
