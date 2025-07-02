// live_scraper.js

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const Database = require('better-sqlite3');

puppeteer.use(StealthPlugin());

// Graceful shutdown
process.stdin.resume();
process.on('SIGINT', () => {
  console.log('🛑 Scraper stopped (SIGINT)');
  process.exit(0);
});
process.on('SIGTERM', () => {
  console.log('🛑 Scraper stopped (SIGTERM)');
  process.exit(0);
});

console.log('🚀 Scraper started');

const db = new Database('cs_match_tracker.db');
const LIVE_CHECK_INTERVAL = 30000;
const NONLIVE_ROTATE_DELAY = 5000;
const LIVE_SCRAPE_INTERVAL = 5000;

let browser;
let activeScrapers = new Map();

const fetch = require('node-fetch'); // For backend HTTP requests

async function launchBrowser() {
  if (!browser) {
    browser = await puppeteer.launch({ 
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
  }
  return browser;
}

function getAllMatches() {
  return db.prepare(`SELECT match_id, match_url FROM matches WHERE is_finished = 0`).all();
}

async function isLiveMatch(page) {
  try {
    const data = await page.evaluate(() => {
      const getText = sel => document.querySelector(sel)?.textContent.trim() || '';
      return {
        ctScore: getText('.score .ctScore'),
        tScore: getText('.score .tScore'),
        ctName: getText('table.team thead.ctTeamHeaderBg .teamName'),
        tName: getText('table.team thead.tTeamHeaderBg .teamName')
      };
    });

    const ct = parseInt(data.ctScore);
    const t = parseInt(data.tScore);
    const valid = !isNaN(ct) && !isNaN(t) && data.ctName && data.tName;

    return valid ? { ...data, ct, t } : null;
  } catch {
    return null;
  }
}

function logScore(matchId, prev, curr) {
  console.log(`📊 [${matchId}] ${curr.ctName} ${curr.ct} : ${curr.t} ${curr.tName}`);
}

async function scrapeLiveMatch(matchId, matchUrl) {
  if (activeScrapers.has(matchId)) return;

  console.log(`✅ Found live match: ${matchId}`);
  const page = await (await launchBrowser()).newPage();
  await page.goto(matchUrl, { waitUntil: 'networkidle2', timeout: 60000 });

  // Get match format (BO1 or BO3)
  const matchMeta = db.prepare('SELECT match_format FROM matches WHERE match_id = ?').get(matchId);
  const matchFormat = matchMeta?.match_format || 'BO1';
  const isBO3 = matchFormat === 'BO3';

  let mapNumber = 1;
  let lastScoreKey = '';
  let lastData = null;

  activeScrapers.set(matchId, true);

function detectWin(ct, t) {
  const maxScore = Math.max(ct, t);
  const minScore = Math.min(ct, t);
  const scoreDiff = Math.abs(ct - t);

  // 🟩 Regulation win: Only if both teams had less than 12 before this round
  if (maxScore >= 13 && minScore < 12) {
    return ct > t ? 'ct' : 't';
  }

  // 🟨 Overtime or approaching it
  if (minScore >= 12) {
    // 🔁 If scores are equal (e.g. 12:12, 15:15, 18:18...), it's a tie → another OT cycle
    if (ct === t) return null;

    // 🧮 Calculate OT cycle start ("baseline") — 12, 15, 18, 21, ...
    const otIndex = Math.floor((minScore - 12) / 3);
    const baseline = 12 + otIndex * 3;
    const winThreshold = baseline + 4;

    // ✅ A team wins in OT if they reach threshold AND lead by at least 2 rounds
    // Only allow a win if the team has reached at least 16 rounds (first OT block) or a valid OT threshold (19, 22, ...)
    if ((ct >= winThreshold || t >= winThreshold) && Math.abs(ct - t) >= 2 && (ct >= 16 || t >= 16)) {
      return ct > t ? 'ct' : 't';
    }

    // Still in OT block, not enough rounds to determine winner
    return null;
  }

  // 🟥 Match still in progress (regulation, neither at 13 yet)
  return null;
}

  const loop = async () => {
    if (!activeScrapers.has(matchId)) return;

    try {
      const data = await isLiveMatch(page);
      if (data) {
        const scoreKey = `${data.ctName}-${data.ct}-${data.t}-${data.tName}`;
        if (scoreKey !== lastScoreKey) {
          logScore(matchId, lastScoreKey, data);
          lastScoreKey = scoreKey;
          lastData = data;
        if (data.ct === data.t && data.ct >= 12) {
          const otIndex = Math.floor((data.ct - 12) / 3);
          console.log(`🔁 [${matchId}] Overtime tied score detected (${data.ct}:${data.t}) — OT${otIndex + 1}`);
        }

          // Update live_scores
          db.prepare(`
            INSERT INTO live_scores (match_id, map_number, ct_team, t_team, ct_score, t_score)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(match_id) DO UPDATE SET
              map_number = excluded.map_number,
              ct_team = excluded.ct_team,
              t_team = excluded.t_team,
              ct_score = excluded.ct_score,
              t_score = excluded.t_score,
              updated_at = CURRENT_TIMESTAMP,
              status = 'live'
          `).run(matchId, mapNumber, data.ctName, data.tName, data.ct, data.t);

          // Update match_maps
          db.prepare(`
            INSERT INTO match_maps (match_id, map_number, status, ct_score, t_score)
            VALUES (?, ?, 'running', ?, ?)
            ON CONFLICT(match_id, map_number) DO UPDATE SET
              ct_score = excluded.ct_score,
              t_score = excluded.t_score,
              updated_at = CURRENT_TIMESTAMP,
              status = 'running'
          `).run(matchId, mapNumber, data.ct, data.t);

          // Detect win
          const winnerSide = detectWin(data.ct, data.t);
          if (winnerSide) {
            const winningTeam = winnerSide === 'ct' ? data.ctName : data.tName;
            if (!winningTeam || typeof winningTeam !== 'string' || !winningTeam.trim()) {
              console.warn(`[${matchId}] Invalid winningTeam detected:`, winningTeam);
              // Do not update win_state if invalid
              return;
            }
            console.log(`🏆 [${matchId}] ${winningTeam} wins map ${mapNumber} (${data.ct}:${data.t})`);

            // Finalize map
            db.prepare(`
              UPDATE match_maps
              SET status = 'finished', winning_team = ?, updated_at = CURRENT_TIMESTAMP
              WHERE match_id = ? AND map_number = ?
            `).run(winningTeam, matchId, mapNumber);

            db.prepare(`
              UPDATE live_scores
              SET status = 'finished', updated_at = CURRENT_TIMESTAMP
              WHERE match_id = ?
            `).run(matchId);

            // --- WIN STATE: Set map win ---
            // Get map counts for each team
            const mapWins = db.prepare(`
              SELECT winning_team, COUNT(*) as win_count
              FROM match_maps
              WHERE match_id = ? AND status = 'finished' AND winning_team IS NOT NULL
              GROUP BY winning_team
            `).all(matchId);
            const matchRow = db.prepare('SELECT team1_name, team2_name FROM matches WHERE match_id = ?').get(matchId);
            const mapCount1 = mapWins.find(w => w.winning_team === matchRow.team1_name)?.win_count || 0;
            const mapCount2 = mapWins.find(w => w.winning_team === matchRow.team2_name)?.win_count || 0;
            // Insert/replace win_state
            db.prepare(`
              INSERT OR REPLACE INTO win_state (match_id, map_win, match_win, winning_team, winning_score, map_counts, updated_at)
              VALUES (?, 1, 0, ?, ?, ?, CURRENT_TIMESTAMP)
            `).run(
              matchId,
              winningTeam,
              `${data.ct}:${data.t}`,
              `${mapCount1}:${mapCount2}`
            );

            // BO1: end match
            if (!isBO3) {
              db.prepare(`
                UPDATE matches
                SET is_finished = 1, winner = ?
                WHERE match_id = ?
              `).run(winningTeam, matchId);
              // --- Also update match_queue status to 'finished' ---
              db.prepare(`
                UPDATE match_queue
                SET status = 'finished'
                WHERE match_id = ?
              `).run(matchId);
              // --- WIN STATE: Set match win ---
              db.prepare(`
                INSERT OR REPLACE INTO win_state (match_id, map_win, match_win, winning_team, winning_score, map_counts, updated_at)
                VALUES (?, 1, 1, ?, ?, ?, CURRENT_TIMESTAMP)
              `).run(
                matchId,
                winningTeam,
                `${data.ct}:${data.t}`,
                `${mapCount1}:${mapCount2}`
              );
              console.log(`🎯 [${matchId}] BO1 match finished. Winner: ${winningTeam}`);
              activeScrapers.delete(matchId);
              await page.close();
              return;
            }

            // BO3: check map wins
            const wins = db.prepare(`
              SELECT winning_team FROM match_maps
              WHERE match_id = ? AND status = 'finished'
            `).all(matchId);

            const winCounts = wins.reduce((acc, row) => {
              acc[row.winning_team] = (acc[row.winning_team] || 0) + 1;
              return acc;
            }, {});

            const topTeam = Object.entries(winCounts).find(([, count]) => count === 2);
if (topTeam) {
  const winner = topTeam[0];
  db.prepare(`
    UPDATE matches
    SET is_finished = 1, winner = ?
    WHERE match_id = ?
  `).run(winner, matchId);
  // --- WIN STATE: Set only map win first ---
  db.prepare(`
    INSERT OR REPLACE INTO win_state (match_id, map_win, match_win, winning_team, winning_score, map_counts, updated_at)
    VALUES (?, 1, 0, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(
    matchId,
    winner,
    `${data.ct}:${data.t}`,
    `${mapCount1}:${mapCount2}`
  );
  console.log(`🏆 [${matchId}] BO3 match finished. Winner: ${winner} (map win)`);

  // After 2 seconds, set match_win=1, map_win=0 for a unique event
  setTimeout(() => {
    db.prepare(`
      INSERT OR REPLACE INTO win_state (match_id, map_win, match_win, winning_team, winning_score, map_counts, updated_at)
      VALUES (?, 0, 1, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
      matchId,
      winner,
      `${data.ct}:${data.t}`,
      `${mapCount1}:${mapCount2}`
    );
    // --- Also update match_queue status to 'finished' on match win ---
    db.prepare(`
      UPDATE match_queue
      SET status = 'finished'
      WHERE match_id = ?
    `).run(matchId);
    console.log(`🎯 [${matchId}] BO3 match finished. Winner: ${winner} (match win)`);

    // Delay cleanup by 20 seconds so frontend can fetch match win state
    setTimeout(async () => {
      activeScrapers.delete(matchId);
      await page.close();
      console.log(`🕒 [${matchId}] Scraper cleanup after match win (20s delay)`);
      // Wait an additional 40 seconds (total 60s from match win), then delete from match_queue
      setTimeout(async () => {
        try {
          // Find the queue row ID for this matchId
          const row = db.prepare('SELECT id FROM match_queue WHERE match_id = ?').get(matchId);
          if (row && row.id) {
            const res = await fetch(`http://localhost:3000/api/match-queue/${row.id}`, { method: 'DELETE' });
            if (res.ok) {
              const data = await res.json();
              if (data.success) {
                console.log(`🗑️ [${matchId}] Deleted from match_queue via API after match win (60s delay)`);
              } else {
                console.error(`❌ [${matchId}] API responded but failed to remove match from queue:`, data.error);
              }
            } else {
              console.error(`❌ [${matchId}] API DELETE request failed with status`, res.status);
            }
          } else {
            console.error(`❌ [${matchId}] Could not find queue row for match_id to delete via API.`);
          }
        } catch (err) {
          console.error(`❌ [${matchId}] Error deleting match from queue via API:`, err.message);
        }
      }, 40000);
    }, 20000);
  }, 2000);

  return;
}

            // Wait for score reset before starting next map
            console.log(` [${matchId}] Waiting for score reset to start map ${mapNumber + 1}`);
            while (true) {
              await new Promise(res => setTimeout(res, 3000));
              const resetCheck = await isLiveMatch(page);
              if (
                resetCheck &&
                parseInt(resetCheck.ctScore) === 0 &&
                parseInt(resetCheck.tScore) === 0
              ) {
                mapNumber += 1;
                lastScoreKey = '';
                lastData = resetCheck;
                // --- WIN STATE: Reset on new map ---
                db.prepare(`
                  INSERT OR REPLACE INTO win_state (match_id, map_win, match_win, winning_team, winning_score, map_counts, updated_at)
                  VALUES (?, 0, 0, NULL, NULL, NULL, CURRENT_TIMESTAMP)
                `).run(matchId);
                console.log(` [${matchId}] Detected map ${mapNumber} started`);
                break;
              }
            }
          }
        }
      } else {
        console.log(`⚠️ [${matchId}] Live score temporarily unavailable.`);
      }
    } catch (err) {
      console.error(`❌ [${matchId}] Scrape error:`, err.message);
    }

    setTimeout(loop, LIVE_SCRAPE_INTERVAL);
  };

  loop();
}

async function monitorQueue() {
  const matches = getAllMatches();

  for (const { match_id, match_url } of matches) {
    if (activeScrapers.has(match_id)) continue;

    const page = await (await launchBrowser()).newPage();
    try {
      await page.goto(match_url, { waitUntil: 'networkidle2', timeout: 60000 });
      const data = await isLiveMatch(page);
      await page.close();

      if (data) {
        scrapeLiveMatch(match_id, match_url);
      } else {
        console.log(`🔍 Match ${match_id} not live yet. Keep searching...`);
        await new Promise(res => setTimeout(res, NONLIVE_ROTATE_DELAY));
      }
    } catch (err) {
      console.warn(`❌ Error checking match ${match_id}: ${err.message}`);
      await page.close();
    }
  }

  setTimeout(monitorQueue, LIVE_CHECK_INTERVAL);
}

(async () => {
  await launchBrowser();
  monitorQueue();
})();
