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

async function runRecordingTest() {
  const server = await startServer();
  console.log('Server running at', BASE_URL);

  // Launch Chromium with fake media stream flags as requested
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
    ],
  });

  const context = await browser.newContext({
    permissions: ['microphone'],
  });
  const page = await context.newPage();

  // Variables to capture intercepted POST /v1/assets/upload request payload
  let uploadRequestCaptured = false;
  let requestHeaders = null;
  let fileBuffer = null;
  let isWavHeaderValid = false;
  let headerRiffText = '';
  let headerWaveText = '';

  // Intercept POST /v1/assets/upload to verify WAV binary payload
  await page.route('**/v1/assets/upload', async (route, request) => {
    if (request.method() === 'POST') {
      uploadRequestCaptured = true;
      requestHeaders = request.headers();
      const postDataBuffer = request.postDataBuffer();

      if (postDataBuffer) {
        fileBuffer = postDataBuffer;
        
        // Search for RIFF and WAVE magic bytes inside multipart/form-data payload
        const riffIndex = postDataBuffer.indexOf(Buffer.from('RIFF'));
        if (riffIndex !== -1 && riffIndex + 12 <= postDataBuffer.length) {
          headerRiffText = postDataBuffer.toString('ascii', riffIndex, riffIndex + 4);
          headerWaveText = postDataBuffer.toString('ascii', riffIndex + 8, riffIndex + 12);

          if (headerRiffText === 'RIFF' && headerWaveText === 'WAVE') {
            isWavHeaderValid = true;
          }
        }
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ asset_id: 'recording-wav-asset-777' }),
      });
    } else {
      await route.continue();
    }
  });

  // Mock other endpoints
  await page.route('**/v1/durations', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        allowed_presets: [{ label: '30s', value: '30s', seconds: 30 }],
        words_per_minute: 150,
      }),
    });
  });

  console.log('\n--- NAVIGATING TO VOICE STEP ---');
  await page.goto(BASE_URL);
  await page.waitForLoadState('networkidle');

  // Go to Photo step -> mock upload photo -> go to Voice step
  await page.click('text="Upload Photo & Voice"');
  await page.waitForTimeout(300);

  const fileInput = await page.$('input[type="file"]');
  if (fileInput) {
    await fileInput.setInputFiles({
      name: 'portrait.png',
      mimeType: 'image/png',
      buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'),
    });
    await page.waitForTimeout(800);
  }

  await page.click('text="Continue to Voice"');
  await page.waitForTimeout(400);

  // 1. Switch to "Record now" mode
  console.log('1. Switching to "Record now" mode...');
  await page.click('text="Record now"');
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'rec_01_record_now_idle.png'), fullPage: true });

  // 2. Start Live Recording
  console.log('2. Clicking "Start Recording"...');
  await page.click('text="Start Recording"');
  await page.waitForTimeout(1000);

  // Take screenshot while recording is active (checking REC timer and live level meter)
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'rec_02_recording_active.png'), fullPage: true });
  console.log('   Recording in progress (waiting 4 seconds to exceed 3s minimum limit)...');
  await page.waitForTimeout(3500);

  // 3. Stop Recording
  console.log('3. Clicking "Stop Recording"...');
  await page.click('text="Stop Recording"');
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'rec_03_recorded_ready.png'), fullPage: true });

  // Check if recording length captured message is visible
  const recordedTextVisible = await page.isVisible('text="Recording captured!"');
  console.log(`   Captured recording prompt visible: ${recordedTextVisible}`);

  // 4. Test "Re-record"
  console.log('4. Testing "Re-record" button...');
  await page.click('text="Re-record"');
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'rec_04_rerecord_reset.png'), fullPage: true });

  // 5. Record again and click "Use this recording"
  console.log('5. Recording again for 4 seconds...');
  await page.click('text="Start Recording"');
  await page.waitForTimeout(4000);
  await page.click('text="Stop Recording"');
  await page.waitForTimeout(500);

  console.log('6. Clicking "Use this recording"...');
  await page.click('text="Use this recording"');
  await page.waitForTimeout(1000);

  // Screenshot waveform preview player
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'rec_05_waveform_player_unlocked.png'), fullPage: true });

  // Check waveform player elements and playback state
  const isWaveformVisible = await page.isVisible('text="Voice sample locked in!"') || await page.isVisible('text="recorded_voice"');
  console.log(`   Waveform preview player locked in: ${isWaveformVisible}`);

  await browser.close();
  server.kill();

  console.log('\n========================================');
  console.log('RECORDING FLOW AUDIT RESULTS:');
  console.log(`- Upload Request Intercepted: ${uploadRequestCaptured}`);
  console.log(`- Valid RIFF/WAVE Header Detected: ${isWavHeaderValid}`);
  console.log(`  Header Bytes: "${headerRiffText}" ... "${headerWaveText}"`);
  console.log(`- Waveform Preview Displayed: ${isWaveformVisible}`);
  console.log('========================================\n');

  if (!uploadRequestCaptured) {
    throw new Error('POST /v1/assets/upload request was not triggered!');
  }
  if (!isWavHeaderValid) {
    throw new Error(`Invalid audio payload header! Expected RIFF/WAVE, got "${headerRiffText}"/"${headerWaveText}"`);
  }

  console.log('✓ ALL RECORDING FLOW CHECKS & WAV BINARY VERIFICATIONS PASSED SUCCESSFULLY!');
}

runRecordingTest().catch((err) => {
  console.error('Recording test failed:', err);
  process.exit(1);
});
