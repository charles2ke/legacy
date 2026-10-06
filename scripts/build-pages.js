#!/usr/bin/env node
// Builds the read-only GitHub Pages copy of the public profile directory into
// _site/. Pages cannot run the Express platform, so this publishes only the
// public pages, their browser code and the profiles committed to profiles/ —
// never accounts, drafts or anything from the database.

import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { IMAGE_PATH_PREFIX, isPublishableOn, isSafeImageSrc, isSafeUrl } from '../assets/js/profile-schema.js';
import { validateProfilesDirectory } from './validate-profiles.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const STATIC_PAGES = ['index.html', 'profiles.html', 'profile.html', 'contribute.html'];
const STATIC_SCRIPTS = ['site.js', 'render.js', 'profile-schema.js'];
const HTML_TAG = '<html lang="en">';

function markStatic(html, page) {
  if (html.split(HTML_TAG).length !== 2) throw new Error(`${page}: expected exactly one ${HTML_TAG}`);
  return html.replace(HTML_TAG, '<html lang="en" data-legacy-static>');
}

/** Like the server, only an https: or mailto: removal contact is accepted. */
export function staticRemovalContact(value) {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const trimmed = value.trim();
  if (!isSafeUrl(trimmed, { schemes: ['https:', 'mailto:'] })) {
    throw new Error('PUBLIC_REMOVAL_URL must be an https: or mailto: URL');
  }
  return trimmed;
}

export async function buildPages({ root = repoRoot, out = path.join(root, '_site'), removalUrl } = {}) {
  // A GitHub Pages site is public even when its repository is private, so this
  // always checks as a public instance whatever LEGACY_INSTANCE says.
  const profilesDir = path.join(root, 'profiles');
  const result = await validateProfilesDirectory(profilesDir, root, { instance: 'public' });
  if (!result.valid) {
    throw new Error(`Profile validation failed:\n${result.errors.map((error) => `  - ${error}`).join('\n')}`);
  }

  const index = JSON.parse(await readFile(path.join(profilesDir, 'index.json'), 'utf8'));
  const profiles = [];
  for (const slug of index.profiles) {
    const profile = JSON.parse(await readFile(path.join(profilesDir, `${slug}.json`), 'utf8'));
    if (isPublishableOn(profile, 'public')) profiles.push(profile);
  }

  await rm(out, { recursive: true, force: true });
  await mkdir(path.join(out, 'assets', 'js'), { recursive: true });
  await mkdir(path.join(out, 'data'), { recursive: true });

  for (const page of STATIC_PAGES) {
    const html = await readFile(path.join(root, page), 'utf8');
    await writeFile(path.join(out, page), markStatic(html, page));
  }
  await cp(path.join(root, 'assets', 'css'), path.join(out, 'assets', 'css'), { recursive: true });
  for (const script of STATIC_SCRIPTS) {
    await cp(path.join(root, 'assets', 'js', script), path.join(out, 'assets', 'js', script));
  }
  // Images referenced by published profiles live under assets/images/.
  for (const src of new Set(profiles.map((profile) => profile.image?.src))) {
    if (isSafeImageSrc(src) && src.trim().startsWith(IMAGE_PATH_PREFIX)) {
      const file = src.trim();
      await mkdir(path.dirname(path.join(out, file)), { recursive: true });
      await cp(path.join(root, file), path.join(out, file));
    }
  }

  await writeFile(path.join(out, 'data', 'profiles.json'), `${JSON.stringify({ profiles }, null, 2)}\n`);
  await writeFile(
    path.join(out, 'data', 'config.json'),
    `${JSON.stringify({ removalContact: staticRemovalContact(removalUrl) }, null, 2)}\n`,
  );

  return { out, count: profiles.length };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const { out, count } = await buildPages({ removalUrl: process.env.PUBLIC_REMOVAL_URL });
    console.log(`Built GitHub Pages site in ${path.relative(process.cwd(), out) || '.'} (${count} public profile(s)).`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
