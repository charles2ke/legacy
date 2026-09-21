#!/usr/bin/env node
// Turns the visibility of each non-public profile into a policy manifest for the
// authenticating host that sits in front of a private instance, so the profile
// JSON stays the single source of truth for who may read it.
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
 * Builds one application per profile that is not public, each covering that
 * profile's data file. Hosts match on path and ignore query strings, so the gate
 * is put on `/profiles/<slug>.json` — the file that actually holds the content —
 * and not on `profile.html?slug=…`, which cannot be told apart per profile.
 *
 * Private profiles are listed too, even though their allowlist lives in the
 * repository rather than in the profile. Leaving them to the site-wide policy
 * would not hold: that policy has to admit the outside viewers named by
 * restricted profiles, because they need the page and the scripts to read
 * anything at all — and once it admits them, they can ask for any private
 * profile's JSON directly. A private profile therefore gets its own application
 * with an empty allowlist, which admits nobody until a maintainer fills it in.
 * @param {{ slug: string, profile: unknown }[]} entries
 */
export function buildAccessPolicies(entries, { site } = {}) {
  const applications = entries
    .filter((entry) => profileVisibility(entry.profile) !== 'public')
    .map((entry) => {
      const visibility = profileVisibility(entry.profile);
      const include = groupViewers(Array.isArray(entry.profile?.allowedViewers) ? entry.profile.allowedViewers : []);
      const empty = include.emails.length === 0 && include.emailDomains.length === 0 && include.groups.length === 0;
      return {
        slug: entry.slug,
        name: `Legacy profile: ${entry.slug}`,
        path: `/profiles/${entry.slug}.json`,
        visibility,
        decision: 'allow',
        include,
        // An empty allowlist matches nobody, which is the safe way to be
        // incomplete. The warning below stops it from being missed.
        needsInclude: empty,
      };
    })
    .sort((a, b) => a.slug.localeCompare(b.slug));

  const warnings = applications
    .filter((application) => application.needsInclude)
    .map(
      (application) =>
        `${application.slug}: ${JSON.stringify(application.visibility)} profile has no allowlist of its own, so ` +
        `this policy admits nobody. Give ${application.path} an include covering the people who may read it ` +
        '— do not leave it to the site-wide policy, which has to admit the viewers of restricted profiles.',
    );

  return {
    generatedBy: 'scripts/build-access-policies.js',
    note:
      'A policy manifest, not an applied configuration. Every path not listed here still needs a ' +
      'site-wide policy: without one the rest of the private instance is served to anyone.',
    site: site ?? null,
    applications,
    warnings,
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
    console.error('No profile in this instance asks to be private or restricted; nothing to gate.');
  }
  for (const warning of manifest.warnings) {
    console.error(`Warning: ${warning}`);
  }
  console.log(JSON.stringify(manifest, null, 2));
}
