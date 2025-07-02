/**
 * Environment check script for Railway deployment
 * 
 * This script checks if we're in a production environment (Railway)
 * and skips better-sqlite3 installation if needed
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
  // No need to do anything, better-sqlite3 is optional and will be skipped if it fails
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
}

console.log('Postinstall script completed');
