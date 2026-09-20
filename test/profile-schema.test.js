import assert from 'node:assert/strict';
import test from 'node:test';

import { isSafeUrl, validateCollection, validateProfile } from '../assets/js/profile-schema.js';

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
  assert.equal(isSafeUrl('images/photo.jpg', { allowRelative: true }), true);
  assert.equal(isSafeUrl('//evil.example/photo.jpg', { allowRelative: true }), false);
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
