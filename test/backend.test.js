import assert from 'node:assert/strict';
import test from 'node:test';

import argon2 from 'argon2';
import supertest from 'supertest';

import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { openDatabase } from '../src/database.js';

const password = 'a long test password';
const baseProfile = (slug = 'river-song', name = 'River Song') => ({
  slug,
  name,
  introduction: 'A short introduction.',
  story: 'A plain-text story.',
  carryForward: 'Keep helping.',
});

async function fixture(t, { recoveryConfigured = false } = {}) {
  const database = await openDatabase(':memory:');
  t.after(() => database.close());
  const sent = [];
  const config = loadConfig({
    NODE_ENV: 'test',
    APP_BASE_URL: 'http://localhost:3000',
    SESSION_SECRET: 'test-session-secret-that-is-long-enough',
  });
  const mailer = {
    configured: recoveryConfigured,
    async sendPasswordReset(email, token) {
      sent.push({ email, token });
    },
  };
  const app = await createApp({
    config,
    database,
    mailer,
    logger: { error() {}, info() {} },
    authLimit: 1000,
  });
  return { app, database, sent };
}

async function csrf(agent) {
  return (await agent.get('/api/csrf').expect(200)).body.token;
}

function mutate(agent, method, url, body = {}) {
  return {
    async expect(...arguments_) {
      const token = await csrf(agent);
      return agent[method](url).set('x-csrf-token', token).send(body).expect(...arguments_);
    },
  };
}

function signup(agent, email) {
  return mutate(agent, 'post', '/api/auth/signup', {
    email,
    password,
    role: 'moderator',
  });
}

function createProfile(agent, profile = baseProfile()) {
  return mutate(agent, 'post', '/api/me/profiles', { profile });
}

async function createModerator(database, email = 'moderator@example.test') {
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  await database.run(`INSERT INTO users (email, password_hash, role) VALUES (?, ?, 'moderator')`, [
    email,
    passwordHash,
  ]);
}

function login(agent, email) {
  return mutate(agent, 'post', '/api/auth/login', { email, password });
}

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

test('production configuration fails closed without secure settings', () => {
  assert.throws(
    () => loadConfig({ NODE_ENV: 'production', APP_BASE_URL: 'https://legacy.example' }),
    /SESSION_SECRET/,
  );
  assert.throws(
    () =>
      loadConfig({
        NODE_ENV: 'production',
        APP_BASE_URL: 'http://legacy.example',
        SESSION_SECRET: 'a-production-secret-that-is-long-enough',
      }),
    /https/,
  );
  assert.throws(
    () =>
      loadConfig({
        NODE_ENV: 'production',
        APP_BASE_URL: 'https://legacy.example',
        SESSION_SECRET: 'a-production-secret-that-is-long-enough',
        DEV_RECOVERY_LOG: 'true',
      }),
    /local development only/,
  );
  assert.throws(
    () =>
      loadConfig({
        NODE_ENV: 'production',
        APP_BASE_URL: 'https://legacy.example',
        SESSION_SECRET: 'a-production-secret-that-is-long-enough',
        PUBLIC_REMOVAL_URL: 'http://legacy.example/removal',
      }),
    /unsupported URL scheme/,
  );
});

test('database transactions serialize concurrent writers without cross-rollback', async (t) => {
  const database = await openDatabase(':memory:');
  t.after(() => database.close());
  await Promise.all(
    Array.from({ length: 5 }, (_, index) =>
      database.transaction(async (transaction) => {
        await transaction.run('INSERT INTO audit_log (action) VALUES (?)', [`concurrent.${index}`]);
        await new Promise((resolve) => setTimeout(resolve, 5));
      }),
    ),
  );
  const result = await database.get(`SELECT COUNT(*) AS count FROM audit_log WHERE action LIKE 'concurrent.%'`);
  assert.equal(result.count, 5);
});

test('auth uses sessions, CSRF protection, private emails and server-controlled roles', async (t) => {
  const { app } = await fixture(t);
  const agent = supertest.agent(app);

  await agent.post('/api/auth/signup').send({ email: 'owner@example.test', password }).expect(403);
  const created = await signup(agent, 'OWNER@EXAMPLE.TEST').expect(201);
  assert.equal(created.body.role, 'owner');

  const me = await agent.get('/api/me').expect(200);
  assert.equal(me.body.email, 'owner@example.test');
  assert.equal(me.body.role, 'owner');

  const publicResult = await supertest(app).get('/api/profiles').expect(200);
  assert.equal(JSON.stringify(publicResult.body).includes('owner@example.test'), false);

  await mutate(agent, 'post', '/api/auth/logout').expect(204);
  await agent.get('/api/me').expect(401);
});

