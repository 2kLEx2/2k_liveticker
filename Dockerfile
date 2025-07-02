# Stage 1: Install dependencies
FROM ghcr.io/puppeteer/puppeteer:21.11.0 AS deps
WORKDIR /app

# Set environment variables
ENV NODE_ENV=production
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Copy only package files first for better caching
COPY package*.json ./

# Create browser config before npm install to improve caching
RUN echo "module.exports = { executablePath: '/usr/bin/chromium-browser', args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] };" > browser-config.js

# Install dependencies with specific options to reduce output and time
RUN npm ci --only=production --no-audit --no-fund --prefer-offline --silent --no-optional

# Stage 2: Create production image with minimal files
FROM ghcr.io/puppeteer/puppeteer:21.11.0
WORKDIR /app

# Set environment variables
ENV NODE_ENV=production
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Copy browser config and node_modules from deps stage
COPY --from=deps /app/browser-config.js ./
COPY --from=deps /app/node_modules ./node_modules

# Copy application code (will use .dockerignore to exclude unnecessary files)
COPY . .

# Expose port
EXPOSE 3000

# Start the app directly with node instead of npm
CMD ["node", "server.js"]
