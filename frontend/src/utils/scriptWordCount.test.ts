import { describe, it, expect } from 'vitest';
import { analyzeScriptWords } from './scriptWordCount';

describe('analyzeScriptWords pure function', () => {
  // Test parameters: 30 seconds target at 150 WPM
  // Target words = (30/60) * 150 = 75 words
  // Min words (90%) = 68 words
  // Max words (110%) = 82 words

  it('handles empty script', () => {
    const res = analyzeScriptWords('', 30, 150);
    expect(res.wordCount).toBe(0);
    expect(res.status).toBe('empty');
    expect(res.isWithinBounds).toBe(false);
    expect(res.helperText).toContain('You need at least 68 words');
  });

  it('handles script below 90% target (too short)', () => {
    // 50 words script (target min is 68)
    const script = Array(50).fill('word').join(' ');
    const res = analyzeScriptWords(script, 30, 150);
    expect(res.wordCount).toBe(50);
    expect(res.status).toBe('too_short');
    expect(res.isWithinBounds).toBe(false);
    expect(res.helperText).toContain('A bit too brief');
    expect(res.helperText).toContain('need at least 68 words');
  });

  it('handles script at exactly 90% boundary', () => {
    // 68 words script (exact 90% boundary)
    const script = Array(68).fill('word').join(' ');
    const res = analyzeScriptWords(script, 30, 150);
    expect(res.wordCount).toBe(68);
    expect(res.status).toBe('perfect');
    expect(res.isWithinBounds).toBe(true);
    expect(res.helperText).toContain('Perfect pacing');
  });

  it('handles script in valid 90%-110% target range', () => {
    // 75 words script (exact target)
    const script = Array(75).fill('word').join(' ');
    const res = analyzeScriptWords(script, 30, 150);
    expect(res.wordCount).toBe(75);
    expect(res.status).toBe('perfect');
    expect(res.isWithinBounds).toBe(true);
    expect(res.helperText).toContain('Perfect pacing');
  });

  it('handles script above 110% target (too long)', () => {
    // 90 words script (target max is 82)
    const script = Array(90).fill('word').join(' ');
    const res = analyzeScriptWords(script, 30, 150);
    expect(res.wordCount).toBe(90);
    expect(res.status).toBe('too_long');
    expect(res.isWithinBounds).toBe(false);
    expect(res.helperText).toContain('Script is a bit too long');
    expect(res.helperText).toContain('rejects speech outside 90%–110%');
  });
});
