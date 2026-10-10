import { chromium } from 'playwright';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SERVER_PORT = 4173;
const BASE_URL = `http://localhost:${SERVER_PORT}`;
const SCREENSHOT_DIR = path.join(__dirname, '..', 'screenshots');

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

async function startServer() {
  console.log('Starting Vite preview server...');
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

  return server;
}

async function navigateToVoiceStep(page) {
  // 1. Intercept asset upload
  await page.route('**/*/v1/assets/upload', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ asset_id: 'test-photo-asset-id' }),
    });
  });

  // 2. Intercept durations
  await page.route('**/*/v1/durations', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        allowed_presets: [{ label: '30s', value: '30s', seconds: 30 }],
        words_per_minute: 150,
      }),
    });
  });

  // 3. Open welcome page
  await page.goto(BASE_URL);
  await page.waitForLoadState('networkidle');

  // 4. Click "Upload Photo & Voice"
  await page.click('text="Upload Photo & Voice"');
  await page.waitForTimeout(300);

  // 5. Select photo file (hidden input element in DOM)
  await page.waitForSelector('input[type="file"]', { state: 'attached' });
  const fileInput = await page.$('input[type="file"]');
  if (fileInput) {
    await fileInput.setInputFiles({
      name: 'portrait.png',
      mimeType: 'image/png',
      buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'),
    });
  }

  // 6. Wait for "Continue to Voice" button to become enabled and click it
  const continueBtn = page.locator('button:has-text("Continue to Voice")');
  await continueBtn.waitFor({ state: 'visible' });
  const handle = await continueBtn.elementHandle();
  if (handle) {
    await page.waitForFunction((el) => !el.hasAttribute('disabled'), handle, { timeout: 10000 });
  }
  await continueBtn.click();
  await page.waitForTimeout(400);
}