test('owners cannot read, edit or delete another owner’s profile', async (t) => {
  const { app } = await fixture(t);
  const first = supertest.agent(app);
  const second = supertest.agent(app);
  await signup(first, 'first@example.test').expect(201);
  const created = await createProfile(first).expect(201);
  await signup(second, 'second@example.test').expect(201);

  const secondDashboard = await second.get('/api/me/profiles').expect(200);
  assert.deepEqual(secondDashboard.body.profiles, []);
  await mutate(second, 'put', `/api/me/profiles/${created.body.id}`, {
    profile: baseProfile('stolen-profile'),
  }).expect(404);
  await mutate(second, 'delete', `/api/me/profiles/${created.body.id}`).expect(404);

  const firstDashboard = await first.get('/api/me/profiles').expect(200);
  assert.equal(firstDashboard.body.profiles.length, 1);
});

test('moderation protects every public path and keeps approved revisions live during re-review', async (t) => {
  const { app, database } = await fixture(t);
  const owner = supertest.agent(app);
  const outsider = supertest.agent(app);
  const moderator = supertest.agent(app);
  await signup(owner, 'owner@example.test').expect(201);
  await signup(outsider, 'outsider@example.test').expect(201);
  const created = await createProfile(owner).expect(201);

  await supertest(app).get('/api/profiles').expect(200).expect(({ body }) => {
    assert.equal(body.profiles.length, 0);
  });
  await supertest(app).get('/api/profiles/river-song').expect(404);
  await supertest(app).get(`/api/profiles/id/${created.body.id}`).expect(404);
  await mutate(owner, 'post', `/api/me/profiles/${created.body.id}/submit`, { consent: false }).expect(400);
  await mutate(owner, 'post', `/api/me/profiles/${created.body.id}/submit`, { consent: true }).expect(200);
  await supertest(app).get('/api/profiles/river-song').expect(404);
  await outsider.get('/api/moderation/profiles').expect(403);

  await createModerator(database);
  await login(moderator, 'moderator@example.test').expect(200);
  const queue = await moderator.get('/api/moderation/profiles?limit=500').expect(200);
  assert.equal(queue.body.pagination.limit, 50);
  assert.equal(queue.body.pagination.total, 1);
  assert.equal(queue.body.profiles[0].approved, null);
  await mutate(moderator, 'post', `/api/moderation/profiles/${created.body.id}/decision`, {
    decision: 'approved',
    feedback: 'Approved after review.',
    revisionId: queue.body.profiles[0].revisionId,
    contentHash: queue.body.profiles[0].contentHash,
  }).expect(200);

  const published = await supertest(app).get('/api/profiles/river-song').expect(200);
  assert.equal(published.body.story, 'A plain-text story.');
  for (const privateField of ['email', 'owner_user_id', 'feedback', 'password_hash']) {
    assert.equal(Object.hasOwn(published.body, privateField), false);
  }

  const changed = baseProfile('river-song');
  changed.story = 'Pending secret revision.';
  await mutate(owner, 'put', `/api/me/profiles/${created.body.id}`, { profile: changed }).expect(200);
  assert.equal((await supertest(app).get('/api/profiles/river-song')).body.story, 'A plain-text story.');
  await mutate(owner, 'post', `/api/me/profiles/${created.body.id}/submit`, { consent: true }).expect(200);
  assert.equal((await supertest(app).get('/api/profiles/river-song')).body.story, 'A plain-text story.');
  const reReview = await moderator.get('/api/moderation/profiles').expect(200);
  assert.equal(reReview.body.profiles[0].approved.story, 'A plain-text story.');
  assert.equal(reReview.body.profiles[0].draft.story, 'Pending secret revision.');
  await mutate(moderator, 'post', `/api/moderation/profiles/${created.body.id}/decision`, {
    decision: 'rejected',
    feedback: 'Please remove the private passage.',
    revisionId: reReview.body.profiles[0].revisionId,
    contentHash: reReview.body.profiles[0].contentHash,
  }).expect(200);
  await moderator.get('/api/moderation/profiles').expect(200).expect(({ body }) => {
    assert.equal(body.profiles.length, 0);
  });

  const ownerView = await owner.get('/api/me/profiles').expect(200);
  assert.equal(ownerView.body.profiles[0].feedback, 'Please remove the private passage.');
  assert.equal((await outsider.get('/api/profiles/river-song')).body.story, 'A plain-text story.');
  assert.equal(JSON.stringify((await outsider.get('/api/profiles')).body).includes('private passage'), false);

  await mutate(owner, 'put', `/api/me/profiles/${created.body.id}`, {
    profile: { ...changed, slug: 'pending-secret-address' },
  }).expect(400);

  await mutate(owner, 'post', `/api/me/profiles/${created.body.id}/unpublish`).expect(204);
  await supertest(app).get('/api/profiles/river-song').expect(404);
  await mutate(owner, 'delete', `/api/me/profiles/${created.body.id}`).expect(204);
  await owner.get('/api/me/profiles').expect(200).expect(({ body }) => assert.equal(body.profiles.length, 0));
});

