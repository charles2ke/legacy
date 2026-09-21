// Pure helpers shared by the site pages. They contain no DOM access so they can
// be unit tested in Node, and so that rendering stays text-only by construction.

import { SLUG_PATTERN, isSafeImageSrc, isSafeUrl } from './profile-schema.js';

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
  return new URL(`profiles/${slug}.json`, baseUrl).toString();
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
