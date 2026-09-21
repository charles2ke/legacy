import assert from 'node:assert/strict';
import test from 'node:test';

import {
  profileDataUrl,
  profilePageUrl,
  safeFamily,
  safeImage,
  safeLinks,
  safeWork,
  toParagraphs,
} from '../assets/js/render.js';

test('stories are split into paragraphs of plain text', () => {
  assert.deepEqual(toParagraphs('One.\n\nTwo.'), ['One.', 'Two.']);
  assert.deepEqual(toParagraphs('Single line'), ['Single line']);
  assert.deepEqual(toParagraphs(''), []);
  assert.deepEqual(toParagraphs(undefined), []);
});

test('markup in contributor text is kept as text, never parsed', () => {
  const [paragraph] = toParagraphs('<script>alert(1)</script>');
  assert.equal(paragraph, '<script>alert(1)</script>');
});

test('profile data URLs resolve under a project path such as /legacy/', () => {
  assert.equal(
    profileDataUrl('river-song', 'https://example.github.io/legacy/profile.html'),
    'https://example.github.io/legacy/profiles/river-song.json',
  );
  assert.equal(
    profileDataUrl('river-song', 'https://example.github.io/profile.html'),
    'https://example.github.io/profiles/river-song.json',
  );
});

test('profile data URLs reject anything that is not a plain slug', () => {
  for (const slug of ['../secrets', 'a/b', 'https://evil.example/x', '', null]) {
    assert.equal(profileDataUrl(slug, 'https://example.github.io/legacy/profile.html'), null);
  }
});

test('profile page links stay relative and only accept valid slugs', () => {
  assert.equal(profilePageUrl('river-song'), 'profile.html?slug=river-song');
  assert.equal(profilePageUrl('../evil'), null);
});

test('work entries with unsafe URLs are rendered without a link', () => {
  const [item] = safeWork([{ title: 'A tool', url: 'javascript:alert(1)' }]);
  assert.equal(item.title, 'A tool');
  assert.equal(item.url, null);

  const [safe] = safeWork([{ title: 'A tool', url: 'https://example.com' }]);
  assert.equal(safe.url, 'https://example.com');
  assert.deepEqual(safeWork(undefined), []);
});

test('images are dropped unless the source is safe and alt text exists', () => {
  assert.equal(safeImage({ src: 'javascript:alert(1)', alt: 'x' }), null);
  assert.equal(safeImage({ src: 'https://example.com/a.jpg' }), null);
  assert.deepEqual(safeImage({ src: 'https://example.com/a.jpg', alt: 'A photo.' }), {
    src: 'https://example.com/a.jpg',
    alt: 'A photo.',
  });
  assert.equal(safeImage(undefined), null);
});

test('family relations are labelled and only link to valid profile slugs', () => {
  const relations = safeFamily([
    { relation: 'parent', name: 'Ada', slug: 'ada-okonkwo', note: 'Taught me to solder.' },
    { relation: 'sibling', name: 'Tobi' },
    { relation: 'partner', name: 'Kim', slug: '../evil' },
    { relation: 'colleague', name: 'Not family' },
    { relation: 'parent', name: '   ' },
    null,
  ]);
  assert.deepEqual(relations, [
    {
      relation: 'parent',
      label: 'Parent',
      name: 'Ada',
      note: 'Taught me to solder.',
      href: 'profile.html?slug=ada-okonkwo',
    },
    { relation: 'sibling', label: 'Sibling', name: 'Tobi', note: '', href: null },
    { relation: 'partner', label: 'Partner', name: 'Kim', note: '', href: null },
  ]);
  assert.deepEqual(safeFamily(undefined), []);
});

test('an autobiography is split into paragraphs of plain text', () => {
  assert.deepEqual(toParagraphs('Early years.\n\nLater years.'), ['Early years.', 'Later years.']);
  assert.deepEqual(toParagraphs('<b>Not markup</b>'), ['<b>Not markup</b>']);
  assert.deepEqual(toParagraphs(undefined), []);
});

test('safeLinks keeps labelled links and drops unsafe or incomplete ones', () => {
  assert.deepEqual(
    safeLinks([
      { label: 'Blog', url: 'https://example.com/blog' },
      { label: 'Photos', url: 'https://example.com/photos' },
      { label: 'Bad', url: 'javascript:alert(1)' },
      { label: '  ', url: 'https://example.com' },
      { url: 'https://example.com' },
      null,
    ]),
    [
      { label: 'Blog', url: 'https://example.com/blog' },
      { label: 'Photos', url: 'https://example.com/photos' },
    ],
  );
  assert.deepEqual(safeLinks(undefined), []);
});
