const express = require('express');
const path = require('path');
const Database = require('better-sqlite3');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');



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

// Database
let db;
try {
  // Use a path that's guaranteed to be writable in Railway
  const dbPath = process.env.NODE_ENV === 'production' ? '/tmp/cs_match_tracker.db' : 'cs_match_tracker.db';
  console.log(`📂 Using database at: ${dbPath}`);
  
  db = new Database(dbPath);
  db.pragma('foreign_keys = ON');
  console.log('✅ Database connected');

  // Log DB summary on startup
  try {
    const matchCount = db.prepare('SELECT COUNT(*) AS count FROM matches').get().count;
    const queueCount = db.prepare('SELECT COUNT(*) AS count FROM match_queue').get().count;
    const mapCount = db.prepare('SELECT COUNT(*) AS count FROM match_maps').get().count;
    const scoreCount = db.prepare('SELECT COUNT(*) AS count FROM live_scores').get().count;
    const summary = `📊 DB Startup Summary: matches=${matchCount}, queue=${queueCount}, maps=${mapCount}, live_scores=${scoreCount}`;
    console.log(summary);
  } catch (e) {
    console.error('❌ Failed to log DB summary:', e.message);
  }
  
  // Create admin user table if it doesn't exist
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS admin_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Check if admin user exists, if not create default one
    const adminExists = db.prepare('SELECT COUNT(*) as count FROM admin_users WHERE username = ?').get('admin');
    if (adminExists.count === 0) {
      // Default password is - change this immediately in production
      const hashedPassword = bcrypt.hashSync('alex666', 10);
      db.prepare('INSERT INTO admin_users (username, password) VALUES (?, ?)').run('admin', hashedPassword);
      console.log('✅ Default admin user created');
    }
  } catch (e) {
    console.error('❌ Failed to setup admin users table:', e.message);
  }
} catch (err) {
  console.error('❌ Failed to connect to DB:', err.message);
  process.exit(1);
}

// Extract match ID from HLTV URL
function extractMatchId(url) {
  const match = url.match(/hltv\.org\/matches\/(\d+)/);
  return match ? match[1] : null;
}


// Authentication endpoints
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }
  
  try {
    const user = db.prepare('SELECT * FROM admin_users WHERE username = ?').get(username);
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const validPassword = bcrypt.compareSync(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Generate JWT token
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '24h' });
    
    res.json({ success: true, token });
  } catch (err) {
    console.error('❌ Login error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
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

  const matchIdMatch = hltvUrl.match(/matches\/(\d+)/);
  if (!matchIdMatch) return res.status(400).json({ error: 'Malformed HLTV URL' });
  const matchId = matchIdMatch[1];

  const exists = db.prepare('SELECT 1 FROM matches WHERE match_id = ?').get(matchId);
  if (exists) return res.status(409).json({ error: 'Match already exists' });

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

        async function ensureTeamLogo(teamName, logoUrl, page) {
          const existing = db.prepare('SELECT 1 FROM team_logos WHERE team_name = ?').get(teamName);
          if (existing) {
            console.log(`⏭ Logo already exists for ${teamName}`);
            return;
          }

          // Skip dynamic placeholder logos
          if (logoUrl && logoUrl.includes('/dynamic-svg/teamplaceholder')) {
            console.warn(`⏭ Skipping dynamic placeholder logo for ${teamName}`);
            return;
          }

          if (!logoUrl || !logoUrl.startsWith('http')) {
            console.warn(`⚠️ No valid logo URL for ${teamName}`);
            return;
          }

          const ext = path.extname(logoUrl.split('?')[0]) || '.png';
          const safeName = teamName.toLowerCase().replace(/[^a-z0-9]/gi, '_');
          const filename = `${safeName}${ext}`;
          const logoPath = path.join(__dirname, 'public', 'logos', filename);

          if (!fs.existsSync(logoPath)) {
            try {
              const response = await page.goto(logoUrl, { timeout: 30000 });
              const buffer = await response.buffer();
              fs.writeFileSync(logoPath, buffer);
              console.log(`✅ Logo saved for ${teamName}: ${filename}`);
            } catch (err) {
              console.error(`❌ Failed to download logo for ${teamName}: ${err.message}`);
              return;
            }
          } else {
            console.log(`⏭ Already downloaded: ${filename}`);
          }

          db.prepare('INSERT INTO team_logos (team_name, logo_filename, source_url) VALUES (?, ?, ?)')
            .run(teamName, filename, logoUrl);
        }

        const browser = await puppeteer.launch({ 
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
        });
        const page = await browser.newPage();

        try {
          await ensureTeamLogo(matchInfo.team1_name, matchInfo.team1_logo, page);
          await ensureTeamLogo(matchInfo.team2_name, matchInfo.team2_logo, page);
        } catch (e) {
          console.error('❌ Logo fetch failed:', e.message);
        } finally {
          await browser.close();
        }

        res.json({ success: true, match_id: matchId, matchInfo });
      } catch (err) {
        console.error('❌ DB insert failed:', err.message, matchInfo);
        res.status(500).json({ error: 'Database error', details: err.message });
      }
    } else {
      res.status(500).json({ error: 'Scraper failed', details: errorOutput || output });
    }
  });
});

// API: Get match queue with match info
app.get('/api/match-queue', (req, res) => {
  try {
    const rows = db.prepare(`
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
    `).all();
    res.json({ success: true, queue: rows });
  } catch (err) {
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

const fs = require('fs');

function findLogo(teamName) {
  const row = db.prepare(`
    SELECT logo_filename FROM team_logos WHERE team_name = ?
  `).get(teamName);
  return row ? row.logo_filename : '';
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

    const mapWins = db.prepare(`
      SELECT winning_team, COUNT(*) as win_count
      FROM match_maps
      WHERE match_id = ? AND status = 'finished' AND winning_team IS NOT NULL
      GROUP BY winning_team
    `).all(match.match_id);

    const mapCount = {
      [match.team1_name]: 0,
      [match.team2_name]: 0,
    };
    for (const row of mapWins) {
      if (row.winning_team in mapCount) {
        mapCount[row.winning_team] = row.win_count;
      }
    }

    const scoreLeft = liveScore.ct_team === match.team1_name ? liveScore.ct_score : liveScore.t_score;
    const scoreRight = liveScore.ct_team === match.team2_name ? liveScore.ct_score : liveScore.t_score;

    const team1Logo = findLogo(match.team1_name);
    const team2Logo = findLogo(match.team2_name);

    const matchWinner = match.winner;
    const isMatchWin = !!matchWinner;

    const latestMap = db.prepare(`
      SELECT winning_team, map_number
      FROM match_maps
      WHERE match_id = ? AND status = 'finished'
      ORDER BY updated_at DESC
      LIMIT 1
    `).get(match.match_id);

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
const LOG_FILE = path.join(__dirname, 'serverlog.txt');

function writeLogLine(type, message) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] [${type}] ${message}\n`;
  fs.appendFileSync(LOG_FILE, line, 'utf8');
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
  fs.readFile(LOG_FILE, 'utf8', (err, data) => {
    if (err) return res.status(500).json({ error: 'Failed to read log file' });
    res.json({ success: true, log: data });
  });
});

// API to clear log file
app.delete('/api/server-log', (req, res) => {
  fs.writeFile(LOG_FILE, '', (err) => {
    if (err) return res.status(500).json({ error: 'Failed to clear log file' });
    res.json({ success: true, message: 'Log cleared' });
  });
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

const http = require('http');
const server = http.createServer(app);

server.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}/admin`);
});

app.listen(3000, () => {
  console.log('Server running on port 3000');
});