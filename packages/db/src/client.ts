import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import * as schema from './schema';

export type QuestDb = BetterSQLite3Database<typeof schema>;

const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), '../drizzle');

/** Create a Drizzle client. Pass ':memory:' for tests. */
export function createDb(url: string): QuestDb {
  const sqlite = new Database(url);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  return drizzle(sqlite, { schema });
}

export function applyMigrations(db: QuestDb): void {
  migrate(db, { migrationsFolder });
}

/** Convenience for tests: in-memory db with schema applied. */
export function createTestDb(): QuestDb {
  const db = createDb(':memory:');
  applyMigrations(db);
  return db;
}
