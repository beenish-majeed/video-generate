export const MAX_IDEA_PROMPT_LENGTH = 1000;

export interface IdeaValidationResult {
  isValid: boolean;
  length: number;
  remaining: number;
  error: string | null;
}

/**
 * Validates an idea prompt according to length and content rules:
 * - Must not be empty / whitespace only
 * - Must not exceed MAX_IDEA_PROMPT_LENGTH (1000 characters)
 */
export function validateIdeaPrompt(text: string): IdeaValidationResult {
  const trimmed = text.trim();
  const length = text.length;
  const remaining = MAX_IDEA_PROMPT_LENGTH - length;

  if (trimmed.length === 0) {
    return {
      isValid: false,
      length,
      remaining,
      error: 'Please describe your idea before continuing.',
    };
  }

  if (length > MAX_IDEA_PROMPT_LENGTH) {
    return {
      isValid: false,
      length,
      remaining,
      error: `Your idea is ${length - MAX_IDEA_PROMPT_LENGTH} characters too long. Please keep it under ${MAX_IDEA_PROMPT_LENGTH} characters.`,
    };
  }

  return {
    isValid: true,
    length,
    remaining,
    error: null,
  };
}
