#!/usr/bin/env node
// Validates every profile in profiles/ and checks that profiles/index.json
// lists exactly the profiles that exist. Exits non-zero on any problem.

import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { SLUG_PATTERN, validateCollection, validateProfile } from '../assets/js/profile-schema.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const profilesDir = path.join(repoRoot, 'profiles');

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

export async function validateProfilesDirectory(dir = profilesDir) {
  const errors = [];
  const files = (await readdir(dir))
    .filter((file) => file.endsWith('.json'))
    .filter((file) => file !== 'index.json' && !file.startsWith('_'))
    .sort();

  const entries = [];
  for (const file of files) {
    const slug = file.replace(/\.json$/, '');
    try {
      entries.push({ slug, profile: await readJson(path.join(dir, file)) });
    } catch (error) {
      errors.push(`${file}: is not valid JSON (${error.message})`);
    }
  }

  errors.push(...validateCollection(entries).errors);

  let index;
  try {
    index = await readJson(path.join(dir, 'index.json'));
  } catch (error) {
    errors.push(`index.json: is not valid JSON (${error.message})`);
  }

  if (index !== undefined) {
    if (typeof index !== 'object' || index === null || Array.isArray(index) || !Array.isArray(index.profiles)) {
      errors.push('index.json: must contain a "profiles" array of slugs');
    } else {
      const invalid = index.profiles.filter((slug) => typeof slug !== 'string' || !SLUG_PATTERN.test(slug));
      for (const entry of invalid) {
        errors.push(`index.json: ${JSON.stringify(entry)} is not a valid slug`);
      }
      const listed = new Set(index.profiles.filter((slug) => !invalid.includes(slug)));
      const present = new Set(entries.map((entry) => entry.slug));
      if (listed.size !== index.profiles.length) {
        errors.push('index.json: contains duplicate slugs');
      }
      for (const slug of listed) {
        if (!present.has(slug)) errors.push(`index.json: lists "${slug}" but profiles/${slug}.json does not exist`);
      }
      for (const slug of present) {
        if (!listed.has(slug)) errors.push(`index.json: is missing "${slug}"`);
      }
    }
  }

  // The template itself must stay a valid profile, so copying it is a safe start.
  try {
    const template = await readJson(path.join(dir, '_template.json'));
    for (const error of validateProfile(template).errors) {
      errors.push(`_template.json: ${error}`);
    }
  } catch (error) {
    errors.push(`_template.json: is not valid JSON (${error.message})`);
  }

  return { valid: errors.length === 0, errors, count: entries.length };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const result = await validateProfilesDirectory();
  if (!result.valid) {
    console.error('Profile validation failed:');
    for (const error of result.errors) console.error(`  - ${error}`);
    process.exit(1);
  }
  console.log(`Profile validation passed (${result.count} profile(s)).`);
}
