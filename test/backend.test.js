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
});

test('database transactions serialize concurrent writers without cross-rollback', async (t) => {
  const database = await openDatabase(':memory:');
  t.after(() => database.close());
  await Promise.all(
    Array.from({ length: 5 }, (_, index) =>
      database.transaction(async () => {
        await database.run('INSERT INTO audit_log (action) VALUES (?)', [`concurrent.${index}`]);
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
  await mutate(moderator, 'post', `/api/moderation/profiles/${created.body.id}/decision`, {
    decision: 'approved',
    feedback: 'Approved after review.',
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
  await mutate(moderator, 'post', `/api/moderation/profiles/${created.body.id}/decision`, {
    decision: 'rejected',
    feedback: 'Please remove the private passage.',
  }).expect(200);

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
    { ...baseProfile('alpha', 'alpha'), fictional: true, work: [{ title: 'A work' }] },
    baseProfile('beta', 'Beta'),
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
