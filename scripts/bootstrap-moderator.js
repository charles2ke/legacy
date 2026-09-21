import argon2 from 'argon2';

import { loadConfig } from '../src/config.js';
import { openDatabase } from '../src/database.js';

const email = process.env.MODERATOR_EMAIL?.trim().toLowerCase();
const password = process.env.MODERATOR_PASSWORD;
if (!email || !password || password.length < 12) {
  throw new Error('Set MODERATOR_EMAIL and a MODERATOR_PASSWORD of at least 12 characters');
}

const config = loadConfig();
const database = await openDatabase(config.databasePath);
const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
await database.run(
  `INSERT INTO users (email, password_hash, role) VALUES (?, ?, 'moderator')
   ON CONFLICT(email) DO UPDATE SET password_hash = excluded.password_hash, role = 'moderator'`,
  [email, passwordHash],
);
await database.close();
console.log(`Moderator account configured for ${email}`);

