import { describe, it, expect } from 'vitest';
import { validateIdeaPrompt, MAX_IDEA_PROMPT_LENGTH } from './ideaValidation';

describe('validateIdeaPrompt unit tests', () => {
  it('1. Rejects empty string or whitespace-only input', () => {
    expect(validateIdeaPrompt('').isValid).toBe(false);
    expect(validateIdeaPrompt('   ').isValid).toBe(false);
    expect(validateIdeaPrompt('\n\t').isValid).toBe(false);
    expect(validateIdeaPrompt('').error).toContain('Please describe your idea');
  });

  it('2. Accepts valid ideas within length limit', () => {
    const validIdea = 'A serene morning walk through a quiet mountain valley with autumn breeze.';
    const result = validateIdeaPrompt(validIdea);
    expect(result.isValid).toBe(true);
    expect(result.error).toBeNull();
    expect(result.length).toBe(validIdea.length);
    expect(result.remaining).toBe(MAX_IDEA_PROMPT_LENGTH - validIdea.length);
  });

  it('3. Accepts prompt at exactly 1000 characters limit', () => {
    const exact1000 = 'a'.repeat(1000);
    const result = validateIdeaPrompt(exact1000);
    expect(result.isValid).toBe(true);
    expect(result.remaining).toBe(0);
    expect(result.error).toBeNull();
  });

  it('4. Rejects prompt exceeding 1000 characters with informative error message', () => {
    const over1000 = 'b'.repeat(1005);
    const result = validateIdeaPrompt(over1000);
    expect(result.isValid).toBe(false);
    expect(result.remaining).toBe(-5);
    expect(result.error).toContain('5 characters too long');
  });
});
