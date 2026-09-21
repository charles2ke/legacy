import session from 'express-session';

export class SqliteSessionStore extends session.Store {
  constructor(database) {
    super();
    this.database = database;
  }

  get(sid, callback) {
    this.database
      .get('SELECT sess, expires_at FROM sessions WHERE sid = ? AND expires_at > ?', [sid, Date.now()])
      .then((row) => callback(null, row ? JSON.parse(row.sess) : null))
      .catch(callback);
  }

  set(sid, value, callback = () => {}) {
    const expiresAt = value.cookie?.expires
      ? new Date(value.cookie.expires).getTime()
      : Date.now() + 8 * 60 * 60 * 1000;
    this.database
      .run(
        `INSERT INTO sessions (sid, sess, expires_at) VALUES (?, ?, ?)
         ON CONFLICT(sid) DO UPDATE SET sess = excluded.sess, expires_at = excluded.expires_at`,
        [sid, JSON.stringify(value), expiresAt],
      )
      .then(() => callback())
      .catch(callback);
  }

  destroy(sid, callback = () => {}) {
    this.database.run('DELETE FROM sessions WHERE sid = ?', [sid]).then(() => callback()).catch(callback);
  }

  touch(sid, value, callback = () => {}) {
    this.set(sid, value, callback);
  }
}

