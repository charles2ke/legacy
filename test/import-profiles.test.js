import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

import { openDatabase } from '../src/database.js';

const execFileAsync = promisify(execFile);
const requiredProfile = (slug) => ({
  slug,
  name: slug,
  introduction: 'An import test profile.',
  story: 'Testing atomic archive imports.',
  carryForward: 'Keep imports consistent.',
});

test('profile imports roll back the entire batch when a later slug conflicts', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'legacy-import-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const databasePath = path.join(directory, 'legacy.sqlite');
  const database = await openDatabase(databasePath);
  await database.run(`INSERT INTO profiles (slug) VALUES ('existing-profile')`);
  await database.close();

  await writeFile(
    path.join(directory, 'index.json'),
    JSON.stringify({ profiles: ['new-profile', 'existing-profile'] }),
  );
  await writeFile(path.join(directory, 'new-profile.json'), JSON.stringify(requiredProfile('new-profile')));
  await writeFile(
    path.join(directory, 'existing-profile.json'),
    JSON.stringify(requiredProfile('existing-profile')),
  );

  await assert.rejects(
    execFileAsync(process.execPath, ['scripts/import-profiles.js', `--source=${directory}`, '--provenance=test'], {
      cwd: path.resolve(import.meta.dirname, '..'),
      env: {
        ...process.env,
        NODE_ENV: 'test',
        DATABASE_PATH: databasePath,
        SESSION_SECRET: 'test-session-secret-that-is-long-enough',
      },
    }),
    /existing-profile: already exists/,
  );

  const checked = await openDatabase(databasePath);
  t.after(() => checked.close());
  const newProfile = await checked.get(`SELECT id FROM profiles WHERE slug = 'new-profile'`);
  assert.equal(newProfile, undefined);
});
