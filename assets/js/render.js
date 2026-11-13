// Pure helpers shared by the site pages. They contain no DOM access so they can
// be unit tested in Node, and so that rendering stays text-only by construction.

import { ALLOWED_RELATIONS, SLUG_PATTERN, isSafeImageSrc, isSafeUrl } from './profile-schema.js';

const RELATION_LABELS = {
  parent: 'Parent',
  child: 'Child',
  sibling: 'Sibling',
  partner: 'Partner',
  grandparent: 'Grandparent',
  grandchild: 'Grandchild',
  relative: 'Relative',
  'chosen-family': 'Chosen family',
};

/** Splits a story into paragraphs. Contributor text is never treated as HTML. */
export function toParagraphs(text) {
  if (typeof text !== 'string') return [];
  return text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/\s+/g, ' ').trim())
    .filter((paragraph) => paragraph !== '');
}

/**
 * Resolves the data file for a slug relative to the page, so the site works at
 * the domain root and under a project path such as /legacy/.
 * Returns null for anything that is not a valid slug, which also prevents
 * path traversal from a crafted ?slug= query.
 */
export function profileDataUrl(slug, baseUrl) {
  if (typeof slug !== 'string' || !SLUG_PATTERN.test(slug)) return null;
  return new URL(`api/profiles/${slug}`, baseUrl).toString();
}

/** Link to a profile page, keeping relative paths intact. */
export function profilePageUrl(slug) {
  if (typeof slug !== 'string' || !SLUG_PATTERN.test(slug)) return null;
  return `profile.html?slug=${encodeURIComponent(slug)}`;
}

/** Drops work entries whose URL uses a scheme we do not allow. */
export function safeWork(work) {
  if (!Array.isArray(work)) return [];
  return work
    .filter((item) => item && typeof item === 'object' && typeof item.title === 'string')
    .map((item) => ({
      title: item.title,
      description: typeof item.description === 'string' ? item.description : '',
      url: isSafeUrl(item.url) ? item.url : null,
    }));
}

/**
 * Keeps only the links (social media, blog, photo galleries and anything else)
 * that have a label and a URL using a scheme we allow.
 */
export function safeLinks(links) {
  if (!Array.isArray(links)) return [];
  return links
    .filter(
      (item) =>
        item &&
        typeof item === 'object' &&
        typeof item.label === 'string' &&
        item.label.trim() !== '' &&
        isSafeUrl(item.url),
    )
    .map((item) => ({ label: item.label, url: item.url }));
}

/** Returns the image only when its source is safe, otherwise null. */
export function safeImage(image) {
  if (!image || typeof image !== 'object') return null;
  if (!isSafeImageSrc(image.src)) return null;
  if (typeof image.alt !== 'string' || image.alt.trim() === '') return null;
  return { src: image.src, alt: image.alt };
}

/**
 * Normalises family relations for display: unknown relation types and unusable
 * slugs are dropped, and each entry gains a label and a link when the related
 * person also has a profile here.
 */
export function safeFamily(family) {
  if (!Array.isArray(family)) return [];
  return family
    .filter(
      (item) =>
        item &&
        typeof item === 'object' &&
        typeof item.name === 'string' &&
        item.name.trim() !== '' &&
        ALLOWED_RELATIONS.includes(item.relation),
    )
    .map((item) => ({
      relation: item.relation,
      label: RELATION_LABELS[item.relation],
      name: item.name,
      note: typeof item.note === 'string' ? item.note : '',
      href: profilePageUrl(item.slug),
    }));
}

// Text searched by /api/profiles and by the static copy. Family entries are
// left out on purpose so nobody can look a profile up by a relative's name.
export const SEARCH_TEXT_FIELDS = ['name', 'introduction', 'story', 'autobiography', 'carryForward'];
export const SEARCH_LIST_FIELDS = ['values', 'memories'];

function matchesSearch(profile, q) {
  const includes = (value) => typeof value === 'string' && value.toLowerCase().includes(q);
  return (
    SEARCH_TEXT_FIELDS.some((field) => includes(profile[field])) ||
    SEARCH_LIST_FIELDS.some((field) => Array.isArray(profile[field]) && profile[field].some(includes))
  );
}

/**
 * Filters, sorts and pages published profiles the way /api/profiles does, for
 * the static GitHub Pages copy of the site, which has no server to ask.
 */
