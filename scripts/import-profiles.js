import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { validateProfile } from '../assets/js/profile-schema.js';
import { loadConfig } from '../src/config.js';
import { openDatabase } from '../src/database.js';

const provenanceArg = process.argv.find((argument) => argument.startsWith('--provenance='));
const provenance = provenanceArg?.slice('--provenance='.length).trim();
if (!provenance) {
  throw new Error('Pass --provenance="where the files came from and what consent review remains"');
}

const sourceArg = process.argv.find((argument) => argument.startsWith('--source='));
const source = path.resolve(sourceArg?.slice('--source='.length) || 'profiles');
const index = JSON.parse(await readFile(path.join(source, 'index.json'), 'utf8'));
if (!Array.isArray(index.profiles)) throw new Error('Source index.json must contain a profiles array');

const candidates = [];
for (const slug of index.profiles) {
  const profile = JSON.parse(await readFile(path.join(source, `${slug}.json`), 'utf8'));
  const validation = validateProfile(profile);
  if (!validation.valid || profile.slug !== slug) {
    throw new Error(`${slug}: ${validation.errors.join('; ') || 'slug does not match filename'}`);
  }
  candidates.push({ slug, profile });
}

const config = loadConfig();
const database = await openDatabase(config.databasePath);
try {
  await database.transaction(async (transaction) => {
    for (const { slug, profile } of candidates) {
      const existing = await transaction.get('SELECT id FROM profiles WHERE slug = ?', [slug]);
      if (existing) throw new Error(`${slug}: already exists in the database`);
      const result = await transaction.run(
        `INSERT INTO profiles (owner_user_id, slug, status) VALUES (NULL, ?, 'draft')`,
        [slug],
      );
      const revision = await transaction.run(
        `INSERT INTO profile_revisions (profile_id, content_json, provenance)
         VALUES (?, ?, ?)`,
        [result.lastID, JSON.stringify(profile), provenance],
      );
      await transaction.run('UPDATE profiles SET draft_revision_id = ? WHERE id = ?', [
        revision.lastID,
        result.lastID,
      ]);
      await transaction.run(
        `INSERT INTO audit_log (profile_id, action, details_json)
         VALUES (?, 'profile.imported_unowned', ?)`,
        [result.lastID, JSON.stringify({ provenance })],
      );
    }
  });
} finally {
  await database.close();
}

console.log(`Imported ${candidates.length} profile(s) as unowned, unpublished drafts`);
