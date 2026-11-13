// Page behaviour for the Legacy site. Contributor content is only ever inserted
// with textContent or as attributes on elements we create, so submitted HTML or
// scripts are never executed.

import { validateProfile } from './profile-schema.js';
import { el, renderProfileParts } from './profile-view.js';
import { profileDataUrl, profilePageUrl, queryProfiles } from './render.js';

const FILTER_KEYS = ['q', 'fictional', 'hasWork'];

function setStatus(container, message) {
  container.replaceChildren(el('p', message, 'status'));
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Request failed with status ${response.status}`);
  return response.json();
}

// The GitHub Pages build marks its pages with data-legacy-static. That copy has
// no server, so it reads the files written by scripts/build-pages.js, relative
// to the page so it also works under a project path such as /legacy/.
const isStaticSite = document.documentElement.hasAttribute('data-legacy-static');
let staticProfiles;

function loadStaticProfiles() {
  staticProfiles ||= fetchJson(new URL('data/profiles.json', document.baseURI)).then((data) =>
    Array.isArray(data?.profiles) ? data.profiles : [],
  );
  return staticProfiles;
}

async function loadProfiles() {
  const query = new URLSearchParams(window.location.search);
  if (isStaticSite) return queryProfiles(await loadStaticProfiles(), query);
  const response = await fetchJson(`/api/profiles?${query}`);
  return response;
}

async function loadProfile(slug) {
  if (!isStaticSite) return fetchJson(`/api/profiles/${encodeURIComponent(slug)}`);
  const profile = (await loadStaticProfiles()).find((candidate) => candidate?.slug === slug);
  if (!profile) throw new Error('Profile not found');
  return profile;
}

function loadConfig() {
  return fetchJson(isStaticSite ? new URL('data/config.json', document.baseURI) : '/api/config');
}

function profileCard(profile) {
  const card = el('li', null, 'card');
  const heading = el('h2');
  const href = profilePageUrl(profile.slug);
  if (href) {
    const link = el('a', profile.name);
    link.href = href;
    heading.append(link);
  } else {
    heading.textContent = profile.name;
  }
  card.append(heading);

  if (profile.fictional) {
    card.append(el('p', 'Fictional demonstration profile', 'badge'));
  }
  card.append(el('p', profile.introduction));
  return card;
}

function hasActiveFilters(query) {
  return FILTER_KEYS.some((key) => (query.get(key) || '').trim() !== '');
}

function clearFiltersLink() {
  const paragraph = el('p');
  const link = el('a', 'Clear search and filters');
  link.href = 'profiles.html';
  paragraph.append(link);
  return paragraph;
}

/** Shows the current search and filters in the form after the page reloads. */
function populateFilters(form) {
  const query = new URLSearchParams(window.location.search);
  if (form.elements.q) form.elements.q.value = query.get('q') || '';
  if (form.elements.fictional) {
    const fictional = query.get('fictional');
    form.elements.fictional.value = fictional === 'true' || fictional === 'false' ? fictional : '';
  }
  if (form.elements.hasWork) form.elements.hasWork.checked = query.get('hasWork') === 'true';
}

function renderList(container, profiles, pagination) {
  const query = new URLSearchParams(window.location.search);
  const filtered = hasActiveFilters(query);
  if (profiles.length === 0) {
    if (filtered) {
      container.replaceChildren(el('p', 'No profiles match your search.', 'status'), clearFiltersLink());
      return;
    }
    container.replaceChildren(
      el('p', 'No profiles have been published yet.', 'status'),
      el(
        'p',
        isStaticSite
          ? 'This is a read-only copy of the archive.'
          : 'The first one could be yours — create an account to draft a profile.',
      ),
    );
    return;
  }
  const list = el('ul', null, 'card-list');
  for (const profile of profiles) list.append(profileCard(profile));
  const summary = el(
    'p',
    `Page ${pagination.page} of ${Math.max(1, pagination.pages)} · ${pagination.total} profile${pagination.total === 1 ? '' : 's'}`,
    'status',
  );
  const navigation = el('nav', null, 'pagination');
  navigation.setAttribute('aria-label', 'Profile pages');
  if (pagination.page > 1) {
    query.set('page', String(pagination.page - 1));
    const previous = el('a', '← Previous');
    previous.href = `?${query}`;
    navigation.append(previous);
  }
  if (pagination.page < pagination.pages) {
    query.set('page', String(pagination.page + 1));
    const next = el('a', 'Next →');
    next.href = `?${query}`;
    navigation.append(next);
  }
  container.replaceChildren(summary, ...(filtered ? [clearFiltersLink()] : []), list, navigation);
}

function renderProfile(container, profile) {
  const back = el('p', null, 'back-link');
  const backLink = el('a', '← All profiles');
  backLink.href = 'profiles.html';
  back.append(backLink);
  container.replaceChildren(...renderProfileParts(profile), back);
  document.title = `${profile.name} — Legacy`;
}

async function initListPage(container) {
  setStatus(container, 'Loading profiles…');
  try {
    const result = await loadProfiles();
    renderList(container, result.profiles, result.pagination);
  } catch {
    setStatus(container, 'Profiles could not be loaded. Try refreshing the page.');
  }
}

async function initProfilePage(container) {
  const slug = new URLSearchParams(window.location.search).get('slug');
  const url = profileDataUrl(slug, document.baseURI);
  if (!url) {
    setStatus(container, 'No profile was requested, or the address is not valid.');
    return;
  }
  setStatus(container, 'Loading profile…');
  try {
    const profile = await loadProfile(slug);
    if (!validateProfile(profile).valid) {
      setStatus(container, 'This profile could not be displayed because its file is not valid.');
      return;
    }
    renderProfile(container, profile);
  } catch {
    setStatus(container, 'This profile could not be found.');
  }
}

const filterForm = document.querySelector('[data-profile-filters]');
if (filterForm) populateFilters(filterForm);

const listContainer = document.querySelector('[data-profile-list]');
if (listContainer) initListPage(listContainer);

const profileContainer = document.querySelector('[data-profile-view]');
if (profileContainer) initProfilePage(profileContainer);

const removalContact = document.querySelector('[data-removal-contact]');
if (removalContact) {
  loadConfig()
    .then((config) => {
      if (config.removalContact) {
        const link = el('a', 'Private removal contact');
        link.href = config.removalContact;
        removalContact.replaceChildren(link);
      } else {
        removalContact.textContent =
          'Private removal contact is not configured. Use the repository’s public issue guidance without posting sensitive evidence.';
      }
    })
    .catch(() => {
      removalContact.textContent = 'Removal contact configuration could not be loaded.';
    });
}
