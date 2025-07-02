// create_cs_match_tracker_db.js
console.log('🔧 Initializing database tables...');

// Set database path based on environment
const dbPath = process.env.NODE_ENV === 'production' ? '/tmp/cs_match_tracker.db' : 'cs_match_tracker.db';
console.log(`📂 Using database at: ${dbPath}`);

// SQL statements to create tables
const createTablesSql = `
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

CREATE TABLE IF NOT EXISTS admin_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
`;

// Try to use better-sqlite3 first, fall back to sqlite3 if not available
try {
  const Database = require('better-sqlite3');
  console.log('✅ Using better-sqlite3 for database initialization');
  const db = new Database(dbPath);
  
  // Enable foreign key constraints
  db.exec('PRAGMA foreign_keys = ON;');
  
  // Create tables
  db.exec(createTablesSql);
  
  // List tables for verification
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  console.log("✅ Tables created:", tables.map(t => t.name).join(', '));
  
  db.close();
} catch (err) {
  console.log(`⚠️ better-sqlite3 not available: ${err.message}`);
  console.log('🔄 Falling back to sqlite3...');
  
  try {
    const sqlite3 = require('sqlite3').verbose();
    const db = new sqlite3.Database(dbPath);
    
    // Enable foreign key constraints
    db.run('PRAGMA foreign_keys = ON;');
    
    // Create tables
    db.exec(createTablesSql, (err) => {
      if (err) {
        console.error('❌ Error creating tables:', err.message);
        process.exit(1);
      }
      
      // List tables for verification
      db.all("SELECT name FROM sqlite_master WHERE type='table'", [], (err, tables) => {
        if (err) {
          console.error('❌ Error listing tables:', err.message);
        } else {
          console.log("✅ Tables created:", tables.map(t => t.name).join(', '));
        }
        
        db.close();
      });
    });
  } catch (err) {
    console.error('❌ Failed to initialize database:', err.message);
    process.exit(1);
  }
}