# 🕷️ CS Match Tracker – Scraper Instructions

This document lists all the critical sections that your **scraping script** must parse from an HLTV match page in order to populate the database tables for the CS Match Tracker system.

---

## 🔗 1. Match Metadata (URL & Basics)

**HTML Sections:**
- **URL format:** `https://www.hltv.org/matches/<match_id>/<slug>`
- **Example:** `https://www.hltv.org/matches/2383225/partizan-vs-zero-tenacity-cct-season-3-europe-series-3`

**Scrape:**
- `match_id` → Extract from URL
- `match_url` → Full URL
- `team1_name` and `team2_name` → Found in title header or map results block
- `match_format` → Look for `"Best of 3"` or `"Best of 1"` in `.veto-box` or `.preformatted-text`
- `event_name` → Often near the match banner (not currently extracted but recommended)
- `start_time` → Found in `div.timeAndEvent`, `data-unix` attribute

---

## 🟡 2. Match Queue Management

Automatically after inserting the match:
- Add to `match_queue`
- Set `status = 'queued'`, `priority = 0`

---

## 📊 3. Live Score Section (During Match)

**HTML Target:**
```html
<div class="topbarBg">
```

**Scrape:**
- `current_round` → from `<span class="currentRoundText">`
- `ct_score` and `t_score` → from `<div class="ctScore">` and `<div class="tScore">`
- `ct_team`, `t_team` → team names in the two `<thead>` blocks with classes `ctTeamHeaderBg` and `tTeamHeaderBg`
- `map_number` → determined by scraper (increment per live page refresh or match layout)

---

## 🗺️ 4. Map Veto & Results Section

**HTML Target:**
```html
<div class="standard-box veto-box"> ... </div>
<div class="flexbox-column">
  <div class="mapholder">
```

**Scrape for each map:**
- `map_number` → order of appearance (1, 2, 3...)
- `map_name` → from `<div class="mapname">`
- `status` → derived from class names (`played`, `optional`, `tie`, `won`, etc.)
- `ct_score`, `t_score` → from `.results-team-score` blocks
- `winning_team` → team with higher score or `won` class
- `picked_by` → from veto text like `"3. Zero Tenacity picked Anubis"`
- `map_stats_url` → from `<a href="/stats/matches/mapstatsid/...">`

---

## 📁 5. Match Meta Info (Optional)

**HTML Target:**
```html
<div class="standard-box veto-box">
  <div class="padding preformatted-text">
```

**Scrape:**
- `format_description` → full string (e.g., `"Best of 3 (Online)"`)
- `round_description` → full string (e.g., `"Swiss round 5 (teams with a 2-2 record)...`)
- Store in optional table `match_meta`

---

## 📸 6. Team Assets (Optional)

**HTML Target:**
- `<img ... title="Team Name" src="...teamlogo...">`

**Scrape:**
- `logo_url` → for overlays (optional)
- `hltv_team_id` → can be inferred from team page links if needed
- Optional table: `teams`

---

## 🧠 Scraper Responsibilities Summary

| Table         | Required Fields Filled by Scraper                                  |
|---------------|---------------------------------------------------------------------|
| `matches`     | `match_id`, `match_url`, `team1_name`, `team2_name`, `match_format`, `event_name`, `start_time` |
| `match_queue` | `match_id` (auto-added)                                             |
| `live_scores` | `map_number`, `ct_team`, `t_team`, `ct_score`, `t_score`, `current_round` |
| `match_maps`  | `map_number`, `map_name`, `status`, `ct_score`, `t_score`, `winning_team`, `picked_by`, `map_stats_url` |
| `match_meta`  | `match_id`, `format_description`, `round_description` (optional)   |
| `teams`       | `team_name`, `logo_url` (optional)                                 |


🔐 7. Scraper Runtime & Anti-Bot Strategy
This scraper is built for reliability against Cloudflare and dynamic content.

  📦 Tools Used
  puppeteer-extra
  A headless Chromium automation library used to simulate a real browser.

  puppeteer-extra-plugin-stealth
  Masks browser fingerprints (e.g., navigator.webdriver, user-agent inconsistencies) to evade detection.

  🧠 Runtime Behavior
  Headless browser navigation with:


  page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
  This ensures all JavaScript content and scores are fully loaded before scraping.

  Live status check:
  Verifies if the match is live by checking for the presence of score elements (e.g., .ctScore, .tScore).

  Console forwarding:
  Browser logs are piped into Node logs for debugging:

  page.on('console', msg => { ... });
  Sleep + retry logic:
  To avoid rate limits and data lag, scraper uses:


  await new Promise(res => setTimeout(res, 5000));
  🛡️ Cloudflare Mitigation Summary

  Technique	Purpose
  Puppeteer + Chromium	Full browser engine that executes JS like a user
  Stealth Plugin	Hides headless browser indicators
  No API calls	Scrapes DOM after rendering — avoids bot-blocked APIs
  Randomized delays (if needed)	Prevents detection via request frequency
  User-agent & viewport control	(can be added) to mimic real users