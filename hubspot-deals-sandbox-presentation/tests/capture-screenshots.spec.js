const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const presentationRoot = path.join(__dirname, '..');
const screenshotsDir = path.join(presentationRoot, 'screenshots');
const targetUrl = 'http://localhost:5100';

async function capturePanel(page, panelName, fileName) {
  await page.evaluate((name) => {
    showPanel(name);
    window.scrollTo(0, 0);
  }, panelName);
  await page.waitForTimeout(500);
  await page.screenshot({
    path: path.join(screenshotsDir, fileName),
    fullPage: true,
  });
}

(async () => {
  await fs.promises.mkdir(screenshotsDir, { recursive: true });

  const browser = await chromium.launch({
    channel: 'msedge',
    headless: true,
  });

  try {
    const page = await browser.newPage({
      viewport: { width: 1600, height: 2200 },
      deviceScaleFactor: 1,
    });

    await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForFunction(() => {
      const overlay = document.getElementById('loading-overlay');
      const dealRows = document.querySelectorAll('#deal-table-body tr').length;
      return typeof showPanel === 'function'
        && overlay
        && overlay.style.display === 'none'
        && dealRows > 0;
    }, null, { timeout: 60000 });

    await capturePanel(page, 'deals', 'deals-panel.png');
    await capturePanel(page, 'companies', 'companies-panel.png');
    await capturePanel(page, 'links', 'links-panel.png');
    await capturePanel(page, 'import', 'import-panel.png');
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