test('moderator authorization uses the current database role', async (t) => {
  const { app, database } = await fixture(t);
  const moderator = supertest.agent(app);
  await createModerator(database);
  await login(moderator, 'moderator@example.test').expect(200);
  await moderator.get('/api/moderation/audit').expect(200);

  await database.run(`UPDATE users SET role = 'owner' WHERE email = ?`, ['moderator@example.test']);
  await moderator.get('/api/moderation/audit').expect(403);
});

test('decisions apply only to the exact revision the moderator reviewed', async (t) => {
  const { app, database } = await fixture(t);
  const owner = supertest.agent(app);
  const moderator = supertest.agent(app);
  await signup(owner, 'owner@example.test').expect(201);
  const created = await createProfile(owner).expect(201);
  const decide = (body) => mutate(moderator, 'post', `/api/moderation/profiles/${created.body.id}/decision`, body);
  const pin = ({ revisionId, contentHash }) => ({ revisionId, contentHash });
  await createModerator(database);
  await login(moderator, 'moderator@example.test').expect(200);

  await decide({ decision: 'approved', revisionId: 1, contentHash: '0'.repeat(64) }).expect(409, /not awaiting review/);
  await mutate(owner, 'post', `/api/me/profiles/${created.body.id}/submit`, { consent: true }).expect(200);
  const reviewed = (await moderator.get('/api/moderation/profiles').expect(200)).body.profiles[0];
  assert.equal(typeof reviewed.consentedAt, 'string');
  assert.match(reviewed.contentHash, /^[0-9a-f]{64}$/);
  await decide({ decision: 'approved' }).expect(400, /reviewed revision is required/);
  await decide({ decision: 'approved', revisionId: reviewed.revisionId }).expect(400, /reviewed revision is required/);
  await decide({ ...pin(reviewed), decision: 'approved', revisionId: String(reviewed.revisionId) }).expect(400);

  const edited = { ...baseProfile(), story: 'Changed after the moderator loaded the queue.' };
  await mutate(owner, 'put', `/api/me/profiles/${created.body.id}`, { profile: edited }).expect(200);
  await decide({ decision: 'approved', ...pin(reviewed) }).expect(409, /not awaiting review/);
  await mutate(owner, 'post', `/api/me/profiles/${created.body.id}/submit`, { consent: true }).expect(200);
  await decide({ decision: 'approved', ...pin(reviewed) }).expect(409, /changed after you loaded it/);
  await supertest(app).get('/api/profiles/river-song').expect(404);

  const latest = (await moderator.get('/api/moderation/profiles').expect(200)).body.profiles[0];
  assert.notEqual(latest.revisionId, reviewed.revisionId);
  await decide({ decision: 'approved', ...pin(latest) }).expect(200);
  const published = await supertest(app).get('/api/profiles/river-song').expect(200);
  assert.equal(published.body.story, edited.story);
  const decisions = await database.all('SELECT revision_id FROM moderation_decisions');
  assert.deepEqual(decisions, [{ revision_id: latest.revisionId }]);
});

test('a decision cannot approve different content that was given the reviewed ids', async (t) => {
  const { app, database } = await fixture(t);
  const owner = supertest.agent(app);
  const moderator = supertest.agent(app);
  await signup(owner, 'owner@example.test').expect(201);
  await createModerator(database);
  await login(moderator, 'moderator@example.test').expect(200);
  const first = await createProfile(owner).expect(201);
  await mutate(owner, 'post', `/api/me/profiles/${first.body.id}/submit`, { consent: true }).expect(200);
  const reviewed = (await moderator.get('/api/moderation/profiles').expect(200)).body.profiles[0];

  // SQLite gives the ids of a deleted newest row to the next row inserted.
  await mutate(owner, 'delete', `/api/me/profiles/${first.body.id}`).expect(204);
  const unseen = { ...baseProfile(), story: 'Text the moderator never saw.' };
  const second = await createProfile(owner, unseen).expect(201);
  await mutate(owner, 'post', `/api/me/profiles/${second.body.id}/submit`, { consent: true }).expect(200);
  const current = (await moderator.get('/api/moderation/profiles').expect(200)).body.profiles[0];
  assert.deepEqual([current.id, current.revisionId], [reviewed.id, reviewed.revisionId]);

  await mutate(moderator, 'post', `/api/moderation/profiles/${reviewed.id}/decision`, {
    decision: 'approved',
    revisionId: reviewed.revisionId,
    contentHash: reviewed.contentHash,
  }).expect(409, /changed after you loaded it/);
  await supertest(app).get('/api/profiles/river-song').expect(404);
});

