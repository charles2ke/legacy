import { isSafeImageSrc, isSafeUrl, validateProfile } from './profile-schema.js';
import { el, renderProfileParts } from './profile-view.js';
import { diffProfiles, profilePageUrl, profileUrls } from './render.js';

let csrfToken;

async function request(url, options = {}, retried = false) {
  const method = options.method || 'GET';
  const headers = { Accept: 'application/json', ...(options.headers || {}) };
  if (!['GET', 'HEAD'].includes(method)) {
    csrfToken ||= (await (await fetch('/api/csrf')).json()).token;
    headers['x-csrf-token'] = csrfToken;
    headers['content-type'] = 'application/json';
  }
  const response = await fetch(url, { ...options, method, headers });
  const body = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) {
    // A new session, such as the one issued after a password change, has a
    // new token. The rejected request did nothing, so it is safe to retry.
    if (response.status === 403 && body?.error === 'Invalid CSRF token' && !retried) {
      csrfToken = undefined;
      return request(url, options, true);
    }
    const error = new Error(body?.error || 'Request failed');
    error.status = response.status;
    error.details = body?.details;
    throw error;
  }
  return body;
}

function message(text, error = false, output = document.querySelector('[data-message]')) {
  if (!output) return;
  output.textContent = text;
  output.classList.toggle('error', error);
  output.focus();
}

function errorText(error) {
  return `${error.message}${error.details ? `: ${error.details.join('; ')}` : ''}`;
}

function lines(value) {
  return value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);
}

function statusText(profile) {
  const stillPublic = profile.approved ? ' The previously approved version is still public.' : '';
  if (profile.status === 'pending') return `Waiting for moderator review.${stillPublic}`;
  if (profile.status === 'approved') return 'Published. A moderator approved this version.';
  if (profile.status === 'rejected') {
    return `A moderator asked for changes. Edit the draft and submit it again.${stillPublic}`;
  }
  return profile.approved
    ? 'Published, with newer changes in a private draft that has not been submitted.'
    : 'Private draft. It has not been submitted for review.';
}

function pageNavigation({ page, pages }, label) {
  if (pages <= 1) return null;
  const navigation = el('nav', null, 'pagination');
  navigation.setAttribute('aria-label', label);
  if (page > 1) {
    const previous = el('a', '← Previous');
    previous.href = `?page=${page - 1}`;
    navigation.append(previous);
  }
  navigation.append(el('span', `Page ${page} of ${pages}`));
  if (page < pages) {
    const next = el('a', 'Next →');
    next.href = `?page=${page + 1}`;
    navigation.append(next);
  }
  return navigation;
}

function currentPage() {
  return Math.max(1, Number.parseInt(new URLSearchParams(window.location.search).get('page') || '1', 10) || 1);
}

// Fields the guided editor shows. Anything else on a profile is kept unchanged
// when the editor saves, rather than silently dropped.
const EDITOR_FIELDS = new Set([
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
]);

function unmanagedFields(profile) {
  return Object.fromEntries(Object.entries(profile || {}).filter(([key]) => !EDITOR_FIELDS.has(key)));
}

let entrySequence = 0;

function capitalized(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function entriesIn(group) {
  return [...group.querySelector('[data-entries]').children];
}

function renumberEntries(group) {
  const noun = group.dataset.noun;
  const entries = entriesIn(group);
  entries.forEach((entry, index) => {
    entry.querySelector('[data-entry-legend]').textContent = `${capitalized(noun)} ${index + 1}`;
    entry.querySelector('[data-remove]').textContent = `Remove ${noun} ${index + 1}`;
  });
  const max = Number(group.dataset.max);
  group.querySelector('[data-add]').disabled = entries.length >= max;
  group.querySelector('[data-limit]').textContent =
    entries.length >= max ? `You have added the most allowed (${max}).` : '';
}

function addEntry(group, values = {}) {
  const kind = group.dataset.repeat;
  const entry = document.querySelector(`template[data-template="${kind}"]`).content.firstElementChild.cloneNode(true);
  entrySequence += 1;
  for (const field of entry.querySelectorAll('[data-field]')) {
    field.id = `${kind}-${entrySequence}-${field.dataset.field}`;
    const value = values[field.dataset.field];
    if (typeof value === 'string') field.value = value;
  }
  for (const label of entry.querySelectorAll('label[data-for]')) {
    label.htmlFor = `${kind}-${entrySequence}-${label.dataset.for}`;
  }
  group.querySelector('[data-entries]').append(entry);
  renumberEntries(group);
  return entry;
}

function entryValues(form, kind) {
  return entriesIn(form.querySelector(`[data-repeat="${kind}"]`)).map((entry) =>
    Object.fromEntries([...entry.querySelectorAll('[data-field]')].map((field) => [field.dataset.field, field.value.trim()])),
  );
}

function withoutBlanks(object) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== ''));
}

