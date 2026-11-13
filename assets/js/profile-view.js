// Builds the DOM for one profile. The public profile page, the editor preview
// and moderator review all use it, so owners and moderators see exactly what
// would be published. Contributor content is only ever inserted with
// textContent or as attributes on elements created here, so submitted HTML or
// scripts are never executed.

import { safeFamily, safeImage, safeLinks, safeWork, toParagraphs } from './render.js';

export function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined && text !== null) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function heading(level, text) {
  return el(`h${Math.min(Math.max(level, 1), 6)}`, text);
}

function imageFigure(image, deferImages) {
  const figure = el('figure', null, 'profile-image');
  const show = () => {
    const img = el('img');
    img.src = image.src;
    img.alt = image.alt;
    img.loading = 'lazy';
    figure.replaceChildren(img);
  };
  if (!deferImages) {
    show();
    return figure;
  }
  // Reviewers choose when their browser contacts the image host.
  const load = el('button', 'Load image');
  load.type = 'button';
  load.addEventListener('click', () => {
    show();
    figure.tabIndex = -1;
    figure.focus();
  });
  figure.append(el('figcaption', `Image not loaded yet. Description: ${image.alt}`), load);
  return figure;
}

/**
 * Returns the elements that display `profile`. `headingLevel` is the level of
 * the name heading, so the profile can sit under another page's headings.
 * `deferImages` waits for a click before loading an outside image.
 */
export function renderProfileParts(profile, { headingLevel = 1, deferImages = false } = {}) {
  const parts = [];
  const section = (title, node) => {
    const wrapper = el('section', null, 'profile-section');
    wrapper.append(heading(headingLevel + 1, title), node);
    return wrapper;
  };

  const header = el('header', null, 'profile-header');
  header.append(heading(headingLevel, profile.name));
  if (profile.fictional) {
    header.append(el('p', 'Fictional demonstration profile', 'badge'));
  }
  header.append(el('p', profile.introduction, 'lede'));
  parts.push(header);

  const image = safeImage(profile.image);
  if (image) parts.push(imageFigure(image, deferImages));

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
      const title = heading(headingLevel + 2);
      if (item.url) {
        const link = el('a', item.title);
        link.href = item.url;
        link.rel = 'nofollow ugc';
        title.append(link);
      } else {
        title.textContent = item.title;
      }
      entry.append(title);
      if (item.description) entry.append(el('p', item.description));
      list.append(entry);
    }
    parts.push(section('Things I made', list));
  }

  const links = safeLinks(profile.links);
  if (links.length > 0) {
    const list = el('ul', null, 'link-list');
    for (const item of links) {
      const entry = el('li');
      const link = el('a', item.label);
      link.href = item.url;
      link.rel = 'nofollow ugc';
      entry.append(link);
      list.append(entry);
    }
    parts.push(section('Where to find me', list));
  }

  if (Array.isArray(profile.memories) && profile.memories.length > 0) {
    const list = el('ul');
    for (const memory of profile.memories) list.append(el('li', memory));
    parts.push(section('Memories', list));
  }

  const family = safeFamily(profile.family);
  if (family.length > 0) {
    const list = el('ul', null, 'family-list');
    for (const relation of family) {
      const entry = el('li');
      entry.append(el('span', `${relation.label}: `, 'family-relation'));
      if (relation.href) {
        const link = el('a', relation.name);
        link.href = relation.href;
        entry.append(link);
      } else {
        entry.append(el('span', relation.name));
      }
      if (relation.note) entry.append(el('p', relation.note));
      list.append(entry);
    }
    parts.push(section('Family', list));
  }

  parts.push(section('What I hope you carry forward', el('p', profile.carryForward)));
  return parts;
}