test('the paginated audit log never reveals the address of an unsubmitted draft', async (t) => {
  const { app, database } = await fixture(t);
  const owner = supertest.agent(app);
  const moderator = supertest.agent(app);
  await signup(owner, 'owner@example.test').expect(201);
  await createProfile(owner, baseProfile('private-draft-address', 'Private')).expect(201);
  const submitted = await createProfile(owner, baseProfile('submitted-address', 'Submitted')).expect(201);
  await mutate(owner, 'post', `/api/me/profiles/${submitted.body.id}/submit`, { consent: true }).expect(200);
  const removed = await createProfile(owner, baseProfile('deleted-draft-address', 'Removed')).expect(201);
  await mutate(owner, 'delete', `/api/me/profiles/${removed.body.id}`).expect(204);
  await createModerator(database);
  await login(moderator, 'moderator@example.test').expect(200);

  const firstPage = await moderator.get('/api/moderation/audit?limit=2').expect(200);
  assert.deepEqual(firstPage.body.pagination, { page: 1, limit: 2, total: 4, pages: 2 });
  const [deleted, submittedEvent] = firstPage.body.events;
  assert.deepEqual(
    { action: deleted.action, actorRole: deleted.actorRole, profileId: deleted.profileId },
    { action: 'profile.deleted', actorRole: 'owner', profileId: null },
  );
  assert.deepEqual(deleted.details, { profileId: removed.body.id, wasPublished: false });
  assert.equal(submittedEvent.action, 'profile.submitted');
  assert.equal(submittedEvent.profileSlug, 'submitted-address');
  assert.equal(submittedEvent.profilePublished, false);
  assert.equal(typeof submittedEvent.createdAt, 'string');

  const secondPage = await moderator.get('/api/moderation/audit?limit=2&page=2').expect(200);
  assert.deepEqual(
    secondPage.body.events.map((event) => [event.action, event.profileSlug]),
    [
      ['profile.created', 'submitted-address'],
      ['profile.created', null],
    ],
  );
  const everything = await moderator.get('/api/moderation/audit?limit=500').expect(200);
  assert.equal(everything.body.pagination.limit, 100);
  for (const hidden of ['private-draft-address', 'deleted-draft-address']) {
    assert.equal(JSON.stringify(everything.body).includes(hidden), false, hidden);
  }
});

test('owners change their password and every other session is signed out', async (t) => {
  const { app, database, sent } = await fixture(t, { recoveryConfigured: true });
  const owner = supertest.agent(app);
  const otherDevice = supertest.agent(app);
  const newPassword = 'a brand new long password';
  await signup(owner, 'owner@example.test').expect(201);
  await login(otherDevice, 'owner@example.test').expect(200);
  await mutate(owner, 'post', '/api/auth/request-reset', { email: 'owner@example.test' }).expect(200);
  const change = (body) => mutate(owner, 'post', '/api/me/password', body);

  const signedOut = supertest.agent(app);
  await mutate(signedOut, 'post', '/api/me/password', { currentPassword: password, newPassword }).expect(401);
  await change({ currentPassword: 'not the password', newPassword }).expect(403);
  await change({ currentPassword: password, newPassword: 'short' }).expect(400);
  await change({ currentPassword: password, newPassword: password }).expect(400);
  // A request still running during the change writes its session back afterwards.
  const staleSessions = await database.all('SELECT sid, sess, expires_at FROM sessions');
  await change({ currentPassword: password, newPassword }).expect(200);
  for (const row of staleSessions) {
    await database.run('INSERT OR REPLACE INTO sessions (sid, sess, expires_at) VALUES (?, ?, ?)', [
      row.sid,
      row.sess,
      row.expires_at,
    ]);
  }

  await owner.get('/api/me').expect(200);
  await otherDevice.get('/api/me').expect(401);
  await mutate(supertest.agent(app), 'post', '/api/auth/login', { email: 'owner@example.test', password }).expect(401);
  await mutate(supertest.agent(app), 'post', '/api/auth/login', {
    email: 'owner@example.test',
    password: newPassword,
  }).expect(200);
  await mutate(owner, 'post', '/api/auth/reset-password', {
    token: sent[0].token,
    password: 'a reset after the change',
  }).expect(400);
  const events = await database.all(`SELECT action, actor_user_id FROM audit_log WHERE action LIKE 'account.%'`);
  assert.equal(events.length, 1);
  assert.equal(events[0].action, 'account.password_changed');
});

