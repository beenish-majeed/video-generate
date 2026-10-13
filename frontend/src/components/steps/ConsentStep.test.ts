import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { ConsentStep } from './ConsentStep';
import type { ConsentPayload } from '../../types/api';

describe('ConsentStep component and payload tests', () => {
  it('1. Validates custom media path payload contract', () => {
    const payload: ConsentPayload = {
      authorized: true,
      statement:
        'I attest that I hold full rights to use this photo and voice sample, and understand that the resulting video carries an AI generation label.',
      face_rights_attested: true,
      voice_rights_attested: true,
    };

    expect(payload.authorized).toBe(true);
    expect(payload.face_rights_attested).toBe(true);
    expect(payload.voice_rights_attested).toBe(true);
    expect(typeof payload.statement).toBe('string');
    expect(payload.statement.length).toBeGreaterThan(10);
  });

  it('2. Validates prompt path payload contract with AI acceptance and without claiming face/voice rights', () => {
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

  it('3. Renders AI-label-only wording on prompt path without face or voice ownership claims', () => {
    const markup = renderToStaticMarkup(
      React.createElement(ConsentStep, {
        onSubmitJob: () => {},
        onBack: () => {},
        submitting: false,
        isPromptPath: true,
      })
    );

    // Prompt path specific copy
    expect(markup).toContain('AI Generation &amp; Transparency Consent');
    expect(markup).toContain('Studio Character Avatar');
    expect(markup).toContain('Synthesized Voice Narration');
    expect(markup).toContain('AI Transparency Label');
    expect(markup).toContain('I understand and accept that this video is AI-generated');
    expect(markup).toContain('I agree that the video will carry an AI transparency label');

    // Must NOT contain personal face or voice ownership attestation wording
    expect(markup).not.toContain('Your Photograph');
    expect(markup).not.toContain('permission to use the face image');
    expect(markup).not.toContain('permission to use this voice recording sample');
    expect(markup).not.toContain('This is my own face');
    expect(markup).not.toContain('I am the speaker');
  });

  it('4. Renders face and voice ownership attestations on custom media path', () => {
    const markup = renderToStaticMarkup(
      React.createElement(ConsentStep, {
        onSubmitJob: () => {},
        onBack: () => {},
        submitting: false,
        isPromptPath: false,
      })
    );

    // Custom media path copy
    expect(markup).toContain('Rights &amp; Consent Confirmation');
    expect(markup).toContain('Your Photograph');
    expect(markup).toContain('Your Voice Recording');
    expect(markup).toContain('permission to use the face image in this photograph');
    expect(markup).toContain('permission to use this voice recording sample');
    expect(markup).toContain('This is my own face');
    expect(markup).toContain('I am the speaker');
  });
});