function profileFromForm(form, preserved = {}) {
  const data = new FormData(form);
  const text = (name) => String(data.get(name) ?? '').trim();
  const profile = {
    ...preserved,
    slug: text('slug'),
    name: text('name'),
    introduction: text('introduction'),
    story: text('story'),
    carryForward: text('carryForward'),
  };
  const autobiography = text('autobiography');
  if (autobiography) profile.autobiography = autobiography;
  const values = lines(text('values'));
  if (values.length) profile.values = values;
  const memories = lines(text('memories'));
  if (memories.length) profile.memories = memories;
  // Required parts are always sent, even when empty, so validation reports
  // them instead of an incomplete entry being saved.
  const work = entryValues(form, 'work').map(({ title, description, url }) => ({
    title,
    ...withoutBlanks({ description, url }),
  }));
  if (work.length) profile.work = work;
  const links = entryValues(form, 'links').map(({ label, url }) => ({ label, url }));
  if (links.length) profile.links = links;
  const family = entryValues(form, 'family').map(({ relation, name, slug, note }) => ({
    relation,
    name,
    ...withoutBlanks({ slug, note }),
  }));
  if (family.length) profile.family = family;
  const imageSrc = text('imageSrc');
  const imageAlt = text('imageAlt');
  if (imageSrc || imageAlt) profile.image = { src: imageSrc, alt: imageAlt };
  if (data.get('fictional') === 'on') profile.fictional = true;
  return profile;
}

function populateEditor(form, profile) {
  for (const key of ['slug', 'name', 'introduction', 'story', 'autobiography', 'carryForward']) {
    form.elements[key].value = profile[key] || '';
  }
  form.elements.values.value = (profile.values || []).join('\n');
  form.elements.memories.value = (profile.memories || []).join('\n');
  form.elements.imageSrc.value = profile.image?.src || '';
  form.elements.imageAlt.value = profile.image?.alt || '';
  form.elements.fictional.checked = profile.fictional === true;
  for (const group of form.querySelectorAll('[data-repeat]')) {
    group.querySelector('[data-entries]').replaceChildren();
    const items = profile[group.dataset.repeat];
    for (const item of Array.isArray(items) ? items : []) addEntry(group, item);
    renumberEntries(group);
  }
}

function renderPreview(container, profile) {
  const { errors } = validateProfile(profile);
  const parts = [];
  if (errors.length) {
    const problems = el('div', null, 'note problems');
    const list = el('ul');
    for (const error of errors) list.append(el('li', error));
    problems.append(
      el('p', errors.length === 1 ? 'Fix this problem before saving:' : `Fix these ${errors.length} problems before saving:`),
      list,
    );
    parts.push(problems);
  } else {
    parts.push(el('p', 'No problems found. This is how readers will see the profile once it is approved.', 'status'));
  }
  const view = el('div', null, 'profile-preview');
  view.append(...renderProfileParts(profile, { headingLevel: 3 }));
  const raw = el('details');
  raw.append(el('summary', 'Exact data that will be saved'), el('pre', JSON.stringify(profile, null, 2)));
  container.replaceChildren(...parts, view, raw);
  container.focus();
}

