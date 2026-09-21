import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isAllowedViewer,
  isPublishableOn,
  isSafeImageSrc,
  isSafeUrl,
  profileVisibility,
  validateCollection,
  validateProfile,
} from '../assets/js/profile-schema.js';

const validProfile = {
  slug: 'river-song',
  name: 'River Song',
  introduction: 'A short introduction.',
  story: 'A story.\n\nWith two paragraphs.',
  carryForward: 'Keep going.',
};

test('a minimal profile with only required fields is valid', () => {
  assert.deepEqual(validateProfile(validProfile), { valid: true, errors: [] });
});

test('optional fields are accepted when present', () => {
  const result = validateProfile({
    ...validProfile,
    values: ['Kindness'],
    work: [{ title: 'A tool', description: 'Why it mattered.', url: 'https://example.com' }],
    memories: ['An ordinary afternoon.'],
    image: { src: 'https://example.com/photo.jpg', alt: 'A photo of a workshop.' },
    fictional: true,
  });
  assert.deepEqual(result.errors, []);
});

test('each required field is reported when missing', () => {
  for (const field of ['slug', 'name', 'introduction', 'story', 'carryForward']) {
    const profile = { ...validProfile };
    delete profile[field];
    const result = validateProfile(profile);
    assert.equal(result.valid, false, `${field} should be required`);
    assert.ok(result.errors.some((error) => error.startsWith(`${field}:`)));
  }
});

test('empty required fields are rejected', () => {
  const result = validateProfile({ ...validProfile, story: '   ' });
  assert.equal(result.valid, false);
});

test('null is rejected, not treated as a missing optional value', () => {
  const nullName = validateProfile({ ...validProfile, name: null });
  assert.equal(nullName.valid, false);
  assert.ok(nullName.errors.some((error) => error.startsWith('name:')));

  const nullValues = validateProfile({ ...validProfile, values: [null] });
  assert.equal(nullValues.valid, false);
  assert.ok(nullValues.errors.some((error) => error.startsWith('values[0]:')));

  const nullMemories = validateProfile({ ...validProfile, memories: [null] });
  assert.equal(nullMemories.valid, false);
  assert.ok(nullMemories.errors.some((error) => error.startsWith('memories[0]:')));
});

test('unknown fields are rejected so unexpected data is never published', () => {
  const result = validateProfile({ ...validProfile, homeAddress: '1 Example Street' });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes('homeAddress')));
});

test('slugs must be lowercase, hyphenated and URL safe', () => {
  const badSlugs = ['River Song', 'River_Song', '../etc/passwd', 'river--song', '-river', 'río'];
  for (const slug of badSlugs) {
    assert.equal(validateProfile({ ...validProfile, slug }).valid, false, `${slug} should be rejected`);
  }
  for (const slug of ['river-song', 'river2', 'a']) {
    assert.equal(validateProfile({ ...validProfile, slug }).valid, true, `${slug} should be allowed`);
  }
});

test('image requires alt text and a safe source', () => {
  const noAlt = validateProfile({ ...validProfile, image: { src: 'https://example.com/a.jpg' } });
  assert.equal(noAlt.valid, false);

  const badSrc = validateProfile({
    ...validProfile,
    image: { src: 'javascript:alert(1)', alt: 'Bad' },
  });
  assert.equal(badSrc.valid, false);

  const mailto = validateProfile({
    ...validProfile,
    image: { src: 'mailto:someone@example.com', alt: 'Not an image' },
  });
  assert.equal(mailto.valid, false);

  const repoPath = validateProfile({
    ...validProfile,
    image: { src: 'assets/images/example.jpg', alt: 'A picture.' },
  });
  assert.deepEqual(repoPath.errors, []);
});

test('unsafe work URLs are rejected', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,<script>', 'file:///etc/passwd', 'ftp://example.com']) {
    const result = validateProfile({ ...validProfile, work: [{ title: 'x', url }] });
    assert.equal(result.valid, false, `${url} should be rejected`);
  }
});

