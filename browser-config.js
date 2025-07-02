
// Browser configuration for Railway deployment
module.exports = {
  // For the puppeteer/puppeteer:21.11.0 Docker image, Chrome is at this path
  executablePath: process.env.NODE_ENV === 'production' 
    ? '/usr/bin/chromium-browser' 
    : '/usr/bin/chromium',
  headless: 'new',
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage'
  ]
};
  