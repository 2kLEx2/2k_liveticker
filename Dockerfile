FROM node:18-slim

# Install Chromium and its dependencies
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Set environment variables
ENV NODE_ENV=production
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Create app directory
WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./

# Install dependencies with minimal output
RUN npm install --omit=dev --no-optional --no-audit --no-fund --prefer-offline --no-package-lock

# Copy app source
COPY . .

# Create the browser config file
RUN echo "module.exports = { executablePath: '/usr/bin/chromium', args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] };" > browser-config.js

# Expose port
EXPOSE 3000

# Start the app
CMD ["npm", "start"]
