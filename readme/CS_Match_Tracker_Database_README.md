# 🧠 CS Match Tracker – Database Schema README

This document describes the **SQLite database schema** used to track CS matches, live scores, and broadcasting priority for a custom scoreboard or analytics system.

---

## 🏗️ Database Overview

The database consists of 4 main tables:

- [`matches`](#matches) — base match info from HLTV
- [`live_scores`](#live_scores) — real-time score data per map
- [`match_maps`](#match_maps) — result and status for each map
- [`match_queue`](#match_queue) — controls broadcast priority and queue

All tables are connected through `match_id`, which is extracted from HLTV match URLs.

---

## 📄 Table Definitions

### 🧩 `matches`

Stores all added HLTV matches.

```sql
CREATE TABLE matches (
    match_id TEXT PRIMARY KEY,
    match_url TEXT NOT NULL,
    team1_name TEXT NOT NULL,
    team2_name TEXT NOT NULL,
    match_format TEXT CHECK (match_format IN ('BO1', 'BO3', 'BO5')) NOT NULL,
    winner TEXT,
    is_finished BOOLEAN DEFAULT 0,
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

- `match_id` is the unique numeric ID from the HLTV URL.
- `match_format` defines whether it’s BO1, BO3, or BO5.
- `winner` and `is_finished` are set once the match concludes.

---

### 📊 `live_scores`

Tracks live score data per map, per match, including CT/T sides.

```sql
CREATE TABLE live_scores (
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
```

- Tracks **live round number**, team sides, and scores.
- `map_number` is numeric (1–5), not map name.

---

### 🗺️ `match_maps`

Stores the final outcome and status of each map in a match.

```sql
CREATE TABLE match_maps (
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
```

- Used to determine how many maps a team has won.
- Once a team wins the required number of maps, the `matches.winner` can be set.

---

### 🎯 `match_queue`

Controls which matches are prioritized for broadcast.

```sql
CREATE TABLE match_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id TEXT NOT NULL,
    priority INTEGER DEFAULT 0,
    status TEXT CHECK (status IN ('queued', 'active', 'done')) DEFAULT 'queued',
    queued_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (match_id) REFERENCES matches(match_id) ON DELETE CASCADE,
    UNIQUE(match_id)
);
```

- Admins can change the `priority` field to control match order.
- `status` is:
  - `queued` – waiting to be shown
  - `active` – currently being broadcast
  - `done` – completed or manually removed

---

## 🧠 Usage Tips

- Automatically add to `match_queue` when inserting a new match.
- Update `live_scores` frequently as the match progresses.
- Use `match_maps` to determine map winners and trigger `matches` finalization.
- Use a scheduled process to mark finished matches as `done` in `match_queue`.

---

## 📌 Example Insert

```sql
INSERT INTO matches (match_id, match_url, team1_name, team2_name, match_format)
VALUES ('2383225', 'https://www.hltv.org/matches/2383225/partizan-vs-zero-tenacity-cct-season-3-europe-series-3', 'Partizan', 'Zero Tenacity', 'BO3');

INSERT INTO match_queue (match_id) VALUES ('2383225');
```

---

## ✅ Ready to Use

This schema is ideal for:
- Real-time broadcasting overlays
- Match tracking systems
- Admin-controlled stream queues
- HLTV scraping pipelines
