const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const presentationRoot = path.join(__dirname, '..');
const screenshotsDir = path.join(presentationRoot, 'screenshots');
const targetUrl = 'http://localhost:5100';

async function capturePanel(page, panelName, fileName) {
  const navButton = page.locator(`#module-nav .nav-button[data-panel="${panelName}"]`);
  if (await navButton.count() === 0) {
    console.warn(`Skipping missing panel: ${panelName}`);
    return;
  }

  await navButton.click();
  await page.waitForTimeout(350);

  if (panelName === 'deal-audit') {
    await page.locator('#panel-deal-audit [data-audit-run]').click();
    await page.waitForFunction(() => {
      const count = document.querySelector('#panel-deal-audit [data-audit-count]');
      return count && !count.textContent.includes('No audit yet');
    }, null, { timeout: 60000 });
  }

  await page.evaluate(() => document.getElementById('toast-container')?.replaceChildren());

  const panel = page.locator(`#panel-${panelName}`);
  if (panelName === 'deal-audit') {
    const box = await panel.boundingBox();
    if (!box) throw new Error('Audit panel box was not found.');
    await page.screenshot({
      path: path.join(screenshotsDir, fileName),
      animations: 'disabled',
      clip: {
        x: box.x,
        y: box.y,
        width: box.width,
        height: Math.min(box.height, 980),
      },
    });
    return;
  }

  await panel.screenshot({ path: path.join(screenshotsDir, fileName), animations: 'disabled' });
}

async function captureContactValidationError(page) {
  const navButton = page.locator('#module-nav .nav-button[data-panel="contacts"]');
  if (await navButton.count() === 0) {
    console.warn('Skipping validation screenshot: contacts panel is missing');
    return;
  }

  await navButton.click();
  await page.waitForTimeout(350);

  const existingEmail = await page.locator('#contact-table-body tr td:nth-child(2)')
    .first()
    .textContent()
    .catch(() => null);

  if (!existingEmail || !existingEmail.includes('@')) {
    console.warn('Skipping validation screenshot: no existing contact email found');
    return;
  }

  await page.locator('#contact-firstname').fill('Duplicate');
  await page.locator('#contact-lastname').fill('Validation');
  await page.locator('#contact-email').fill(existingEmail.trim());
  await page.locator('#contact-phone').fill('+1-555-000-0000');
  await page.locator('#btn-save-contact').click();
  await page.waitForSelector('#contact-email.invalid, .api-error-summary', { timeout: 15000 });
  await page.evaluate(() => document.getElementById('toast-container')?.replaceChildren());
  await page.locator('#panel-contacts').screenshot({
    path: path.join(screenshotsDir, 'contact-validation-error.png'),
    animations: 'disabled',
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
      viewport: { width: 1600, height: 1000 },
      deviceScaleFactor: 1,
    });

    await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForFunction(() => {
      const overlay = document.getElementById('loading-overlay');
      const dealRows = document.querySelectorAll('#deal-table-body tr').length;
      return overlay
        && overlay.style.display === 'none'
        && dealRows > 0;
    }, null, { timeout: 60000 });

    await capturePanel(page, 'deals', 'deals-panel.png');
    await capturePanel(page, 'contacts', 'contacts-panel.png');
    await capturePanel(page, 'deal-audit', 'audit-panel.png');
    await capturePanel(page, 'companies', 'companies-panel.png');
    await capturePanel(page, 'links', 'links-panel.png');
    await capturePanel(page, 'import', 'import-panel.png');
    await capturePanel(page, 'settings', 'settings-panel.png');
    await captureContactValidationError(page);
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
