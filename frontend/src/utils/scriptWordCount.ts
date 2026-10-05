/**
 * Pure function to evaluate script word count against target duration and words_per_minute rate.
 * Enforces backend 90% - 110% speech duration bounds.
 */

export interface ScriptWordAnalysis {
  wordCount: number;
  targetWords: number;
  minWords: number;
  maxWords: number;
  status: 'empty' | 'too_short' | 'perfect' | 'too_long';
  percentage: number;
  helperText: string;
  isWithinBounds: boolean;
}

export function analyzeScriptWords(
  script: string,
  targetDurationSeconds: number,
  wordsPerMinute: number
): ScriptWordAnalysis {
  const trimmed = script.trim();
  const wordCount = trimmed ? trimmed.split(/\s+/).length : 0;

  // Calculate target word count dynamically based on words_per_minute
  const targetWords = Math.round((targetDurationSeconds / 60) * wordsPerMinute);
  const minWords = Math.ceil(targetWords * 0.90);
  const maxWords = Math.floor(targetWords * 1.10);

  const percentage = Math.min(150, Math.round((wordCount / targetWords) * 100));

  if (wordCount === 0) {
    return {
      wordCount: 0,
      targetWords,
      minWords,
      maxWords,
      status: 'empty',
      percentage: 0,
      helperText: `Please write your story script. You need at least ${minWords} words for a ${targetDurationSeconds}s video.`,
      isWithinBounds: false,
    };
  }

  if (wordCount < minWords) {
    return {
      wordCount,
      targetWords,
      minWords,
      maxWords,
      status: 'too_short',
      percentage,
      helperText: `A bit too brief... you have ${wordCount} words, but need at least ${minWords} words for a ${targetDurationSeconds}s video.`,
      isWithinBounds: false,
    };
  }

  if (wordCount > maxWords) {
    return {
      wordCount,
      targetWords,
      minWords,
      maxWords,
      status: 'too_long',
      percentage,
      helperText: `Script is a bit too long! You have ${wordCount} words (max ${maxWords} words). The studio engine rejects speech outside 90%–110% of target length.`,
      isWithinBounds: false,
    };
  }

  return {
    wordCount,
    targetWords,
    minWords,
    maxWords,
    status: 'perfect',
    percentage,
    helperText: `✨ Perfect pacing! Your ${wordCount}-word narrative fits nicely into the ${targetDurationSeconds}s video duration.`,
    isWithinBounds: true,
  };
}