export function queryProfiles(profiles, params = new URLSearchParams()) {
  const page = Math.max(1, Number.parseInt(params.get('page') || '1', 10) || 1);
  const limit = Math.min(50, Math.max(1, Number.parseInt(params.get('limit') || '12', 10) || 12));
  const q = (params.get('q') || '').trim().slice(0, 100).toLowerCase();
  const fictional = params.get('fictional');
  const hasWork = (profile) => Array.isArray(profile.work) && profile.work.length > 0;

  const matches = (Array.isArray(profiles) ? profiles : [])
    .filter((profile) => profile && typeof profile === 'object' && profilePageUrl(profile.slug))
    .filter((profile) => !q || matchesSearch(profile, q))
    .filter((profile) => fictional !== 'true' || profile.fictional === true)
    .filter((profile) => fictional !== 'false' || profile.fictional !== true)
    .filter((profile) => params.get('hasWork') !== 'true' || hasWork(profile))
    .sort((a, b) => {
      const left = [String(a.name).toLowerCase(), a.slug];
      const right = [String(b.name).toLowerCase(), b.slug];
      if (left[0] !== right[0]) return left[0] < right[0] ? -1 : 1;
      return left[1] < right[1] ? -1 : left[1] > right[1] ? 1 : 0;
    });

  return {
    profiles: matches.slice((page - 1) * limit, page * limit).map((profile) => ({
      slug: profile.slug,
      name: profile.name,
      introduction: profile.introduction,
      fictional: profile.fictional === true,
      hasWork: hasWork(profile),
    })),
    pagination: { page, limit, total: matches.length, pages: Math.ceil(matches.length / limit) },
  };
}

// Fields in the order a moderator reads them. Anything else a profile holds is
// compared after these, so a review never hides a change.
const REVIEW_FIELDS = [
  ['slug', 'Profile address'],
  ['name', 'Public name'],
  ['introduction', 'Introduction'],
  ['fictional', 'Fictional label'],
  ['image', 'Image'],
  ['story', 'Story'],
  ['autobiography', 'Autobiography'],
  ['values', 'Values'],
  ['work', 'Work'],
  ['links', 'Links'],
  ['memories', 'Memories'],
  ['family', 'Family'],
  ['carryForward', 'Carry forward'],
  ['visibility', 'Visibility'],
  ['admins', 'Admins'],
  ['allowedViewers', 'Allowed viewers'],
];

// Above this many comparisons a changed block is shown as removed-then-added,
// so a pathological submission cannot exhaust a moderator's browser.
const MAX_DIFF_CELLS = 1_000_000;

function singleLine(value) {
  return String(value).replace(/\s+/g, ' ').trim();
}

/** Plain-text lines describing one profile field, for comparing revisions. */
function reviewLines(field, value) {
  if (value === undefined || value === null) return [];
  if (typeof value === 'string') {
    return value
      .split(/\r?\n/)
      .map((line) => line.trimEnd())
      .filter((line) => line.trim() !== '');
  }
  if (typeof value === 'boolean') return [value ? 'Yes' : 'No'];
  if (!Array.isArray(value)) {
    if (field === 'image' && typeof value === 'object') {
      return [`${singleLine(value.src)} — description: ${singleLine(value.alt)}`];
    }
    return [JSON.stringify(value)];
  }
  return value.map((item) => {
    if (typeof item === 'string') return singleLine(item);
    if (!item || typeof item !== 'object') return JSON.stringify(item);
    if (field === 'work') {
      return [item.title, item.description, item.url].filter(Boolean).map(singleLine).join(' — ');
    }
    if (field === 'links') return `${singleLine(item.label)} — ${singleLine(item.url)}`;
    if (field === 'family') {
      return [
        `${RELATION_LABELS[item.relation] || item.relation}: ${item.name}`,
        item.slug && `profile: ${item.slug}`,
        item.note,
      ]
        .filter(Boolean)
        .map(singleLine)
        .join(' — ');
    }
    return JSON.stringify(item);
  });
}

/**
 * Line diff of two arrays of strings, as `{ type: 'same' | 'removed' | 'added', text }`.
 * Unchanged lines at either end are matched first, then the changed middle is
 * aligned with a longest-common-subsequence table unless it is too large.
 */
