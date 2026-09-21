// Shared profile format rules. Used by the website and by the validation script,
// so the browser and CI always agree on what a valid profile looks like.

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const MAX_LENGTHS = {
  slug: 60,
  name: 80,
  introduction: 280,
  story: 8000,
  autobiography: 20000,
  value: 160,
  workTitle: 120,
  workDescription: 600,
  linkLabel: 80,
  memory: 1000,
  imageAlt: 300,
  carryForward: 1000,
  url: 500,
  admin: 39,
  allowedViewer: 254,
  relationName: 80,
  relationNote: 200,
};

// Relationships a profile may describe. A fixed list keeps the wording simple
// and stops free text being used to record sensitive detail about other people.
export const ALLOWED_RELATIONS = [
  'parent',
  'child',
  'sibling',
  'partner',
  'grandparent',
  'grandchild',
  'relative',
  'chosen-family',
];

// How widely a profile may be published. Declared in the profile, but enforced
// where it can actually be enforced: by the publication guard in
// scripts/validate-profiles.js and by the host serving a private instance.
// It is never a browser-side access control. See docs/VISIBILITY.md.
export const VISIBILITY_MODES = ['public', 'private', 'restricted'];

// Profiles without a "visibility" field keep today's behaviour.
export const DEFAULT_VISIBILITY = 'public';

// What kind of deployment this copy of the site is. A public instance (this
// repository) may only hold public profiles; a private instance may hold all of
// them, because access is enforced by repository permissions and by the host.
export const INSTANCE_MODES = ['public', 'private'];

// Assume the strictest instance when nothing says otherwise, so a missing or
// unreadable setting can never widen what is published.
export const DEFAULT_INSTANCE = 'public';

// GitHub usernames: alphanumeric with single hyphens, up to 39 characters.
export const GITHUB_USERNAME_PATTERN = /^[A-Za-z0-9](?:-?[A-Za-z0-9])*$/;

// Admins own a profile and may change its visibility; kept small on purpose.
export const MAX_ADMINS = 10;

// Cloudflare Access allows up to 1000 email addresses in one policy rule, which
// is the tightest documented limit among the hosts described in
// docs/VISIBILITY.md.
export const MAX_ALLOWED_VIEWERS = 1000;

// Identifiers an authenticating host can match on. Each alternative uses a
// delimiter that cannot appear in the surrounding character classes, so these
// patterns match in linear time.
const VIEWER_EMAIL_PATTERN = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/;
const VIEWER_DOMAIN_PATTERN = /^@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/;
const VIEWER_GROUP_PATTERN = /^group:[A-Za-z0-9][A-Za-z0-9 ._-]*$/;

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
  'autobiography',
  'values',
  'work',
  'links',
  'memories',
  'image',
  'family',
  'carryForward',
  'fictional',
  'visibility',
  'admins',
  'allowedViewers',
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

/**
 * The visibility a profile asks for. Only an absent field means "public":
 * anything else is returned as it was written, including null and unknown
 * strings, so a hostile or mistaken value can never be mistaken for "public"
 * by the callers below.
 */
export function profileVisibility(profile) {
  const value = profile?.visibility;
  return value === undefined ? DEFAULT_VISIBILITY : value;
}

/**
 * True when a profile may be published by a deployment of the given kind. A
 * public instance publishes public profiles only; a private instance may hold
 * every mode, because the repository and the host in front of it decide who
 * gets to read anything at all.
 *
 * This is a publication rule, not an access control: on a public instance the
 * browser has already downloaded the file by the time this runs.
 */
export function isPublishableOn(profile, instance = DEFAULT_INSTANCE) {
  const visibility = profileVisibility(profile);
  if (!VISIBILITY_MODES.includes(visibility)) return false;
  if (instance === 'private') return true;
  return visibility === DEFAULT_VISIBILITY;
}

/** Normalises an instance name, falling back to the strictest one. */
export function normaliseInstance(value) {
  return typeof value === 'string' && INSTANCE_MODES.includes(value) ? value : DEFAULT_INSTANCE;
}

/**
 * True when `value` is an identifier an authenticating host can match a signed
 * in visitor against: an email address, an `@domain` covering everyone with an
 * address there, or `group:<name>` for an identity provider group.
 */
export function isAllowedViewer(value) {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (trimmed === '' || trimmed.length > MAX_LENGTHS.allowedViewer) return false;
  if (/[\u0000-\u001f\u007f]/.test(trimmed)) return false;
  return (
    VIEWER_EMAIL_PATTERN.test(trimmed) ||
    VIEWER_DOMAIN_PATTERN.test(trimmed) ||
    VIEWER_GROUP_PATTERN.test(trimmed)
  );
}

