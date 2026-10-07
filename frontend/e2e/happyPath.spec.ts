import { test, expect } from '@playwright/test';

test.describe('Memory Studio Happy Path Journey (Mocked Backend)', () => {
  test('user completes full creation flow from photo upload to video premiere', async ({ page }) => {
    // Mock GET /v1/durations
    await page.route('**/v1/durations', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          allowed_presets: [
            { label: '15s', value: '15s', seconds: 15 },
            { label: '30s', value: '30s', seconds: 30 },
          ],
          words_per_minute: 150,
        }),
      });
    });

    // Mock POST /v1/assets/photo
    await page.route('**/v1/assets/photo', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ asset_id: 'mock-photo-id-123', asset_type: 'photo' }),
      });
    });

    // Mock POST /v1/assets/voice
    await page.route('**/v1/assets/voice', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ asset_id: 'mock-voice-id-456', asset_type: 'voice' }),
      });
    });

    // Mock POST /v1/jobs
    await page.route('**/v1/jobs', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          job_id: 'mock-job-id-789',
          status: 'RECEIVED',
          target_duration_seconds: 30,
        }),
      });
    });

    // Mock GET /v1/jobs/mock-job-id-789
    let pollCount = 0;
    await page.route('**/v1/jobs/mock-job-id-789', async (route) => {
      pollCount++;
      const state = pollCount >= 2 ? 'COMPLETED' : 'SYNTHESIZING_AUDIO';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          job_id: 'mock-job-id-789',
          state,
          status: state,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          target_duration_seconds: 30,
        }),
      });
    });

    // 1. Visit Hero Page
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /Turn your photo and voice/i })).toBeVisible();

    // 2. Click Begin
    await page.getByRole('button', { name: /Begin/i }).click();

    // 3. Photo Upload Step
    await page.setInputFiles('input[type="file"]', {
      name: 'portrait.png',
      mimeType: 'image/png',
      buffer: Buffer.from('fake-image-bytes'),
    });
    await page.getByRole('button', { name: /Continue to Voice/i }).click();

    // 4. Voice Upload Step
    await page.setInputFiles('input[type="file"]', {
      name: 'voice.wav',
      mimeType: 'audio/wav',
      buffer: Buffer.from('fake-audio-bytes'),
    });
    await page.getByRole('button', { name: /Continue to Duration/i }).click();

    // 5. Duration Step
    await page.getByRole('button', { name: /Select 30s/i }).click();
    await page.getByRole('button', { name: /Continue to Script/i }).click();

    // 6. Script Step
    await page.fill(
      'textarea',
      'A peaceful sunny morning in a quiet valley surrounded by tall whispering pine trees standing sentinel under soft sky.'
    );
    await page.getByRole('button', { name: /Continue to Consent/i }).click();

    // 7. Consent Step
    await page.check('#face-rights-checkbox');
    await page.check('#voice-rights-checkbox');
    await page.check('#authorized-checkbox');
    await page.getByRole('button', { name: /Create My Memory Film/i }).click();

    // 8. Waiting Room & Premiere
    await expect(page.getByRole('heading', { name: /Your film is ready!/i })).toBeVisible({ timeout: 10000 });
  });
});
