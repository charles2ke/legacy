import assert from 'node:assert/strict';
import test from 'node:test';

import { isSafeImageSrc, isSafeUrl, validateCollection, validateProfile } from '../assets/js/profile-schema.js';

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

test('family relations are accepted with a known relation, a name and an optional slug', () => {
  const result = validateProfile({
    ...validProfile,
    family: [
      { relation: 'parent', name: 'Ada Okonkwo', slug: 'ada-okonkwo', note: 'Ran the repair shop.' },
      { relation: 'chosen-family', name: 'Tobi' },
    ],
  });
  assert.deepEqual(result, { valid: true, errors: [] });
});

test('family relations reject unknown types, bad slugs and extra fields', () => {
  const result = validateProfile({
    ...validProfile,
    family: [
      { relation: 'colleague', name: 'Someone' },
      { relation: 'parent' },
      { relation: 'sibling', name: 'Someone', slug: 'Not A Slug' },
      { relation: 'partner', name: 'Someone', slug: 'river-song' },
      { relation: 'child', name: 'Someone', birthday: '1970-01-01' },
      'not an object',
    ],
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.startsWith('family[0].relation:')));
  assert.ok(result.errors.some((error) => error === 'family[1].name: is required'));
  assert.ok(result.errors.some((error) => error.startsWith('family[2].slug:')));
  assert.ok(result.errors.some((error) => error.startsWith('family[3].slug:')));
  assert.ok(result.errors.some((error) => error === 'family[4].birthday: is not an allowed field'));
  assert.ok(result.errors.some((error) => error === 'family[5]: must be an object'));
});

test('a collection accepts present family slugs and rejects missing ones', () => {
  const relativeProfile = {
    ...validProfile,
    slug: 'relative-profile',
    family: [{ relation: 'child', name: 'River Song', slug: 'river-song' }],
  };
  const valid = validateCollection([
    { slug: 'river-song', profile: validProfile },
    { slug: 'relative-profile', profile: relativeProfile },
  ]);
  assert.equal(valid.valid, true);

  const selfReference = validateCollection([
    {
      slug: 'river-song',
      profile: {
        ...validProfile,
        family: [{ relation: 'parent', name: 'River Song', slug: 'river-song' }],
      },
    },
  ]);
  assert.ok(selfReference.errors.includes(
    "river-song: family[0].slug: must not be this profile's own slug",
  ));

  const result = validateCollection([
    {
      slug: 'river-song',
      profile: {
        ...validProfile,
        family: [{ relation: 'parent', name: 'Missing Profile', slug: 'missing-profile' }],
      },
    },
  ]);
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes(
    'river-song: family[0].slug: must be the slug of a profile in this archive',
  ));
});
