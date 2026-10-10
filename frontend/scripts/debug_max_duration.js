import { chromium } from 'playwright';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SERVER_PORT = 4173;
const BASE_URL = `http://localhost:${SERVER_PORT}`;

async function debugMaxDuration() {
  const server = spawn('npx.cmd', ['vite', 'preview', '--port', String(SERVER_PORT)], {
    cwd: path.join(__dirname, '..'),
    shell: true,
    stdio: 'pipe',
  });

  await new Promise((resolve) => {
    server.stdout.on('data', (data) => {
      const msg = data.toString();
      if (msg.includes(String(SERVER_PORT)) || msg.includes('Local:')) {
        resolve(true);
      }
    });
    setTimeout(resolve, 3000);
  });

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
    ],
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('console', (msg) => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', (err) => console.log('PAGE ERROR:', err));

  // Intercept backend
  await page.route('**/*/v1/assets/upload', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ asset_id: 'test-photo-asset-id' }),
    });
  });

  await page.goto(BASE_URL);
  await page.click('text="Upload Photo & Voice"');
  await page.waitForSelector('input[type="file"]', { state: 'attached' });
  const fileInput = await page.$('input[type="file"]');
  if (fileInput) {
    await fileInput.setInputFiles({
      name: 'portrait.png',
      mimeType: 'image/png',
      buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'),
    });
  }
  const continueBtn = page.locator('button:has-text("Continue to Voice")');
  await continueBtn.waitFor({ state: 'visible' });
  const handle = await continueBtn.elementHandle();
  if (handle) {
    await page.waitForFunction((el) => !el.hasAttribute('disabled'), handle);
  }
  await continueBtn.click();
  await page.waitForTimeout(400);

  await page.click('text="Record now"');
  await page.waitForTimeout(300);
  await page.click('text="Start Recording"');

  console.log('Recording started... waiting for 60s timer auto-stop...');
  for (let i = 0; i <= 65; i++) {
    const text = await page.innerText('body');
    if (text.includes('Recording captured!') || text.includes('recorded_voice')) {
      console.log(`Auto-stopped at second ${i}! Content found.`);
      break;
    }
    if (i % 10 === 0) {
      console.log(`Status at second ${i}:`, text.substring(0, 150).replace(/\n/g, ' '));
    }
    await page.waitForTimeout(1000);
  }

  await browser.close();
  server.kill();
}

debugMaxDuration().catch(console.error);
