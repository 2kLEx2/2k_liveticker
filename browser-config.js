
// Browser configuration for Railway deployment
const isProduction = process.env.NODE_ENV === 'production';
const isWindows = process.platform === 'win32';

module.exports = {
  // For the puppeteer/puppeteer:21.11.0 Docker image, Chrome is at this path
  // In Windows development environments, we'll let Puppeteer find the browser automatically
  executablePath: isProduction 
    ? '/usr/bin/google-chrome' 
    : (isWindows ? undefined : '/usr/bin/chromium'),
  headless: 'new',
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage'
  ]
};