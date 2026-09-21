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
  normaliseInstance,
  profileVisibility,
  validateCollection,
  validateProfile,
} from '../assets/js/profile-schema.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const profilesDir = path.join(repoRoot, 'profiles');

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

export async function validateProfilesDirectory(
  dir = profilesDir,
  root = path.dirname(dir),
  { instance = DEFAULT_INSTANCE } = {},
) {
  // An unrecognised instance falls back to the strictest one rather than being
  // reported as-is, so every message below names a real mode.
  instance = normaliseInstance(instance);
  const errors = [];
  // Everything in profiles/ is published, so a file the validator skips would
  // still be served. Only the two reserved names and <slug>.json are allowed,
  // and anything else is reported rather than quietly ignored — otherwise
  // profiles/_river.json could carry visibility "private" past every check and
  // be uploaded with the rest of the site.
  const directoryFiles = await readdir(dir);
  const reserved = new Set(['index.json', '_template.json']);
  const isProfileFile = (file) => file.endsWith('.json') && SLUG_PATTERN.test(file.slice(0, -'.json'.length));
  for (const file of directoryFiles.filter((file) => !reserved.has(file) && !isProfileFile(file)).sort()) {
    errors.push(
      `${file}: is not a profile. profiles/ may only contain index.json, _template.json and <slug>.json, ` +
        'and every file here is published whether or not it is checked.',
    );
  }

  const files = directoryFiles.filter((file) => !reserved.has(file) && isProfileFile(file)).sort();

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

  // What kind of deployment this is comes from the caller — the environment the
  // validator runs in — and never from the files being checked. profiles/index.json
  // is touched by every profile pull request, so letting it choose would let a
  // contributor turn off the guard in the same change it is meant to catch.
  // The copy in index.json exists for the browser and must agree with this one.
  const declaredInstance = index && typeof index === 'object' && !Array.isArray(index) ? index.instance : undefined;
  if (declaredInstance !== undefined) {
    if (typeof declaredInstance !== 'string' || !INSTANCE_MODES.includes(declaredInstance)) {
      errors.push(`index.json: "instance" must be one of ${INSTANCE_MODES.map((mode) => `"${mode}"`).join(', ')}`);
    } else if (declaredInstance !== instance) {
      errors.push(
        `index.json: "instance" says "${declaredInstance}" but this deployment is "${instance}". The deployment ` +
          'sets its own instance (the LEGACY_INSTANCE environment variable), so changing this file cannot ' +
          'change what may be published here.',
      );
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
  // A private instance opts in through its own environment. Anything else, and
  // anything unrecognised, is treated as a public instance.
  const requested = process.env.LEGACY_INSTANCE;
  if (requested !== undefined && !INSTANCE_MODES.includes(requested)) {
    console.error(
      `LEGACY_INSTANCE must be one of ${INSTANCE_MODES.map((mode) => `"${mode}"`).join(', ')}, not "${requested}".`,
    );
    process.exit(1);
  }
  const instance = requested ?? DEFAULT_INSTANCE;

  const result = await validateProfilesDirectory(profilesDir, repoRoot, { instance });
  if (!result.valid) {
    console.error('Profile validation failed:');
    for (const error of result.errors) console.error(`  - ${error}`);
    process.exit(1);
  }
  console.log(`Profile validation passed (${result.count} profile(s), "${result.instance}" instance).`);
}
