
# 🧠 Admin Panel Control Summary

The admin panel serves as the central interface for managing match tracking, live status, queueing, and system behavior in the CS Match Tracker system.

---

## 🔗 1. Add Match via HLTV URL
**Purpose:** Insert new matches to track.

- 📝 Paste HLTV match URL
- 🔍 Validate & extract `match_id`
- 📦 Automatically insert into:
  - `matches` table (with format: BO1, BO3)
  - `match_queue` with default priority
- ⚠️ Handle duplicates / malformed links

---

## 📋 2. Match Queue Manager
**Purpose:** Control priority and visibility of matches.

- 🪄 View all tracked matches in order
- ⬆️⬇️ Reorder priority (affects broadcasting)
- 🟡 Show match status:
  - `not_started`, `running`, `finished`
- ❌ Remove match from queue
- 🧠 Each row shows:
  - Match ID, teams, format, priority, status

---

## 📺 3. Live Score Monitor
**Purpose:** Monitor and verify live match progress.

- 🎮 Show current map, CT/T teams, round, scores
- 🔄 Auto-refresh toggle
- 🚦 Show side-switch status
- 🧹 Optional: manual data override if scrape breaks

---

## 🗺️ 4. Map Results Viewer
**Purpose:** See individual map outcomes and progress.

- 📌 View all maps per match
- 🧾 Info:
  - Map name (Dust2, Anubis...)
  - Picked by
  - Winner
  - Final score
- ✅ Status: `not_started`, `running`, `finished`
- 🔧 Optional manual fix (override score/winner)

---

## 🎯 5. App Control Panel
**Purpose:** Start/stop or restart the entire tracking service.

- ▶️ **Start**: Begin scraping and match processing
- ⏹️ **Stop**: Halt all scraping and processing logic
- 🔄 **Restart**: Fully restart the backend process (via system call)
- 🟢 **Status Display**: "App running" or "App stopped"

---

## 🔒 6. Security (Recommended)
- 🔐 Admin-only access to panel
- 🛡 HTTPS if remote access
- 🧑‍💻 Optional activity log (match additions, deletions, restarts)

---

## Optional Future Features
- 📦 Scraper logs viewer
- 👤 Team name normalization
- 📈 Stats display (e.g., total matches tracked, win rates, map stats)
- 📤 Export match data as JSON/CSV
