#!/usr/bin/env node
// Turns the "allowedViewers" of each restricted profile into a policy manifest
// for the authenticating host that sits in front of a private instance, so the
// profile JSON stays the single source of truth for who may read it.
//
// This prints a manifest; it does not configure anything. A maintainer applies
// it by hand in the host's dashboard, or feeds it to whatever infrastructure
// tooling they use. See docs/VISIBILITY.md for the mapping.
//
// Usage: npm run access-policies -- --site https://legacy.example.com

import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { isAllowedViewer, profileVisibility } from '../assets/js/profile-schema.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const profilesDir = path.join(repoRoot, 'profiles');

/** Splits an allowlist into the shapes a host matches on. */
function groupViewers(allowedViewers) {
  const emails = [];
  const emailDomains = [];
  const groups = [];
  for (const viewer of allowedViewers) {
    if (!isAllowedViewer(viewer)) continue;
    const trimmed = viewer.trim();
    if (trimmed.startsWith('group:')) groups.push(trimmed.slice('group:'.length));
    else if (trimmed.startsWith('@')) emailDomains.push(trimmed.slice(1));
    else emails.push(trimmed);
  }
  return { emails, emailDomains, groups };
}

/**
 * Builds one application per restricted profile, each covering that profile's
 * data file. Hosts match on path and ignore query strings, so the gate is put
 * on `/profiles/<slug>.json` — the file that actually holds the content — and
 * not on `profile.html?slug=…`, which cannot be told apart per profile.
 * @param {{ slug: string, profile: unknown }[]} entries
 */
export function buildAccessPolicies(entries, { site } = {}) {
  const applications = entries
    .filter((entry) => profileVisibility(entry.profile) === 'restricted')
    .map((entry) => ({
      slug: entry.slug,
      name: `Legacy profile: ${entry.slug}`,
      path: `/profiles/${entry.slug}.json`,
      decision: 'allow',
      include: groupViewers(Array.isArray(entry.profile?.allowedViewers) ? entry.profile.allowedViewers : []),
    }))
    .sort((a, b) => a.slug.localeCompare(b.slug));

  return {
    generatedBy: 'scripts/build-access-policies.js',
    note:
      'A policy manifest, not an applied configuration. Every path not listed here still needs a ' +
      'site-wide policy: without one the rest of the private instance is served to anyone.',
    site: site ?? null,
    applications,
  };
}

async function readEntries(dir = profilesDir) {
  const files = (await readdir(dir))
    .filter((file) => file.endsWith('.json'))
    .filter((file) => file !== 'index.json' && !file.startsWith('_'))
    .sort();

  const entries = [];
  for (const file of files) {
    entries.push({
      slug: file.replace(/\.json$/, ''),
      profile: JSON.parse(await readFile(path.join(dir, file), 'utf8')),
    });
  }
  return entries;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const siteIndex = process.argv.indexOf('--site');
  const site = siteIndex === -1 ? undefined : process.argv[siteIndex + 1];
  if (!site) {
    console.error('Usage: npm run access-policies -- --site https://legacy.example.com');
    process.exit(1);
  }
  const manifest = buildAccessPolicies(await readEntries(), { site });
  if (manifest.applications.length === 0) {
    console.error('No profile in this instance asks to be restricted; nothing to gate.');
  }
  console.log(JSON.stringify(manifest, null, 2));
}