test('a reset token invalidated during password hashing cannot change the password', async (t) => {
  const { app, database, sent } = await fixture(t, { recoveryConfigured: true });
  const owner = supertest.agent(app);
  await signup(owner, 'owner@example.test').expect(201);
  await mutate(owner, 'post', '/api/auth/request-reset', { email: 'owner@example.test' }).expect(200);

  const originalGet = database.get.bind(database);
  const lookedUp = deferred();
  const release = deferred();
  let held = false;
  database.get = async (sql, params) => {
    const row = await originalGet(sql, params);
    if (!held && sql.includes('SELECT id, user_id FROM password_reset_tokens')) {
      held = true;
      lookedUp.resolve();
      await release.promise;
    }
    return row;
  };

  const reset = mutate(owner, 'post', '/api/auth/reset-password', {
    token: sent[0].token,
    password: 'a concurrent reset password',
  }).expect(400);
  try {
    await lookedUp.promise;
    await mutate(owner, 'post', '/api/me/password', {
      currentPassword: password,
      newPassword: 'a concurrent self-service password',
    }).expect(200);
  } finally {
    release.resolve();
    database.get = originalGet;
  }
  await reset;
  await mutate(supertest.agent(app), 'post', '/api/auth/login', {
    email: 'owner@example.test',
    password: 'a concurrent self-service password',
  }).expect(200);
  await mutate(supertest.agent(app), 'post', '/api/auth/login', {
    email: 'owner@example.test',
    password: 'a concurrent reset password',
  }).expect(401);
});

test('a password change cannot update a replacement account after hashing', async (t) => {
  const { app, database } = await fixture(t);
  const owner = supertest.agent(app);
  const otherDevice = supertest.agent(app);
  await signup(owner, 'owner@example.test').expect(201);
  await login(otherDevice, 'owner@example.test').expect(200);

  const originalGet = database.get.bind(database);
  const lookedUp = deferred();
  const release = deferred();
  let held = false;
  database.get = async (sql, params) => {
    const row = await originalGet(sql, params);
    if (!held && sql === 'SELECT id, password_hash FROM users WHERE id = ?') {
      held = true;
      lookedUp.resolve();
      await release.promise;
    }
    return row;
  };

  const change = mutate(owner, 'post', '/api/me/password', {
    currentPassword: password,
    newPassword: 'a password for the old account',
  }).expect(409);
  try {
    await lookedUp.promise;
    await mutate(otherDevice, 'delete', '/api/me', { password, confirm: true }).expect(204);
    const newcomer = supertest.agent(app);
    const created = await signup(newcomer, 'newcomer@example.test').expect(201);
    assert.equal(created.body.id, 1);
  } finally {
    release.resolve();
    database.get = originalGet;
  }
  await change;

  await mutate(supertest.agent(app), 'post', '/api/auth/login', {
    email: 'newcomer@example.test',
    password,
  }).expect(200);
  await mutate(supertest.agent(app), 'post', '/api/auth/login', {
    email: 'newcomer@example.test',
    password: 'a password for the old account',
  }).expect(401);
});

