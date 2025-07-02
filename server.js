const express = require('express');
const path = require('path');
let Database;
let sqlite3;
let isUsingSqlite3 = false;
let db;

// Set database path based on environment
const dbPath = process.env.NODE_ENV === 'production' ? '/tmp/cs_match_tracker.db' : 'cs_match_tracker.db';

// Always use sqlite3 in production (Railway)
if (process.env.NODE_ENV === 'production') {
  try {
    console.log('🔌 Production environment detected, using sqlite3...');
    sqlite3 = require('sqlite3').verbose();
    isUsingSqlite3 = true;
    console.log('✅ Successfully loaded sqlite3 for production');
  } catch (err) {
    console.error('❌ Failed to load sqlite3:', err.message);
    process.exit(1);
  }
} else {
  // In development, try better-sqlite3 first (which is an optional dependency)
  try {
    Database = require('better-sqlite3');
    console.log('✅ Using better-sqlite3');
  } catch (err) {
    console.log('⚠️ better-sqlite3 failed to load, falling back to sqlite3:', err.message);
    try {
      sqlite3 = require('sqlite3').verbose();
      isUsingSqlite3 = true;
      console.log('✅ Successfully loaded sqlite3 as fallback');
    } catch (sqlite3Err) {
      console.error('❌ Failed to load sqlite3 fallback:', sqlite3Err.message);
      process.exit(1);
    }
  }
}

const puppeteerExtra = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const fs = require('fs');

// Use puppeteer-core instead of puppeteer to avoid downloading Chromium
const puppeteer = puppeteerExtra.default;
const browserConfig = require('./browser-config');

// Apply stealth plugin
puppeteer.use(StealthPlugin());

const app = express();
const PORT = process.env.PORT || 3000;

// Stay open even if nothing keeps the event loop alive
process.stdin.resume();

// Catch unexpected errors
process.on('uncaughtException', err => console.error('Uncaught Exception:', err));
process.on('unhandledRejection', err => console.error('Unhandled Rejection:', err));

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Serve logos directory
app.use('/logos', express.static(path.join(__dirname, 'public', 'logos')));

app.use(cors()); // NOT for production

// JWT Secret Key from environment variables
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this-in-production';

// Authentication middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) return res.status(401).json({ error: 'Access denied' });
  
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token' });
    req.user = user;
    next();
  });
}

