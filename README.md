# 🎮 Live Match Tracker + Twitch Score Bot

This is a full-stack application for tracking CS:GO (HLTV) matches with a web admin panel, live score display, and an optional Twitch chat bot that announces scores. Built using **Node.js**, **SQLite**, **Puppeteer**, and **Python**.

---

## 🚀 Features

- ✅ Admin interface to add HLTV match links
- 🎯 Scrapes match info (teams, logos, format)
- 📡 Displays live scores and map wins
- 🤖 Optional Twitch bot that announces scores in chat
- 🛡️ Token-based authentication
- 🧠 SQLite for match and score storage
- 🖼️ Logo caching via Puppeteer

---

## 🛠 Tech Stack

- Node.js (Express)
- Python (for Twitch bot)
- SQLite (via better-sqlite3)
- Puppeteer + Stealth Plugin
- JWT Auth
- Railway deployment-ready

---

## 🔧 Setup Instructions (Local)

### 1. Clone the Repo

```bash
git clone https://github.com/yourname/your-repo.git
cd your-repo
```

### 2. Install Node Modules

```bash
npm install
```

### 3. Run Locally

```bash
node server.js
```

Admin: http://localhost:3000/admin

Display: http://localhost:3000/display

Login: http://localhost:3000/login

### 4. Run the Twitch Bot (Optional)

```bash
python twitch_score_bot.py
```

## 🏗 Deployment (Railway)

1. Push your repo to GitHub
2. Go to https://railway.app
3. Deploy via "New Project" → "Deploy from GitHub"
4. Set environment variables if needed
5. Done!

## 🔐 Environment Variables

Add these to Railway or a .env file:

```env
JWT_SECRET=your-secret-key
```
(You can hardcode it during dev but use env vars in production)

## 📁 Project Structure

```
.
├── server.js                 # Main Express server
├── twitch_score_bot.py       # Twitch bot
├── add_match_check.js        # Scraper
├── display.html / admin.html # UI
├── public/logos              # Team logos
├── cs_match_tracker.db       # SQLite database (ignored in git)
```
