import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import sqlite3 from 'sqlite3';

const migrationPath = new URL('../migrations/001_initial.sql', import.meta.url);

export async function openDatabase(filename) {
  if (filename !== ':memory:') await mkdir(path.dirname(filename), { recursive: true });
  const raw = await new Promise((resolve, reject) => {
    const instance = new sqlite3.Database(filename, (error) => (error ? reject(error) : resolve(instance)));
  });
  raw.configure('busyTimeout', 5000);

  const database = {
    raw,
    run(sql, params = []) {
      return new Promise((resolve, reject) => {
        raw.run(sql, params, function callback(error) {
          if (error) reject(error);
          else resolve({ lastID: this.lastID, changes: this.changes });
        });
      });
    },
    get(sql, params = []) {
      return new Promise((resolve, reject) => {
        raw.get(sql, params, (error, row) => (error ? reject(error) : resolve(row)));
      });
    },
    all(sql, params = []) {
      return new Promise((resolve, reject) => {
        raw.all(sql, params, (error, rows) => (error ? reject(error) : resolve(rows)));
      });
    },
    exec(sql) {
      return new Promise((resolve, reject) => raw.exec(sql, (error) => (error ? reject(error) : resolve())));
    },
    close() {
      return new Promise((resolve, reject) => raw.close((error) => (error ? reject(error) : resolve())));
    },
  };

  await database.exec(await readFile(migrationPath, 'utf8'));
  return database;
}

