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
  let transactionTail = Promise.resolve();

  function runRaw(sql, params = []) {
    return new Promise((resolve, reject) => {
      raw.run(sql, params, function callback(error) {
        if (error) reject(error);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  }
  function getRaw(sql, params = []) {
    return new Promise((resolve, reject) => {
      raw.get(sql, params, (error, row) => (error ? reject(error) : resolve(row)));
    });
  }
  function allRaw(sql, params = []) {
    return new Promise((resolve, reject) => {
      raw.all(sql, params, (error, rows) => (error ? reject(error) : resolve(rows)));
    });
  }
  function execRaw(sql) {
    return new Promise((resolve, reject) => raw.exec(sql, (error) => (error ? reject(error) : resolve())));
  }

  const transactionDatabase = { run: runRaw, get: getRaw, all: allRaw, exec: execRaw };
  const database = {
    raw,
    async run(sql, params = []) {
      await transactionTail;
      return runRaw(sql, params);
    },
    async get(sql, params = []) {
      await transactionTail;
      return getRaw(sql, params);
    },
    async all(sql, params = []) {
      await transactionTail;
      return allRaw(sql, params);
    },
    async exec(sql) {
      await transactionTail;
      return execRaw(sql);
    },
    async close() {
      await transactionTail;
      return new Promise((resolve, reject) => raw.close((error) => (error ? reject(error) : resolve())));
    },
    async transaction(work) {
      let release;
      const previous = transactionTail;
      transactionTail = new Promise((resolve) => {
        release = resolve;
      });
      await previous;
      let started = false;
      try {
        await execRaw('BEGIN IMMEDIATE');
        started = true;
        const result = await work(transactionDatabase);
        await execRaw('COMMIT');
        return result;
      } catch (error) {
        if (started) await execRaw('ROLLBACK').catch(() => {});
        throw error;
      } finally {
        release();
      }
    },
  };

  await execRaw(await readFile(migrationPath, 'utf8'));
  return database;
}
