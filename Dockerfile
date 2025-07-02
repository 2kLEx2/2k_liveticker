# Use the official Puppeteer image which already has Chromium installed
FROM ghcr.io/puppeteer/puppeteer:21.11.0

# Set environment variables
ENV NODE_ENV=production
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies with minimal output
RUN npm ci --only=production --no-audit --no-fund --prefer-offline --silent --no-optional

# Copy app source
COPY . .

# Create the browser config file pointing to the pre-installed Chromium
RUN echo "module.exports = { executablePath: '/usr/bin/chromium-browser', args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] };" > browser-config.js

# Expose port
EXPOSE 3000

# Start the app
CMD ["npm", "start"]
