let csrfToken;

async function request(url, options = {}) {
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
    const error = new Error(body.error || 'Request failed');
    error.status = response.status;
    error.details = body.details;
    throw error;
  }
  return body;
}

function message(text, error = false) {
  const output = document.querySelector('[data-message]');
  if (!output) return;
  output.textContent = text;
  output.classList.toggle('error', error);
  output.focus();
}

function lines(value) {
  return value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);
}

function profileFromForm(form) {
  const data = new FormData(form);
  const profile = {
    slug: data.get('slug').trim(),
    name: data.get('name').trim(),
    introduction: data.get('introduction').trim(),
    story: data.get('story').trim(),
    carryForward: data.get('carryForward').trim(),
  };
  const values = lines(data.get('values'));
  const memories = lines(data.get('memories'));
  if (values.length) profile.values = values;
  if (memories.length) profile.memories = memories;
  const autobiography = data.get('autobiography').trim();
  if (autobiography) profile.autobiography = autobiography;
  const workTitle = data.get('workTitle').trim();
  if (workTitle) {
    profile.work = [
      {
        title: workTitle,
        ...(data.get('workDescription').trim() ? { description: data.get('workDescription').trim() } : {}),
        ...(data.get('workUrl').trim() ? { url: data.get('workUrl').trim() } : {}),
      },
    ];
  }
  const linkLabel = data.get('linkLabel').trim();
  const linkUrl = data.get('linkUrl').trim();
  if (linkLabel || linkUrl) profile.links = [{ label: linkLabel, url: linkUrl }];
  const familyName = data.get('familyName').trim();
  if (familyName) {
    profile.family = [
      {
        relation: data.get('familyRelation'),
        name: familyName,
        ...(data.get('familySlug').trim() ? { slug: data.get('familySlug').trim() } : {}),
        ...(data.get('familyNote').trim() ? { note: data.get('familyNote').trim() } : {}),
      },
    ];
  }
  const imageSrc = data.get('imageSrc').trim();
  const imageAlt = data.get('imageAlt').trim();
  if (imageSrc || imageAlt) profile.image = { src: imageSrc, alt: imageAlt };
  if (data.get('fictional') === 'on') profile.fictional = true;
  return profile;
}

function populateEditor(form, profile) {
  for (const key of ['slug', 'name', 'introduction', 'story', 'carryForward']) {
    form.elements[key].value = profile[key] || '';
  }
  form.elements.values.value = (profile.values || []).join('\n');
  form.elements.memories.value = (profile.memories || []).join('\n');
  form.elements.autobiography.value = profile.autobiography || '';
  form.elements.workTitle.value = profile.work?.[0]?.title || '';
  form.elements.workDescription.value = profile.work?.[0]?.description || '';
  form.elements.workUrl.value = profile.work?.[0]?.url || '';
  form.elements.linkLabel.value = profile.links?.[0]?.label || '';
  form.elements.linkUrl.value = profile.links?.[0]?.url || '';
  form.elements.familyRelation.value = profile.family?.[0]?.relation || 'parent';
  form.elements.familyName.value = profile.family?.[0]?.name || '';
  form.elements.familySlug.value = profile.family?.[0]?.slug || '';
  form.elements.familyNote.value = profile.family?.[0]?.note || '';
  form.elements.imageSrc.value = profile.image?.src || '';
  form.elements.imageAlt.value = profile.image?.alt || '';
  form.elements.fictional.checked = profile.fictional === true;
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
    if (user.role === 'moderator') document.querySelector('[data-moderator-link]').hidden = false;
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
      status.textContent = `Status: ${profile.status}`;
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
  const id = new URLSearchParams(window.location.search).get('id');
  if (id) {
    try {
      const { profiles } = await request('/api/me/profiles');
      const current = profiles.find((profile) => String(profile.id) === id);
      if (!current) throw new Error('Profile not found');
      populateEditor(form, current.draft);
      document.querySelector('[data-submit-review]').hidden = false;
    } catch (error) {
      message(error.message, true);
    }
  }

  document.querySelector('[data-preview]').addEventListener('click', () => {
    const preview = document.querySelector('[data-profile-preview]');
    preview.textContent = JSON.stringify(profileFromForm(form), null, 2);
    preview.focus();
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const saved = await request(id ? `/api/me/profiles/${id}` : '/api/me/profiles', {
        method: id ? 'PUT' : 'POST',
        body: JSON.stringify({ profile: profileFromForm(form) }),
      });
      message('Private draft saved.');
      if (!id) window.location.assign(`editor.html?id=${saved.id}`);
    } catch (error) {
      message(`${error.message}${error.details ? `: ${error.details.join('; ')}` : ''}`, true);
    }
  });
  document.querySelector('[data-submit-review] button').addEventListener('click', async () => {
    const consent = document.querySelector('[name="consent"]').checked;
    try {
      await request(`/api/me/profiles/${id}/submit`, {
        method: 'POST',
        body: JSON.stringify({ consent }),
      });
      message('Submitted for moderator review.');
    } catch (error) {
      message(error.message, true);
    }
  });
}

async function initModerator(container) {
  try {
    const query = new URLSearchParams(window.location.search);
    const page = Math.max(1, Number.parseInt(query.get('page') || '1', 10) || 1);
    const { profiles, pagination } = await request(`/api/moderation/profiles?page=${page}`);
    if (!profiles.length) {
      container.textContent = 'No profiles are awaiting review.';
    } else {
      for (const profile of profiles) {
        const article = document.createElement('article');
        article.className = 'card moderation-card';
        const heading = document.createElement('h2');
        heading.textContent = `${profile.draft.name} (${profile.status})`;
        const content = document.createElement('pre');
        content.textContent = JSON.stringify(profile.draft, null, 2);
        const feedback = document.createElement('textarea');
        feedback.setAttribute('aria-label', `Private feedback for ${profile.draft.name}`);
        feedback.maxLength = 2000;
        const approve = document.createElement('button');
        approve.textContent = 'Approve';
        const reject = document.createElement('button');
        reject.textContent = 'Reject';
        for (const [button, decision] of [
          [approve, 'approved'],
          [reject, 'rejected'],
        ]) {
          button.type = 'button';
          button.addEventListener('click', async () => {
            try {
              await request(`/api/moderation/profiles/${profile.id}/decision`, {
                method: 'POST',
                body: JSON.stringify({ decision, feedback: feedback.value }),
              });
              window.location.reload();
            } catch (error) {
              message(error.message, true);
            }
          });
        }
        article.append(heading, content, feedback, approve, reject);
        container.append(article);
      }
    }
    const navigation = document.createElement('nav');
    navigation.className = 'pagination';
    navigation.setAttribute('aria-label', 'Moderation queue pages');
    if (pagination.page > 1) {
      const previous = document.createElement('a');
      previous.href = `?page=${pagination.page - 1}`;
      previous.textContent = '← Previous';
      navigation.append(previous);
    }
    if (pagination.page < pagination.pages) {
      const next = document.createElement('a');
      next.href = `?page=${pagination.page + 1}`;
      next.textContent = 'Next →';
      navigation.append(next);
    }
    if (navigation.childNodes.length) container.append(navigation);
  } catch (error) {
    if (error.status === 401) {
      window.location.assign('login.html');
      return;
    }
    container.textContent = '';
    message(error.message, true);
  }
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

const logout = document.querySelector('[data-logout]');
if (logout) {
  logout.addEventListener('click', async () => {
    await request('/api/auth/logout', { method: 'POST', body: '{}' });
    window.location.assign('index.html');
  });
}