export function diffLines(before, after) {
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start += 1;
  let endBefore = before.length;
  let endAfter = after.length;
  while (endBefore > start && endAfter > start && before[endBefore - 1] === after[endAfter - 1]) {
    endBefore -= 1;
    endAfter -= 1;
  }
  const same = (text) => ({ type: 'same', text });
  const removed = before.slice(start, endBefore);
  const added = after.slice(start, endAfter);
  const middle = [];

  if (removed.length * added.length > MAX_DIFF_CELLS) {
    middle.push(...removed.map((text) => ({ type: 'removed', text })));
    middle.push(...added.map((text) => ({ type: 'added', text })));
  } else {
    const table = Array.from({ length: removed.length + 1 }, () => new Uint32Array(added.length + 1));
    for (let i = removed.length - 1; i >= 0; i -= 1) {
      for (let j = added.length - 1; j >= 0; j -= 1) {
        table[i][j] =
          removed[i] === added[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < removed.length && j < added.length) {
      if (removed[i] === added[j]) {
        middle.push(same(removed[i]));
        i += 1;
        j += 1;
      } else if (table[i + 1][j] >= table[i][j + 1]) {
        middle.push({ type: 'removed', text: removed[i] });
        i += 1;
      } else {
        middle.push({ type: 'added', text: added[j] });
        j += 1;
      }
    }
    while (i < removed.length) middle.push({ type: 'removed', text: removed[i++] });
    while (j < added.length) middle.push({ type: 'added', text: added[j++] });
  }

  return [...before.slice(0, start).map(same), ...middle, ...before.slice(endBefore).map(same)];
}

/**
 * Replaces runs of unchanged lines that are more than `context` lines away from
 * a change with `{ type: 'skipped', count }`.
 */
export function collapseUnchanged(lines, context = 1) {
  const near = lines.map(() => false);
  lines.forEach((line, index) => {
    if (line.type === 'same') return;
    for (let offset = -context; offset <= context; offset += 1) {
      if (index + offset >= 0 && index + offset < lines.length) near[index + offset] = true;
    }
  });
  const result = [];
  for (const [index, line] of lines.entries()) {
    if (line.type !== 'same' || near[index]) {
      result.push(line);
    } else if (result.at(-1)?.type === 'skipped') {
      result.at(-1).count += 1;
    } else {
      result.push({ type: 'skipped', count: 1 });
    }
  }
  return result;
}

/**
 * Field-by-field changes between the published revision and a submitted one,
 * for moderators. Each change is `{ field, label, change, lines }` where
 * `change` is "added", "removed" or "changed".
 */
export function diffProfiles(before, after) {
  const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
  const previous = isObject(before) ? before : {};
  const next = isObject(after) ? after : {};
  const known = new Set(REVIEW_FIELDS.map(([field]) => field));
  const others = [...new Set([...Object.keys(previous), ...Object.keys(next)])]
    .filter((field) => !known.has(field))
    .sort()
    .map((field) => [field, field]);

  const changes = [];
  for (const [field, label] of [...REVIEW_FIELDS, ...others]) {
    if (JSON.stringify(previous[field]) === JSON.stringify(next[field])) continue;
    const oldLines = reviewLines(field, previous[field]);
    const newLines = reviewLines(field, next[field]);
    let change = 'changed';
    if (previous[field] === undefined) change = 'added';
    else if (next[field] === undefined) change = 'removed';
    changes.push({ field, label, change, lines: collapseUnchanged(diffLines(oldLines, newLines)) });
  }
  return changes;
}

/**
 * Every outside address a profile points to, so a moderator can read each one
 * rather than trusting the link text.
 */
export function profileUrls(profile) {
  if (!profile || typeof profile !== 'object') return [];
  const urls = [];
  if (typeof profile.image?.src === 'string') urls.push({ label: 'Image', url: profile.image.src });
  for (const item of Array.isArray(profile.work) ? profile.work : []) {
    if (typeof item?.url === 'string') urls.push({ label: `Work: ${item.title}`, url: item.url });
  }
  for (const item of Array.isArray(profile.links) ? profile.links : []) {
    if (typeof item?.url === 'string') urls.push({ label: `Link: ${item.label}`, url: item.url });
  }
  return urls;
}