test('owners can download everything stored about them without moderator identities', async (t) => {
  const { app, database } = await fixture(t);
  const owner = supertest.agent(app);
  const otherOwner = supertest.agent(app);
  const moderator = supertest.agent(app);
  await signup(owner, 'owner@example.test').expect(201);
  await signup(otherOwner, 'other@example.test').expect(201);
  await createProfile(otherOwner, baseProfile('someone-else', 'Someone Else')).expect(201);
  const created = await createProfile(owner).expect(201);
  const edited = { ...baseProfile(), story: 'Second saved version.' };
  await mutate(owner, 'put', `/api/me/profiles/${created.body.id}`, { profile: edited }).expect(200);
  await mutate(owner, 'post', `/api/me/profiles/${created.body.id}/submit`, { consent: true }).expect(200);
  await createModerator(database);
  await login(moderator, 'moderator@example.test').expect(200);
  const { revisionId, contentHash } = (await moderator.get('/api/moderation/profiles').expect(200)).body.profiles[0];
  await mutate(moderator, 'post', `/api/moderation/profiles/${created.body.id}/decision`, {
    decision: 'rejected',
    feedback: 'Please add a date.',
    revisionId,
    contentHash,
  }).expect(200);

  await supertest(app).get('/api/me/export').expect(401);
  const response = await owner.get('/api/me/export').expect(200);
  assert.match(response.headers['content-type'], /^application\/json/);
  assert.match(response.headers['content-disposition'], /^attachment; filename="legacy-export-\d{4}-\d{2}-\d{2}\.json"$/);
  assert.equal(response.headers['cache-control'], 'no-store');
  const exported = response.body;
  assert.equal(exported.format, 'legacy-export/1');
  assert.equal(exported.account.email, 'owner@example.test');
  assert.equal(exported.profiles.length, 1);
  const [profile] = exported.profiles;
  assert.equal(profile.status, 'rejected');
  assert.equal(profile.draft.story, 'Second saved version.');
  assert.equal(profile.approved, null);
  assert.deepEqual(
    profile.revisions.map((revision) => revision.content.story),
    ['A plain-text story.', 'Second saved version.'],
  );
  assert.deepEqual(profile.moderation, [
    { revisionId, decision: 'rejected', feedback: 'Please add a date.', createdAt: profile.moderation[0].createdAt },
  ]);
  assert.deepEqual(
    exported.activity.map((event) => event.action),
    ['profile.created', 'profile.draft_saved', 'profile.submitted'],
  );
  const text = JSON.stringify(exported);
  for (const absent of ['moderator@example.test', 'other@example.test', 'someone-else', 'password_hash', '$argon2']) {
    assert.equal(text.includes(absent), false, `${absent} must not be exported`);
  }
});

test('an export cannot cross an account replacement after authentication', async (t) => {
  const { app, database } = await fixture(t);
  const owner = supertest.agent(app);
  const otherDevice = supertest.agent(app);
  await signup(owner, 'owner@example.test').expect(201);
  await login(otherDevice, 'owner@example.test').expect(200);
  await createProfile(owner, baseProfile('old-private-profile', 'Old Private')).expect(201);

  const originalTransaction = database.transaction.bind(database);
  const entered = deferred();
  const release = deferred();
  let held = false;
  database.transaction = async (work) => {
    if (!held) {
      held = true;
      entered.resolve();
      await release.promise;
    }
    return originalTransaction(work);
  };
  const exportRequest = owner.get('/api/me/export');
  const exported = exportRequest.then((response) => response);
  try {
    await entered.promise;
    await mutate(otherDevice, 'delete', '/api/me', { password, confirm: true }).expect(204);
    const newcomer = supertest.agent(app);
    await signup(newcomer, 'newcomer@example.test').expect(201);
    await createProfile(newcomer, baseProfile('new-private-profile', 'New Private')).expect(201);
  } finally {
    release.resolve();
    database.transaction = originalTransaction;
  }

  const response = await exported;
  assert.equal(response.status, 401);
  assert.equal(JSON.stringify(response.body).includes('new-private-profile'), false);
});

test('owners delete their account, profiles and sessions; moderators cannot self-delete', async (t) => {
  const { app, database } = await fixture(t);
  const owner = supertest.agent(app);
  const otherDevice = supertest.agent(app);
  const moderator = supertest.agent(app);
  await signup(owner, 'owner@example.test').expect(201);
  await login(otherDevice, 'owner@example.test').expect(200);
  const created = await createProfile(owner).expect(201);
  await mutate(owner, 'post', `/api/me/profiles/${created.body.id}/submit`, { consent: true }).expect(200);
  await createModerator(database);
  await login(moderator, 'moderator@example.test').expect(200);
  const { revisionId, contentHash } = (await moderator.get('/api/moderation/profiles').expect(200)).body.profiles[0];
  await mutate(moderator, 'post', `/api/moderation/profiles/${created.body.id}/decision`, {
    decision: 'approved',
    revisionId,
    contentHash,
  }).expect(200);
  await supertest(app).get('/api/profiles/river-song').expect(200);

  await mutate(moderator, 'delete', '/api/me', { password, confirm: true }).expect(403, /Moderator accounts/);
  await mutate(owner, 'delete', '/api/me', { password }).expect(400);
  await mutate(owner, 'delete', '/api/me', { password: 'not the password', confirm: true }).expect(403);
  await owner.get('/api/me').expect(200);
  await mutate(owner, 'delete', '/api/me', { password, confirm: true }).expect(204);

  await owner.get('/api/me').expect(401);
  await otherDevice.get('/api/me').expect(401);
  await moderator.get('/api/me').expect(200);
  await supertest(app).get('/api/profiles/river-song').expect(404);
  await login(supertest.agent(app), 'owner@example.test').expect(401);
  for (const table of ['profiles', 'profile_revisions', 'moderation_decisions']) {
    assert.equal((await database.get(`SELECT COUNT(*) AS total FROM ${table}`)).total, 0, table);
  }
  const deletion = await database.get(`SELECT actor_user_id, profile_id, details_json FROM audit_log
    WHERE action = 'account.deleted'`);
  assert.deepEqual(deletion, { actor_user_id: null, profile_id: null, details_json: '{"profilesDeleted":1}' });
  const remaining = await database.all(`SELECT sess FROM sessions`);
  assert.equal(remaining.some((row) => JSON.parse(row.sess).userId === 1), false);
});