async function initAuthForm(form) {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    try {
      const result = await request(form.dataset.endpoint, {
        method: 'POST',
        body: JSON.stringify(data),
      });
      if (form.dataset.endpoint === '/api/auth/request-reset') {
        message(`${result.message}${result.recoveryConfigured ? '' : ' Email delivery is not configured.'}`);
      } else if (form.dataset.endpoint === '/api/auth/reset-password') {
        message(result.message);
      } else {
        window.location.assign('dashboard.html');
      }
    } catch (error) {
      message(error.message, true);
    }
  });
}

async function initDashboard(container) {
  try {
    const [{ profiles }, user] = await Promise.all([request('/api/me/profiles'), request('/api/me')]);
    document.querySelector('[data-account]').textContent = `Signed in as ${user.email}`;
    if (user.role === 'moderator') {
      for (const link of document.querySelectorAll('[data-moderator-link]')) link.hidden = false;
    }
    if (!profiles.length) {
      container.textContent = 'You have no profiles yet.';
      return;
    }
    const list = document.createElement('ul');
    list.className = 'card-list';
    for (const profile of profiles) {
      const item = document.createElement('li');
      item.className = 'card';
      const heading = document.createElement('h2');
      heading.textContent = profile.draft?.name || profile.slug;
      const status = document.createElement('p');
      status.textContent = `Status: ${statusText(profile)}`;
      const edit = document.createElement('a');
      edit.href = `editor.html?id=${profile.id}`;
      edit.textContent = 'Edit draft';
      item.append(heading, status, edit);
      if (profile.feedback) {
        const feedback = document.createElement('p');
        feedback.textContent = `Moderator feedback: ${profile.feedback}`;
        item.append(feedback);
      }
      if (profile.approved) {
        const publicLink = document.createElement('a');
        publicLink.href = `profile.html?slug=${encodeURIComponent(profile.slug)}`;
        publicLink.textContent = 'View published revision';
        const unpublish = document.createElement('button');
        unpublish.type = 'button';
        unpublish.textContent = 'Unpublish';
        unpublish.dataset.action = 'unpublish';
        unpublish.dataset.id = profile.id;
        item.append(document.createTextNode(' · '), publicLink, document.createTextNode(' '), unpublish);
      }
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = 'Delete profile';
      remove.dataset.action = 'delete';
      remove.dataset.id = profile.id;
      item.append(document.createTextNode(' '), remove);
      list.append(item);
    }
    container.replaceChildren(list);
    container.addEventListener('click', async (event) => {
      const button = event.target.closest('button[data-action]');
      if (!button) return;
      const verb = button.dataset.action === 'delete' ? 'delete' : 'unpublish';
      if (!window.confirm(`Are you sure you want to ${verb} this profile?`)) return;
      try {
        await request(
          `/api/me/profiles/${button.dataset.id}${verb === 'unpublish' ? '/unpublish' : ''}`,
          { method: verb === 'delete' ? 'DELETE' : 'POST', body: '{}' },
        );
        window.location.reload();
      } catch (error) {
        message(error.message, true);
      }
    });
  } catch {
    window.location.assign('login.html');
  }
}