async function runRecordingErrorTests() {
  const server = await startServer();
  console.log('Server running at', BASE_URL);

  const browser = await chromium.launch({
    headless: true,
  });

  const testResults = [];

  // Helper for running a specific error case
  async function testCase({ id, name, initScript, expectedMessageSnippet, screenshotPrefix }) {
    console.log(`\n========================================`);
    console.log(`Testing Case ${id}: ${name}`);
    console.log(`========================================`);

    const context = await browser.newContext();
    if (initScript) {
      await context.addInitScript(initScript);
    }

    const page = await context.newPage();

    await navigateToVoiceStep(page);

    // Switch to "Record now" mode
    console.log('  1. Switching to "Record now"...');
    await page.click('text="Record now"');
    await page.waitForTimeout(300);

    // Click "Start Recording" to trigger error
    console.log('  2. Clicking "Start Recording"...');
    await page.click('text="Start Recording"');
    await page.waitForTimeout(600);

    // Get displayed error text
    const noticeLocator = page.locator('text=Microphone Notice').locator('xpath=..');
    let displayedMessage = '';
    if (await noticeLocator.count() > 0) {
      displayedMessage = (await noticeLocator.textContent()).replace('Microphone Notice', '').trim();
    } else {
      // Fallback: search paragraph inside error container
      const pLocator = page.locator('p:has-text("Microphone")');
      if (await pLocator.count() > 0) {
        displayedMessage = (await pLocator.first().textContent()).trim();
      }
    }

    console.log(`  3. Exact message displayed to user:\n     "${displayedMessage}"`);

    const matchesExpected = displayedMessage.toLowerCase().includes(expectedMessageSnippet.toLowerCase());
    console.log(`  4. Matches expected error criteria: ${matchesExpected}`);

    // Take screenshot of error state
    const errScreenshotPath = path.join(SCREENSHOT_DIR, `${screenshotPrefix}_error.png`);
    await page.screenshot({ path: errScreenshotPath, fullPage: true });
    console.log(`  5. Saved error screenshot: ${path.basename(errScreenshotPath)}`);

    // Test switching back to "Upload a file"
    console.log('  6. Testing switch back to "Upload a file"...');
    await page.click('text="Upload a file"');
    await page.waitForTimeout(400);

    // Substring match for dropzone text
    const isUploadDropzoneVisible = await page.locator('text=Drag & drop voice audio clip').isVisible();
    console.log(`  7. "Upload a file" dropzone visible: ${isUploadDropzoneVisible}`);

    const switchScreenshotPath = path.join(SCREENSHOT_DIR, `${screenshotPrefix}_switch_to_upload.png`);
    await page.screenshot({ path: switchScreenshotPath, fullPage: true });
    console.log(`  8. Saved switch screenshot: ${path.basename(switchScreenshotPath)}`);

    testResults.push({
      id,
      name,
      displayedMessage,
      matchesExpected,
      isUploadDropzoneVisible,
      errScreenshot: path.basename(errScreenshotPath),
      switchScreenshot: path.basename(switchScreenshotPath),
    });

    await context.close();
  }

  try {
    // 1. Microphone permission denied
    await testCase({
      id: 1,
      name: 'Microphone permission denied',
      initScript: () => {
        window.navigator.mediaDevices.getUserMedia = () => {
          const err = new Error('Permission denied');
          err.name = 'NotAllowedError';
          return Promise.reject(err);
        };
      },
      expectedMessageSnippet: 'permission was denied',
      screenshotPrefix: 'rec_err_1_perm_denied',
    });

    // 2. No microphone found
    await testCase({
      id: 2,
      name: 'No microphone found',
      initScript: () => {
        window.navigator.mediaDevices.getUserMedia = () => {
          const err = new Error('Requested device not found');
          err.name = 'NotFoundError';
          return Promise.reject(err);
        };
      },
      expectedMessageSnippet: 'no microphone input device was detected',
      screenshotPrefix: 'rec_err_2_no_mic',
    });

    // 3. Browser without MediaRecorder
    await testCase({
      id: 3,
      name: 'Browser without MediaRecorder',
      initScript: () => {
        delete window.MediaRecorder;
      },
      expectedMessageSnippet: 'not supported in this browser version',
      screenshotPrefix: 'rec_err_3_no_media_recorder',
    });

    // 4. Insecure origin (not HTTPS or localhost)
    await testCase({
      id: 4,
      name: 'Insecure origin (not HTTPS or localhost)',
      initScript: () => {
        Object.defineProperty(window, 'isSecureContext', { get: () => false, configurable: true });
        try {
          Object.defineProperty(Location.prototype, 'hostname', {
            get: () => '192.168.1.100',
            configurable: true,
          });
          Object.defineProperty(Location.prototype, 'protocol', {
            get: () => 'http:',
            configurable: true,
          });
        } catch {
          // Fallback if Location.prototype is sealed
        }
      },
      expectedMessageSnippet: 'requires a secure connection',
      screenshotPrefix: 'rec_err_4_insecure_origin',
    });

    console.log('\n==================================================');
    console.log('RECORDING ERROR CASES SUMMARY:');
    console.log('==================================================');
    let allPassed = true;
    for (const r of testResults) {
      console.log(`Case ${r.id}: ${r.name}`);
      console.log(`  - Message: "${r.displayedMessage}"`);
      console.log(`  - Matches Expected: ${r.matchesExpected}`);
      console.log(`  - Can Switch to Upload: ${r.isUploadDropzoneVisible}`);
      console.log(`  - Screenshots: ${r.errScreenshot}, ${r.switchScreenshot}`);
      if (!r.matchesExpected || !r.isUploadDropzoneVisible) {
        allPassed = false;
      }
    }
    console.log('==================================================\n');

    if (!allPassed) {
      throw new Error('One or more recording error test cases failed validation!');
    }

    console.log('✓ ALL 4 RECORDING ERROR CASES PASSED SUCCESSFULLY!');
  } finally {
    await browser.close();
    server.kill();
  }
}

runRecordingErrorTests().catch((err) => {
  console.error('Recording error test failed:', err);
  process.exit(1);
});
