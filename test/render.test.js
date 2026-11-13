import assert from 'node:assert/strict';
import test from 'node:test';

import {
  collapseUnchanged,
  diffLines,
  diffProfiles,
  profileDataUrl,
  profilePageUrl,
  profileUrls,
  queryProfiles,
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
    'https://example.github.io/legacy/api/profiles/river-song',
  );
  assert.equal(
    profileDataUrl('river-song', 'https://example.github.io/profile.html'),
    'https://example.github.io/api/profiles/river-song',
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

test('static profile queries filter, sort and page like the API', () => {
  const profiles = [
    { slug: 'b', name: 'beta', introduction: 'Second.', story: 'Has a garden.', carryForward: 'x', work: [{ title: 'T' }] },
    { slug: 'a', name: 'Alpha', introduction: 'First.', story: 'S.', carryForward: 'x', fictional: true },
    { slug: 'c', name: 'Gamma', introduction: 'Third.', story: 'S.', carryForward: 'Plant a GARDEN.' },
    { slug: '../bad', name: 'Bad', introduction: 'x', story: 'x', carryForward: 'x' },
  ];
  const all = queryProfiles(profiles);
  assert.deepEqual(
    all.profiles.map((profile) => profile.slug),
    ['a', 'b', 'c'],
  );
  assert.deepEqual(all.pagination, { page: 1, limit: 12, total: 3, pages: 1 });
  assert.deepEqual(all.profiles[0], {
    slug: 'a',
    name: 'Alpha',
    introduction: 'First.',
    fictional: true,
    hasWork: false,
  });

  const search = (query) => queryProfiles(profiles, new URLSearchParams(query)).profiles.map((p) => p.slug);
  assert.deepEqual(search('q=garden'), ['b', 'c']);
  assert.deepEqual(search('fictional=true'), ['a']);
  assert.deepEqual(search('fictional=false'), ['b', 'c']);
  assert.deepEqual(search('hasWork=true'), ['b']);
  assert.deepEqual(search('limit=2&page=2'), ['c']);
  assert.deepEqual(queryProfiles(profiles, new URLSearchParams('limit=2&page=2')).pagination, {
    page: 2,
    limit: 2,
    total: 3,
    pages: 2,
  });
  assert.deepEqual(queryProfiles(undefined).profiles, []);
});

test('static search also covers the autobiography, values and memories but never family names', () => {
  const profiles = [
    {
      slug: 'river',
      name: 'River',
      introduction: 'x',
      story: 'x',
      carryForward: 'x',
      autobiography: 'Grew up beside a lighthouse.',
      values: ['Patience'],
      memories: ['Fishing at dawn'],
      family: [{ relation: 'parent', name: 'Hidden Relative' }],
    },
    { slug: 'sea', name: 'Sea', introduction: 'x', story: 'x', carryForward: 'x' },
  ];
  const search = (q) => queryProfiles(profiles, new URLSearchParams({ q })).profiles.map((p) => p.slug);
  assert.deepEqual(search('LIGHTHOUSE'), ['river']);
  assert.deepEqual(search('patience'), ['river']);
  assert.deepEqual(search('at dawn'), ['river']);
  assert.deepEqual(search('Hidden Relative'), []);
});

const keep = (lines, dropped) => lines.filter((line) => line.type !== dropped).map((line) => line.text);

test('line diffs mark only what changed and rebuild both versions', () => {
  const before = ['intro', 'kept', 'old line', 'shared', 'end'];
  const after = ['intro', 'kept', 'shared', 'new line', 'end'];
  const lines = diffLines(before, after);
  assert.deepEqual(lines, [
    { type: 'same', text: 'intro' },
    { type: 'same', text: 'kept' },
    { type: 'removed', text: 'old line' },
    { type: 'same', text: 'shared' },
    { type: 'added', text: 'new line' },
    { type: 'same', text: 'end' },
  ]);
  assert.deepEqual(keep(lines, 'added'), before);
  assert.deepEqual(keep(lines, 'removed'), after);
  assert.deepEqual(diffLines([], ['only']), [{ type: 'added', text: 'only' }]);
});

test('very large changed blocks are shown as removed then added instead of aligned', () => {
  const before = [...Array.from({ length: 1500 }, (_, index) => `old ${index}`), 'shared'];
  const after = ['shared', ...Array.from({ length: 1500 }, (_, index) => `new ${index}`)];
  const lines = diffLines(before, after);
  assert.equal(lines.some((line) => line.type === 'same'), false);
  assert.deepEqual(keep(lines, 'added'), before);
  assert.deepEqual(keep(lines, 'removed'), after);
});

test('unchanged lines far from a change collapse into counted gaps', () => {
  const same = (text) => ({ type: 'same', text });
  const lines = [
    same('a'),
    same('b'),
    same('c'),
    { type: 'removed', text: 'd' },
    { type: 'added', text: 'e' },
    same('f'),
    same('g'),
    same('h'),
    same('i'),
  ];
  assert.deepEqual(collapseUnchanged(lines), [
    { type: 'skipped', count: 2 },
    same('c'),
    { type: 'removed', text: 'd' },
    { type: 'added', text: 'e' },
    same('f'),
    { type: 'skipped', count: 3 },
  ]);
});

test('profile diffs list every changed field in reading order, including unknown fields', () => {
  const before = {
    slug: 'river',
    name: 'River',
    story: 'Line one.\n\nLine two.',
    fictional: false,
    family: [{ relation: 'parent', name: 'Ada', slug: 'ada', note: 'Ran the shop.' }],
    extra: 1,
  };
  const after = {
    slug: 'river',
    name: 'River',
    story: 'Line one.\n\nLine 2.',
    fictional: true,
    family: before.family,
    links: [{ label: 'Site', url: 'https://example.com' }],
    zeta: 'new',
  };
  assert.deepEqual(diffProfiles(before, after), [
    {
      field: 'fictional',
      label: 'Fictional label',
      change: 'changed',
      lines: [
        { type: 'removed', text: 'No' },
        { type: 'added', text: 'Yes' },
      ],
    },
    {
      field: 'story',
      label: 'Story',
      change: 'changed',
      lines: [
        { type: 'same', text: 'Line one.' },
        { type: 'removed', text: 'Line two.' },
        { type: 'added', text: 'Line 2.' },
      ],
    },
    { field: 'links', label: 'Links', change: 'added', lines: [{ type: 'added', text: 'Site — https://example.com' }] },
    { field: 'extra', label: 'extra', change: 'removed', lines: [{ type: 'removed', text: '1' }] },
    { field: 'zeta', label: 'zeta', change: 'added', lines: [{ type: 'added', text: 'new' }] },
  ]);
  assert.deepEqual(diffProfiles(after, after), []);

  const firstSubmission = diffProfiles(null, before);
  assert.deepEqual(
    firstSubmission.map((change) => [change.field, change.change]),
    [
      ['slug', 'added'],
      ['name', 'added'],
      ['fictional', 'added'],
      ['story', 'added'],
      ['family', 'added'],
      ['extra', 'added'],
    ],
  );
  assert.deepEqual(firstSubmission[4].lines, [{ type: 'added', text: 'Parent: Ada — profile: ada — Ran the shop.' }]);
});

test('a change to spacing alone is reported without any added or removed lines', () => {
  assert.deepEqual(diffProfiles({ story: 'One.\n\nTwo.' }, { story: 'One.\nTwo.' }), [
    { field: 'story', label: 'Story', change: 'changed', lines: [{ type: 'skipped', count: 2 }] },
  ]);
});

test('every outside address in a profile is listed for review', () => {
  assert.deepEqual(
    profileUrls({
      image: { src: 'https://images.example/river.jpg', alt: 'River' },
      work: [{ title: 'Radio', url: 'https://radio.example' }, { title: 'No link' }],
      links: [{ label: 'Mail', url: 'mailto:river@example.com' }],
    }),
    [
      { label: 'Image', url: 'https://images.example/river.jpg' },
      { label: 'Work: Radio', url: 'https://radio.example' },
      { label: 'Link: Mail', url: 'mailto:river@example.com' },
    ],
  );
  assert.deepEqual(profileUrls(null), []);
});
