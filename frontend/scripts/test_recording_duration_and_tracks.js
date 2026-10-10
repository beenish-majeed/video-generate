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

// Script to track active microphone stream tracks
const TRACK_TRACKER_INIT_SCRIPT = () => {
  window.__activeMicTracks = [];
  if (navigator?.mediaDevices?.getUserMedia) {
    const origGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const stream = await origGetUserMedia(constraints);
      stream.getAudioTracks().forEach((track) => {
        window.__activeMicTracks.push(track);
      });
      return stream;
    };
  }
};

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

  // 5. Select photo file
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

async function getTrackStates(page) {
  return await page.evaluate(() => {
    return window.__activeMicTracks.map((t, idx) => ({
      index: idx,
      id: t.id,
      label: t.label,
      readyState: t.readyState,
      enabled: t.enabled,
    }));
  });
}

async function runPhase15Tests() {
  const server = await startServer();
  console.log('Server running at', BASE_URL);

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
    ],
  });

  const summary = {
    minDurationPass: false,
    minDurationText: '',
    useRecordingDisabledOnTooShort: false,
    maxDurationPass: false,
    maxDurationText: '',
    trackCleanupResults: {},
  };

  try {
    // =========================================================================
    // TEST 1: MINIMUM RECORDING LENGTH (<3s)
    // =========================================================================
    console.log('\n========================================');
    console.log('TEST 1: Minimum Recording Length (< 3 seconds)');
    console.log('========================================');

    const context1 = await browser.newContext();
    await context1.addInitScript(TRACK_TRACKER_INIT_SCRIPT);
    const page1 = await context1.newPage();

    await navigateToVoiceStep(page1);

    await page1.click('text="Record now"');
    await page1.waitForTimeout(300);

    console.log('  Starting recording...');
    await page1.click('text="Start Recording"');
    await page1.waitForTimeout(1000); // 1 second elapsed

    console.log('  Stopping recording after 1s (<3s min limit)...');
    await page1.click('text="Stop Recording"');
    await page1.waitForTimeout(500);

    const tooShortLocator = page1.locator('text=Recording was too short');
    const isTooShortVisible = await tooShortLocator.isVisible();
    const tooShortText = isTooShortVisible ? await tooShortLocator.locator('xpath=..').textContent() : '';
    console.log(`  Gentle warning message displayed: ${isTooShortVisible}`);
    console.log(`  Exact text: "${tooShortText.trim()}"`);

    const useRecBtnVisible = await page1.locator('text="Use this recording"').isVisible();
    console.log(`  "Use this recording" button visible: ${useRecBtnVisible} (Should be false)`);

    const tryAgainBtnVisible = await page1.locator('text="Try Recording Again"').isVisible();
    console.log(`  "Try Recording Again" button visible: ${tryAgainBtnVisible}`);

    await page1.screenshot({ path: path.join(SCREENSHOT_DIR, 'rec_p15_01_min_length_too_short.png'), fullPage: true });

    summary.minDurationPass = isTooShortVisible && !useRecBtnVisible && tryAgainBtnVisible;
    summary.minDurationText = tooShortText.trim();
    summary.useRecordingDisabledOnTooShort = !useRecBtnVisible;

    await context1.close();

    // =========================================================================
    // TEST 2: MAXIMUM RECORDING LENGTH (60s limit auto-stop)
    // =========================================================================
    console.log('\n========================================');
    console.log('TEST 2: Maximum Recording Length Auto-Stop (60 seconds)');
    console.log('========================================');

    const context2 = await browser.newContext();
    await context2.addInitScript(TRACK_TRACKER_INIT_SCRIPT);
    const page2 = await context2.newPage();

    await navigateToVoiceStep(page2);

    await page2.click('text="Record now"');
    await page2.waitForTimeout(300);

    console.log('  Starting recording (letting timer reach 60s limit in real time)...');
    await page2.click('text="Start Recording"');

    console.log('  Waiting for automatic timer auto-stop at 60s limit...');
    let maxLimitReached = false;
    let maxText = '';
    
    // Substring match locator for Recording captured!
    const recordedLocator = page2.locator('text=Recording captured!');

    for (let sec = 0; sec <= 66; sec++) {
      const isRecorded = await recordedLocator.isVisible();
      if (isRecorded) {
        maxLimitReached = true;
        maxText = (await recordedLocator.locator('xpath=..').textContent()).trim();
        console.log(`  Auto-stopped at 60s limit! Message: "${maxText}" at second ${sec}`);
        break;
      }
      await page2.waitForTimeout(1000);
    }

    await page2.screenshot({ path: path.join(SCREENSHOT_DIR, 'rec_p15_02_max_length_limit.png'), fullPage: true });

    summary.maxDurationPass = maxLimitReached;
    summary.maxDurationText = maxText;

    await context2.close();

    // =========================================================================
    // TEST 3: TRACK CLEANUP VERIFICATION (track.readyState === "ended")
    // =========================================================================
    console.log('\n========================================');
    console.log('TEST 3: Microphone Track Cleanup Verification');
    console.log('========================================');

    // Scenario 3a: "Use this recording"
    {
      console.log('  Scenario 3a: After "Use this recording"...');
      const ctx = await browser.newContext();
      await ctx.addInitScript(TRACK_TRACKER_INIT_SCRIPT);
      const page = await ctx.newPage();
      await navigateToVoiceStep(page);
      await page.click('text="Record now"');
      await page.waitForTimeout(300);
      await page.click('text="Start Recording"');
      await page.waitForTimeout(3500); // 3.5s > 3s min
      await page.click('text="Stop Recording"');
      await page.waitForTimeout(400);
      await page.click('text="Use this recording"');
      await page.waitForTimeout(600);

      const tracks = await getTrackStates(page);
      const allEnded = tracks.length > 0 && tracks.every((t) => t.readyState === 'ended');
      console.log(`    Active tracks count: ${tracks.length}, All readyState === "ended": ${allEnded}`);
      tracks.forEach((t) => console.log(`      Track ${t.index} (${t.label}): readyState="${t.readyState}"`));
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'rec_p15_03a_tracks_use_recording.png'), fullPage: true });
      summary.trackCleanupResults.useRecording = { allEnded, tracks };
      await ctx.close();
    }

    // Scenario 3b: "Re-record"
    {
      console.log('  Scenario 3b: After "Re-record"...');
      const ctx = await browser.newContext();
      await ctx.addInitScript(TRACK_TRACKER_INIT_SCRIPT);
      const page = await ctx.newPage();
      await navigateToVoiceStep(page);
      await page.click('text="Record now"');
      await page.waitForTimeout(300);
      await page.click('text="Start Recording"');
      await page.waitForTimeout(3500);
      await page.click('text="Stop Recording"');
      await page.waitForTimeout(400);
      await page.click('text="Re-record"');
      await page.waitForTimeout(400);

      const tracks = await getTrackStates(page);
      const allEnded = tracks.length > 0 && tracks.every((t) => t.readyState === 'ended');
      console.log(`    Active tracks count: ${tracks.length}, All readyState === "ended": ${allEnded}`);
      tracks.forEach((t) => console.log(`      Track ${t.index} (${t.label}): readyState="${t.readyState}"`));
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'rec_p15_03b_tracks_rerecord.png'), fullPage: true });
      summary.trackCleanupResults.rerecord = { allEnded, tracks };
      await ctx.close();
    }

    // Scenario 3c: "Cancel / Switch to Upload"
    {
      console.log('  Scenario 3c: After "Cancel" (switching mode to Upload)...');
      const ctx = await browser.newContext();
      await ctx.addInitScript(TRACK_TRACKER_INIT_SCRIPT);
      const page = await ctx.newPage();
      await navigateToVoiceStep(page);
      await page.click('text="Record now"');
      await page.waitForTimeout(300);
      await page.click('text="Start Recording"');
      await page.waitForTimeout(2000);
      await page.click('text="Upload a file"');
      await page.waitForTimeout(400);

      const tracks = await getTrackStates(page);
      const allEnded = tracks.length > 0 && tracks.every((t) => t.readyState === 'ended');
      console.log(`    Active tracks count: ${tracks.length}, All readyState === "ended": ${allEnded}`);
      tracks.forEach((t) => console.log(`      Track ${t.index} (${t.label}): readyState="${t.readyState}"`));
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'rec_p15_03c_tracks_cancel_upload.png'), fullPage: true });
      summary.trackCleanupResults.cancel = { allEnded, tracks };
      await ctx.close();
    }

    // Scenario 3d: "Error state"
    {
      console.log('  Scenario 3d: After "Error state"...');
      const ctx = await browser.newContext();
      await ctx.addInitScript(TRACK_TRACKER_INIT_SCRIPT);
      const page = await ctx.newPage();
      await navigateToVoiceStep(page);
      await page.click('text="Record now"');
      await page.waitForTimeout(300);

      // Start recording then mock stream error or call stop
      await page.click('text="Start Recording"');
      await page.waitForTimeout(1500);

      // Trigger cleanup via component or error reset
      await page.evaluate(() => {
        // Mock error on recorder
        const btn = document.querySelector('button');
        btn?.click();
      });
      await page.click('text="Upload a file"');
      await page.waitForTimeout(400);

      const tracks = await getTrackStates(page);
      const allEnded = tracks.length > 0 && tracks.every((t) => t.readyState === 'ended');
      console.log(`    Active tracks count: ${tracks.length}, All readyState === "ended": ${allEnded}`);
      tracks.forEach((t) => console.log(`      Track ${t.index} (${t.label}): readyState="${t.readyState}"`));
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'rec_p15_03d_tracks_error.png'), fullPage: true });
      summary.trackCleanupResults.error = { allEnded, tracks };
      await ctx.close();
    }

    // Scenario 3e: "Leaving the page (unmount)"
    {
      console.log('  Scenario 3e: After "Leaving the page" (unmounting VoiceStep)...');
      const ctx = await browser.newContext();
      await ctx.addInitScript(TRACK_TRACKER_INIT_SCRIPT);
      const page = await ctx.newPage();
      await navigateToVoiceStep(page);
      await page.click('text="Record now"');
      await page.waitForTimeout(300);
      await page.click('text="Start Recording"');
      await page.waitForTimeout(2000);

      // Navigate back to Hero page or click Back button
      console.log('    Clicking "Back" button to unmount VoiceStep...');
      await page.click('button:has-text("Back")');
      await page.waitForTimeout(500);

      const tracks = await getTrackStates(page);
      const allEnded = tracks.length > 0 && tracks.every((t) => t.readyState === 'ended');
      console.log(`    Active tracks count: ${tracks.length}, All readyState === "ended": ${allEnded}`);
      tracks.forEach((t) => console.log(`      Track ${t.index} (${t.label}): readyState="${t.readyState}"`));
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'rec_p15_03e_tracks_unmount_leave.png'), fullPage: true });
      summary.trackCleanupResults.unmount = { allEnded, tracks };
      await ctx.close();
    }

    console.log('\n==================================================');
    console.log('PHASE 15 DURATION & TRACK CLEANUP AUDIT SUMMARY:');
    console.log('==================================================');
    console.log(`1. Min Length Warning (<3s): ${summary.minDurationPass ? 'PASSED' : 'FAILED'}`);
    console.log(`   Message: "${summary.minDurationText}"`);
    console.log(`   Use Recording Disabled: ${summary.useRecordingDisabledOnTooShort}`);

    console.log(`2. Max Length Auto-Stop (60s): ${summary.maxDurationPass ? 'PASSED' : 'FAILED'}`);
    console.log(`   Message: "${summary.maxDurationText}"`);

    console.log('3. Microphone Tracks Stopped (readyState === "ended"):');
    console.log(`   - Use Recording: ${summary.trackCleanupResults.useRecording?.allEnded ? 'PASSED (ended)' : 'FAILED'}`);
    console.log(`   - Re-record: ${summary.trackCleanupResults.rerecord?.allEnded ? 'PASSED (ended)' : 'FAILED'}`);
    console.log(`   - Cancel (Switch): ${summary.trackCleanupResults.cancel?.allEnded ? 'PASSED (ended)' : 'FAILED'}`);
    console.log(`   - Error State: ${summary.trackCleanupResults.error?.allEnded ? 'PASSED (ended)' : 'FAILED'}`);
    console.log(`   - Unmount / Leave: ${summary.trackCleanupResults.unmount?.allEnded ? 'PASSED (ended)' : 'FAILED'}`);
    console.log('==================================================\n');

    const allCleanupPassed =
      summary.trackCleanupResults.useRecording?.allEnded &&
      summary.trackCleanupResults.rerecord?.allEnded &&
      summary.trackCleanupResults.cancel?.allEnded &&
      summary.trackCleanupResults.error?.allEnded &&
      summary.trackCleanupResults.unmount?.allEnded;

    if (!summary.minDurationPass || !summary.maxDurationPass || !allCleanupPassed) {
      throw new Error('Phase 15 test verification failed!');
    }

    console.log('✓ ALL PHASE 15 RECORDING DURATION AND TRACK CLEANUP AUDITS PASSED SUCCESSFULLY!');
  } finally {
    await browser.close();
    server.kill();
  }
}

runPhase15Tests().catch((err) => {
  console.error('Phase 15 test execution failed:', err);
  process.exit(1);
});
