const puppeteerExtra = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const path = require('path');

// Use puppeteer-core to avoid downloading Chromium
const puppeteer = puppeteerExtra.default;
puppeteer.use(StealthPlugin());

// Import browser configuration
let browserConfig;
try {
  browserConfig = require('./browser-config');
  console.log('Using browser configuration from browser-config.js');
} catch (err) {
  console.log('No browser-config.js found, using default configuration');
  browserConfig = {
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
}

const [,, url, matchId] = process.argv;

if (!url || !matchId) {
  console.error('❌ Usage: node add_match_check.js <HLTV_URL> <matchId>');
  process.exit(1);
}

(async () => {
  // Use the browser configuration with puppeteer-core
  const launchOptions = {
    headless: 'new',
    ...browserConfig
  };
  
  console.log('Launching browser with options:', JSON.stringify(launchOptions, null, 2));
  const browser = await puppeteer.launch(launchOptions);

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114 Safari/537.36');
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise(resolve => setTimeout(resolve, 5000)); // Let Cloudflare settle

    const data = await page.evaluate(() => {
      const teamEls = document.querySelectorAll('.teamsBox .team .teamName');
      const team1 = teamEls[0]?.textContent.trim() || 'Unknown';
      const team2 = teamEls[1]?.textContent.trim() || 'Unknown';

      const formatText = document.querySelector('.padding.preformatted-text')?.textContent || '';
      const matchFormat = formatText.includes('Best of 3') ? 'BO3'
                        : formatText.includes('Best of 1') ? 'BO1'
                        : formatText.includes('Best of 5') ? 'BO5'
                        : 'Unknown';

      const teamContainers = document.querySelectorAll('.teamsBox .team');

      const getLogoUrl = (container) => {
        const logoAnchor = container.querySelector('a[href^="/team"]');
        const logoEl = logoAnchor?.querySelector('img.night-only') ||
                       logoAnchor?.querySelector('img.logo') ||
                       logoAnchor?.querySelector('img');
        let logoUrl = logoEl?.getAttribute('src') || '';
        if (logoUrl && !logoUrl.startsWith('http')) {
          logoUrl = 'https://www.hltv.org' + logoUrl;
        }
        return logoUrl || null;
      };

      const team1Logo = teamContainers[0] ? getLogoUrl(teamContainers[0]) : null;
      const team2Logo = teamContainers[1] ? getLogoUrl(teamContainers[1]) : null;

      return { team1, team2, matchFormat, team1Logo, team2Logo };
    });

    console.log('\n📋 Extracted Match Info:');
    console.log(`Match ID:      ${matchId}`);
    console.log(`Match URL:     ${url}`);
    console.log(`Team 1 Name:   ${data.team1}`);
    console.log(`Team 2 Name:   ${data.team2}`);
    console.log(`Match Format:  ${data.matchFormat}`);
    if (data.team1Logo) console.log(`Team 1 Logo:   ${data.team1Logo}`);
    if (data.team2Logo) console.log(`Team 2 Logo:   ${data.team2Logo}`);

  } catch (err) {
    console.error('❌ Error scraping the page:', err.message);
  } finally {
    await browser.close();
  }
})();
