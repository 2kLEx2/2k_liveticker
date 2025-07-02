/**
 * Environment check script for Railway deployment
 * 
 * This script checks if we're in a production environment (Railway)
 * and configures the application accordingly
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Check if we're in a production environment (Railway)
const isProduction = process.env.NODE_ENV === 'production';

console.log(`Environment: ${isProduction ? 'Production' : 'Development'}`);

if (isProduction) {
  console.log('Production environment detected (Railway)');
  console.log('Skipping better-sqlite3 installation to avoid build errors');
  
  // Create a browser-config.js file for Railway with proper Chromium path
  const browserConfigPath = path.join(__dirname, '..', 'browser-config.js');
  const browserConfig = `
    // Browser configuration for Railway deployment
    module.exports = {
      executablePath: '/usr/bin/chromium',
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
  `;
  
  fs.writeFileSync(browserConfigPath, browserConfig);
  console.log(`Created browser configuration at ${browserConfigPath}`);
} else {
  // In development, try to rebuild better-sqlite3
  try {
    console.log('Development environment detected');
    console.log('Attempting to rebuild better-sqlite3...');
    execSync('npm rebuild better-sqlite3 --build-from-source', { stdio: 'inherit' });
    console.log('Successfully rebuilt better-sqlite3');
  } catch (error) {
    console.warn('Failed to rebuild better-sqlite3, but continuing anyway:', error.message);
    console.log('The application will fall back to sqlite3');
  }
  
  // Create a browser-config.js file for local development
  const browserConfigPath = path.join(__dirname, '..', 'browser-config.js');
  const browserConfig = `
    // Browser configuration for local development
    module.exports = {
      // No executablePath specified - puppeteer-extra will find the local Chrome/Chromium
      args: [
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--disable-gpu'
      ]
    };
  `;
  
  fs.writeFileSync(browserConfigPath, browserConfig);
  console.log(`Created browser configuration at ${browserConfigPath}`);
}

console.log('Postinstall script completed');
