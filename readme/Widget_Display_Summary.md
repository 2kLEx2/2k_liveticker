# 📺 Match Display Widget Summary

## 🔧 Purpose
This widget is used to show live Counter-Strike match data scraped from HLTV and stored in the SQLite database. It pulls **only the first-priority match from `match_queue`**, regardless of its current status.

## 🔁 Behavior Overview

- The widget polls a backend endpoint every few seconds (e.g. `/api/display/live`).
- It fetches data for the match with the lowest priority in `match_queue`.
- It updates team names, scores, map info, and map win counts.

## 🔗 Data Mapping from Database

| Widget Element   | Source Table | Field(s) Used | Notes |
|------------------|--------------|----------------|-------|
| `teamName1`      | `matches`    | `team1_name`   | Static info |
| `teamName2`      | `matches`    | `team2_name`   | Static info |
| `team1Logo`      | *(optional)* | `team1_logo`   | Extend DB to store |
| `team2Logo`      | *(optional)* | `team2_logo`   | Extend DB to store |
| `mapInfo`        | `matches`, `live_scores` | `match_format`, `map_number` | Displayed as "Map X - BO3" |
| `scoreLeft`      | `live_scores` | `ct_score` or `t_score` | Depends on side of `team1_name` |
| `scoreRight`     | `live_scores` | `ct_score` or `t_score` | Depends on side of `team2_name` |
| `mapCount1`      | `match_maps` | Count of wins by `team1_name` | `status = 'finished'` |
| `mapCount2`      | `match_maps` | Count of wins by `team2_name` | `status = 'finished'` |

## 📥 Match Selection Logic

```sql
SELECT match_id FROM match_queue ORDER BY priority ASC LIMIT 1;
```

Use this match ID to gather display data via joins on `matches`, `live_scores`, and `match_maps`.

## 🖼️ Widget Code (HTML + CSS)
```html
<!DOCTYPE html>
<html>
<head>
  <title>Match Score Widget</title>
  <style>
    body {
      margin: 0;
      overflow: hidden;
      background: transparent;
      font-family: 'Inter', sans-serif;
    }

    #widget {
      position: fixed;
      top: 130px;
      right: -100%;
      width: 430px;
      height: 130px;
      background: rgba(32, 32, 32, 0.917);
      border-radius: 10px 0 0 10px;
      color: white;
      overflow: hidden;
      transition: right 0.8s ease-in-out;
      z-index: 999;
      stroke: white;
    }

    #widget.show {
      right: 0;
    }

    .map-info {
      position: absolute;
      top: 15px;
      left: 50%;
      transform: translateX(-50%);
      font-size: 13px;
      font-weight: 600;
      opacity: 0.9;
    }

    .divider {
      position: absolute;
      top: 40px;
      left: 50%;
      transform: translateX(-50%);
      width: 124px;
      height: 1px;
      background: linear-gradient(to right, transparent, #d9d9d9, transparent);
    }

    .score {
      position: absolute;
      top: 45px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 40px;
      font-weight: 600;
      min-width: 100px;
      gap: 10px;
    }

    .score-left,
    .score-right {
      width: 40px;
      text-align: center;
    }

    .score-divider {
      width: 20px;
      text-align: center;
    }

    .map-count-wrapper {
      position: absolute;
      top: 100px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      gap: 30px;
      align-items: center;
    }

    .map-count {
      font-size: 15px;
      font-weight: 600;
      text-align: center;
    }

    .team-column {
      position: absolute;
      top: 15px;
      text-align: center;
    }

    .team1 {
      left: 30px;
    }

    .team2 {
      right: 30px;
    }

    .team-logo {
      width: 65px;
      height: 65px;
      object-fit: contain;
    }

    .team-name {
      font-size: 16px;
      font-weight: 500;
      margin-top: 6px;
    }
  </style>
</head>
<body>

<div id="widget">
  <div class="map-info" id="mapInfo">Map X - BO3</div>
  <div class="divider"></div>

  <div class="team-column team1">
    <img src="" class="team-logo" id="team1Logo" alt="Team 1" />
    <div class="team-name" id="teamName1">Team 1</div>
  </div>

  <div class="team-column team2">
    <img src="" class="team-logo" id="team2Logo" alt="Team 2" />
    <div class="team-name" id="teamName2">Team 2</div>
  </div>

  <div class="score">
    <div class="score-left" id="scoreLeft">0</div>
    <div class="score-divider">:</div>
    <div class="score-right" id="scoreRight">0</div>
  </div>

  <div class="map-count-wrapper">
    <div class="map-count" id="mapCount1">(0)</div>
    <div class="map-divider">&nbsp;</div>
    <div class="map-count" id="mapCount2">(0)</div>
  </div>
</div>

```
