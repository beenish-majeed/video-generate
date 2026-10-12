import { chromium } from 'playwright';
import { spawn } from 'child_process';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SERVER_PORT = 4173;
const BASE_URL = `http://127.0.0.1:${SERVER_PORT}`;
const AXE_PATH = path.join(__dirname, '..', 'node_modules', 'axe-core', 'axe.min.js');

function checkServerResponding() {
  return new Promise((resolve) => {
    const req = http.get(BASE_URL, (res) => {
      resolve(res.statusCode < 500);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1000, () => {
      req.abort();
      resolve(false);
    });
  });
}

async function startServer() {
  const alreadyUp = await checkServerResponding();
  if (alreadyUp) {
    console.log(`Preview server already responding at ${BASE_URL}`);
    return null;
  }

  console.log('Starting Vite preview server on 127.0.0.1:4173...');
  const server = spawn(
    'npm.cmd',
    ['run', 'preview', '--', '--host', '127.0.0.1', '--port', String(SERVER_PORT)],
    {
      cwd: path.join(__dirname, '..'),
      shell: true,
      stdio: 'pipe',
    }
  );

  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 500));
    const up = await checkServerResponding();
    if (up) {
      console.log(`Preview server started and responding at ${BASE_URL}`);
      return server;
    }
  }

  return server;
}

const VALID_75_WORD_SCRIPT =
  'The morning mist softly rose above the quiet mountain lake as dawn painted the horizon with gentle strokes of amber and rose. Ancient pine trees stood like silent guardians along the winding rocky trail, whispering secrets of centuries past to the passing cool breeze. Every step revealed another forgotten story etched deep into the wild untamed earth, reminding us of timeless memories that linger in our hearts forever and always through every passing golden season.';

// Contrast helper functions
function sRGBtoLin(c) {
  c = c / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function lum(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 0.2126 * sRGBtoLin(r) + 0.7152 * sRGBtoLin(g) + 0.0722 * sRGBtoLin(b);
}
function contrastRatio(h1, h2) {
  const l1 = lum(h1);
  const l2 = lum(h2);
  const max = Math.max(l1, l2);
  const min = Math.min(l1, l2);
  return (max + 0.05) / (min + 0.05);
}

async function runAxe(page, stepName) {
  await page.addScriptTag({ path: AXE_PATH });
  const results = await page.evaluate(async () => {
    // @ts-ignore
    return await axe.run(document, {
      runOnly: {
        type: 'tag',
        values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'],
      },
    });
  });

  const totalRules = results.passes.length + results.violations.length;
  const score = totalRules > 0 ? Math.round((results.passes.length / totalRules) * 100) : 100;

  return {
    step: stepName,
    score,
    violationsCount: results.violations.length,
    passesCount: results.passes.length,
    violations: results.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      description: v.description,
      help: v.help,
      nodesCount: v.nodes.length,
      targets: v.nodes.map((n) => n.target.join(' ')),
      htmlSnippets: v.nodes.map((n) => n.html.slice(0, 120)),
    })),
  };
}

