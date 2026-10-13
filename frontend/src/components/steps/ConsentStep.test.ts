import { describe, it, expect } from 'vitest';
import type { ConsentPayload } from '../../types/api';

describe('ConsentPayload contract validation', () => {
  it('creates valid ConsentPayload matching backend expectations', () => {
    const payload: ConsentPayload = {
      authorized: true,
      statement: 'I attest that I hold full rights to use this photo and voice sample, and understand that the resulting video carries an AI generation label.',
      face_rights_attested: true,
      voice_rights_attested: true,
    };

    expect(payload.authorized).toBe(true);
    expect(payload.face_rights_attested).toBe(true);
    expect(payload.voice_rights_attested).toBe(true);
    expect(typeof payload.statement).toBe('string');
    expect(payload.statement.length).toBeGreaterThan(10);
  });

  it('validates prompt path ConsentPayload with AI acceptance and without claiming face/voice rights', () => {
    const payload: ConsentPayload = {
      authorized: true,
      statement: 'I accept that this video is AI-generated and will display an AI label.',
      ai_generated_accepted: true,
      ai_label_accepted: true,
    };

    expect(payload.authorized).toBe(true);
    expect(payload.ai_generated_accepted).toBe(true);
    expect(payload.ai_label_accepted).toBe(true);
    expect(payload.face_rights_attested).toBeUndefined();
    expect(payload.voice_rights_attested).toBeUndefined();
    expect(payload.statement).toContain('AI-generated');
  });
});