async function initEditor(form) {
  let id = new URLSearchParams(window.location.search).get('id');
  let preserved = {};
  const submitSection = document.querySelector('[data-submit-review]');
  const consent = submitSection.querySelector('[name="consent"]');
  const snapshot = () => JSON.stringify(profileFromForm(form, preserved));
  let savedSnapshot;

  for (const group of form.querySelectorAll('[data-repeat]')) renumberEntries(group);
  form.addEventListener('click', (event) => {
    const add = event.target.closest('[data-add]');
    if (add) {
      addEntry(add.closest('[data-repeat]')).querySelector('[data-field]').focus();
      return;
    }
    const remove = event.target.closest('[data-remove]');
    if (remove) {
      const group = remove.closest('[data-repeat]');
      remove.closest('.entry').remove();
      renumberEntries(group);
      group.querySelector('[data-add]').focus();
    }
  });

  const showStatus = (profile) => {
    const panel = document.querySelector('[data-editor-status]');
    panel.hidden = false;
    panel.querySelector('[data-status-text]').textContent =
      profile.status === 'pending'
        ? `${statusText(profile)} Saving changes takes it out of the review queue until you submit it again.`
        : statusText(profile);
    const published = panel.querySelector('[data-status-public]');
    const href = profile.approved ? profilePageUrl(profile.approved.slug) : null;
    published.hidden = !href;
    if (href) published.querySelector('a').href = href;
    const feedback = panel.querySelector('[data-status-feedback]');
    feedback.hidden = !profile.feedback;
    feedback.textContent = profile.feedback ? `Latest moderator feedback: ${profile.feedback}` : '';
    form.elements.slug.readOnly = Boolean(profile.approved);
    document.querySelector('[data-slug-hint]').textContent = profile.approved
      ? 'A published profile keeps its address. To change it, unpublish the profile first.'
      : 'Lowercase letters, numbers and single hyphens.';
  };
  const refreshStatus = async () => {
    const { profiles } = await request('/api/me/profiles');
    const current = profiles.find((profile) => String(profile.id) === String(id));
    if (!current) throw new Error('Profile not found');
    showStatus(current);
    return current;
  };

  try {
    if (id) {
      const current = await refreshStatus();
      preserved = unmanagedFields(current.draft);
      populateEditor(form, current.draft || {});
      const kept = Object.keys(preserved);
      const note = document.querySelector('[data-unmanaged]');
      note.hidden = kept.length === 0;
      note.textContent = `This profile also has settings this editor does not show (${kept.join(', ')}). They are kept unchanged.`;
      submitSection.hidden = false;
    } else {
      await request('/api/me');
    }
  } catch (error) {
    if (error.status === 401) {
      window.location.assign('login.html');
      return;
    }
    message(error.message, true);
  }
  savedSnapshot = snapshot();
  window.addEventListener('beforeunload', (event) => {
    if (snapshot() === savedSnapshot) return;
    event.preventDefault();
    event.returnValue = '';
  });

  const save = async () => {
    const profile = profileFromForm(form, preserved);
    const saved = await request(id ? `/api/me/profiles/${id}` : '/api/me/profiles', {
      method: id ? 'PUT' : 'POST',
      body: JSON.stringify({ profile }),
    });
    savedSnapshot = JSON.stringify(profile);
    if (!id) {
      id = String(saved.id);
      window.history.replaceState(null, '', `editor.html?id=${saved.id}`);
      submitSection.hidden = false;
    }
    await refreshStatus().catch(() => {});
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await save();
      message('Private draft saved. Only you can see it until you submit it for review.');
    } catch (error) {
      message(errorText(error), true);
    }
  });
  const previewContainer = document.querySelector('[data-profile-preview]');
  let previewSnapshot = null;
  document.querySelector('[data-preview]').addEventListener('click', () => {
    previewSnapshot = snapshot();
    renderPreview(previewContainer, profileFromForm(form, preserved));
  });
  // An outdated preview would still claim to show what readers will see.
  const invalidatePreview = () => {
    if (previewSnapshot === null || snapshot() === previewSnapshot) return;
    previewSnapshot = null;
    previewContainer.replaceChildren(
      el('p', 'You have changed the profile since this preview. Use “Preview profile” to see it again.', 'note'),
    );
  };
  for (const type of ['input', 'change', 'click']) form.addEventListener(type, invalidatePreview);
  submitSection.querySelector('button').addEventListener('click', async () => {
    if (!consent.checked) {
      message('Tick the consent box before submitting this profile for review.', true);
      return;
    }
    let savedFirst = false;
    try {
      if (snapshot() !== savedSnapshot) {
        if (!form.reportValidity()) return;
        await save();
        savedFirst = true;
      }
      await request(`/api/me/profiles/${id}/submit`, { method: 'POST', body: JSON.stringify({ consent: true }) });
      consent.checked = false;
      await refreshStatus().catch(() => {});
      message(
        savedFirst
          ? 'Saved your latest changes and submitted them for moderator review.'
          : 'Submitted for moderator review.',
      );
    } catch (error) {
      message(`${savedFirst ? 'Your changes were saved, but submitting failed. ' : ''}${errorText(error)}`, true);
    }
  });
}

