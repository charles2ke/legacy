#!/usr/bin/env node
// Validates every profile in profiles/ and checks that profiles/index.json
// lists exactly the profiles that exist. Exits non-zero on any problem.

import { access, readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  DEFAULT_INSTANCE,
  IMAGE_PATH_PREFIX,
  INSTANCE_MODES,
  SLUG_PATTERN,
  isPublishableOn,
  profileVisibility,
  validateCollection,
  validateProfile,
} from '../assets/js/profile-schema.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const profilesDir = path.join(repoRoot, 'profiles');

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

export async function validateProfilesDirectory(dir = profilesDir, root = path.dirname(dir)) {
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

  let index;
  try {
    index = await readJson(path.join(dir, 'index.json'));
  } catch (error) {
    errors.push(`index.json: is not valid JSON (${error.message})`);
  }

  // What kind of deployment these files belong to. Absent means "public",
  // the strictest setting, so forgetting it can never widen publication.
  let instance = DEFAULT_INSTANCE;
  const declaredInstance = index && typeof index === 'object' ? index.instance : undefined;
  if (declaredInstance !== undefined) {
    if (typeof declaredInstance === 'string' && INSTANCE_MODES.includes(declaredInstance)) {
      instance = declaredInstance;
    } else {
      errors.push(`index.json: "instance" must be one of ${INSTANCE_MODES.map((mode) => `"${mode}"`).join(', ')}`);
    }
  }

  errors.push(...validateCollection(entries, { instance }).errors);

  // An image committed to the repository must actually be there.
  for (const entry of entries) {
    const src = entry.profile?.image?.src;
    if (typeof src === 'string' && src.startsWith(IMAGE_PATH_PREFIX)) {
      try {
        await access(path.join(root, src));
      } catch {
        errors.push(`${entry.slug}: image.src "${src}" does not exist in the repository`);
      }
    }
  }

  if (index !== undefined) {
    if (typeof index !== 'object' || index === null || Array.isArray(index) || !Array.isArray(index.profiles)) {
      errors.push('index.json: must contain a "profiles" array of slugs');
    } else {
      const validSlugs = [];
      for (const entry of index.profiles) {
        if (typeof entry === 'string' && SLUG_PATTERN.test(entry)) {
          validSlugs.push(entry);
        } else {
          errors.push(`index.json: ${JSON.stringify(entry)} is not a valid slug`);
        }
      }
      const listed = new Set(validSlugs);
      const present = new Set(entries.map((entry) => entry.slug));
      if (listed.size !== validSlugs.length) {
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

  // The template itself must stay a valid profile, so copying it is a safe start,
  // and copying it must not produce a profile this instance may not publish.
  try {
    const template = await readJson(path.join(dir, '_template.json'));
    const templateResult = validateProfile(template);
    for (const error of templateResult.errors) {
      errors.push(`_template.json: ${error}`);
    }
    if (templateResult.valid && !isPublishableOn(template, instance)) {
      errors.push(
        `_template.json: visibility "${profileVisibility(template)}" is not allowed on a "${instance}" instance`,
      );
    }
  } catch (error) {
    errors.push(`_template.json: is not valid JSON (${error.message})`);
  }

  return { valid: errors.length === 0, errors, count: entries.length, instance };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const result = await validateProfilesDirectory();
  if (!result.valid) {
    console.error('Profile validation failed:');
    for (const error of result.errors) console.error(`  - ${error}`);
    process.exit(1);
  }
  console.log(`Profile validation passed (${result.count} profile(s), "${result.instance}" instance).`);
}