test('a concurrent account deletion cannot delete a replacement account', async (t) => {
  const { app, database } = await fixture(t);
  const firstOwner = supertest.agent(app);
  const secondOwner = supertest.agent(app);
  await signup(firstOwner, 'owner@example.test').expect(201);
  await login(secondOwner, 'owner@example.test').expect(200);
  const firstToken = await csrf(firstOwner);
  const secondToken = await csrf(secondOwner);

  const originalTransaction = database.transaction.bind(database);
  const entered = deferred();
  const releases = [];
  let held = 0;
  database.transaction = async (work) => {
    if (held < 2) {
      const release = deferred();
      releases.push(release);
      held += 1;
      if (held === 2) entered.resolve();
      await release.promise;
    }
    return originalTransaction(work);
  };
  const first = firstOwner
    .delete('/api/me')
    .set('x-csrf-token', firstToken)
    .send({ password, confirm: true })
    .then((response) => response);
  const second = secondOwner
    .delete('/api/me')
    .set('x-csrf-token', secondToken)
    .send({ password, confirm: true })
    .then((response) => response);
  try {
    await entered.promise;
    releases[0].resolve();
    const firstResult = await Promise.race(
      [first, second].map((request, index) => request.then((response) => ({ index, response }))),
    );
    assert.equal(firstResult.response.status, 204);
    const newcomer = supertest.agent(app);
    const created = await signup(newcomer, 'newcomer@example.test').expect(201);
    assert.equal(created.body.id, 1);
  } finally {
    for (const release of releases) release.resolve();
    database.transaction = originalTransaction;
  }

  assert.deepEqual(
    (await Promise.all([first, second])).map((response) => response.status).sort(),
    [204, 409],
  );
  await mutate(supertest.agent(app), 'post', '/api/auth/login', {
    email: 'newcomer@example.test',
    password,
  }).expect(200);
});

test('a session written back after its account is deleted never signs in the next account', async (t) => {
  const { app, database } = await fixture(t);
  const owner = supertest.agent(app);
  const otherDevice = supertest.agent(app);
  const deleted = await signup(owner, 'owner@example.test').expect(201);
  await login(otherDevice, 'owner@example.test').expect(200);
  // A request still running during the deletion writes its session back afterwards.
  const staleSessions = await database.all('SELECT sid, sess, expires_at FROM sessions');
  await mutate(owner, 'delete', '/api/me', { password, confirm: true }).expect(204);
  for (const row of staleSessions) {
    await database.run('INSERT OR REPLACE INTO sessions (sid, sess, expires_at) VALUES (?, ?, ?)', [
      row.sid,
      row.sess,
      row.expires_at,
    ]);
  }

  // SQLite gives the deleted newest account's id to the next account.
  const newcomer = supertest.agent(app);
  const created = await signup(newcomer, 'newcomer@example.test').expect(201);
  assert.equal(created.body.id, deleted.body.id);
  await otherDevice.get('/api/me/export').expect(401);
  await otherDevice.get('/api/me').expect(401);
  await newcomer.get('/api/me').expect(200).expect(({ body }) => assert.equal(body.email, 'newcomer@example.test'));
});

test('validation rejects dangerous URLs while preserving malicious-looking text as data', async (t) => {
  const { app } = await fixture(t);
  const owner = supertest.agent(app);
  await signup(owner, 'owner@example.test').expect(201);
  const dangerous = baseProfile('dangerous');
  dangerous.work = [{ title: 'Bad', url: 'javascript:alert(1)' }];
  await createProfile(owner, dangerous).expect(400);

  const plainText = baseProfile('plain-text');
  plainText.story = '<script>alert("still text")</script>';
  await createProfile(owner, plainText).expect(201);
  const dashboard = await owner.get('/api/me/profiles').expect(200);
  assert.equal(dashboard.body.profiles[0].draft.story, plainText.story);
});

