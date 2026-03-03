import fs from 'node:fs';
import path from 'node:path';
import sqlite3 from 'sqlite3';

const dataDir = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'ai-rpg.sqlite');
export const db = new sqlite3.Database(dbPath);

export function run(sql: string, params: unknown[] = []) {
  return new Promise<void>((resolve, reject) => {
    db.run(sql, params, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

export function get<T>(sql: string, params: unknown[] = []) {
  return new Promise<T | undefined>((resolve, reject) => {
    db.get(sql, params, (error, row) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(row as T | undefined);
    });
  });
}

export function all<T>(sql: string, params: unknown[] = []) {
  return new Promise<T[]>((resolve, reject) => {
    db.all(sql, params, (error, rows) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(rows as T[]);
    });
  });
}

export async function initDb() {
  await run('PRAGMA foreign_keys = ON;');

  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS games (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT 'Untitled Game',
      description TEXT NOT NULL DEFAULT '',
      current_scene_id TEXT,
      zip_path TEXT NOT NULL,
      files_path TEXT NOT NULL,
      json_file_count INTEGER NOT NULL,
      webp_file_count INTEGER NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  const gameColumns = await all<{ name: string }>('PRAGMA table_info(games);');
  if (!gameColumns.some((column) => column.name === 'title')) {
    await run("ALTER TABLE games ADD COLUMN title TEXT NOT NULL DEFAULT 'Untitled Game';");
  }
  if (!gameColumns.some((column) => column.name === 'description')) {
    await run("ALTER TABLE games ADD COLUMN description TEXT NOT NULL DEFAULT ''; ");
  }
  if (!gameColumns.some((column) => column.name === 'current_scene_id')) {
    await run('ALTER TABLE games ADD COLUMN current_scene_id TEXT;');
  }

  await run(`
    CREATE TABLE IF NOT EXISTS game_players (
      id TEXT PRIMARY KEY,
      game_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('player', 'support')),
      name TEXT NOT NULL,
      gender TEXT NOT NULL,
      background TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(game_id, role),
      FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
    );
  `);
}