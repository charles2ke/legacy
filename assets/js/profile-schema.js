// Shared profile format rules. Used by the website and by the validation script,
// so the browser and CI always agree on what a valid profile looks like.

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const MAX_LENGTHS = {
  slug: 60,
  name: 80,
  introduction: 280,
  story: 8000,
  value: 160,
  workTitle: 120,
  workDescription: 600,
  memory: 1000,
  imageAlt: 300,
  carryForward: 1000,
  url: 500,
};

// Only these URL schemes are allowed anywhere in a profile.
export const ALLOWED_URL_SCHEMES = ['https:', 'http:', 'mailto:'];

// Images are fetched by the browser, so they may not use mailto:.
export const ALLOWED_IMAGE_SCHEMES = ['https:', 'http:'];

// Images committed to this repository must live here.
export const IMAGE_PATH_PREFIX = 'assets/images/';

// Fields a contributor may use. Anything else is rejected so typos and
// unexpected (possibly sensitive) data never reach the site.
const ALLOWED_TOP_LEVEL_FIELDS = [
  'slug',
  'name',
  'introduction',
  'story',
  'values',
  'work',
  'memories',
  'image',
  'carryForward',
  'fictional',
];

const REQUIRED_TOP_LEVEL_FIELDS = ['slug', 'name', 'introduction', 'story', 'carryForward'];

/**
 * Returns true when `value` is an absolute URL we are willing to link to or
 * load. The accepted schemes can be narrowed with `schemes`.
 */
export function isSafeUrl(value, { schemes = ALLOWED_URL_SCHEMES } = {}) {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (trimmed === '' || trimmed.length > MAX_LENGTHS.url) return false;
  // Reject control characters that can be used to smuggle "javascript:" past checks.
  if (/[\u0000-\u001f\u007f]/.test(trimmed)) return false;

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    return false;
  }
  return schemes.includes(parsed.protocol);
}

/**
 * Image sources may either be an https/http URL or a file committed to
 * `assets/images/`. Traversal and odd characters are rejected so a profile can
 * never point at something outside that folder.
 */
export function isSafeImageSrc(value) {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (trimmed.startsWith(IMAGE_PATH_PREFIX)) {
    if (trimmed.length > MAX_LENGTHS.url) return false;
    if (trimmed.includes('..') || trimmed.endsWith('/')) return false;
    return /^[A-Za-z0-9._/-]+$/.test(trimmed);
  }
  return isSafeUrl(trimmed, { schemes: ALLOWED_IMAGE_SCHEMES });
}

function checkText(errors, path, value, maxLength, { required = false } = {}) {
  if (value === undefined || value === null) {
    if (required) errors.push(`${path}: is required`);
    return;
  }
  if (typeof value !== 'string') {
    errors.push(`${path}: must be a string`);
    return;
  }
  if (value.trim() === '') {
    errors.push(`${path}: must not be empty`);
    return;
  }
  if (value.length > maxLength) {
    errors.push(`${path}: must be ${maxLength} characters or fewer`);
  }
}

function checkArray(errors, path, value, maxItems) {
  if (!Array.isArray(value)) {
    errors.push(`${path}: must be an array`);
    return false;
  }
  if (value.length > maxItems) {
    errors.push(`${path}: must have ${maxItems} items or fewer`);
    return false;
  }
  return true;
}

/**
 * Validates one profile object.
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateProfile(profile) {
  const errors = [];

  if (typeof profile !== 'object' || profile === null || Array.isArray(profile)) {
    return { valid: false, errors: ['profile: must be a JSON object'] };
  }

  for (const key of Object.keys(profile)) {
    if (!ALLOWED_TOP_LEVEL_FIELDS.includes(key)) {
      errors.push(`${key}: is not an allowed field`);
    }
  }
  for (const key of REQUIRED_TOP_LEVEL_FIELDS) {
    if (profile[key] === undefined) errors.push(`${key}: is required`);
  }

  checkText(errors, 'slug', profile.slug, MAX_LENGTHS.slug);
  if (typeof profile.slug === 'string' && !SLUG_PATTERN.test(profile.slug)) {
    errors.push('slug: must use lowercase letters, numbers and single hyphens (e.g. "river-song")');
  }

  checkText(errors, 'name', profile.name, MAX_LENGTHS.name);
  checkText(errors, 'introduction', profile.introduction, MAX_LENGTHS.introduction);
  checkText(errors, 'story', profile.story, MAX_LENGTHS.story);
  checkText(errors, 'carryForward', profile.carryForward, MAX_LENGTHS.carryForward);

  if (profile.values !== undefined && checkArray(errors, 'values', profile.values, 10)) {
    profile.values.forEach((value, index) => {
      checkText(errors, `values[${index}]`, value, MAX_LENGTHS.value);
    });
  }

  if (profile.work !== undefined && checkArray(errors, 'work', profile.work, 20)) {
    profile.work.forEach((item, index) => {
      const base = `work[${index}]`;
      if (typeof item !== 'object' || item === null || Array.isArray(item)) {
        errors.push(`${base}: must be an object`);
        return;
      }
      checkText(errors, `${base}.title`, item.title, MAX_LENGTHS.workTitle);
      if (item.description !== undefined) {
        checkText(errors, `${base}.description`, item.description, MAX_LENGTHS.workDescription);
      }
      if (item.url !== undefined && !isSafeUrl(item.url)) {
        errors.push(`${base}.url: must be a valid https, http or mailto URL`);
      }
      for (const key of Object.keys(item)) {
        if (!['title', 'description', 'url'].includes(key)) {
          errors.push(`${base}.${key}: is not an allowed field`);
        }
      }
    });
  }

  if (profile.memories !== undefined && checkArray(errors, 'memories', profile.memories, 20)) {
    profile.memories.forEach((memory, index) => {
      checkText(errors, `memories[${index}]`, memory, MAX_LENGTHS.memory);
    });
  }

  if (profile.image !== undefined) {
    const image = profile.image;
    if (typeof image !== 'object' || image === null || Array.isArray(image)) {
      errors.push('image: must be an object with "src" and "alt"');
    } else {
      if (!isSafeImageSrc(image.src)) {
        errors.push(`image.src: must be an https/http URL or a file under ${IMAGE_PATH_PREFIX}`);
      }
      checkText(errors, 'image.alt', image.alt, MAX_LENGTHS.imageAlt, { required: true });
      for (const key of Object.keys(image)) {
        if (!['src', 'alt'].includes(key)) {
          errors.push(`image.${key}: is not an allowed field`);
        }
      }
    }
  }

  if (profile.fictional !== undefined && typeof profile.fictional !== 'boolean') {
    errors.push('fictional: must be true or false');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates a whole collection: every profile is valid, slugs are unique and
 * each profile's slug matches the file it lives in.
 * @param {{ slug: string, profile: unknown }[]} entries
 */
export function validateCollection(entries) {
  const errors = [];
  const seen = new Set();

  for (const entry of entries) {
    const result = validateProfile(entry.profile);
    for (const error of result.errors) {
      errors.push(`${entry.slug}: ${error}`);
    }
    if (result.valid && entry.profile.slug !== entry.slug) {
      errors.push(`${entry.slug}: slug "${entry.profile.slug}" must match the file name`);
    }
    if (seen.has(entry.slug)) {
      errors.push(`${entry.slug}: duplicate slug`);
    }
    seen.add(entry.slug);
  }

  return { valid: errors.length === 0, errors };
}
