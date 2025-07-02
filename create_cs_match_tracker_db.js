// create_cs_match_tracker_db.js
const Database = require('better-sqlite3');
const db = new Database('cs_match_tracker.db');

// Enable foreign key constraints
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS matches (
  match_id TEXT PRIMARY KEY,
  match_url TEXT NOT NULL,
  team1_name TEXT NOT NULL,
  team2_name TEXT NOT NULL,
  match_format TEXT CHECK (match_format IN ('BO1', 'BO3', 'BO5')) NOT NULL,
  winner TEXT,
  is_finished BOOLEAN DEFAULT 0,
  added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS live_scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id TEXT NOT NULL,
  map_number INTEGER NOT NULL,
  current_round INTEGER DEFAULT 1,
  ct_team TEXT NOT NULL,
  t_team TEXT NOT NULL,
  ct_score INTEGER DEFAULT 0,
  t_score INTEGER DEFAULT 0,
  status TEXT DEFAULT 'live',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (match_id) REFERENCES matches(match_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS match_maps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id TEXT NOT NULL,
  map_number INTEGER NOT NULL,
  status TEXT CHECK (status IN ('not_started', 'running', 'finished')) NOT NULL DEFAULT 'not_started',
  winning_team TEXT,
  ct_score INTEGER,
  t_score INTEGER,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (match_id) REFERENCES matches(match_id) ON DELETE CASCADE,
  UNIQUE (match_id, map_number)
);

CREATE TABLE IF NOT EXISTS match_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id TEXT NOT NULL,
  priority INTEGER DEFAULT 0,
  status TEXT CHECK (status IN ('queued', 'not_started', 'running', 'finished')) NOT NULL DEFAULT 'queued',
  FOREIGN KEY (match_id) REFERENCES matches(match_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS win_state (
  match_id TEXT PRIMARY KEY,
  map_win BOOLEAN DEFAULT 0,
  match_win BOOLEAN DEFAULT 0,
  winning_team TEXT,
  winning_score TEXT,
  map_counts TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (match_id) REFERENCES matches(match_id) ON DELETE CASCADE
);
`);

const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log("Tables:", tables.map(t => t.name));

for (const { name } of tables) {
  console.log(`\nSchema for ${name}:`);
  const info = db.prepare(`PRAGMA table_info(${name})`).all();
  info.forEach(col => console.log(col));
}

db.close();