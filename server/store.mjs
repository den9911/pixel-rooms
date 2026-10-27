import { DatabaseSync } from 'node:sqlite';
import { seedMemes } from './content.mjs';

export function openStore(filename) {
  const db = new DatabaseSync(filename);
  db.exec(`
    PRAGMA journal_mode=WAL;
    PRAGMA foreign_keys=ON;
    PRAGMA busy_timeout=3000;
    CREATE TABLE IF NOT EXISTS posts (
      id TEXT PRIMARY KEY, kind TEXT NOT NULL, title TEXT NOT NULL,
      body TEXT NOT NULL DEFAULT '', category TEXT NOT NULL DEFAULT '',
      day TEXT NOT NULL DEFAULT '', owner TEXT NOT NULL, status TEXT NOT NULL,
      votes INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL,
      image BLOB, mime TEXT, bytes INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS posts_feed ON posts(kind,status,created DESC);
    CREATE INDEX IF NOT EXISTS posts_day ON posts(day,kind,status,votes DESC);
    CREATE TABLE IF NOT EXISTS votes (
      scope TEXT NOT NULL, target TEXT NOT NULL, voter TEXT NOT NULL,
      choice TEXT NOT NULL DEFAULT '', created INTEGER NOT NULL,
      PRIMARY KEY(scope,target,voter)
    );
    CREATE TABLE IF NOT EXISTS polls (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, options TEXT NOT NULL,
      owner TEXT NOT NULL, created INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY, owner TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
      pixels TEXT NOT NULL, updated INTEGER NOT NULL, version INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS games (
      day TEXT NOT NULL, player TEXT NOT NULL, started INTEGER NOT NULL,
      finished INTEGER, attempts INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(day,player)
    );
    CREATE TABLE IF NOT EXISTS reports (
      post TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      reporter TEXT NOT NULL, reason TEXT NOT NULL, PRIMARY KEY(post,reporter)
    );
    CREATE TABLE IF NOT EXISTS uploads_usage (
      id INTEGER PRIMARY KEY CHECK(id=1), bytes INTEGER NOT NULL DEFAULT 0
    );
    INSERT OR IGNORE INTO uploads_usage(id,bytes) SELECT 1,COALESCE(SUM(bytes),0) FROM posts;
    CREATE TRIGGER IF NOT EXISTS posts_insert_usage AFTER INSERT ON posts BEGIN
      UPDATE uploads_usage SET bytes=bytes+NEW.bytes WHERE id=1;
    END;
    CREATE TRIGGER IF NOT EXISTS posts_delete_usage AFTER DELETE ON posts BEGIN
      UPDATE uploads_usage SET bytes=bytes-OLD.bytes WHERE id=1;
    END;
  `);
  const insert = db.prepare('INSERT OR IGNORE INTO posts(id,kind,title,body,category,owner,status,created) VALUES (?,?,?,?,?,?,?,?)');
  seedMemes.forEach(([title, body, color], i) => insert.run(`seed-${i}`, 'arena', title, body, color, 'editor', 'approved', i));
  return db;
}

export function transaction(db, action) {
  db.exec('BEGIN IMMEDIATE');
  try { const result = action(); db.exec('COMMIT'); return result; }
  catch (error) { db.exec('ROLLBACK'); throw error; }
}
