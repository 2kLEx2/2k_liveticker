# Stage 1: Install dependencies
FROM node:18-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production --no-audit --no-fund --prefer-offline --silent --no-optional

# Stage 2: Build the application
FROM node:18-alpine

# Install only Chromium with minimal dependencies
RUN apk add --no-cache chromium nss ca-certificates

# Set environment variables
ENV NODE_ENV=production
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Create app directory
WORKDIR /app

# Copy dependencies from the deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy app source
COPY . .

# Create the browser config file pointing to the pre-installed Chromium
RUN echo "module.exports = { executablePath: '/usr/bin/chromium-browser', args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] };" > browser-config.js

# Expose port
EXPOSE 3000

# Start the app
CMD ["npm", "start"]