// Initialize database connection
function initializeDatabase() {
  console.log(`📂 Using database at: ${dbPath}`);
  
  if (isUsingSqlite3) {
    // Using sqlite3
    try {
      // Create a new database connection
      db = new sqlite3.Database(dbPath, (err) => {
        if (err) {
          console.error('❌ Failed to connect with sqlite3:', err.message);
          process.exit(1);
        }
        console.log('✅ Connected to database with sqlite3');
      });
      
      // Enable foreign keys
      db.run('PRAGMA foreign_keys = ON');
      
      // Initialize tables - using the same schema as create_cs_match_tracker_db.js
      db.serialize(() => {
        // matches table
        db.run(`
          CREATE TABLE IF NOT EXISTS matches (
            match_id TEXT PRIMARY KEY,
            match_url TEXT NOT NULL,
            team1_name TEXT NOT NULL,
            team2_name TEXT NOT NULL,
            match_format TEXT CHECK (match_format IN ('BO1', 'BO3', 'BO5')) NOT NULL,
            winner TEXT,
            is_finished BOOLEAN DEFAULT 0,
            added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);
        
        // live_scores table
        db.run(`
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
          )
        `);
        
        // match_maps table
        db.run(`
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
          )
        `);
        
        // match_queue table
        db.run(`
          CREATE TABLE IF NOT EXISTS match_queue (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            match_id TEXT NOT NULL,
            priority INTEGER DEFAULT 0,
            status TEXT CHECK (status IN ('queued', 'not_started', 'running', 'finished')) NOT NULL DEFAULT 'queued',
            FOREIGN KEY (match_id) REFERENCES matches(match_id) ON DELETE CASCADE
          )
        `);
        
        // win_state table
        db.run(`
          CREATE TABLE IF NOT EXISTS win_state (
            match_id TEXT PRIMARY KEY,
            map_win BOOLEAN DEFAULT 0,
            match_win BOOLEAN DEFAULT 0,
            winning_team TEXT,
            winning_score TEXT,
            map_counts TEXT,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (match_id) REFERENCES matches(match_id) ON DELETE CASCADE
          )
        `);
        
        // admin_users table
        db.run(`
          CREATE TABLE IF NOT EXISTS admin_users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);
        
        // team_logos table
        db.run(`
          CREATE TABLE IF NOT EXISTS team_logos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            team_name TEXT UNIQUE NOT NULL,
            logo_filename TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);
        
        // Check if admin user exists
        db.get('SELECT COUNT(*) as count FROM admin_users', (err, row) => {
          if (err) {
            console.error('❌ Error checking admin users:', err.message);
            return;
          }
          
          if (row && row.count === 0) {
            // Create default admin user
            const hashedPassword = bcrypt.hashSync('admin', 10);
            db.run('INSERT INTO admin_users (username, password) VALUES (?, ?)', ['admin', hashedPassword], function(err) {
              if (err) {
                console.error('❌ Error creating default admin user:', err.message);
                return;
              }
              console.log('👤 Created default admin user (username: admin, password: admin)');
            });
          }
        });
      });
    } catch (err) {
      console.error('❌ Failed to initialize sqlite3 database:', err.message);
      process.exit(1);
    }
  } else {
    // Using better-sqlite3
    try {
      db = new Database(dbPath);
      db.pragma('foreign_keys = ON');
      console.log('✅ Connected to database with better-sqlite3');
      
      // Initialize tables
      db.exec(`
        CREATE TABLE IF NOT EXISTS admin_users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT UNIQUE NOT NULL,
          password TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        
        CREATE TABLE IF NOT EXISTS match_queue (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          match_id TEXT UNIQUE NOT NULL,
          team1 TEXT NOT NULL,
          team2 TEXT NOT NULL,
          status TEXT DEFAULT 'queued',
          last_checked TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        
        CREATE TABLE IF NOT EXISTS match_data (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          match_id TEXT NOT NULL,
          data TEXT NOT NULL,
          timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(match_id)
        );
      `);
      
      // Create default admin user if none exists
      const adminCount = db.prepare('SELECT COUNT(*) as count FROM admin_users').get().count;
      if (adminCount === 0) {
        const hashedPassword = bcrypt.hashSync('admin', 10);
        db.prepare('INSERT INTO admin_users (username, password) VALUES (?, ?)').run('admin', hashedPassword);
        console.log('👤 Created default admin user (username: admin, password: admin)');
      }
    } catch (err) {
      console.error('❌ Failed to initialize better-sqlite3 database:', err.message);
      process.exit(1);
    }
  }
}

// Initialize the database when the server starts
initializeDatabase();

// Express routes and middleware setup

// Health check endpoint for Railway
app.get('/health', (req, res) => {
  try {
    // Check if database is accessible
    if (isUsingSqlite3) {
      db.get('SELECT 1', (err) => {
        if (err) {
          console.error('❌ Health check failed - Database error:', err.message);
          return res.status(500).json({ status: 'error', message: 'Database connection failed' });
        }
        res.json({ status: 'ok', database: 'sqlite3', timestamp: new Date().toISOString() });
      });
    } else {
      // Using better-sqlite3
      db.prepare('SELECT 1').get();
      res.json({ status: 'ok', database: 'better-sqlite3', timestamp: new Date().toISOString() });
    }
  } catch (err) {
    console.error('❌ Health check failed:', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// Extract match ID from HLTV URL
function extractMatchId(url) {
  const match = url.match(/hltv\.org\/matches\/(\d+)/);
  return match ? match[1] : null;
}

// Token verification endpoint
app.get('/api/verify', authenticateToken, (req, res) => {
  // If the middleware passes, the token is valid
  res.json({
    valid: true,
    user: {
      id: req.user.id,
      username: req.user.username
    }
  });
});

// Login endpoint
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    
    // Get user from database
    if (isUsingSqlite3) {
      // Using sqlite3
      db.get('SELECT * FROM admin_users WHERE username = ?', [username], async (err, user) => {
        if (err) {
          console.error('Login query error:', err.message);
          return res.status(500).json({ error: 'Server error' });
        }
        
        if (!user) {
          return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        // Check password
        try {
          const validPassword = await bcrypt.compare(password, user.password);
          if (!validPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
          }
          
          // Generate JWT token
          const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '24h' });
          
          res.json({ token });
        } catch (bcryptErr) {
          console.error('Password verification error:', bcryptErr.message);
          res.status(500).json({ error: 'Server error' });
        }
      });
    } else {
      // Using better-sqlite3
      const user = db.prepare('SELECT * FROM admin_users WHERE username = ?').get(username);
      
      if (!user) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      
      // Check password
      const validPassword = await bcrypt.compare(password, user.password);
      if (!validPassword) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      
      // Generate JWT token
      const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '24h' });
      
      res.json({ token });
    }
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// Change password endpoint
app.post('/api/auth/change-password', authenticateToken, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const userId = req.user.id;
  
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current password and new password are required' });
  }
  
  try {
    const user = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const validPassword = bcrypt.compareSync(currentPassword, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    
    const hashedPassword = bcrypt.hashSync(newPassword, 10);
    db.prepare('UPDATE admin_users SET password = ? WHERE id = ?').run(hashedPassword, userId);
    
    res.json({ success: true, message: 'Password updated successfully' });
  } catch (err) {
    console.error('❌ Change password error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Verify token endpoint
app.get('/api/auth/verify', authenticateToken, (req, res) => {
  res.json({ valid: true, user: { username: req.user.username } });
});

// Serve UI
app.get('/display', (req, res) => {
  res.sendFile(path.join(__dirname, 'display.html'));
});
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'login.html'));
});

// Add Match API: runs add_match_check.js, logs output, and inserts into DB
const { spawn } = require('child_process');

// Apply authentication middleware to admin APIs
app.use(['/api/add-match', '/api/match-queue', '/api/start-scraper', '/api/stop-scraper'], authenticateToken);

app.post('/api/add-match', (req, res) => {
  const { hltvUrl } = req.body;
  if (!hltvUrl) return res.status(400).json({ error: 'No URL provided' });

  console.log(`🔍 Processing match URL: ${hltvUrl}`);
  
  // Extract match ID from URL - handle both /matches/2378952/team-vs-team and /match/2378952/team-vs-team formats
  const matchIdMatch = hltvUrl.match(/(?:matches|match)\/([0-9]+)/);
  if (!matchIdMatch) return res.status(400).json({ error: 'Malformed HLTV URL' });
  const matchId = matchIdMatch[1];

  console.log(`🔍 Checking if match ID ${matchId} already exists in database...`);
  
  // Handle different database types
  if (isUsingSqlite3) {
    // Using sqlite3
    db.get('SELECT * FROM matches WHERE match_id = ?', [matchId], (err, row) => {
      if (err) {
        console.error(`❌ Error checking if match exists:`, err.message);
        // Continue with match addition
        proceedWithMatchAddition();
      } else if (row) {
        console.log(`⚠️ Match ${matchId} already exists in database:`, row);
        return res.status(409).json({ 
          error: 'Match already exists', 
          matchDetails: { 
            id: matchId, 
            team1: row.team1_name, 
            team2: row.team2_name 
          } 
        });
      } else {
        console.log(`✅ Match ${matchId} does not exist in database, proceeding...`);
        proceedWithMatchAddition();
      }
    });
  } else {
    // Using better-sqlite3
    try {
      const exists = db.prepare('SELECT * FROM matches WHERE match_id = ?').get(matchId);
      
      if (exists) {
        console.log(`⚠️ Match ${matchId} already exists in database:`, exists);
        return res.status(409).json({ 
          error: 'Match already exists', 
          matchDetails: { 
            id: matchId, 
            team1: exists.team1_name, 
            team2: exists.team2_name 
          } 
        });
      }
      
      console.log(`✅ Match ${matchId} does not exist in database, proceeding...`);
      proceedWithMatchAddition();
    } catch (err) {
      console.error(`❌ Error checking if match exists:`, err.message);
      // Continue anyway - it's better to try adding the match
      proceedWithMatchAddition();
    }
  }
  
  // Return early as we'll handle the response in the callbacks
  return;
  
  // Function to proceed with match addition
  function proceedWithMatchAddition() {
    const child = spawn('node', ['add_match_check.js', hltvUrl, matchId], { cwd: __dirname });

    let output = '';
    let errorOutput = '';

    child.stdout.on('data', (data) => {
      output += data.toString();
      process.stdout.write(data);
    });
    child.stderr.on('data', (data) => {
      errorOutput += data.toString();
      process.stderr.write(data);
    });

    child.on('close', async (code) => {
      if (code === 0 && !errorOutput) {
        const matchInfo = {};
        const lines = output.split('\n');
        for (const line of lines) {
          if (line.startsWith('Team 1 Name:')) matchInfo.team1_name = line.replace('Team 1 Name:', '').trim();
          if (line.startsWith('Team 2 Name:')) matchInfo.team2_name = line.replace('Team 2 Name:', '').trim();
          if (line.startsWith('Match Format:')) matchInfo.match_format = line.replace('Match Format:', '').trim();
          if (line.startsWith('Team 1 Logo:')) matchInfo.team1_logo = line.replace('Team 1 Logo:', '').trim();
          if (line.startsWith('Team 2 Logo:')) matchInfo.team2_logo = line.replace('Team 2 Logo:', '').trim();
        }
        matchInfo.match_id = matchId;
        matchInfo.match_url = hltvUrl;
        matchInfo.winner = null;
        matchInfo.is_finished = 0;

        if (!matchInfo.team1_name || !matchInfo.team2_name || !['BO1', 'BO3', 'BO5'].includes(matchInfo.match_format)) {
          return res.status(500).json({ error: 'Scraped data invalid or incomplete', matchInfo });
        }

        try {
          db.prepare(`INSERT INTO matches (match_id, match_url, team1_name, team2_name, match_format, winner, is_finished) VALUES (?, ?, ?, ?, ?, ?, ?);`)
            .run(matchInfo.match_id, matchInfo.match_url, matchInfo.team1_name, matchInfo.team2_name, matchInfo.match_format, matchInfo.winner, matchInfo.is_finished);
          db.prepare(`INSERT INTO match_queue (match_id, priority, status) VALUES (?, (SELECT IFNULL(MAX(priority), 0) + 1 FROM match_queue), 'queued');`).run(matchInfo.match_id);
          console.log(`✅ Match ${matchId} successfully added to database and queue:`, matchInfo);

          const fs = require('fs');
          const path = require('path');
          const puppeteer = require('puppeteer-extra');
          const StealthPlugin = require('puppeteer-extra-plugin-stealth');
          puppeteer.use(StealthPlugin());

          // Define helper function for team logo handling
          async function ensureTeamLogo(teamName, logoUrl, page) {
            const existing = db.prepare('SELECT 1 FROM team_logos WHERE team_name = ?').get(teamName);
            if (existing) {
              console.log(`⏭ Logo already exists for ${teamName}`);
              return;
            }

            // Skip dynamic placeholder logos
            if (logoUrl && logoUrl.includes('/dynamic-svg/teamplaceholder')) {
              console.log(`⏭ Skipping dynamic placeholder logo for ${teamName}`);
              return;
            }

            if (!logoUrl) {
              console.log(`No logo URL for ${teamName}, skipping logo download`);
              return;
            }

            try {
              // Create logos directory if it doesn't exist
              const logoDir = path.join(__dirname, 'public', 'logos');
              if (!fs.existsSync(logoDir)) {
                fs.mkdirSync(logoDir, { recursive: true });
              }

              // Download logo
              const logoName = `${teamName.toLowerCase().replace(/\s+/g, '_')}.png`;
              const logoPath = path.join(logoDir, logoName);

              // Use page to download image
              await page.goto(logoUrl, { waitUntil: 'networkidle0' });
              const imageBuffer = await page.screenshot();
              fs.writeFileSync(logoPath, imageBuffer);

              // Insert into database
              db.prepare('INSERT INTO team_logos (team_name, logo_filename) VALUES (?, ?)').run(teamName, logoName);
              console.log(`✅ Downloaded logo for ${teamName}`);
            } catch (err) {
              console.error(`❌ Failed to download logo for ${teamName}:`, err.message);
            }
          }

          // Download team logos if needed
          (async () => {
            try {
              const browserConfig = {
                headless: 'new',
                args: [
                  '--no-sandbox',
                  '--disable-setuid-sandbox',
                  '--disable-dev-shm-usage',
                  '--disable-accelerated-2d-canvas',
                  '--no-first-run',
                  '--no-zygote',
                  '--single-process',
                  '--disable-gpu'
                ]
              };
              const browser = await puppeteer.launch(browserConfig);
              const page = await browser.newPage();
              await page.setViewport({ width: 100, height: 100 });

              await ensureTeamLogo(matchInfo.team1_name, matchInfo.team1_logo, page);
              await ensureTeamLogo(matchInfo.team2_name, matchInfo.team2_logo, page);

              await browser.close();
            } catch (err) {
              console.error('❌ Error downloading team logos:', err.message);
            }
          })();

          res.json({ success: true, message: 'Match added successfully', match: matchInfo });
        } catch (err) {
          console.error(`❌ Error adding match ${matchId} to database:`, err.message);
          res.status(500).json({ error: 'Failed to add match to database', details: err.message });
        }
      } else {
        console.error(`❌ Match check script failed with code ${code}`);
        res.status(500).json({ error: 'Failed to check match', output, errorOutput });
      }
    });
  }
});

// API: Get match queue with match info
app.get('/api/match-queue', (req, res) => {
  try {
    let rows = [];
    try {
      rows = db.prepare(`
        SELECT
          mq.id,
          mq.match_id,
          m.team1_name,
          m.team2_name,
          m.match_format,
          mq.priority,
          mq.status
        FROM match_queue mq
        JOIN matches m ON mq.match_id = m.match_id
        ORDER BY mq.priority ASC, mq.id ASC
      `).all() || [];
    } catch (dbErr) {
      console.error('Error fetching match queue:', dbErr.message);
      // Continue with empty rows array
    }
    
    // Always return an array, even if empty
    res.json({ success: true, queue: Array.isArray(rows) ? rows : [] });
  } catch (err) {
    console.error('API /api/match-queue error:', err.message);
    res.status(500).json({ error: 'Failed to fetch match queue', details: err.message });
  }
});

// Remove match from queue and matches by queue row id
app.delete('/api/match-queue/:id', authenticateToken, (req, res) => {
  const id = req.params.id;
  try {
    const row = db.prepare('SELECT match_id FROM match_queue WHERE id = ?').get(id);
    if (!row) return res.status(404).json({ error: 'Queue row not found' });

    const t = db.transaction(() => {
      db.prepare('DELETE FROM match_queue WHERE id = ?').run(id);
      db.prepare('DELETE FROM matches WHERE match_id = ?').run(row.match_id);
      db.prepare('DELETE FROM win_state WHERE match_id = ?').run(row.match_id);
    });
    t();

    console.log(`🗑️ Deleted match_id ${row.match_id} from queue ID ${id} and matches table.`);
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Failed to delete match from queue and matches:', err.message);
    res.status(500).json({ error: 'Failed to remove from queue', details: err.message });
  }
});

// Reorder match in queue (up/down)
  app.post('/api/match-queue/:id/reorder', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { direction } = req.body;

  console.log(`📥 Reorder request: ID=${id}, direction=${direction}`);

  if (!['up', 'down'].includes(direction)) {
    console.warn('⚠️ Invalid direction:', direction);
    return res.status(400).json({ error: 'Invalid direction' });
  }

  try {
    const row = db.prepare('SELECT id, priority FROM match_queue WHERE id = ?').get(id);
    if (!row) {
      console.warn(`❌ No queue row found for ID ${id}`);
      return res.status(404).json({ error: 'Queue row not found' });
    }

    console.log(`🔍 Current row: ID=${row.id}, priority=${row.priority}`);

    // Find the neighbor row to swap with
    const neighbor = db.prepare(`
      SELECT id, priority FROM match_queue
      WHERE priority ${direction === 'up' ? '<' : '>'} ?
      ORDER BY priority ${direction === 'up' ? 'DESC' : 'ASC'}
      LIMIT 1
    `).get(row.priority);

    if (!neighbor) {
      console.warn(`↕️ Cannot move ${direction} from priority ${row.priority}`);
      return res.status(400).json({ error: `Cannot move ${direction}` });
    }

    console.log(`🔁 Swapping with neighbor: ID=${neighbor.id}, priority=${neighbor.priority}`);

    // Swap priorities in transaction 
    const t = db.transaction(() => {
      db.prepare('UPDATE match_queue SET priority = ? WHERE id = ?').run(neighbor.priority, row.id);
      db.prepare('UPDATE match_queue SET priority = ? WHERE id = ?').run(row.priority, neighbor.id);
    });
    t();

    console.log(`✅ Reordered match ID ${id} ${direction}, priorities swapped`);

    res.json({ success: true });
  } catch (err) {
    console.error('❌ Reorder error:', err.message);
    res.status(500).json({ error: 'Failed to reorder queue', details: err.message });
  }
});

let scraperProcess = null;
let twitchBotProcess = null;

app.post('/api/start-scraper', (req, res) => {
  if (scraperProcess) {
    return res.status(409).json({ error: 'Scraper already running' });
  }

  const { spawn } = require('child_process');
  scraperProcess = spawn('node', ['live_scraper.js'], {
    cwd: __dirname,
    stdio: ['ignore', 'pipe', 'pipe'], // capture output instead of piping directly to terminal
  });

  scraperProcess.stdout.on('data', (data) => {
    const text = data.toString().trim();
    console.log(text); // logs to file + terminal
  });

  scraperProcess.stderr.on('data', (data) => {
    const text = data.toString().trim();
    console.error(text);
  });

  scraperProcess.on('exit', (code) => {
    console.log(`🛑 Live scraper exited with code ${code}`);
    scraperProcess = null;
  });

  // Start Twitch bot if not running
  if (!twitchBotProcess) {
    twitchBotProcess = spawn('python', ['twitch_score_bot.py'], {
      cwd: __dirname,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    twitchBotProcess.stdout.on('data', (data) => {
      console.log(`[TwitchBot] ${data}`);
    });
    twitchBotProcess.stderr.on('data', (data) => {
      console.error(`[TwitchBot Error] ${data}`);
    });
    twitchBotProcess.on('exit', (code) => {
      console.log(`[TwitchBot] exited with code ${code}`);
      twitchBotProcess = null;
    });
    console.log('🤖 Twitch bot started');
  }

  console.log('🚀 Live scraper started');
  res.json({ success: true, message: 'Scraper started' });
});

app.post('/api/stop-scraper', (req, res) => {
  if (!scraperProcess) {
    return res.status(400).json({ error: 'Scraper is not running' });
  }

  scraperProcess.kill();
  scraperProcess = null;
  console.log('🛑 Live scraper stopped');

  // Stop Twitch bot if running
  if (twitchBotProcess) {
    twitchBotProcess.kill();
    twitchBotProcess = null;
    console.log('🤖 Twitch bot stopped');
  }

  res.json({ success: true, message: 'Scraper stopped' });
});

function findLogo(teamName) {
  try {
    const row = db.prepare(`
      SELECT logo_filename FROM team_logos WHERE team_name = ?
    `).get(teamName);
    return row ? row.logo_filename : '';
  } catch (err) {
    console.error(`Error finding logo for team ${teamName}:`, err.message);
    return ''; // Return empty string on error
  }
}

// Debug endpoint to inspect live matches and queue state
app.get('/api/debug/live-matches', (req, res) => {
  try {
    const matches = db.prepare(`
      SELECT m.match_id, m.is_finished, mq.status
      FROM matches m
      JOIN match_queue mq ON m.match_id = mq.match_id
    `).all();
    res.json(matches);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/display/live', (req, res) => {
  try {
    const match = db.prepare(`
      SELECT m.*
      FROM matches m
      JOIN match_queue mq ON m.match_id = mq.match_id
      WHERE m.is_finished = 0 AND (mq.status = 'queued' OR mq.status = 'live')
      ORDER BY mq.priority ASC
      LIMIT 1
    `).get();

    if (!match) return res.status(404).json({ error: 'No live match found' });

    const liveScore = db.prepare(`SELECT * FROM live_scores WHERE match_id = ?`).get(match.match_id);
    if (!liveScore) return res.status(404).json({ error: 'No live score available' });

    // Get map wins with proper error handling
    let mapWins = [];
    try {
      mapWins = db.prepare(`
        SELECT winning_team, COUNT(*) as win_count
        FROM match_maps
        WHERE match_id = ? AND status = 'finished' AND winning_team IS NOT NULL
        GROUP BY winning_team
      `).all(match.match_id) || [];
    } catch (err) {
      console.error('Error getting map wins:', err.message);
      // Continue with empty mapWins array
    }

    const mapCount = {
      [match.team1_name]: 0,
      [match.team2_name]: 0,
    };
    
    // Only iterate if mapWins is an array and not empty
    if (Array.isArray(mapWins) && mapWins.length > 0) {
      for (const row of mapWins) {
        if (row && row.winning_team && row.winning_team in mapCount) {
          mapCount[row.winning_team] = row.win_count;
        }
      }
    }

    const scoreLeft = liveScore.ct_team === match.team1_name ? liveScore.ct_score : liveScore.t_score;
    const scoreRight = liveScore.ct_team === match.team2_name ? liveScore.ct_score : liveScore.t_score;

    const team1Logo = findLogo(match.team1_name);
    const team2Logo = findLogo(match.team2_name);

    const matchWinner = match.winner;
    const isMatchWin = !!matchWinner;

    // Get latest map with proper error handling
    let latestMap = null;
    try {
      latestMap = db.prepare(`
        SELECT winning_team, map_number
        FROM match_maps
        WHERE match_id = ? AND status = 'finished'
        ORDER BY updated_at DESC
        LIMIT 1
      `).get(match.match_id) || null;
    } catch (err) {
      console.error('Error getting latest map:', err.message);
      // Continue with latestMap as null
    }

    res.json({
      matchId: match.match_id,
      teamName1: match.team1_name,
      teamName2: match.team2_name,
      scoreLeft,
      scoreRight,
      mapInfo: `Map ${liveScore.map_number || 1} - ${match.match_format}`,
      mapCount1: mapCount[match.team1_name],
      mapCount2: mapCount[match.team2_name],
      team1Logo,
      team2Logo,
      matchFormat: match.match_format,
      mapNumber: liveScore.map_number || 1
    });
    
  } catch (err) {
    // Enhanced error logging for debugging
    console.error('API /api/display/live error:', {
      error: err && (err.stack || err.message || err),
      match: typeof match !== 'undefined' ? match : 'undefined',
      liveScore: typeof liveScore !== 'undefined' ? liveScore : 'undefined',
      latestMap: typeof latestMap !== 'undefined' ? latestMap : 'undefined',
      mapRow: typeof mapRow !== 'undefined' ? mapRow : 'undefined',
      runningMap: typeof runningMap !== 'undefined' ? runningMap : 'undefined'
    });
    res.status(500).json({ error: 'Internal server error', message: err && err.message ? err.message : String(err) });
  }
});


// Win State API for frontend win widget
app.get('/api/display/win-state', (req, res) => {
  try {
    // Always return the most recent win_state row (even after match is finished)
    const row = db.prepare(`SELECT * FROM win_state ORDER BY updated_at DESC LIMIT 1`).get();
    if (!row) return res.status(404).json({ error: 'No win state found' });
    res.json(row);
  } catch (err) {
    console.error('API /api/display/win-state error:', err);
    res.status(500).json({ error: 'Internal server error', message: err.message });
  }
});

// LOGGING TO FILE
const LOG_FILE = process.env.NODE_ENV === 'production' 
  ? path.join('/tmp', 'serverlog.txt')  // Use /tmp in production (Railway)
  : path.join(__dirname, 'serverlog.txt'); // Use local directory in development

function writeLogLine(type, message) {
  try {
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] [${type}] ${message}\n`;
    fs.appendFileSync(LOG_FILE, line, 'utf8');
  } catch (err) {
    // If writing to log fails, just output to console without recursion
    process.stderr.write(`Error writing to log: ${err.message}\n`);
  }
}

// Save original log functions
const originalLog = console.log;
const originalError = console.error;

console.log = (...args) => {
  const msg = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ');
  writeLogLine('INFO', msg);
  originalLog(...args);
};

console.error = (...args) => {
  const msg = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ');
  writeLogLine('ERROR', msg);
  originalError(...args);
};

// API to get log file
app.get('/api/server-log', (req, res) => {
  try {
    // Check if log file exists first
    if (!fs.existsSync(LOG_FILE)) {
      return res.json({ success: true, log: '-- No logs available --' });
    }
    
    fs.readFile(LOG_FILE, 'utf8', (err, data) => {
      if (err) return res.status(500).json({ error: 'Failed to read log file', details: err.message });
      res.json({ success: true, log: data });
    });
  } catch (err) {
    console.error('Error accessing log file:', err.message);
    res.json({ success: true, log: '-- Error accessing logs --' });
  }
});

// API to clear log file
app.delete('/api/server-log', (req, res) => {
  try {
    // Check if log file exists first
    if (!fs.existsSync(LOG_FILE)) {
      return res.json({ success: true, message: 'No log file to clear' });
    }
    
    fs.writeFile(LOG_FILE, '', (err) => {
      if (err) return res.status(500).json({ error: 'Failed to clear log file', details: err.message });
      res.json({ success: true, message: 'Log cleared' });
    });
  } catch (err) {
    console.error('Error clearing log file:', err.message);
    res.json({ success: true, message: 'Error clearing logs, but continuing operation' });
  }
});

// --- WIN STATE API for frontend widget ---
app.get('/api/display/win-state', (req, res) => {
  try {
    // Get the most recent win_state row
    const row = db.prepare(`SELECT * FROM win_state ORDER BY updated_at DESC LIMIT 1`).get();
    if (!row) return res.status(404).json({ error: 'No win state found' });
    res.json({
      match_id: row.match_id,
      map_win: !!row.map_win,
      match_win: !!row.match_win,
      winning_team: row.winning_team,
      winning_score: row.winning_score,
      map_counts: row.map_counts,
      updated_at: row.updated_at,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch win state', details: err.message });
  }
});

// Health check function
function performHealthCheck(req, res) {
  try {
    // Simple query to verify database connection
    if (isUsingSqlite3) {
      db.get('SELECT 1', (err) => {
        if (err) {
          console.error('Health check failed - Database error:', err.message);
          return res.status(500).json({ status: 'error', message: 'Database connection failed' });
        }
        res.json({ status: 'ok', message: 'Service is healthy' });
      });
    } else {
      // For better-sqlite3
      db.prepare('SELECT 1').get();
      res.json({ status: 'ok', message: 'Service is healthy' });
    }
  } catch (err) {
    console.error('Health check failed:', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
}

// Health check endpoints for Railway
app.get('/health', performHealthCheck);

// Also respond to root path for Railway's default health check
app.get('/', (req, res) => {
  // If request is from Railway health check (no user agent or specific headers)
  if (!req.headers['user-agent'] || req.headers['user-agent'].includes('Railway')) {
    return performHealthCheck(req, res);
  }
  
  // Otherwise redirect to admin page
  res.redirect('/admin');
});

// Create a single server instance
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}/admin`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔐 Authentication: JWT (${JWT_SECRET === 'your-secret-key-change-this-in-production' ? 'using default secret - NOT SECURE' : 'using custom secret'})`);
  console.log(`💾 Database: ${isUsingSqlite3 ? 'sqlite3' : 'better-sqlite3'} at ${dbPath}`);
});