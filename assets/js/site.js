// Page behaviour for the Legacy site. Contributor content is only ever inserted
// with textContent or as attributes on elements we create, so submitted HTML or
// scripts are never executed.

import { validateProfile } from './profile-schema.js';
import {
  profileDataUrl,
  profilePageUrl,
  safeImage,
  safeWork,
  toParagraphs,
} from './render.js';

const indexUrl = new URL('profiles/index.json', document.baseURI).toString();

function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined && text !== null) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function setStatus(container, message) {
  container.replaceChildren(el('p', message, 'status'));
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Request failed with status ${response.status}`);
  return response.json();
}

async function loadProfiles() {
  const index = await fetchJson(indexUrl);
  const slugs = Array.isArray(index?.profiles) ? index.profiles : [];
  const results = await Promise.all(
    slugs.map(async (slug) => {
      const url = profileDataUrl(slug, document.baseURI);
      if (!url) return null;
      try {
        const profile = await fetchJson(url);
        return validateProfile(profile).valid ? profile : null;
      } catch {
        return null;
      }
    }),
  );
  return results.filter(Boolean);
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

function renderList(container, profiles) {
  if (profiles.length === 0) {
    container.replaceChildren(
      el('p', 'No profiles have been published yet.', 'status'),
      el('p', 'The first one could be yours — see the contributing guide to add a profile by pull request.'),
    );
    return;
  }
  const list = el('ul', null, 'card-list');
  for (const profile of profiles) list.append(profileCard(profile));
  container.replaceChildren(list);
}

function section(title, node) {
  const wrapper = el('section', null, 'profile-section');
  wrapper.append(el('h2', title));
  wrapper.append(node);
  return wrapper;
}

function renderProfile(container, profile) {
  const parts = [];

  const header = el('header', null, 'profile-header');
  header.append(el('h1', profile.name));
  if (profile.fictional) {
    header.append(el('p', 'Fictional demonstration profile', 'badge'));
  }
  header.append(el('p', profile.introduction, 'lede'));
  parts.push(header);

  const image = safeImage(profile.image);
  if (image) {
    const figure = el('figure', null, 'profile-image');
    const img = el('img');
    img.src = image.src;
    img.alt = image.alt;
    img.loading = 'lazy';
    figure.append(img);
    parts.push(figure);
  }

  const story = el('div');
  for (const paragraph of toParagraphs(profile.story)) story.append(el('p', paragraph));
  parts.push(section('My story', story));

  const autobiography = toParagraphs(profile.autobiography);
  if (autobiography.length > 0) {
    const longForm = el('div');
    for (const paragraph of autobiography) longForm.append(el('p', paragraph));
    parts.push(section('My autobiography', longForm));
  }

  if (Array.isArray(profile.values) && profile.values.length > 0) {
    const list = el('ul');
    for (const value of profile.values) list.append(el('li', value));
    parts.push(section('What I believe', list));
  }

  const work = safeWork(profile.work);
  if (work.length > 0) {
    const list = el('ul', null, 'work-list');
    for (const item of work) {
      const entry = el('li');
      const heading = el('h3');
      if (item.url) {
        const link = el('a', item.title);
        link.href = item.url;
        link.rel = 'nofollow ugc';
        heading.append(link);
      } else {
        heading.textContent = item.title;
      }
      entry.append(heading);
      if (item.description) entry.append(el('p', item.description));
      list.append(entry);
    }
    parts.push(section('Things I made', list));
  }

  if (Array.isArray(profile.memories) && profile.memories.length > 0) {
    const list = el('ul');
    for (const memory of profile.memories) list.append(el('li', memory));
    parts.push(section('Memories', list));
  }

  parts.push(section('What I hope you carry forward', el('p', profile.carryForward)));

  const back = el('p', null, 'back-link');
  const backLink = el('a', '← All profiles');
  backLink.href = 'profiles.html';
  back.append(backLink);
  parts.push(back);

  container.replaceChildren(...parts);
  document.title = `${profile.name} — Legacy`;
}

async function initListPage(container) {
  setStatus(container, 'Loading profiles…');
  try {
    const profiles = await loadProfiles();
    profiles.sort((a, b) => a.name.localeCompare(b.name));
    renderList(container, profiles);
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
    const profile = await fetchJson(url);
    if (!validateProfile(profile).valid) {
      setStatus(container, 'This profile could not be displayed because its file is not valid.');
      return;
    }
    renderProfile(container, profile);
  } catch {
    setStatus(container, 'This profile could not be found.');
  }
}

const listContainer = document.querySelector('[data-profile-list]');
if (listContainer) initListPage(listContainer);

const profileContainer = document.querySelector('[data-profile-view]');
if (profileContainer) initProfilePage(profileContainer);
