FROM node:18-alpine

# Install Chromium and minimal dependencies
RUN apk add --no-cache \
    chromium \
    nss \
    ca-certificates \
    ttf-freefont

# Set environment variables
ENV NODE_ENV=production
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Create app directory
WORKDIR /app

# Copy package files first for better caching
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