test('isSafeUrl allows only http, https and mailto', () => {
  assert.equal(isSafeUrl('https://example.com'), true);
  assert.equal(isSafeUrl('http://example.com'), true);
  assert.equal(isSafeUrl('mailto:someone@example.com'), true);
  assert.equal(isSafeUrl('javascript:alert(1)'), false);
  assert.equal(isSafeUrl('JavaScript:alert(1)'), false);
  assert.equal(isSafeUrl('java\nscript:alert(1)'), false);
  assert.equal(isSafeUrl('vbscript:msgbox(1)'), false);
  assert.equal(isSafeUrl(''), false);
  assert.equal(isSafeUrl(undefined), false);
  assert.equal(isSafeUrl('images/photo.jpg'), false);
});

test('image sources allow https/http or files under assets/images/', () => {
  assert.equal(isSafeImageSrc('https://example.com/a.jpg'), true);
  assert.equal(isSafeImageSrc('assets/images/a.jpg'), true);
  assert.equal(isSafeImageSrc('assets/images/nested/a.jpg'), true);
  assert.equal(isSafeImageSrc('assets/images/../../secret.txt'), false);
  assert.equal(isSafeImageSrc('assets/images/'), false);
  assert.equal(isSafeImageSrc('../../etc/passwd'), false);
  assert.equal(isSafeImageSrc('/etc/passwd'), false);
  assert.equal(isSafeImageSrc('//evil.example/photo.jpg'), false);
  assert.equal(isSafeImageSrc('mailto:someone@example.com'), false);
  assert.equal(isSafeImageSrc('javascript:alert(1)'), false);
  assert.equal(isSafeImageSrc(undefined), false);
});

test('a collection rejects duplicate slugs and file name mismatches', () => {
  const duplicates = validateCollection([
    { slug: 'river-song', profile: validProfile },
    { slug: 'river-song', profile: validProfile },
  ]);
  assert.equal(duplicates.valid, false);
  assert.ok(duplicates.errors.some((error) => error.includes('duplicate slug')));

  const mismatch = validateCollection([{ slug: 'other-name', profile: validProfile }]);
  assert.equal(mismatch.valid, false);
  assert.ok(mismatch.errors.some((error) => error.includes('must match the file name')));
});

test('every visibility mode is accepted, and anything else is rejected', () => {
  assert.deepEqual(validateProfile({ ...validProfile, visibility: 'public' }).errors, []);
  assert.deepEqual(validateProfile({ ...validProfile, visibility: 'private' }).errors, []);
  assert.deepEqual(
    validateProfile({ ...validProfile, visibility: 'restricted', allowedViewers: ['a@example.com'] }).errors,
    [],
  );

  for (const visibility of ['secret', 'unlisted', '', 'PUBLIC', true, null, ['public']]) {
    const result = validateProfile({ ...validProfile, visibility });
    assert.equal(result.valid, false, `${JSON.stringify(visibility)} should be rejected`);
    assert.ok(result.errors.some((error) => error.startsWith('visibility:')));
  }
});

test('a profile without a visibility field is public, as it was before', () => {
  assert.equal(profileVisibility(validProfile), 'public');
  assert.deepEqual(validateProfile(validProfile), { valid: true, errors: [] });
  assert.equal(isPublishableOn(validProfile, 'public'), true);
});

test('an unrecognised visibility is never treated as public', () => {
  // profileVisibility reports the raw value so callers fail closed rather than
  // publishing something that asked for anything other than "public".
  assert.equal(profileVisibility({ visibility: 'secret' }), 'secret');
  assert.equal(isPublishableOn({ visibility: 'secret' }, 'public'), false);
  assert.equal(isPublishableOn({ visibility: 'secret' }, 'private'), false);
});

test('only public profiles may be published on a public instance', () => {
  assert.equal(isPublishableOn({ visibility: 'public' }, 'public'), true);
  assert.equal(isPublishableOn({ visibility: 'private' }, 'public'), false);
  assert.equal(isPublishableOn({ visibility: 'restricted' }, 'public'), false);

  for (const visibility of ['public', 'private', 'restricted']) {
    assert.equal(isPublishableOn({ visibility }, 'private'), true, `${visibility} belongs on a private instance`);
  }
});

