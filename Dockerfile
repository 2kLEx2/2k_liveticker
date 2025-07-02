# Use the official Puppeteer image which already has Chromium installed
FROM ghcr.io/puppeteer/puppeteer:21.11.0

# Set environment variables
ENV NODE_ENV=production
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Create app directory
WORKDIR /app

# Create browser config file
RUN echo "module.exports = { executablePath: '/usr/bin/chromium-browser', args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] };" > browser-config.js

# Copy only necessary files
COPY package.json ./
COPY server.js ./
COPY admin.html ./
COPY login.html ./
COPY add_match_check.js ./
COPY live_scraper.js ./
COPY create_cs_match_tracker_db.js ./
COPY public ./public

# Install dependencies with minimal output
RUN npm install --only=production --no-audit --no-fund --prefer-offline --silent

# Expose port
EXPOSE 3000

# Start the app
CMD ["node", "server.js"]
