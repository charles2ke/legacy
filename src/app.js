import { createHash, randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import argon2 from 'argon2';
import { csrfSync } from 'csrf-sync';
import express from 'express';
import rateLimit from 'express-rate-limit';
import session from 'express-session';
import helmet from 'helmet';

import { validateProfile } from '../assets/js/profile-schema.js';
import { SESSION_MAX_AGE_MS } from './config.js';
import { SqliteSessionStore } from './session-store.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RESET_LIFETIME_MS = 30 * 60 * 1000;

function jsonError(res, status, message, details) {
  return res.status(status).json({ error: message, ...(details ? { details } : {}) });
}

function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function validEmail(email) {
  if (!email || email.length > 254) return false;
  if ([...email].some((character) => /\s/.test(character))) return false;
  const at = email.indexOf('@');
  const dot = email.lastIndexOf('.');
  return at > 0 && at === email.lastIndexOf('@') && dot > at + 1 && dot < email.length - 1;
}

function validPassword(password) {
  return typeof password === 'string' && password.length >= 12 && password.length <= 200;
}

function parseProfile(value) {
  const validation = validateProfile(value);
  return validation.valid ? { profile: value } : { errors: validation.errors };
}

function parseContent(row, key = 'content_json') {
  return row?.[key] ? JSON.parse(row[key]) : null;
}

function requireUser(req, res, next) {
  if (!req.session.userId) return jsonError(res, 401, 'Authentication required');
  next();
}

function requireModerator(req, res, next) {
  if (req.session.role !== 'moderator') return jsonError(res, 403, 'Moderator access required');
  next();
}

function sessionRegenerate(req) {
  return new Promise((resolve, reject) => req.session.regenerate((error) => (error ? reject(error) : resolve())));
}

function sessionDestroy(req) {
  return new Promise((resolve, reject) => req.session.destroy((error) => (error ? reject(error) : resolve())));
}

async function audit(database, actorUserId, profileId, action, details = null) {
  await database.run(
    'INSERT INTO audit_log (actor_user_id, profile_id, action, details_json) VALUES (?, ?, ?, ?)',
    [actorUserId || null, profileId || null, action, details ? JSON.stringify(details) : null],
  );
}

async function ownedProfile(database, profileId, userId) {
  return database.get(
    `SELECT p.*, r.content_json AS draft_json, a.content_json AS approved_json
       FROM profiles p
       LEFT JOIN profile_revisions r ON r.id = p.draft_revision_id
       LEFT JOIN profile_revisions a ON a.id = p.approved_revision_id
      WHERE p.id = ? AND p.owner_user_id = ?`,
    [profileId, userId],
  );
}

export async function createApp({ config, database, mailer, logger = console, authLimit = 10 }) {
  const app = express();
  if (config.trustProxy) app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          'img-src': ["'self'", 'https:', 'http:'],
          'script-src': ["'self'"],
        },
      },
    }),
  );
  app.use(express.json({ limit: '100kb' }));
  app.use(
    session({
      name: 'legacy.sid',
      secret: config.sessionSecret,
      store: new SqliteSessionStore(database),
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: config.production,
        maxAge: SESSION_MAX_AGE_MS,
      },
    }),
  );

  const { generateToken, csrfSynchronisedProtection } = csrfSync();
  app.get('/api/csrf', (req, res) => res.json({ token: generateToken(req) }));
  app.use('/api', csrfSynchronisedProtection);

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: authLimit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many attempts; try again later' },
  });

  app.get('/api/config', (req, res) => {
    res.json({
      removalContact: config.publicRemovalUrl,
      recoveryConfigured: mailer.configured,
    });
  });

  app.post('/api/auth/signup', authLimiter, async (req, res, next) => {
    try {
      const email = normalizeEmail(req.body.email);
      if (!validEmail(email)) return jsonError(res, 400, 'Enter a valid email');
      if (!validPassword(req.body.password)) {
        return jsonError(res, 400, 'Password must be between 12 and 200 characters');
      }
      const passwordHash = await argon2.hash(req.body.password, { type: argon2.argon2id });
      let result;
      try {
        result = await database.run('INSERT INTO users (email, password_hash) VALUES (?, ?)', [
          email,
          passwordHash,
        ]);
      } catch (error) {
        if (error.code === 'SQLITE_CONSTRAINT') return jsonError(res, 409, 'An account already exists');
        throw error;
      }
      await sessionRegenerate(req);
      req.session.userId = result.lastID;
      req.session.role = 'owner';
      res.status(201).json({ id: result.lastID, role: 'owner' });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/auth/login', authLimiter, async (req, res, next) => {
    try {
      const user = await database.get('SELECT id, password_hash, role FROM users WHERE email = ?', [
        normalizeEmail(req.body.email),
      ]);
      if (!user || !(await argon2.verify(user.password_hash, req.body.password || ''))) {
        return jsonError(res, 401, 'Invalid email or password');
      }
      await sessionRegenerate(req);
      req.session.userId = user.id;
      req.session.role = user.role;
      res.json({ id: user.id, role: user.role });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/auth/logout', requireUser, async (req, res, next) => {
    try {
      await sessionDestroy(req);
      res.clearCookie('legacy.sid');
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/auth/request-reset', authLimiter, async (req, res, next) => {
    try {
      const user = await database.get('SELECT id, email FROM users WHERE email = ?', [
        normalizeEmail(req.body.email),
      ]);
      if (user && mailer.configured) {
        const token = randomBytes(32).toString('base64url');
        const tokenHash = createHash('sha256').update(token).digest('hex');
        const expiresAt = new Date(Date.now() + RESET_LIFETIME_MS).toISOString();
        await database.transaction(async (transaction) => {
          await transaction.run(
            'UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP WHERE user_id = ? AND used_at IS NULL',
            [user.id],
          );
          await transaction.run(
            'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)',
            [user.id, tokenHash, expiresAt],
          );
        });
        try {
          await mailer.sendPasswordReset(user.email, token);
        } catch (error) {
          logger.error('Password recovery delivery failed', error);
        }
      }
      res.json({
        message: 'If that account exists and recovery is configured, a reset link will be sent.',
        recoveryConfigured: mailer.configured,
      });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/auth/reset-password', authLimiter, async (req, res, next) => {
    try {
      if (!validPassword(req.body.password) || typeof req.body.token !== 'string') {
        return jsonError(res, 400, 'A valid token and password of at least 12 characters are required');
      }
      const tokenHash = createHash('sha256').update(req.body.token).digest('hex');
      const reset = await database.get(
        `SELECT id, user_id FROM password_reset_tokens
          WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?`,
        [tokenHash, new Date().toISOString()],
      );
      if (!reset) return jsonError(res, 400, 'Reset link is invalid or expired');
      const passwordHash = await argon2.hash(req.body.password, { type: argon2.argon2id });
      await database.transaction(async (transaction) => {
        await transaction.run('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, reset.user_id]);
        await transaction.run('UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = ?', [reset.id]);
        await transaction.run(`DELETE FROM sessions WHERE json_extract(sess, '$.userId') = ?`, [reset.user_id]);
      });
      res.json({ message: 'Password updated. Sign in with the new password.' });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/me', requireUser, async (req, res, next) => {
    try {
      const user = await database.get('SELECT id, email, role, created_at FROM users WHERE id = ?', [
        req.session.userId,
      ]);
      res.json(user);
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/me/profiles', requireUser, async (req, res, next) => {
    try {
      const rows = await database.all(
        `SELECT p.id, p.slug, p.status, p.consented_at, p.updated_at,
                d.content_json AS draft_json, a.content_json AS approved_json,
                (SELECT feedback FROM moderation_decisions m
                  WHERE m.profile_id = p.id ORDER BY m.id DESC LIMIT 1) AS feedback
           FROM profiles p
           LEFT JOIN profile_revisions d ON d.id = p.draft_revision_id
           LEFT JOIN profile_revisions a ON a.id = p.approved_revision_id
          WHERE p.owner_user_id = ? ORDER BY p.updated_at DESC`,
        [req.session.userId],
      );
      res.json({
        profiles: rows.map((row) => ({
          id: row.id,
          slug: row.slug,
          status: row.status,
          consentedAt: row.consented_at,
          updatedAt: row.updated_at,
          draft: parseContent(row, 'draft_json'),
          approved: parseContent(row, 'approved_json'),
          feedback: row.feedback,
        })),
      });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/me/profiles', requireUser, async (req, res, next) => {
    try {
      const parsed = parseProfile(req.body.profile);
      if (parsed.errors) return jsonError(res, 400, 'Profile validation failed', parsed.errors);
      try {
        const profile = await database.transaction(async (transaction) => {
          const inserted = await transaction.run(
            'INSERT INTO profiles (owner_user_id, slug) VALUES (?, ?)',
            [req.session.userId, parsed.profile.slug],
          );
          const revision = await transaction.run(
            'INSERT INTO profile_revisions (profile_id, content_json, created_by_user_id) VALUES (?, ?, ?)',
            [inserted.lastID, JSON.stringify(parsed.profile), req.session.userId],
          );
          await transaction.run('UPDATE profiles SET draft_revision_id = ? WHERE id = ?', [
            revision.lastID,
            inserted.lastID,
          ]);
          await audit(transaction, req.session.userId, inserted.lastID, 'profile.created');
          return inserted;
        });
        res.status(201).json({ id: profile.lastID, status: 'draft' });
      } catch (error) {
        if (error.code === 'SQLITE_CONSTRAINT') return jsonError(res, 409, 'That profile address is already used');
        throw error;
      }
    } catch (error) {
      next(error);
    }
  });

  app.put('/api/me/profiles/:id', requireUser, async (req, res, next) => {
    try {
      const current = await ownedProfile(database, req.params.id, req.session.userId);
      if (!current) return jsonError(res, 404, 'Profile not found');
      const parsed = parseProfile(req.body.profile);
      if (parsed.errors) return jsonError(res, 400, 'Profile validation failed', parsed.errors);
      const approved = parseContent(current, 'approved_json');
      if (approved && approved.slug !== parsed.profile.slug) {
        return jsonError(res, 400, 'The address of a published profile cannot be changed');
      }
      const slugConflict = await database.get('SELECT id FROM profiles WHERE slug = ? AND id != ?', [
        parsed.profile.slug,
        current.id,
      ]);
      if (slugConflict) return jsonError(res, 409, 'That profile address is already used');
      try {
        await database.transaction(async (transaction) => {
          const revision = await transaction.run(
            'INSERT INTO profile_revisions (profile_id, content_json, created_by_user_id) VALUES (?, ?, ?)',
            [current.id, JSON.stringify(parsed.profile), req.session.userId],
          );
          await transaction.run(
            `UPDATE profiles SET slug = ?, draft_revision_id = ?, status = 'draft',
             consented_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND owner_user_id = ?`,
            [parsed.profile.slug, revision.lastID, current.id, req.session.userId],
          );
          await audit(transaction, req.session.userId, current.id, 'profile.draft_saved');
        });
      } catch (error) {
        if (error.code === 'SQLITE_CONSTRAINT') return jsonError(res, 409, 'That profile address is already used');
        throw error;
      }
      res.json({ id: current.id, status: 'draft' });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/me/profiles/:id/submit', requireUser, async (req, res, next) => {
    try {
      const profile = await ownedProfile(database, req.params.id, req.session.userId);
      if (!profile) return jsonError(res, 404, 'Profile not found');
      if (!profile.draft_revision_id || !parseProfile(parseContent(profile, 'draft_json')).profile) {
        return jsonError(res, 400, 'A valid draft is required');
      }
      if (req.body.consent !== true) return jsonError(res, 400, 'Explicit consent to public publication is required');
      await database.run(
        `UPDATE profiles SET status = 'pending', consented_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP WHERE id = ? AND owner_user_id = ?`,
        [profile.id, req.session.userId],
      );
      await audit(database, req.session.userId, profile.id, 'profile.submitted', {
        revisionId: profile.draft_revision_id,
      });
      res.json({ id: profile.id, status: 'pending' });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/me/profiles/:id/unpublish', requireUser, async (req, res, next) => {
    try {
      const result = await database.run(
        `UPDATE profiles SET approved_revision_id = NULL, status = 'draft',
         consented_at = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND owner_user_id = ?`,
        [req.params.id, req.session.userId],
      );
      if (!result.changes) return jsonError(res, 404, 'Profile not found');
      await audit(database, req.session.userId, Number(req.params.id), 'profile.unpublished');
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  app.delete('/api/me/profiles/:id', requireUser, async (req, res, next) => {
    try {
      const result = await database.run('DELETE FROM profiles WHERE id = ? AND owner_user_id = ?', [
        req.params.id,
        req.session.userId,
      ]);
      if (!result.changes) return jsonError(res, 404, 'Profile not found');
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/moderation/profiles', requireUser, requireModerator, async (req, res, next) => {
    try {
      const page = Math.max(1, Number.parseInt(req.query.page || '1', 10) || 1);
      const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit || '20', 10) || 20));
      const count = await database.get(
        `SELECT COUNT(*) AS total FROM profiles WHERE status IN ('pending', 'rejected')`,
      );
      const rows = await database.all(
        `SELECT p.id, p.slug, p.status, p.updated_at, r.content_json
           FROM profiles p JOIN profile_revisions r ON r.id = p.draft_revision_id
          WHERE p.status IN ('pending', 'rejected') ORDER BY p.updated_at ASC, p.id ASC
          LIMIT ? OFFSET ?`,
        [limit, (page - 1) * limit],
      );
      res.json({
        profiles: rows.map((row) => ({
          id: row.id,
          slug: row.slug,
          status: row.status,
          updatedAt: row.updated_at,
          draft: parseContent(row),
        })),
        pagination: { page, limit, total: count.total, pages: Math.ceil(count.total / limit) },
      });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/moderation/profiles/:id/decision', requireUser, requireModerator, async (req, res, next) => {
    try {
      if (!['approved', 'rejected'].includes(req.body.decision)) {
        return jsonError(res, 400, 'Decision must be approved or rejected');
      }
      const feedback = typeof req.body.feedback === 'string' ? req.body.feedback.trim() : '';
      if (feedback.length > 2000) return jsonError(res, 400, 'Feedback must be 2000 characters or fewer');
      if (req.body.decision === 'rejected' && !feedback) {
        return jsonError(res, 400, 'Rejection feedback is required');
      }
      const profile = await database.get(
        `SELECT id, status, draft_revision_id, consented_at FROM profiles
          WHERE id = ? AND status = 'pending'`,
        [req.params.id],
      );
      if (!profile || !profile.consented_at) return jsonError(res, 409, 'Profile is not awaiting review');
      await database.transaction(async (transaction) => {
        await transaction.run(
          `INSERT INTO moderation_decisions
             (profile_id, revision_id, moderator_user_id, decision, feedback)
           VALUES (?, ?, ?, ?, ?)`,
          [profile.id, profile.draft_revision_id, req.session.userId, req.body.decision, feedback || null],
        );
        if (req.body.decision === 'approved') {
          await transaction.run(
            `UPDATE profiles SET approved_revision_id = draft_revision_id, status = 'approved',
             updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [profile.id],
          );
        } else {
          await transaction.run(
            `UPDATE profiles SET status = 'rejected', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [profile.id],
          );
        }
        await audit(transaction, req.session.userId, profile.id, `profile.${req.body.decision}`, {
          revisionId: profile.draft_revision_id,
        });
      });
      res.json({ id: profile.id, status: req.body.decision });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/moderation/audit', requireUser, requireModerator, async (req, res, next) => {
    try {
      const rows = await database.all(
        `SELECT id, actor_user_id, profile_id, action, details_json, created_at
           FROM audit_log ORDER BY id DESC LIMIT 100`,
      );
      res.json({ events: rows });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/profiles', async (req, res, next) => {
    try {
      const page = Math.max(1, Number.parseInt(req.query.page || '1', 10) || 1);
      const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit || '12', 10) || 12));
      const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
      const filters = [];
      const params = [];
      if (q) {
        filters.push(`(json_extract(r.content_json, '$.name') LIKE ? ESCAPE '\\'
          OR json_extract(r.content_json, '$.introduction') LIKE ? ESCAPE '\\'
          OR json_extract(r.content_json, '$.story') LIKE ? ESCAPE '\\'
          OR json_extract(r.content_json, '$.carryForward') LIKE ? ESCAPE '\\')`);
        const escaped = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
        params.push(escaped, escaped, escaped, escaped);
      }
      if (req.query.fictional === 'true') filters.push(`json_extract(r.content_json, '$.fictional') = 1`);
      if (req.query.fictional === 'false') filters.push(`COALESCE(json_extract(r.content_json, '$.fictional'), 0) = 0`);
      if (req.query.hasWork === 'true') filters.push(`json_array_length(json_extract(r.content_json, '$.work')) > 0`);
      const where = filters.length ? `AND ${filters.join(' AND ')}` : '';
      const count = await database.get(
        `SELECT COUNT(*) AS total FROM profiles p
         JOIN profile_revisions r ON r.id = p.approved_revision_id
         WHERE p.approved_revision_id IS NOT NULL ${where}`,
        params,
      );
      const rows = await database.all(
        `SELECT p.id, json_extract(r.content_json, '$.slug') AS slug, r.content_json FROM profiles p
         JOIN profile_revisions r ON r.id = p.approved_revision_id
         WHERE p.approved_revision_id IS NOT NULL ${where}
         ORDER BY lower(json_extract(r.content_json, '$.name')) ASC, p.slug ASC
         LIMIT ? OFFSET ?`,
        [...params, limit, (page - 1) * limit],
      );
      res.json({
        profiles: rows.map((row) => {
          const profile = parseContent(row);
          return {
            id: row.id,
            slug: row.slug,
            name: profile.name,
            introduction: profile.introduction,
            fictional: profile.fictional === true,
            hasWork: Array.isArray(profile.work) && profile.work.length > 0,
          };
        }),
        pagination: { page, limit, total: count.total, pages: Math.ceil(count.total / limit) },
      });
    } catch (error) {
      next(error);
    }
  });

  async function publicProfile(req, res, next, byId) {
    try {
      const row = await database.get(
        `SELECT p.id, json_extract(r.content_json, '$.slug') AS slug, r.content_json FROM profiles p
         JOIN profile_revisions r ON r.id = p.approved_revision_id
         WHERE ${byId ? 'p.id' : `json_extract(r.content_json, '$.slug')`} = ?
           AND p.approved_revision_id IS NOT NULL`,
        [req.params.value],
      );
      if (!row) return jsonError(res, 404, 'Profile not found');
      res.json(parseContent(row));
    } catch (error) {
      next(error);
    }
  }
  app.get('/api/profiles/id/:value', (req, res, next) => publicProfile(req, res, next, true));
  app.get('/api/profiles/:value', (req, res, next) => publicProfile(req, res, next, false));

  const pageLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 300,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
  });
  app.use('/assets', pageLimiter, express.static(path.join(root, 'assets'), { index: false }));
  for (const page of [
    'index.html',
    'profiles.html',
    'profile.html',
    'contribute.html',
    'login.html',
    'signup.html',
    'recover.html',
    'reset.html',
    'dashboard.html',
    'editor.html',
    'moderator.html',
  ]) {
    app.get(`/${page}`, pageLimiter, (req, res) => res.sendFile(path.join(root, page)));
  }
  app.get('/', pageLimiter, (req, res) => res.sendFile(path.join(root, 'index.html')));

  app.use((req, res) => jsonError(res, 404, 'Not found'));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error.code === 'EBADCSRFTOKEN') return jsonError(res, 403, 'Invalid CSRF token');
    logger.error(error);
    return jsonError(res, 500, 'Unexpected server error');
  });
  return app;
}