async function main() {
  const server = await startServer();
  const browser = await chromium.launch({
    headless: true,
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  });

  console.log('\n======================================================');
  console.log('PHASE 23 AUDIT: ACCESSIBILITY, KEYBOARD, MOTION & CONTRAST');
  console.log('======================================================\n');

  // =========================================================================
  // 1. AXE-CORE ACCESSIBILITY AUDIT ACROSS ALL STEPS
  // =========================================================================
  console.log('--- SECTION 1: RUNNING AXE-CORE AUDIT ON EVERY STEP ---');
  const axeContext = await browser.newContext({ permissions: ['microphone'] });
  const axePage = await axeContext.newPage();

  // Mock API endpoints
  await axePage.route('**/*/v1/durations', (route) => {
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

  await axePage.route('**/*/v1/assets/upload', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ asset_id: 'sample-asset-123' }),
    });
  });

  await axePage.route('**/*/v1/jobs', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ job_id: 'job-axe-audit-123', state: 'PENDING' }),
    });
  });

  let pollCallCount = 0;
  await axePage.route('**/*/v1/jobs/job-axe-audit-123', (route) => {
    pollCallCount++;
    if (pollCallCount >= 3) {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          job_id: 'job-axe-audit-123',
          state: 'COMPLETED',
          progress: 100,
          current_stage: 'Final Film Ready',
          video_url: '/mock/final.mp4',
        }),
      });
    } else {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          job_id: 'job-axe-audit-123',
          state: 'PROCESSING',
          progress: 50,
          current_stage: 'Synthesizing voice narrative...',
        }),
      });
    }
  });

  const axeReports = [];

  // 1.1 Welcome Page (Hero)
  await axePage.goto(BASE_URL);
  await axePage.evaluate(() => localStorage.clear()).catch(() => {});
  await axePage.reload();
  await axePage.waitForLoadState('networkidle');
  console.log('Testing Axe on: Welcome Page (HeroStep)...');
  axeReports.push(await runAxe(axePage, 'Welcome Page (HeroStep)'));

  // 1.2 Path 1: PhotoStep
  await axePage.click('text="Upload Photo & Voice"');
  await axePage.waitForTimeout(300);
  console.log('Testing Axe on: PhotoStep (Empty Dropzone)...');
  axeReports.push(await runAxe(axePage, 'PhotoStep (Empty)'));

  // Upload Photo
  const photoInput = await axePage.$('input[type="file"]');
  if (photoInput) {
    await photoInput.setInputFiles({
      name: 'portrait.png',
      mimeType: 'image/png',
      buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'),
    });
  }
  await axePage.waitForTimeout(400);
  console.log('Testing Axe on: PhotoStep (Uploaded Polaroid State)...');
  axeReports.push(await runAxe(axePage, 'PhotoStep (Uploaded)'));

  // 1.3 Path 1: VoiceStep (Upload Mode)
  await axePage.click('button:has-text("Continue to Voice")');
  await axePage.waitForTimeout(700);
  console.log('Testing Axe on: VoiceStep (Upload Mode)...');
  axeReports.push(await runAxe(axePage, 'VoiceStep (Upload Mode)'));

  // Switch to Record Mode
  await axePage.click('text="Record now"');
  await axePage.waitForTimeout(300);
  console.log('Testing Axe on: VoiceStep (Live Record Idle)...');
  axeReports.push(await runAxe(axePage, 'VoiceStep (Record Mode Idle)'));

  // Start Live Recording
  await axePage.click('text="Start Recording"');
  await axePage.waitForTimeout(1000);
  console.log('Testing Axe on: VoiceStep (Active Recording State)...');
  axeReports.push(await runAxe(axePage, 'VoiceStep (Actively Recording)'));

  await axePage.waitForTimeout(2500); // 3.5s total
  await axePage.click('text="Stop Recording"');
  await axePage.waitForTimeout(400);
  console.log('Testing Axe on: VoiceStep (Recorded Clip Review)...');
  axeReports.push(await runAxe(axePage, 'VoiceStep (Recorded State)'));

  // Use this recording
  await axePage.click('text="Use this recording"');
  await axePage.waitForTimeout(600);
  await axePage.click('button:has-text("Continue to Duration")');
  await axePage.waitForTimeout(400);

  // 1.4 DurationStep
  console.log('Testing Axe on: DurationStep...');
  axeReports.push(await runAxe(axePage, 'DurationStep'));

  // 1.5 ScriptStep
  await axePage.click('button:has-text("Continue to Script")');
  await axePage.waitForTimeout(700);
  console.log('Testing Axe on: ScriptStep (Empty Textarea)...');
  axeReports.push(await runAxe(axePage, 'ScriptStep (Empty)'));

  const textarea = axePage.locator('textarea');
  await textarea.fill(VALID_75_WORD_SCRIPT);
  await axePage.waitForTimeout(300);
  console.log('Testing Axe on: ScriptStep (Valid Script Filled)...');
  axeReports.push(await runAxe(axePage, 'ScriptStep (Filled)'));

  // 1.6 ConsentStep
  await axePage.click('button:has-text("Continue to Rights")');
  await axePage.waitForTimeout(700);
  console.log('Testing Axe on: ConsentStep...');
  axeReports.push(await runAxe(axePage, 'ConsentStep'));

  // Check consents and submit
  const checkboxes = axePage.locator('input[type="checkbox"]');
  const count = await checkboxes.count();
  for (let i = 0; i < count; i++) {
    await checkboxes.nth(i).check();
  }
  await axePage.waitForTimeout(300);
  await axePage.click('button:has-text("Create My Memory Film")');
  await axePage.waitForSelector('text=Rendering your memory film', { timeout: 10000 });
  await axePage.waitForTimeout(700);

  // 1.7 WaitingStep
  console.log('Testing Axe on: WaitingStep (Active Processing)...');
  axeReports.push(await runAxe(axePage, 'WaitingStep (Processing)'));

  // 1.8 PremiereStep
  await axePage.waitForSelector('text=Your film is ready!', { timeout: 15000 });
  await axePage.waitForTimeout(400);
  console.log('Testing Axe on: PremiereStep (Completed Film)...');
  axeReports.push(await runAxe(axePage, 'PremiereStep'));

  // 1.9 FailedStep (Test by restarting and receiving a failed job)
  console.log('Testing Axe on: FailedStep (Error Recovery State)...');
  await axePage.click('button:has-text("Make another video")');
  await axePage.waitForTimeout(400);

  // Switch to failing job mock
  await axePage.route('**/*/v1/jobs', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ job_id: 'job-failed-audit', state: 'PENDING' }),
    });
  });
  await axePage.route('**/*/v1/jobs/job-failed-audit', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        job_id: 'job-failed-audit',
        state: 'FAILED',
        error: 'Unable to synthesize speech. Please try with a slightly longer recording.',
      }),
    });
  });

  await axePage.click('text="Start with Prompt"');
  await axePage.waitForTimeout(300);
  await axePage.click('button:has-text("Continue to Script")');
  await axePage.waitForTimeout(300);
  await axePage.locator('textarea').fill(VALID_75_WORD_SCRIPT);
  await axePage.click('button:has-text("Continue to Rights")');
  await axePage.waitForTimeout(300);
  const cb = axePage.locator('input[type="checkbox"]');
  const cbCount = await cb.count();
  for (let i = 0; i < cbCount; i++) await cb.nth(i).check();
  await axePage.click('button:has-text("Create My Memory Film")');
  await axePage.waitForSelector('text=Ah, a gentle bump along the creative path...', { timeout: 10000 });
  await axePage.waitForTimeout(400);
  axeReports.push(await runAxe(axePage, 'FailedStep (Error State)'));

  await axeContext.close();

  console.log('\n======================================================');
  console.log('AXE-CORE ACCESSIBILITY RESULTS TABLE:');
  console.log('======================================================');
  console.log('| Step Name | Axe Score | Passed Rules | Violations | Issues |');
  console.log('|---|:---:|:---:|:---:|---|');
  axeReports.forEach((r) => {
    const issueSummary =
      r.violations.length === 0
        ? 'None (Clean)'
        : r.violations.map((v) => `${v.id} (${v.impact}) x${v.nodesCount}`).join('; ');
    console.log(`| ${r.step} | ${r.score}% | ${r.passesCount} | ${r.violationsCount} | ${issueSummary} |`);
  });

  const allViolations = axeReports.flatMap((r) => r.violations.map((v) => ({ step: r.step, ...v })));
  if (allViolations.length > 0) {
    console.log('\nDETAILED VIOLATION LIST:');
    allViolations.forEach((v, idx) => {
      console.log(`\n[#${idx + 1}] Step: ${v.step} | Rule: ${v.id} | Impact: ${v.impact}`);
      console.log(`     Help: ${v.help}`);
      console.log(`     Description: ${v.description}`);
      console.log(`     Targets: ${v.targets.join(', ')}`);
      console.log(`     HTML: ${v.htmlSnippets[0] || ''}`);
    });
  }

  // =========================================================================
  // 2. KEYBOARD-ONLY NAVIGATION RUN (NO MOUSE CLICKS)
  // =========================================================================
  console.log('\n======================================================');
  console.log('--- SECTION 2: KEYBOARD-ONLY RUN THROUGH BOTH PATHS ---');
  console.log('======================================================\n');

  const kbContext = await browser.newContext({ permissions: ['microphone'] });
  const kbPage = await kbContext.newPage();

  // Setup mock routes for keyboard run
  await kbPage.route('**/*/v1/durations', (route) => {
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

  await kbPage.route('**/*/v1/assets/upload', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ asset_id: 'kb-asset-123' }),
    });
  });

  await kbPage.route('**/*/v1/jobs', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ job_id: 'job-kb-123', state: 'PENDING' }),
    });
  });

  let kbPollCount = 0;
  await kbPage.route('**/*/v1/jobs/job-kb-123', (route) => {
    kbPollCount++;
    if (kbPollCount >= 2) {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          job_id: 'job-kb-123',
          state: 'COMPLETED',
          progress: 100,
          current_stage: 'Ready',
          video_url: '/mock/kb.mp4',
        }),
      });
    } else {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          job_id: 'job-kb-123',
          state: 'PROCESSING',
          progress: 50,
          current_stage: 'Rendering...',
        }),
      });
    }
  });

  const kbLog = [];
  const recordKbAction = async (actionDesc) => {
    const activeInfo = await kbPage.evaluate(() => {
      const el = document.activeElement;
      if (!el) return 'None';
      const tag = el.tagName.toLowerCase();
      const text = el.textContent?.trim().slice(0, 30) || '';
      const role = el.getAttribute('role') || '';
      const ariaLabel = el.getAttribute('aria-label') || '';
      const id = el.id ? `#${el.id}` : '';
      return `<${tag}${id}> role="${role}" label="${ariaLabel}" text="${text}"`;
    });
    kbLog.push({ action: actionDesc, activeElement: activeInfo });
  };

  // Helper to tab until a predicate or timeout
  const tabUntil = async (predicateText, maxTabs = 20) => {
    for (let i = 0; i < maxTabs; i++) {
      await kbPage.keyboard.press('Tab');
      await kbPage.waitForTimeout(100);
      const text = await kbPage.evaluate(() => document.activeElement?.textContent?.trim() || '');
      const aria = await kbPage.evaluate(() => document.activeElement?.getAttribute('aria-label') || '');
      if (text.includes(predicateText) || aria.includes(predicateText)) {
        await recordKbAction(`Focused on "${predicateText}" after ${i + 1} Tab(s)`);
        return true;
      }
    }
    await recordKbAction(`FAILED to focus on "${predicateText}" within ${maxTabs} Tabs`);
    return false;
  };

  console.log('Starting Keyboard Path 1 (custom_media)...');
  await kbPage.goto(BASE_URL);
  await kbPage.evaluate(() => localStorage.clear()).catch(() => {});
  await kbPage.reload();
  await kbPage.waitForLoadState('networkidle');

  // Step 0: Welcome page -> Tab to "Upload Photo & Voice"
  const focusedUploadCard = await tabUntil('Upload Photo & Voice');
  if (focusedUploadCard) {
    await kbPage.keyboard.press('Enter');
    await kbPage.waitForTimeout(400);
  }

  // Step 1: PhotoStep
  // Tab to dropzone and activate file upload via keyboard
  const focusedDropzone = await tabUntil('Upload portrait photo dropzone');
  console.log('  - Photo Dropzone focused via keyboard:', focusedDropzone);
  // Upload photo file
  const kbPhotoInput = await kbPage.$('input[type="file"]');
  if (kbPhotoInput) {
    await kbPhotoInput.setInputFiles({
      name: 'portrait.png',
      mimeType: 'image/png',
      buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'),
    });
  }
  await kbPage.waitForTimeout(400);

  // Tab to "Continue to Voice"
  const focusedContVoice = await tabUntil('Continue to Voice');
  console.log('  - Continue to Voice focused via keyboard:', focusedContVoice);
  await kbPage.keyboard.press('Enter');
  await kbPage.waitForTimeout(400);

  // Step 2: VoiceStep (Recording Controls via Keyboard)
  console.log('  - Testing Voice Recording controls via keyboard:');
  const focusedRecordTab = await tabUntil('Record now');
  console.log('    * Tabbed to "Record now":', focusedRecordTab);
  await kbPage.keyboard.press('Enter');
  await kbPage.waitForTimeout(400);

  const focusedStartRec = await tabUntil('Start Recording');
  console.log('    * Tabbed to "Start Recording":', focusedStartRec);
  await kbPage.keyboard.press('Space'); // Spacebar activates button
  await kbPage.waitForTimeout(3500); // Record for 3.5s

  const focusedStopRec = await tabUntil('Stop Recording');
  console.log('    * Tabbed to "Stop Recording":', focusedStopRec);
  await kbPage.keyboard.press('Space'); // Spacebar stops recording
  await kbPage.waitForTimeout(500);

  const focusedUseRec = await tabUntil('Use this recording');
  console.log('    * Tabbed to "Use this recording":', focusedUseRec);
  await kbPage.keyboard.press('Enter');
  await kbPage.waitForTimeout(600);

  const focusedContDur = await tabUntil('Continue to Duration');
  console.log('    * Tabbed to "Continue to Duration":', focusedContDur);
  await kbPage.keyboard.press('Enter');
  await kbPage.waitForTimeout(400);

  // Step 3: DurationStep
  console.log('  - Testing Duration selection via keyboard:');
  const focusedContScript = await tabUntil('Continue to Script');
  console.log('    * Tabbed to "Continue to Script":', focusedContScript);
  await kbPage.keyboard.press('Enter');
  await kbPage.waitForTimeout(400);

  // Step 4: ScriptStep
  console.log('  - Testing Script input via keyboard:');
  // Tab into textarea
  let foundTextarea = false;
  for (let i = 0; i < 15; i++) {
    await kbPage.keyboard.press('Tab');
    const isTextarea = await kbPage.evaluate(() => document.activeElement?.tagName === 'TEXTAREA');
    if (isTextarea) {
      foundTextarea = true;
      break;
    }
  }
  console.log('    * Tabbed into script <textarea>:', foundTextarea);
  if (foundTextarea) {
    await kbPage.keyboard.press('Control+a');
    await kbPage.keyboard.press('Backspace');
    await kbPage.keyboard.type(VALID_75_WORD_SCRIPT, { delay: 1 });
    await kbPage.waitForTimeout(300);
  }

  const focusedContRights = await tabUntil('Continue to Rights');
  console.log('    * Tabbed to "Continue to Rights":', focusedContRights);
  await kbPage.keyboard.press('Enter');
  await kbPage.waitForTimeout(400);

  // Step 5: ConsentStep
  console.log('  - Testing Consent checkboxes via keyboard:');
  const checkboxIds = ['face-rights-checkbox', 'voice-rights-checkbox', 'authorized-checkbox'];
  for (const id of checkboxIds) {
    let checked = false;
    for (let t = 0; t < 25; t++) {
      await kbPage.keyboard.press('Tab');
      const activeId = await kbPage.evaluate(() => document.activeElement?.id);
      if (activeId === id) {
        await kbPage.keyboard.press('Space'); // Toggle checkbox
        checked = true;
        console.log(`    * Checked #${id} with Space`);
        await kbPage.waitForTimeout(100);
        break;
      }
    }
    if (!checked) {
      console.warn(`    ! Warning: could not focus #${id} within 25 tabs`);
    }
  }

  const focusedSubmitFilm = await tabUntil('Create My Memory Film', 25);
  console.log('    * Tabbed to "Create My Memory Film":', focusedSubmitFilm);
  await kbPage.keyboard.press('Enter');
  await kbPage.waitForTimeout(500);

  // Step 6: Waiting Room -> Wait for Premiere
  await kbPage.waitForSelector('text=Your film is ready!', { timeout: 15000 });
  await kbPage.waitForTimeout(400);

  // Step 7: Premiere -> Tab to "Make another video"
  const focusedRestart = await tabUntil('Make another video');
  console.log('    * Tabbed to "Make another video" on Premiere:', focusedRestart);
  await kbPage.keyboard.press('Enter');
  await kbPage.waitForTimeout(500);

  // =========================================================================
  // Keyboard Path 2 (prompt_first)
  // =========================================================================
  console.log('\nStarting Keyboard Path 2 (prompt_first)...');
  await kbPage.waitForSelector('text="Start with Prompt"', { timeout: 5000 });
  const focusedStartPrompt = await tabUntil('Start with Prompt');
  console.log('  - Tabbed to "Start with Prompt":', focusedStartPrompt);
  await kbPage.keyboard.press('Enter');
  await kbPage.waitForTimeout(400);

  // Duration
  const focusedContScript2 = await tabUntil('Continue to Script');
  await kbPage.keyboard.press('Enter');
  await kbPage.waitForTimeout(400);

  // Script
  for (let i = 0; i < 15; i++) {
    await kbPage.keyboard.press('Tab');
    const isTextarea = await kbPage.evaluate(() => document.activeElement?.tagName === 'TEXTAREA');
    if (isTextarea) break;
  }
  await kbPage.keyboard.press('Control+a');
  await kbPage.keyboard.press('Backspace');
  await kbPage.keyboard.type(VALID_75_WORD_SCRIPT, { delay: 1 });
  await kbPage.waitForTimeout(300);

  const focusedContRights2 = await tabUntil('Continue to Rights');
  await kbPage.keyboard.press('Enter');
  await kbPage.waitForTimeout(400);

  // Consent
  for (const id of checkboxIds) {
    let checked = false;
    for (let t = 0; t < 25; t++) {
      await kbPage.keyboard.press('Tab');
      const activeId = await kbPage.evaluate(() => document.activeElement?.id);
      if (activeId === id) {
        await kbPage.keyboard.press('Space');
        checked = true;
        console.log(`    * (Path 2) Checked #${id} with Space`);
        await kbPage.waitForTimeout(100);
        break;
      }
    }
    if (!checked) {
      console.warn(`    ! Warning: (Path 2) could not focus #${id} within 25 tabs`);
    }
  }

  const focusedSubmitFilm2 = await tabUntil('Create My Memory Film', 25);
  console.log('    * (Path 2) Tabbed to "Create My Memory Film":', focusedSubmitFilm2);
  await kbPage.keyboard.press('Enter');
  await kbPage.waitForTimeout(500);

  await kbPage.waitForSelector('text=Your film is ready!', { timeout: 15000 });
  const focusedRestart2 = await tabUntil('Make another video');
  console.log('  - Path 2 reached Premiere and tabbed to "Make another video":', focusedRestart2);

  await kbContext.close();

  // =========================================================================
  // 3. PREFERS-REDUCED-MOTION ON AND OFF
  // =========================================================================
  console.log('\n======================================================');
  console.log('--- SECTION 3: CHECKING PREFERS-REDUCED-MOTION ---');
  console.log('======================================================\n');

  // Test 3.1: with reducedMotion: 'no-preference'
  const motionNormalCtx = await browser.newContext({ reducedMotion: 'no-preference' });
  const motionNormalPage = await motionNormalCtx.newPage();
  await motionNormalPage.goto(BASE_URL);
  await motionNormalPage.waitForLoadState('networkidle');

  const normalMotionMatch = await motionNormalPage.evaluate(() => {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });
  console.log('Reduced Motion (no-preference) matchMedia matches:', normalMotionMatch, '(Expected: false)');

  // Test 3.2: with reducedMotion: 'reduce'
  const motionReducedCtx = await browser.newContext({ reducedMotion: 'reduce' });
  const motionReducedPage = await motionReducedCtx.newPage();
  await motionReducedPage.goto(BASE_URL);
  await motionReducedPage.waitForLoadState('networkidle');

  const reducedMotionMatch = await motionReducedPage.evaluate(() => {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });
  console.log('Reduced Motion (reduce) matchMedia matches:', reducedMotionMatch, '(Expected: true)');

  const cssTransitionsSuppressed = await motionReducedPage.evaluate(() => {
    const el = document.querySelector('.btn-terracotta');
    if (!el) return 'Element not found';
    const computed = window.getComputedStyle(el);
    return computed.transitionDuration;
  });
  console.log('Reduced Motion CSS transition-duration on .btn-terracotta:', cssTransitionsSuppressed, '(Expected: 0.00001s or 0s)');

  await motionNormalCtx.close();
  await motionReducedCtx.close();

  // =========================================================================
  // 4. REAL CONTRAST RATIOS OF MAIN TEXT AND BUTTON COLORS
  // =========================================================================
  console.log('\n======================================================');
  console.log('--- SECTION 4: REAL CONTRAST RATIOS OF MAIN COLORS ---');
  console.log('======================================================\n');

  const contrastCtx = await browser.newContext();
  const contrastPage = await contrastCtx.newPage();
  await contrastPage.goto(BASE_URL);
  await contrastPage.waitForLoadState('networkidle');

  const computedColors = await contrastPage.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    return {
      bgCanvas: style.getPropertyValue('--bg-canvas').trim(),
      paperCream: style.getPropertyValue('--paper-cream').trim(),
      paperCreamAlt: style.getPropertyValue('--paper-cream-alt').trim(),
      paperCreamDark: style.getPropertyValue('--paper-cream-dark').trim(),
      paperBorder: style.getPropertyValue('--paper-border').trim(),
      inkPrimary: style.getPropertyValue('--ink-primary').trim(),
      inkMuted: style.getPropertyValue('--ink-muted').trim(),
      inkTerracotta: style.getPropertyValue('--ink-terracotta').trim(),
      inkSage: style.getPropertyValue('--ink-sage').trim(),
      inkBlue: style.getPropertyValue('--ink-blue').trim(),
      inkAmber: style.getPropertyValue('--ink-amber').trim(),
    };
  });

  console.log('Extracted CSS Theme Variables from Live DOM:');
  console.log(JSON.stringify(computedColors, null, 2));

  const contrastChecks = [
    { name: 'Main Text (--ink-primary) on Paper Sheet (--paper-cream)', fg: computedColors.inkPrimary, bg: computedColors.paperCream },
    { name: 'Main Text (--ink-primary) on Card Box (--paper-cream-alt)', fg: computedColors.inkPrimary, bg: computedColors.paperCreamAlt },
    { name: 'Muted Text (--ink-muted) on Paper Sheet (--paper-cream)', fg: computedColors.inkMuted, bg: computedColors.paperCream },
    { name: 'Muted Text (--ink-muted) on Card Box (--paper-cream-alt)', fg: computedColors.inkMuted, bg: computedColors.paperCreamAlt },
    { name: 'Primary Button White Text on Terracotta (--ink-terracotta)', fg: '#ffffff', bg: computedColors.inkTerracotta },
    { name: 'Secondary Button Text (--ink-primary) on (--paper-cream-alt)', fg: computedColors.inkPrimary, bg: computedColors.paperCreamAlt },
    { name: 'Terracotta Accent Text (--ink-terracotta) on Paper Sheet', fg: computedColors.inkTerracotta, bg: computedColors.paperCream },
    { name: 'Sage Accent Text (--ink-sage) on Paper Sheet', fg: computedColors.inkSage, bg: computedColors.paperCream },
    { name: 'Blue Accent Text (--ink-blue) on Paper Sheet', fg: computedColors.inkBlue, bg: computedColors.paperCream },
    { name: 'Amber Warning Text (--ink-amber) on Paper Sheet', fg: computedColors.inkAmber, bg: computedColors.paperCream },
    { name: 'Paper Outline (--paper-border) on Paper Sheet', fg: computedColors.paperBorder, bg: computedColors.paperCream },
  ];

  console.log('\nWCAG 2.1 Contrast Ratios:');
  console.log('| UI Element & Color Pair | Foreground | Background | Ratio | WCAG Compliance |');
  console.log('|---|:---:|:---:|:---:|:---:|');
  contrastChecks.forEach((c) => {
    const ratio = contrastRatio(c.fg, c.bg);
    const compliance =
      ratio >= 7.0 ? 'AAA Pass' : ratio >= 4.5 ? 'AA Pass' : ratio >= 3.0 ? 'AA Large Pass' : 'Fail (< 3:1)';
    console.log(`| ${c.name} | \`${c.fg}\` | \`${c.bg}\` | **${ratio.toFixed(2)}:1** | ${compliance} |`);
  });

  await contrastCtx.close();
  await browser.close();

  if (server) {
    server.kill();
  }

  // Save audit data to JSON
  const auditResult = {
    axeReports,
    kbLog,
    computedColors,
    contrastChecks: contrastChecks.map((c) => ({
      ...c,
      ratio: contrastRatio(c.fg, c.bg),
      ratioStr: `${contrastRatio(c.fg, c.bg).toFixed(2)}:1`,
    })),
  };
  fs.writeFileSync(
    path.join(__dirname, '..', 'phase23_accessibility_audit_results.json'),
    JSON.stringify(auditResult, null, 2)
  );
  console.log('\nAudit complete! Log saved to phase23_accessibility_audit_results.json');
  process.exit(0);
}

main().catch((err) => {
  console.error('Audit failed with error:', err);
  process.exit(1);
});
