
// Browser configuration for Railway deployment
module.exports = {
  // For the puppeteer/puppeteer:21.11.0 Docker image, Chrome is at this path
  executablePath: process.env.NODE_ENV === 'production' 
    ? '/usr/bin/google-chrome-stable' 
    : '/usr/bin/chromium',
  headless: 'new',
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--no-first-run',
    '--no-zygote',
    '--single-process',
    '--disable-gpu'
  ]
};
  