function checkText(errors, path, value, maxLength, { required = false } = {}) {
  if (value === undefined) {
    if (required) errors.push(`${path}: is required`);
    return;
  }
  if (value === null || typeof value !== 'string') {
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

  if (profile.autobiography !== undefined) {
    checkText(errors, 'autobiography', profile.autobiography, MAX_LENGTHS.autobiography);
  }

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

  if (profile.links !== undefined && checkArray(errors, 'links', profile.links, 10)) {
    profile.links.forEach((item, index) => {
      const base = `links[${index}]`;
      if (typeof item !== 'object' || item === null || Array.isArray(item)) {
        errors.push(`${base}: must be an object with "label" and "url"`);
        return;
      }
      checkText(errors, `${base}.label`, item.label, MAX_LENGTHS.linkLabel, { required: true });
      if (!isSafeUrl(item.url)) {
        errors.push(`${base}.url: must be a valid https, http or mailto URL`);
      }
      for (const key of Object.keys(item)) {
        if (!['label', 'url'].includes(key)) {
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

  if (profile.family !== undefined && checkArray(errors, 'family', profile.family, 20)) {
    profile.family.forEach((item, index) => {
      const base = `family[${index}]`;
      if (typeof item !== 'object' || item === null || Array.isArray(item)) {
        errors.push(`${base}: must be an object`);
        return;
      }
      if (!ALLOWED_RELATIONS.includes(item.relation)) {
        errors.push(`${base}.relation: must be one of ${ALLOWED_RELATIONS.join(', ')}`);
      }
      checkText(errors, `${base}.name`, item.name, MAX_LENGTHS.relationName, { required: true });
      if (item.slug !== undefined) {
        checkText(errors, `${base}.slug`, item.slug, MAX_LENGTHS.slug);
        if (typeof item.slug === 'string' && !SLUG_PATTERN.test(item.slug)) {
          errors.push(`${base}.slug: must be the slug of a profile in this archive`);
        }
        if (item.slug === profile.slug) {
          errors.push(`${base}.slug: must not be this profile's own slug`);
        }
      }
      if (item.note !== undefined) {
        checkText(errors, `${base}.note`, item.note, MAX_LENGTHS.relationNote);
      }
      for (const key of Object.keys(item)) {
        if (!['relation', 'name', 'slug', 'note'].includes(key)) {
          errors.push(`${base}.${key}: is not an allowed field`);
        }
      }
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

  const visibility = profileVisibility(profile);
  if (profile.visibility !== undefined && !VISIBILITY_MODES.includes(visibility)) {
    errors.push(`visibility: must be one of ${VISIBILITY_MODES.map((mode) => `"${mode}"`).join(', ')}`);
  }

  if (profile.admins !== undefined && checkArray(errors, 'admins', profile.admins, MAX_ADMINS)) {
    profile.admins.forEach((admin, index) => {
      if (typeof admin !== 'string' || !GITHUB_USERNAME_PATTERN.test(admin) || admin.length > MAX_LENGTHS.admin) {
        errors.push(`admins[${index}]: must be a GitHub username, without the leading "@"`);
      }
    });
  }

  // An allowlist only means something where a host checks it, and it is itself
  // personal data, so it may exist only on a profile that asks to be restricted.
  if (visibility === 'restricted') {
    if (profile.allowedViewers === undefined) {
      errors.push('allowedViewers: is required when visibility is "restricted"');
    }
  } else if (profile.allowedViewers !== undefined) {
    errors.push('allowedViewers: is only allowed when visibility is "restricted"');
  }

  if (
    profile.allowedViewers !== undefined &&
    checkArray(errors, 'allowedViewers', profile.allowedViewers, MAX_ALLOWED_VIEWERS)
  ) {
    if (profile.allowedViewers.length === 0) {
      errors.push('allowedViewers: must name at least one viewer');
    }
    profile.allowedViewers.forEach((viewer, index) => {
      if (!isAllowedViewer(viewer)) {
        errors.push(
          `allowedViewers[${index}]: must be an email address, "@example.com" for a whole domain, or "group:<name>"`,
        );
      }
    });
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates a whole collection: every profile is valid, slugs are unique and
 * each profile's slug matches the file it lives in. The uniqueness and file
 * name checks also cover callers that build entries from something other than
 * a directory listing.
 *
 * `instance` says what kind of deployment these files belong to. On a public
 * instance a profile that asks to be private or restricted is an error, not a
 * hidden page: committing it would publish it, whatever it says about itself.
 * @param {{ slug: string, profile: unknown }[]} entries
 */
export function validateCollection(entries, { instance = DEFAULT_INSTANCE } = {}) {
  const errors = [];
  const seen = new Set();
  const knownSlugs = new Set(entries.map((entry) => entry.slug));

  for (const entry of entries) {
    const result = validateProfile(entry.profile);
    for (const error of result.errors) {
      errors.push(`${entry.slug}: ${error}`);
    }
    if (result.valid && entry.profile.slug !== entry.slug) {
      errors.push(`${entry.slug}: slug "${entry.profile.slug}" must match the file name`);
    }
    if (result.valid && !isPublishableOn(entry.profile, instance)) {
      errors.push(
        `${entry.slug}: visibility "${profileVisibility(entry.profile)}" is not allowed on a "${instance}" ` +
          'instance, because everything committed here is published. Remove ' +
          `profiles/${entry.slug}.json and its entry in profiles/index.json, and keep the profile in a ` +
          'private instance instead (see docs/VISIBILITY.md).',
      );
    }
    if (seen.has(entry.slug)) {
      errors.push(`${entry.slug}: duplicate slug`);
    }
    seen.add(entry.slug);
    if (Array.isArray(entry.profile?.family)) {
      entry.profile.family.forEach((item, index) => {
        if (typeof item?.slug === 'string' && SLUG_PATTERN.test(item.slug) && !knownSlugs.has(item.slug)) {
          errors.push(`${entry.slug}: family[${index}].slug: must be the slug of a profile in this archive`);
        }
      });
    }
  }

  return { valid: errors.length === 0, errors };
}
