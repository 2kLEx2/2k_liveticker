# Use the official Puppeteer image which already has Chromium installed
FROM ghcr.io/puppeteer/puppeteer:21.11.0

# Set environment variables
ENV NODE_ENV=production
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
# The correct Chrome path in the puppeteer Docker image
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome

# Create app directory
WORKDIR /app

# Create tmp directories that will be needed
RUN mkdir -p /tmp/logos && chmod 777 /tmp/logos

# Create browser config file
RUN echo "module.exports = { executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] };" > browser-config.js

# Copy package.json first
COPY package.json ./

# Install dependencies individually to identify any problematic packages
RUN npm install express@4.18.2 \
    cors@2.8.5 \
    jsonwebtoken@9.0.2 \
    bcrypt@5.1.1 \
    sqlite3@5.1.7 \
    ws@8.18.2 \
    node-fetch@2.7.0 \
    puppeteer-core@21.11.0 \
    puppeteer-extra@3.3.6 \
    puppeteer-extra-plugin-stealth@2.11.2

# Copy application files
COPY server.js ./
COPY admin.html ./
COPY login.html ./
COPY display.html ./
COPY add_match_check.js ./
COPY live_scraper.js ./
COPY create_cs_match_tracker_db.js ./
COPY public ./public

# Expose port
EXPOSE 3000

# Create a startup script that ensures database initialization completes before server starts
RUN echo '#!/bin/sh\necho "Initializing database..."\nnode create_cs_match_tracker_db.js\nif [ $? -ne 0 ]; then\n  echo "Database initialization failed"\n  exit 1\nfi\necho "Database initialized successfully, starting server..."\nexec node server.js' > /app/startup.sh && \
    chmod +x /app/startup.sh

# Start the app with the startup script
CMD ["/app/startup.sh"]
