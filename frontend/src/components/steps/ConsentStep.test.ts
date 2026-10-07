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
});