function diffLine(line) {
  if (line.type === 'skipped') {
    return el('p', `… ${line.count} unchanged line${line.count === 1 ? '' : 's'} …`, 'diff-line diff-skipped');
  }
  const row = el('p', null, `diff-line diff-${line.type}`);
  const marker = el('span', { added: '+', removed: '−', same: '' }[line.type], 'diff-marker');
  marker.setAttribute('aria-hidden', 'true');
  row.append(marker);
  if (line.type === 'same') {
    row.append(el('span', line.text));
  } else {
    row.append(
      el('span', line.type === 'added' ? 'Added: ' : 'Removed: ', 'visually-hidden'),
      el(line.type === 'added' ? 'ins' : 'del', line.text),
    );
  }
  return row;
}

function renderChanges(changes) {
  if (!changes.length) return [el('p', 'This submission is identical to the published version.')];
  return changes.map((change) => {
    const block = el('div', null, 'change');
    block.append(el('h4', `${change.label} (${change.change})`));
    if (!change.lines.some((line) => line.type === 'added' || line.type === 'removed')) {
      block.append(el('p', 'Only spacing or line breaks changed.', 'status'));
      return block;
    }
    const diff = el('div', null, 'diff');
    diff.append(...change.lines.map(diffLine));
    block.append(diff);
    return block;
  });
}

function moderationCard(profile, onDecided) {
  const name = profile.draft?.name || profile.slug;
  const article = el('article', null, 'moderation-card');
  const heading = el('h2', name);
  heading.id = `review-${profile.id}`;
  article.setAttribute('aria-labelledby', heading.id);
  const facts = [
    profile.approved ? 'Update to a published profile' : 'New profile',
    `address ${profile.slug}`,
    `revision ${profile.revisionId}`,
    profile.consentedAt ? `consent given ${profile.consentedAt} UTC` : null,
  ];
  article.append(heading, el('p', facts.filter(Boolean).join(' · '), 'review-facts'));

  const changes = el('section');
  if (profile.approved) {
    changes.append(
      el('h3', 'Changes since the published version'),
      ...renderChanges(diffProfiles(profile.approved, profile.draft)),
    );
  } else {
    changes.append(
      el('h3', 'Changes since the published version'),
      el('p', 'Nothing from this profile is public yet, so review everything in the preview below.'),
    );
  }

  const urlSection = el('section');
  urlSection.append(el('h3', 'Links and image sources to check'));
  const urls = profileUrls(profile.draft);
  if (urls.length) {
    const list = el('ul', null, 'url-list');
    for (const { label, url } of urls) {
      const item = el('li');
      item.append(el('span', `${label}: `));
      // Saved drafts are validated, so this is only a second line of defence.
      if (isSafeUrl(url) || (label === 'Image' && isSafeImageSrc(url))) {
        const link = el('a', url);
        link.href = url;
        link.rel = 'nofollow noopener noreferrer';
        item.append(link);
      } else {
        item.append(el('span', url), el('strong', ' (not an allowed address, so it is not linked)'));
      }
      list.append(item);
    }
    urlSection.append(list);
  } else {
    urlSection.append(el('p', 'This profile points to no outside addresses.'));
  }

  const preview = el('section');
  const view = el('div', null, 'profile-preview');
  view.append(...renderProfileParts(profile.draft, { headingLevel: 4, deferImages: true }));
  preview.append(el('h3', 'Preview'), view);

  const raw = el('details');
  raw.append(el('summary', 'Submitted data (JSON)'), el('pre', JSON.stringify(profile.draft, null, 2)));

  const label = el('label', 'Feedback for the owner (required to reject; never published)');
  label.htmlFor = `feedback-${profile.id}`;
  const feedback = el('textarea');
  feedback.id = label.htmlFor;
  feedback.maxLength = 2000;
  const actions = el('div', null, 'actions');
  for (const [decision, text, className] of [
    ['approved', 'Approve', 'button'],
    ['rejected', 'Reject', undefined],
  ]) {
    const button = el('button', null, className);
    button.type = 'button';
    button.append(text, el('span', ` ${name}`, 'visually-hidden'));
    button.addEventListener('click', async () => {
      try {
        await request(`/api/moderation/profiles/${profile.id}/decision`, {
          method: 'POST',
          body: JSON.stringify({
            decision,
            feedback: feedback.value,
            revisionId: profile.revisionId,
            contentHash: profile.contentHash,
          }),
        });
        onDecided(
          decision === 'approved'
            ? `Approved ${name}. It is now public.`
            : `Sent ${name} back to its owner with your feedback.`,
        );
      } catch (error) {
        message(errorText(error), true);
      }
    });
    actions.append(button);
  }
  article.append(changes, urlSection, preview, raw, label, feedback, actions);
  return article;
}

