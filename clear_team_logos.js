// clear_team_logos.js
// Script to clear the team_logos table in the database

console.log('🧹 Clearing team_logos table...');

// Set database path based on environment
const dbPath = process.env.NODE_ENV === 'production' ? '/tmp/cs_match_tracker.db' : 'cs_match_tracker.db';
console.log(`📂 Using database at: ${dbPath}`);

// In production, always use sqlite3
if (process.env.NODE_ENV === 'production') {
  console.log('🔌 Production environment detected, using sqlite3...');
  const sqlite3 = require('sqlite3').verbose();
  const db = new sqlite3.Database(dbPath);
  
  // Use promises for better control flow
  const runAsync = (query) => {
    return new Promise((resolve, reject) => {
      db.run(query, function(err) {
        if (err) reject(err);
        else resolve(this);
      });
    });
  };
  
  // Run the DELETE operation
  runAsync('DELETE FROM team_logos')
    .then((result) => {
      console.log(`✅ Cleared ${result.changes} entries from team_logos table`);
      db.close();
      console.log("✅ Operation completed successfully");
    })
    .catch(err => {
      console.error('❌ Error clearing team_logos table:', err);
      db.close();
      process.exit(1);
    });
} else {
  // In development, try better-sqlite3 first
  try {
    const Database = require('better-sqlite3');
    console.log('✅ Using better-sqlite3');
    const db = new Database(dbPath);
    
    // Clear the team_logos table
    const result = db.prepare('DELETE FROM team_logos').run();
    console.log(`✅ Cleared ${result.changes} entries from team_logos table`);
    
    db.close();
    console.log("✅ Operation completed successfully");
  } catch (err) {
    console.log(`⚠️ better-sqlite3 not available: ${err.message}`);
    console.log('🔄 Falling back to sqlite3...');
    
    // Use the same sqlite3 code as production
    const sqlite3 = require('sqlite3').verbose();
    const db = new sqlite3.Database(dbPath);
    
    // Use promises for better control flow
    const runAsync = (query) => {
      return new Promise((resolve, reject) => {
        db.run(query, function(err) {
          if (err) reject(err);
          else resolve(this);
        });
      });
    };
    
    // Run the DELETE operation
    runAsync('DELETE FROM team_logos')
      .then((result) => {
        console.log(`✅ Cleared ${result.changes} entries from team_logos table`);
        db.close();
        console.log("✅ Operation completed successfully");
      })
      .catch(err => {
        console.error('❌ Error clearing team_logos table:', err);
        db.close();
        process.exit(1);
      });
  }
}
