/**
 * Pure mapping function converting raw backend job failure errors into kind, human explanations with recommended next steps.
 */

export interface FailedJobExplanation {
  title: string;
  explanation: string;
  nextStep: string;
  recommendedStep: 'script' | 'consent' | 'photo' | 'voice';
}

export function mapFailedJobError(errorField?: string | null): FailedJobExplanation {
  const errStr = (errorField || '').trim();
  const lower = errStr.toLowerCase();

  // 1. TTS Speech Audio Duration Mismatch (outside 10% tolerance)
  if (
    lower.includes('outside 10% tolerance') ||
    lower.includes('speech audio duration') ||
    lower.includes('tts speech duration') ||
    lower.includes('duration mismatch')
  ) {
    return {
      title: 'Script & Duration Pacing Mismatch',
      explanation: 'The narrative script was too short or too long for your chosen video length.',
      nextStep: 'Please adjust your script word count on the Script step to fit the 90%–110% target range, then try again.',
      recommendedStep: 'script',
    };
  }

  // 2. Interrupted by Server Restart
  if (
    lower.includes('interrupted by a server restart') ||
    lower.includes('server restart') ||
    lower.includes('interrupted')
  ) {
    return {
      title: 'Studio Server Restarted',
      explanation: 'The studio server restarted while your video was being rendered.',
      nextStep: 'Click "Try Again" below to resume rendering. Your uploaded photo, voice, and script have been kept safe.',
      recommendedStep: 'consent',
    };
  }

  // 3. Voice Synthesizer / Audio Processing Issue
  if (lower.includes('cosyvoice') || lower.includes('voice package') || lower.includes('audio')) {
    return {
      title: 'Voice Synthesizer Note',
      explanation: 'The studio voice synthesizer ran into a note while processing the audio sample.',
      nextStep: 'Please check your voice recording sample or select a different clear audio file.',
      recommendedStep: 'voice',
    };
  }

  // 4. Generic Fallback for Unknown Errors
  return {
    title: 'Studio Render Pause',
    explanation: errStr || 'The studio engine encountered an unexpected hiccup while processing your video.',
    nextStep: 'Click "Try Again" to re-submit your creation, or adjust your narrative script and try once more.',
    recommendedStep: 'consent',
  };
}