async function initModerator(container) {
  const load = async (notice) => {
    try {
      const { profiles, pagination } = await request(`/api/moderation/profiles?page=${currentPage()}`);
      let empty = [el('p', 'No profiles are awaiting review.')];
      if (pagination.page > 1) {
        const first = el('a', 'Go to the first page of the queue');
        first.href = 'moderator.html';
        const back = el('p');
        back.append(first);
        empty = [el('p', 'No profiles are awaiting review on this page.'), back];
      }
      container.replaceChildren(
        ...(profiles.length ? profiles.map((profile) => moderationCard(profile, load)) : empty),
      );
      const navigation = pageNavigation(pagination, 'Moderation queue pages');
      if (navigation) container.append(navigation);
      if (notice) message(notice);
    } catch (error) {
      if (error.status === 401) {
        window.location.assign('login.html');
        return;
      }
      container.replaceChildren();
      message(errorText(error), true);
    }
  };
  await load();
}

const ACTION_TEXT = {
  'profile.created': 'Draft created',
  'profile.draft_saved': 'Draft saved',
  'profile.submitted': 'Submitted for review',
  'profile.approved': 'Approved',
  'profile.rejected': 'Changes requested',
  'profile.unpublished': 'Unpublished by owner',
  'profile.deleted': 'Profile deleted by owner',
  'profile.imported_unowned': 'Imported without an owner',
  'account.password_changed': 'Password changed',
  'account.deleted': 'Account deleted by owner',
};

function auditProfileCell(event) {
  const cell = el('td');
  if (event.profileSlug) {
    const href = event.profilePublished ? profilePageUrl(event.profileSlug) : null;
    if (href) {
      const link = el('a', event.profileSlug);
      link.href = href;
      cell.append(link);
    } else {
      cell.textContent = event.profileSlug;
    }
  } else if (event.profileId) {
    cell.textContent = `Profile #${event.profileId} (private draft)`;
  } else if (event.details?.profileId) {
    cell.textContent = `Profile #${event.details.profileId} (deleted)`;
  } else {
    cell.textContent = '—';
  }
  return cell;
}

function auditDetails(details) {
  if (!details) return '';
  const parts = [];
  for (const [key, value] of Object.entries(details)) {
    if (key === 'profileId') continue;
    if (key === 'revisionId') parts.push(`Revision ${value}`);
    else if (key === 'wasPublished') parts.push(value ? 'Was published' : 'Was never published');
    else if (key === 'profilesDeleted') parts.push(`${value} profile${value === 1 ? '' : 's'} deleted`);
    else if (key === 'provenance') parts.push(`Provenance: ${value}`);
    else parts.push(`${key}: ${JSON.stringify(value)}`);
  }
  return parts.join('; ');
}