test('an unknown or missing instance falls back to the strictest one', () => {
  assert.equal(isPublishableOn({ visibility: 'private' }), false);
  assert.equal(isPublishableOn({ visibility: 'private' }, undefined), false);
  assert.equal(isPublishableOn({ visibility: 'private' }, 'PRIVATE'), false);
  assert.equal(isPublishableOn({ visibility: 'private' }, 'anything-else'), false);
});

test('a collection refuses non-public profiles on a public instance', () => {
  const entries = [{ slug: 'river-song', profile: { ...validProfile, visibility: 'private' } }];

  const onPublic = validateCollection(entries);
  assert.equal(onPublic.valid, false);
  assert.ok(onPublic.errors.some((error) => error.includes('is not allowed on a "public" instance')));

  const onPrivate = validateCollection(entries, { instance: 'private' });
  assert.deepEqual(onPrivate.errors, []);
});

test('admins must be GitHub usernames and are capped', () => {
  assert.deepEqual(validateProfile({ ...validProfile, admins: ['charles2ke', 'a-b-c', 'x'] }).errors, []);

  for (const admin of ['@charles2ke', 'has space', 'ends-', '-starts', 'a--b', 'a'.repeat(40), 7, null]) {
    const result = validateProfile({ ...validProfile, admins: [admin] });
    assert.equal(result.valid, false, `${JSON.stringify(admin)} should be rejected`);
    assert.ok(result.errors.some((error) => error.startsWith('admins[0]:')));
  }

  const tooMany = validateProfile({ ...validProfile, admins: Array(11).fill('charles2ke') });
  assert.equal(tooMany.valid, false);
  assert.ok(tooMany.errors.some((error) => error.includes('items or fewer')));

  const notAnArray = validateProfile({ ...validProfile, admins: 'charles2ke' });
  assert.equal(notAnArray.valid, false);
});

test('allowedViewers is required for restricted profiles and forbidden otherwise', () => {
  const missing = validateProfile({ ...validProfile, visibility: 'restricted' });
  assert.equal(missing.valid, false);
  assert.ok(missing.errors.some((error) => error.includes('is required when visibility is "restricted"')));

  const empty = validateProfile({ ...validProfile, visibility: 'restricted', allowedViewers: [] });
  assert.equal(empty.valid, false);
  assert.ok(empty.errors.some((error) => error.includes('at least one viewer')));

  for (const visibility of [undefined, 'public', 'private']) {
    const profile = { ...validProfile, allowedViewers: ['someone@example.com'] };
    if (visibility !== undefined) profile.visibility = visibility;
    const result = validateProfile(profile);
    assert.equal(result.valid, false, `${visibility} should not carry an allowlist`);
    assert.ok(result.errors.some((error) => error.includes('only allowed when visibility is "restricted"')));
  }
});

test('allowedViewers entries must be identifiers a host can match on', () => {
  const valid = validateProfile({
    ...validProfile,
    visibility: 'restricted',
    allowedViewers: ['someone@example.com', '@example.org', 'group:Close family'],
  });
  assert.deepEqual(valid.errors, []);

  for (const viewer of ['not-an-email', 'someone@', '@', '@localhost', 'group:', ' ', '', 7, null]) {
    const result = validateProfile({
      ...validProfile,
      visibility: 'restricted',
      allowedViewers: [viewer],
    });
    assert.equal(result.valid, false, `${JSON.stringify(viewer)} should be rejected`);
    assert.ok(result.errors.some((error) => error.startsWith('allowedViewers[0]:')));
  }

  const tooMany = validateProfile({
    ...validProfile,
    visibility: 'restricted',
    allowedViewers: Array(1001).fill('someone@example.com'),
  });
  assert.equal(tooMany.valid, false);
  assert.ok(tooMany.errors.some((error) => error.includes('items or fewer')));
});

test('isAllowedViewer rejects control characters and over-long values', () => {
  assert.equal(isAllowedViewer('someone@example.com'), true);
  assert.equal(isAllowedViewer('some.one+tag@sub.example.com'), true);
  assert.equal(isAllowedViewer('@example.com'), true);
  assert.equal(isAllowedViewer('group:Family'), true);
  assert.equal(isAllowedViewer('some\none@example.com'), false);
  assert.equal(isAllowedViewer(`${'a'.repeat(250)}@example.com`), false);
  assert.equal(isAllowedViewer(undefined), false);
});
