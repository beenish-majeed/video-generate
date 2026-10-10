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

const VIEWPORTS = [
  { name: '320_mobile_small', width: 320, height: 568 },
  { name: '360_mobile_standard', width: 360, height: 640 },
  { name: '768_tablet_portrait', width: 768, height: 1024 },
  { name: '1024_tablet_landscape', width: 1024, height: 768 },
  { name: '1280_laptop', width: 1280, height: 800 },
  { name: '1920_desktop_fhd', width: 1920, height: 1080 },
  { name: '667_landscape_phone', width: 667, height: 375 },
];

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

async function runAudit() {
  const server = await startServer();
  console.log('Server running at', BASE_URL);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Mock API endpoints
  await page.route('**/v1/durations', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        allowed_presets: [
          { label: '15s', value: '15s', seconds: 15 },
          { label: '30s', value: '30s', seconds: 30 },
          { label: '60s', value: '60s', seconds: 60 },
        ],
        words_per_minute: 150,
      }),
    });
  });

  await page.route('**/v1/assets/upload', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ asset_id: 'mock-asset-123' }),
    });
  });

  let mockJobFail = false;

  await page.route('**/v1/jobs', (route) => {
    if (mockJobFail) {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Studio render worker timeout error' }),
      });
    } else {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ job_id: 'job-mock-9999', state: 'PENDING' }),
      });
    }
  });

  await page.route('**/v1/jobs/job-mock-9999', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        job_id: 'job-mock-9999',
        state: 'COMPLETED',
        final_video_duration_seconds: 30,
        target_duration_seconds: 30,
      }),
    });
  });

  await page.route('**/v1/jobs/job-mock-9999/download', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'video/mp4',
      body: Buffer.from('mock video bytes'),
    });
  });

  const issuesFound = [];
  const capturedScreenshots = [];

  // Programmatic layout & horizontal overflow checker
  async function checkLayout(pathName, stepName, vpName, vpWidth) {
    const layoutInfo = await page.evaluate(() => {
      const docWidth = document.documentElement.scrollWidth;
      const bodyWidth = document.body.scrollWidth;
      const winWidth = window.innerWidth;
      const hasHorizontalScroll = docWidth > winWidth + 1 || bodyWidth > winWidth + 1;

      let overflowingTag = null;
      let maxRight = 0;
      const allElems = document.querySelectorAll('*');
      allElems.forEach((el) => {
        const rect = el.getBoundingClientRect();
        if (rect.right > winWidth + 2 && el.tagName !== 'HTML' && el.tagName !== 'BODY') {
          maxRight = Math.max(maxRight, rect.right);
          const classNameStr = typeof el.className === 'string' ? el.className : '';
          overflowingTag = `${el.tagName.toLowerCase()}${classNameStr ? '.' + classNameStr.split(' ').join('.') : ''}`;
        }
      });

      return { hasHorizontalScroll, docWidth, bodyWidth, winWidth, overflowingTag, maxRight };
    });

    if (layoutInfo.hasHorizontalScroll) {
      const msg = `[OVERFLOW DETECTED] Path: ${pathName}, Step: ${stepName}, Viewport: ${vpName} (${vpWidth}px) -> ScrollWidth: ${layoutInfo.docWidth}px > WinWidth: ${layoutInfo.winWidth}px (Elem: ${layoutInfo.overflowingTag})`;
      console.warn(msg);
      issuesFound.push(msg);
    } else {
      console.log(`✓ [LAYOUT PASS] Path: ${pathName}, Step: ${stepName}, Viewport: ${vpName} (${vpWidth}px)`);
    }
  }

  async function capture(pathName, stepName, vp) {
    const filename = `${pathName}_${stepName}_${vp.name}.png`;
    const filepath = path.join(SCREENSHOT_DIR, filename);
    await page.screenshot({ path: filepath, fullPage: true });
    capturedScreenshots.push({ pathName, stepName, vpName: vp.name, filepath });
  }

  // Exactly 73 words paragraph (fits 68–82 target words for 30s @ 150 WPM)
  const PERFECT_73_WORD_SCRIPT = 'A peaceful sunny morning in a quiet valley surrounded by tall whispering pine trees against the clear blue sky. Soft golden light beams filter gently through the green branches illuminating a calm crystal winding stream below. Gentle mountain breezes carry the fresh scent of wild cedar and blooming flora as birds sing happily in the morning canopy. Time seems to stand still in this quiet sanctuary where nature rests undisturbed in soft harmony.';

  async function setScriptTextarea(text) {
    await page.focus('#narrative-script-input');
    await page.evaluate((val) => {
      const textarea = document.querySelector('#narrative-script-input');
      if (textarea) {
        const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
        valueSetter.call(textarea, val);
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, text);
  }

  async function checkConsentCheckboxes() {
    await page.click('#face-rights-checkbox');
    await page.click('#voice-rights-checkbox');
    await page.click('#authorized-checkbox');
    await page.waitForTimeout(300);
  }

  async function resetSession() {
    await page.goto(BASE_URL);
    await page.evaluate(() => {
      try {
        localStorage.clear();
      } catch {}
    });
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');
  }

  for (const vp of VIEWPORTS) {
    console.log(`\n========================================`);
    console.log(`AUDITING VIEWPORT: ${vp.name} (${vp.width}x${vp.height})`);
    console.log(`========================================`);

    await page.setViewportSize({ width: vp.width, height: vp.height });
    mockJobFail = false;

    // --- PATH 1: custom_media ---
    await resetSession();

    // 00. Hero
    await checkLayout('custom_media', '00_hero', vp.name, vp.width);
    await capture('custom_media', '00_hero', vp);

    // Click "Upload Photo & Voice"
    await page.click('text="Upload Photo & Voice"');
    await page.waitForTimeout(300);

    // 01. Photo
    await checkLayout('custom_media', '01_photo', vp.name, vp.width);
    await capture('custom_media', '01_photo', vp);

    // Upload mock photo
    const fileInput = await page.$('input[type="file"]');
    if (fileInput) {
      await fileInput.setInputFiles({
        name: 'test_photo.png',
        mimeType: 'image/png',
        buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'),
      });
      await page.waitForTimeout(800);
    }

    // Click Continue to Voice
    await page.click('text="Continue to Voice"');
    await page.waitForTimeout(300);

    // 02. Voice
    await checkLayout('custom_media', '02_voice', vp.name, vp.width);
    await capture('custom_media', '02_voice', vp);

    // Upload mock voice
    const voiceInput = await page.$('input[type="file"]');
    if (voiceInput) {
      await voiceInput.setInputFiles({
        name: 'test_voice.wav',
        mimeType: 'audio/wav',
        buffer: Buffer.from('RIFF44oAAFdBVkVmbXQgEAAAAAEAAEIBAAxDAAABAAgAZGF0YQooAAAA', 'base64'),
      });
      await page.waitForTimeout(800);
    }

    // Click Continue to Duration
    await page.click('text="Continue to Duration"');
    await page.waitForTimeout(300);

    // 03. Duration
    await checkLayout('custom_media', '03_duration', vp.name, vp.width);
    await capture('custom_media', '03_duration', vp);

    // Click Continue to Script
    await page.click('text="Continue to Script"');
    await page.waitForTimeout(300);

    // Fill valid script using React setter
    await setScriptTextarea(PERFECT_73_WORD_SCRIPT);
    await page.waitForTimeout(300);

    // 04. Script
    await checkLayout('custom_media', '04_script', vp.name, vp.width);
    await capture('custom_media', '04_script', vp);

    // Click Continue to Rights
    await page.click('text="Continue to Rights"');
    await page.waitForTimeout(300);

    // 05. Consent
    await checkLayout('custom_media', '05_consent', vp.name, vp.width);
    await capture('custom_media', '05_consent', vp);

    // Check all checkboxes
    await checkConsentCheckboxes();

    // Click Create My Memory Film -> enters Waiting Room
    await page.click('text="Create My Memory Film"');
    await page.waitForTimeout(300);

    // 06. Waiting Room
    await checkLayout('custom_media', '06_waiting', vp.name, vp.width);
    await capture('custom_media', '06_waiting', vp);

    // Wait for mock polling completion -> transitions to Premiere
    await page.waitForTimeout(1200);

    // 07. Grand Premiere
    await checkLayout('custom_media', '07_premiere', vp.name, vp.width);
    await capture('custom_media', '07_premiere', vp);


    // --- PATH 2: prompt_first ---
    await resetSession();

    // 00. Hero -> Click "Start with Prompt"
    await page.click('text="Start with Prompt"');
    await page.waitForTimeout(300);

    // 01. Duration
    await checkLayout('prompt_first', '01_duration', vp.name, vp.width);
    await capture('prompt_first', '01_duration', vp);

    // Click Continue to Script
    await page.click('text="Continue to Script"');
    await page.waitForTimeout(300);

    // Fill valid script
    await setScriptTextarea(PERFECT_73_WORD_SCRIPT);
    await page.waitForTimeout(300);

    // 02. Script
    await checkLayout('prompt_first', '02_script', vp.name, vp.width);
    await capture('prompt_first', '02_script', vp);

    // Click Continue to Rights
    await page.click('text="Continue to Rights"');
    await page.waitForTimeout(300);

    // 03. Consent
    await checkLayout('prompt_first', '03_consent', vp.name, vp.width);
    await capture('prompt_first', '03_consent', vp);

    // Check all checkboxes
    await checkConsentCheckboxes();

    // Click Create My Memory Film
    await page.click('text="Create My Memory Film"');
    await page.waitForTimeout(300);

    // 04. Waiting Room
    await checkLayout('prompt_first', '04_waiting', vp.name, vp.width);
    await capture('prompt_first', '04_waiting', vp);

    await page.waitForTimeout(1200);

    // 05. Grand Premiere
    await checkLayout('prompt_first', '05_premiere', vp.name, vp.width);
    await capture('prompt_first', '05_premiere', vp);


    // --- FAILURE SCREEN TEST ---
    mockJobFail = true;
    await resetSession();
    await page.click('text="Start with Prompt"');
    await page.waitForTimeout(200);
    await page.click('text="Continue to Script"');
    await page.waitForTimeout(200);
    await setScriptTextarea(PERFECT_73_WORD_SCRIPT);
    await page.waitForTimeout(300);
    await page.click('text="Continue to Rights"');
    await page.waitForTimeout(200);

    await checkConsentCheckboxes();
    await page.click('text="Create My Memory Film"');
    await page.waitForTimeout(500);

    // 06. Failed Screen
    await checkLayout('both_paths', '06_failed', vp.name, vp.width);
    await capture('both_paths', '06_failed', vp);
  }

  await browser.close();
  server.kill();

  console.log('\n========================================');
  console.log(`TOTAL SCREENSHOTS CAPTURED: ${capturedScreenshots.length}`);
  console.log(`TOTAL OVERFLOW ISSUES DETECTED: ${issuesFound.length}`);
  console.log('========================================\n');

  if (issuesFound.length > 0) {
    console.log('LAYOUT ISSUES SUMMARY:');
    issuesFound.forEach((iss) => console.log('  - ' + iss));
  } else {
    console.log('✓ ZERO HORIZONTAL SCROLL OR OVERFLOW ISSUES DETECTED ACROSS ALL VIEWPORTS & PATHS!');
  }
}

runAudit().catch((err) => {
  console.error('Audit failed:', err);
  process.exit(1);
});