async function initAudit(container) {
  try {
    const { events, pagination } = await request(`/api/moderation/audit?page=${currentPage()}`);
    if (!events.length) {
      container.replaceChildren(el('p', 'No events have been recorded on this page.'));
      return;
    }
    const first = (pagination.page - 1) * pagination.limit + 1;
    const table = el('table');
    const headRow = el('tr');
    for (const title of ['Time (UTC)', 'Event', 'Profile', 'By', 'Details']) {
      const cell = el('th', title);
      cell.scope = 'col';
      headRow.append(cell);
    }
    const head = el('thead');
    head.append(headRow);
    const body = el('tbody');
    for (const event of events) {
      const row = el('tr');
      const time = el('time', event.createdAt);
      time.dateTime = `${event.createdAt.replace(' ', 'T')}Z`;
      const timeCell = el('td');
      timeCell.append(time);
      const actor = event.actorUserId
        ? `${event.actorRole === 'moderator' ? 'Moderator' : 'User'} #${event.actorUserId}`
        : '—';
      row.append(
        timeCell,
        el('td', ACTION_TEXT[event.action] || event.action),
        auditProfileCell(event),
        el('td', actor),
        el('td', auditDetails(event.details)),
      );
      body.append(row);
    }
    table.append(
      el('caption', `Events ${first}–${first + events.length - 1} of ${pagination.total}, newest first`),
      head,
      body,
    );
    const wrap = el('div', null, 'table-wrap');
    wrap.tabIndex = 0;
    wrap.setAttribute('role', 'region');
    wrap.setAttribute('aria-label', 'Audit events table');
    wrap.append(table);
    container.replaceChildren(wrap);
    const navigation = pageNavigation(pagination, 'Audit log pages');
    if (navigation) container.append(navigation);
  } catch (error) {
    if (error.status === 401) {
      window.location.assign('login.html');
      return;
    }
    container.replaceChildren();
    message(errorText(error), true);
  }
}

async function initAccount(page) {
  const passwordForm = page.querySelector('[data-password-form]');
  const deleteForm = page.querySelector('[data-delete-form]');
  try {
    const user = await request('/api/me');
    page.querySelector('[data-account]').textContent = `Signed in as ${user.email}`;
    if (user.role === 'moderator') {
      deleteForm.hidden = true;
      page.querySelector('[data-moderator-note]').hidden = false;
    }
  } catch (error) {
    if (error.status === 401) {
      window.location.assign('login.html');
      return;
    }
    message(errorText(error), true);
  }

  passwordForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const output = passwordForm.querySelector('[data-form-message]');
    try {
      const result = await request('/api/me/password', {
        method: 'POST',
        body: JSON.stringify({
          currentPassword: passwordForm.elements.currentPassword.value,
          newPassword: passwordForm.elements.newPassword.value,
        }),
      });
      passwordForm.reset();
      csrfToken = undefined;
      message(result.message, false, output);
    } catch (error) {
      message(errorText(error), true, output);
    }
  });

  deleteForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await request('/api/me', {
        method: 'DELETE',
        body: JSON.stringify({
          password: deleteForm.elements.password.value,
          confirm: deleteForm.elements.confirm.checked,
        }),
      });
      const heading = el('h1', 'Account deleted');
      heading.tabIndex = -1;
      const home = el('p');
      const link = el('a', 'Return to the home page');
      link.href = 'index.html';
      home.append(link);
      page.replaceChildren(
        heading,
        el('p', 'Your account and all of your profiles have been permanently deleted, and you have been signed out.'),
        home,
      );
      document.querySelector('.site-nav')?.remove();
      heading.focus();
    } catch (error) {
      message(errorText(error), true, deleteForm.querySelector('[data-form-message]'));
    }
  });
}

const authForm = document.querySelector('[data-auth-form]');
if (authForm) {
  if (authForm.dataset.endpoint === '/api/auth/reset-password') {
    authForm.elements.token.value = new URLSearchParams(window.location.search).get('token') || '';
  }
  initAuthForm(authForm);
}

const dashboard = document.querySelector('[data-dashboard]');
if (dashboard) initDashboard(dashboard);
const editor = document.querySelector('[data-editor]');
if (editor) initEditor(editor);
const moderation = document.querySelector('[data-moderation]');
if (moderation) initModerator(moderation);
const auditLog = document.querySelector('[data-audit]');
if (auditLog) initAudit(auditLog);
const account = document.querySelector('[data-account-page]');
if (account) initAccount(account);

const logout = document.querySelector('[data-logout]');
if (logout) {
  logout.addEventListener('click', async () => {
    try {
      await request('/api/auth/logout', { method: 'POST', body: '{}' });
    } catch {
      // Already signed out; leave anyway.
    }
    window.location.assign('index.html');
  });
}
