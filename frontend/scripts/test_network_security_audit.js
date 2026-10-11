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
    console.log(`Server already responding at ${BASE_URL}`);
    return null;
  }

  console.log('Starting Vite preview server on 127.0.0.1...');
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

async function runNetworkSecurityAudit() {
  const server = await startServer();
  console.log('Server running at', BASE_URL);

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
    ],
  });

  const capturedRequests = [];
  let currentFlowPath = 'none';
  let currentStepName = 'init';

  const context = await browser.newContext({
    permissions: ['microphone'],
  });
  const page = await context.newPage();

  // Monitor every single request leaving the browser
  page.on('request', (request) => {
    const url = request.url();
    const method = request.method();
    const headers = request.headers();
    const headerNames = Object.keys(headers);

    const parsedUrl = new URL(url);
    const host = parsedUrl.host;

    // Check for API key leakage in header names or header values
    let leakedKey = false;
    for (const [name, value] of Object.entries(headers)) {
      const lowerName = name.toLowerCase();
      if (
        lowerName.includes('x-api-key') ||
        lowerName.includes('api-key') ||
        lowerName.includes('apikey')
      ) {
        leakedKey = true;
      }
      if (
        typeof value === 'string' &&
        (value.includes('dev_secret_key_123') ||
          value.includes('dev_key_123') ||
          value.includes('secret_key'))
      ) {
        leakedKey = true;
      }
    }

    const isMediaUpload = url.includes('/api/v1/assets/upload');
    const isApiRequest = url.includes('/api/v1/');
    const isAppHost = host === `localhost:${SERVER_PORT}` || host === `127.0.0.1:${SERVER_PORT}`;

    capturedRequests.push({
      index: capturedRequests.length + 1,
      flowPath: currentFlowPath,
      step: currentStepName,
      method,
      url,
      host,
      isAppHost,
      isMediaUpload,
      isApiRequest,
      headerNames,
      leakedKey,
    });
  });

  // Mock API endpoints
  let jobPollCount = 0;

  await page.route('**/*/v1/durations', (route) => {
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

  await page.route('**/*/v1/assets/upload', async (route, request) => {
    const postData = request.postData() || '';
    const isVoice = postData.includes('recorded_voice') || request.url().includes('voice');
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        asset_id: isVoice ? 'voice-asset-live-wav-001' : 'photo-asset-portrait-001',
      }),
    });
  });

  await page.route('**/*/v1/jobs', (route) => {
    jobPollCount = 0;
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ job_id: 'job-security-audit-888', state: 'PENDING' }),
    });
  });

  await page.route('**/*/v1/jobs/job-security-audit-888', (route) => {
    jobPollCount++;
    if (jobPollCount >= 2) {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          job_id: 'job-security-audit-888',
          state: 'COMPLETED',
          progress: 100,
          current_stage: 'Final Film Ready',
          video_url: '/mock/final_memory_video.mp4',
        }),
      });
    } else {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          job_id: 'job-security-audit-888',
          state: 'PROCESSING',
          progress: 45,
          current_stage: 'Synthesizing voice & lip synchronization',
        }),
      });
    }
  });

  // =========================================================================
  // PATH 1: Upload Photo & Voice (custom_media flow)
  // =========================================================================
  console.log('\n========================================');
  console.log('AUDIT PATH 1: Upload Photo & Voice (custom_media flow)');
  console.log('========================================');
  currentFlowPath = 'custom_media';

  currentStepName = '00_intro';
  console.log('  1. Navigating to Welcome Page...');
  await page.goto(BASE_URL);
  await page.waitForLoadState('networkidle');

  // Step 01: Photo
  currentStepName = '01_photo';
  console.log('  2. Selecting "Upload Photo & Voice"...');
  await page.click('text="Upload Photo & Voice"');
  await page.waitForTimeout(300);

  console.log('  3. Uploading Portrait Photo...');
  await page.waitForSelector('input[type="file"]', { state: 'attached' });
  const photoInput = await page.$('input[type="file"]');
  if (photoInput) {
    await photoInput.setInputFiles({
      name: 'portrait_sample.png',
      mimeType: 'image/png',
      buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        'base64'
      ),
    });
  }
  const continueToVoiceBtn = page.locator('button:has-text("Continue to Voice")');
  await continueToVoiceBtn.waitFor({ state: 'visible' });
  const photoHandle = await continueToVoiceBtn.elementHandle();
  if (photoHandle) {
    await page.waitForFunction((el) => !el.hasAttribute('disabled'), photoHandle);
  }
  await continueToVoiceBtn.click();
  await page.waitForTimeout(400);

  // Step 02: Voice
  currentStepName = '02_voice';
  console.log('  4. Recording Live Voice Audio Clip...');
  await page.click('text="Record now"');
  await page.waitForTimeout(300);
  await page.click('text="Start Recording"');
  await page.waitForTimeout(3500); // Record for 3.5s
  await page.click('text="Stop Recording"');
  await page.waitForTimeout(500);

  console.log('  5. Submitting Recorded Audio ("Use this recording")...');
  await page.click('text="Use this recording"');
  await page.waitForTimeout(800);

  const continueToDurationBtn = page.locator('button:has-text("Continue to Duration")');
  await continueToDurationBtn.waitFor({ state: 'visible' });
  await continueToDurationBtn.click();
  await page.waitForTimeout(400);

  // Step 03: Duration
  currentStepName = '03_duration';
  console.log('  6. Selecting Duration Preset...');
  await page.waitForTimeout(300);
  await page.click('button:has-text("Continue to Script")');
  await page.waitForTimeout(400);

  // Step 04: Script
  currentStepName = '04_script';
  console.log('  7. Entering Narrative Script...');
  const VALID_75_WORD_SCRIPT =
    'The morning mist softly rose above the quiet mountain lake as dawn painted the horizon with gentle strokes of amber and rose. Ancient pine trees stood like silent guardians along the winding rocky trail, whispering secrets of centuries past to the passing cool breeze. Every step revealed another forgotten story etched deep into the wild untamed earth, reminding us of timeless memories that linger in our hearts forever and always through every passing golden season.';
  const textarea = page.locator('textarea');
  await textarea.fill(VALID_75_WORD_SCRIPT);
  await page.waitForTimeout(300);
  const continueToRightsBtn = page.locator('button:has-text("Continue to Rights")');
  await continueToRightsBtn.waitFor({ state: 'visible' });
  const rightsHandle = await continueToRightsBtn.elementHandle();
  if (rightsHandle) {
    await page.waitForFunction((el) => !el.hasAttribute('disabled'), rightsHandle);
  }
  await continueToRightsBtn.click();
  await page.waitForTimeout(400);

  // Step 05: Consent
  currentStepName = '05_consent';
  console.log('  8. Checking Consent and Submitting Job...');
  const checkboxes = page.locator('input[type="checkbox"]');
  const count = await checkboxes.count();
  for (let i = 0; i < count; i++) {
    await checkboxes.nth(i).check();
  }
  await page.waitForTimeout(300);
  const submitBtn = page.locator('button:has-text("Create My Memory Film")');
  await submitBtn.waitFor({ state: 'visible' });
  const submitHandle = await submitBtn.elementHandle();
  if (submitHandle) {
    await page.waitForFunction((el) => !el.hasAttribute('disabled'), submitHandle);
  }
  await submitBtn.click();
  await page.waitForTimeout(600);

  // Step 06: Waiting Room
  currentStepName = '06_waiting';
  console.log('  9. Waiting Room Polling...');
  await page.waitForSelector('text=Your film is ready!', { timeout: 15000 });
  await page.waitForTimeout(500);

  // Step 07: Premiere
  currentStepName = '07_premiere';
  console.log('  10. Premiere Screen Loaded Successfully.');
  await page.waitForTimeout(400);
  console.log('  11. Restarting flow via "Make another video"...');
  await page.click('button:has-text("Make another video")');
  await page.waitForTimeout(400);
  await page.evaluate(() => localStorage.clear()).catch(() => {});

  // =========================================================================
  // PATH 2: Quick Story with Studio Presets (prompt_first flow)
  // =========================================================================
  console.log('\n========================================');
  console.log('AUDIT PATH 2: Quick Story / Presets (prompt_first flow)');
  console.log('========================================');
  currentFlowPath = 'prompt_first';

  currentStepName = '00_intro';
  console.log('  1. Navigating to Welcome Page...');
  await page.goto(BASE_URL);
  await page.waitForLoadState('networkidle');
  await page.waitForSelector('text="Start with Prompt"', { timeout: 10000 });

  console.log('  2. Selecting "Start with Prompt"...');
  await page.click('text="Start with Prompt"');
  await page.waitForTimeout(400);

  // Step 01: Duration
  currentStepName = '01_duration';
  console.log('  3. Selecting Duration Preset...');
  await page.click('button:has-text("Continue to Script")');
  await page.waitForTimeout(400);

  // Step 02: Script
  currentStepName = '02_script';
  console.log('  4. Entering Narrative Script...');
  const textarea2 = page.locator('textarea');
  await textarea2.fill(VALID_75_WORD_SCRIPT);
  await page.waitForTimeout(300);
  const continueToRightsBtn2 = page.locator('button:has-text("Continue to Rights")');
  await continueToRightsBtn2.waitFor({ state: 'visible' });
  const rightsHandle2 = await continueToRightsBtn2.elementHandle();
  if (rightsHandle2) {
    await page.waitForFunction((el) => !el.hasAttribute('disabled'), rightsHandle2);
  }
  await continueToRightsBtn2.click();
  await page.waitForTimeout(400);

  // Step 03: Consent
  currentStepName = '03_consent';
  console.log('  5. Checking Consent and Submitting Job...');
  const checkboxes2 = page.locator('input[type="checkbox"]');
  const count2 = await checkboxes2.count();
  for (let i = 0; i < count2; i++) {
    await checkboxes2.nth(i).check();
  }
  await page.waitForTimeout(300);
  const submitBtn2 = page.locator('button:has-text("Create My Memory Film")');
  await submitBtn2.waitFor({ state: 'visible' });
  const submitHandle2 = await submitBtn2.elementHandle();
  if (submitHandle2) {
    await page.waitForFunction((el) => !el.hasAttribute('disabled'), submitHandle2);
  }
  await submitBtn2.click();
  await page.waitForTimeout(600);

  // Step 04: Waiting Room
  currentStepName = '04_waiting';
  console.log('  6. Waiting Room Polling...');
  await page.waitForSelector('text=Your film is ready!', { timeout: 15000 });
  await page.waitForTimeout(500);

  // Step 05: Premiere
  currentStepName = '05_premiere';
  console.log('  7. Premiere Screen Loaded Successfully.');
  await page.waitForTimeout(400);

  await browser.close();
  if (server) {
    server.kill();
  }

  // =========================================================================
  // AUDIT REPORT ANALYSIS
  // =========================================================================
  console.log('\n==================================================');
  console.log('NETWORK SECURITY AUDIT RESULTS SUMMARY:');
  console.log('==================================================');

  const totalRequests = capturedRequests.length;
  const leakedKeyRequests = capturedRequests.filter((r) => r.leakedKey);
  const mediaUploadRequests = capturedRequests.filter((r) => r.isMediaUpload);
  const externalMediaRequests = mediaUploadRequests.filter((r) => !r.isAppHost);
  const apiRequests = capturedRequests.filter((r) => r.isApiRequest);
  const externalApiRequests = apiRequests.filter((r) => !r.isAppHost);
  const externalHosts = [...new Set(capturedRequests.filter((r) => !r.isAppHost).map((r) => r.host))];

  console.log(`- Total Requests Captured (Both Paths): ${totalRequests}`);
  console.log(`- Requests with API Key in Headers: ${leakedKeyRequests.length} (Expected: 0)`);
  console.log(`- Media Upload Requests (Photo & Audio): ${mediaUploadRequests.length}`);
  console.log(`- Media Upload Requests to External Hosts: ${externalMediaRequests.length} (Expected: 0)`);
  console.log(`- API Requests to External Hosts: ${externalApiRequests.length} (Expected: 0)`);
  console.log(`- External Static CDN Hosts Contacted: ${externalHosts.join(', ') || 'None'}`);

  const passedSecurity =
    leakedKeyRequests.length === 0 &&
    mediaUploadRequests.length === 2 &&
    externalMediaRequests.length === 0 &&
    externalApiRequests.length === 0;

  console.log(`- Overall Network Security Audit Passed: ${passedSecurity}`);
  console.log('==================================================\n');

  // Print captured requests list
  console.log('CAPTURED BROWSER REQUESTS LIST (URL and Header Names):');
  console.log('----------------------------------------------------------------------------------------------------');
  capturedRequests.forEach((r) => {
    console.log(
      `[#${String(r.index).padStart(2, '0')}] [${r.flowPath}] [${r.step}] ${r.method.padEnd(4)} ${r.url}`
    );
    console.log(`     Host: ${r.host} | Is App Host: ${r.isAppHost}`);
    console.log(`     Header Names: ${JSON.stringify(r.headerNames)}`);
    console.log(`     API Key Leaked in Header: ${r.leakedKey ? 'YES (SECURITY VIOLATION)' : 'NO (SECURE)'}`);
    console.log('----------------------------------------------------------------------------------------------------');
  });

  // Save audit log to JSON artifact
  const auditLogPath = path.join(__dirname, '..', 'network_security_audit_results.json');
  fs.writeFileSync(auditLogPath, JSON.stringify(capturedRequests, null, 2));
  console.log(`Audit log saved to: ${auditLogPath}`);

  if (!passedSecurity) {
    throw new Error('Network security audit failed! API key was leaked or requests went to external hosts!');
  }

  console.log('\n✓ ALL PHASE 22 NETWORK SECURITY AUDITS PASSED SUCCESSFULLY!');
}

runNetworkSecurityAudit().catch((err) => {
  console.error('Network security audit failed:', err);
  process.exit(1);
});