test('public search, filters, deterministic sorting and bounded pagination use approved data only', async (t) => {
  const { app, database } = await fixture(t);
  const profiles = [
    baseProfile('zulu', 'Zulu'),
    {
      ...baseProfile('alpha', 'alpha'),
      fictional: true,
      work: [{ title: 'A work' }],
      family: [
        { relation: 'sibling', name: 'Beta', slug: 'beta' },
        { relation: 'parent', name: 'Unpublished Parent', slug: 'unpublished-parent' },
      ],
    },
    {
      ...baseProfile('beta', 'Beta'),
      autobiography: 'Grew up beside a lighthouse.',
      values: ['Patience'],
      memories: ['Fishing at dawn'],
    },
  ];
  for (const profile of profiles) {
    const inserted = await database.run(
      `INSERT INTO profiles (slug, status, consented_at) VALUES (?, 'approved', CURRENT_TIMESTAMP)`,
      [profile.slug],
    );
    const revision = await database.run(
      'INSERT INTO profile_revisions (profile_id, content_json, provenance) VALUES (?, ?, ?)',
      [inserted.lastID, JSON.stringify(profile), 'test fixture'],
    );
    await database.run('UPDATE profiles SET approved_revision_id = ?, draft_revision_id = ? WHERE id = ?', [
      revision.lastID,
      revision.lastID,
      inserted.lastID,
    ]);
  }

  const firstPage = await supertest(app).get('/api/profiles?limit=2&page=1').expect(200);
  assert.deepEqual(
    firstPage.body.profiles.map((profile) => profile.slug),
    ['alpha', 'beta'],
  );
  assert.deepEqual(firstPage.body.pagination, { page: 1, limit: 2, total: 3, pages: 2 });
  const bounded = await supertest(app).get('/api/profiles?limit=500&page=1').expect(200);
  assert.equal(bounded.body.pagination.limit, 50);
  const filtered = await supertest(app).get('/api/profiles?fictional=true&hasWork=true&q=alpha').expect(200);
  assert.deepEqual(filtered.body.profiles.map((profile) => profile.slug), ['alpha']);
  await supertest(app).get('/api/profiles?q=%25').expect(200).expect(({ body }) => {
    assert.equal(body.profiles.length, 0);
  });
  for (const q of ['lighthouse', 'PATIENCE', 'at dawn']) {
    const found = await supertest(app).get(`/api/profiles?q=${encodeURIComponent(q)}`).expect(200);
    assert.deepEqual(found.body.profiles.map((profile) => profile.slug), ['beta'], q);
  }
  await supertest(app).get('/api/profiles?q=Unpublished%20Parent').expect(200).expect(({ body }) => {
    assert.equal(body.profiles.length, 0);
  });

  const alpha = await supertest(app).get('/api/profiles/alpha').expect(200);
  assert.deepEqual(alpha.body.family, [
    { relation: 'sibling', name: 'Beta', slug: 'beta' },
    { relation: 'parent', name: 'Unpublished Parent' },
  ]);
});

test('recovery is generic, configurable, expiring and single use', async (t) => {
  const missing = await fixture(t);
  const missingAgent = supertest.agent(missing.app);
  const unavailable = await mutate(missingAgent, 'post', '/api/auth/request-reset', {
    email: 'nobody@example.test',
  }).expect(200);
  assert.equal(unavailable.body.recoveryConfigured, false);

  const { app, database, sent } = await fixture(t, { recoveryConfigured: true });
  const agent = supertest.agent(app);
  await signup(agent, 'owner@example.test').expect(201);
  const known = await mutate(agent, 'post', '/api/auth/request-reset', { email: 'owner@example.test' }).expect(200);
  const unknown = await mutate(agent, 'post', '/api/auth/request-reset', { email: 'unknown@example.test' }).expect(200);
  assert.equal(known.body.message, unknown.body.message);
  assert.equal(sent.length, 1);
  await database.run(`UPDATE password_reset_tokens SET expires_at = '2000-01-01T00:00:00.000Z'`);
  await mutate(agent, 'post', '/api/auth/reset-password', {
    token: sent[0].token,
    password: 'a replacement password',
  }).expect(400);
  await mutate(agent, 'post', '/api/auth/request-reset', { email: 'owner@example.test' }).expect(200);
  assert.equal(sent.length, 2);
  await mutate(agent, 'post', '/api/auth/reset-password', {
    token: sent[1].token,
    password: 'a replacement password',
  }).expect(200);
  await mutate(agent, 'post', '/api/auth/reset-password', {
    token: sent[1].token,
    password: 'another replacement password',
  }).expect(400);
});
