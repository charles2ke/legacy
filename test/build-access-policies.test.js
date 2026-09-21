import assert from 'node:assert/strict';
import test from 'node:test';

import { buildAccessPolicies } from '../scripts/build-access-policies.js';

const restricted = (slug, allowedViewers) => ({
  slug,
  profile: { slug, visibility: 'restricted', allowedViewers },
});

test('only restricted profiles get an access policy', () => {
  const manifest = buildAccessPolicies(
    [
      restricted('few', ['someone@example.com']),
      { slug: 'open', profile: { slug: 'open' } },
      { slug: 'quiet', profile: { slug: 'quiet', visibility: 'private' } },
    ],
    { site: 'https://legacy.example.com' },
  );
  assert.deepEqual(
    manifest.applications.map((application) => application.slug),
    ['few'],
  );
});

test('the policy gates the data file, which is the path a host can tell apart', () => {
  const [application] = buildAccessPolicies([restricted('few', ['someone@example.com'])]).applications;
  // Hosts match on path and ignore query strings, so profile.html?slug=few
  // cannot carry a per-profile policy; the JSON it loads can.
  assert.equal(application.path, '/profiles/few.json');
  assert.equal(application.decision, 'allow');
});

test('allowlist entries are sorted into the shapes a host matches on', () => {
  const [application] = buildAccessPolicies([
    restricted('few', ['a@example.com', '@example.org', 'group:Close family', 'b@example.com']),
  ]).applications;
  assert.deepEqual(application.include, {
    emails: ['a@example.com', 'b@example.com'],
    emailDomains: ['example.org'],
    groups: ['Close family'],
  });
});

test('entries that are not valid identifiers are left out of the policy', () => {
  const [application] = buildAccessPolicies([
    restricted('few', ['good@example.com', 'not-an-email', '', null, 7]),
  ]).applications;
  assert.deepEqual(application.include.emails, ['good@example.com']);
});

test('a restricted profile with no usable allowlist yields an empty allow rule', () => {
  // An empty include list denies everyone, which is the safe direction. The
  // schema separately refuses to accept such a profile in the first place.
  const [application] = buildAccessPolicies([restricted('few', [])]).applications;
  assert.deepEqual(application.include, { emails: [], emailDomains: [], groups: [] });
});

test('the manifest says it is only a manifest, and records the site', () => {
  const manifest = buildAccessPolicies([], { site: 'https://legacy.example.com' });
  assert.equal(manifest.site, 'https://legacy.example.com');
  assert.match(manifest.note, /not an applied configuration/);
  assert.deepEqual(manifest.applications, []);
  assert.equal(buildAccessPolicies([]).site, null);
});
