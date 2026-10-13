import type { FlowMode, JourneyStepId } from '../components/PageTabs';
import type { DurationPreset, ScriptTone } from '../types/api';

export const DEFAULT_PHOTO_ASSET_ID = 'default-studio-photo';
export const DEFAULT_VOICE_ASSET_ID = 'default-studio-voice';
export const DEFAULT_AVATAR_PRESET_ID = 'avatar_default';
export const DEFAULT_VOICE_PRESET_ID = 'voice_piper_lessac';

export interface StudioFlowState {
  flowMode: FlowMode;
  currentStep: JourneyStepId;
  photoAssetId: string;
  voiceAssetId: string;
  avatarPresetId?: string;
  voicePresetId?: string;
  durationPreset: DurationPreset;
  targetSeconds: number;
  script: string;
  prompt: string;
  ideaText?: string;
  tone?: ScriptTone;
  errorMessage: string | null;
}

/**
 * Pure state transition reducer function for starting the flow from welcome.
 */
export function startJourney(prevState: StudioFlowState): StudioFlowState {
  return {
    ...prevState,
    currentStep: 'choice',
    errorMessage: null,
  };
}

/**
 * Pure state transition reducer function for switching creative paths.
 * Retains shared user input (script, prompt, duration, custom assets) while setting path defaults.
 */
export function transitionFlowMode(
  prevState: StudioFlowState,
  targetMode: FlowMode
): StudioFlowState {
  if (targetMode === 'prompt_first') {
    return {
      ...prevState,
      flowMode: 'prompt_first',
      currentStep: 'idea',
      avatarPresetId: prevState.avatarPresetId || DEFAULT_AVATAR_PRESET_ID,
      voicePresetId: prevState.voicePresetId || DEFAULT_VOICE_PRESET_ID,
      photoAssetId: prevState.photoAssetId || DEFAULT_PHOTO_ASSET_ID,
      voiceAssetId: prevState.voiceAssetId || DEFAULT_VOICE_ASSET_ID,
      tone: prevState.tone || 'friendly',
      errorMessage: null,
    };
  }

  // Switch to custom_media mode
  return {
    ...prevState,
    flowMode: 'custom_media',
    currentStep: 'photo',
    // Retain custom assets if previously uploaded, otherwise reset defaults
    photoAssetId: prevState.photoAssetId === DEFAULT_PHOTO_ASSET_ID ? '' : prevState.photoAssetId,
    voiceAssetId: prevState.voiceAssetId === DEFAULT_VOICE_ASSET_ID ? '' : prevState.voiceAssetId,
    errorMessage: null,
  };
}

/**
 * Pure state transition reducer function for navigating backwards.
 * Retains all entered user data while determining previous step.
 */
export function navigateBackStep(prevState: StudioFlowState): StudioFlowState {
  const { currentStep, flowMode } = prevState;

  if (currentStep === 'choice') {
    return { ...prevState, currentStep: 'hero', errorMessage: null };
  }

  // Custom Media path backward steps
  if (flowMode === 'custom_media') {
    if (currentStep === 'photo') {
      return { ...prevState, currentStep: 'choice', errorMessage: null };
    }
    if (currentStep === 'voice') {
      return { ...prevState, currentStep: 'photo', errorMessage: null };
    }
    if (currentStep === 'duration') {
      return { ...prevState, currentStep: 'voice', errorMessage: null };
    }
    if (currentStep === 'script') {
      return { ...prevState, currentStep: 'duration', errorMessage: null };
    }
    if (currentStep === 'consent') {
      return { ...prevState, currentStep: 'script', errorMessage: null };
    }
  }

  // Prompt First path backward steps (Idea -> Length -> Look and voice -> Script -> Consent)
  if (flowMode === 'prompt_first') {
    if (currentStep === 'idea') {
      return { ...prevState, currentStep: 'choice', errorMessage: null };
    }
    if (currentStep === 'duration') {
      return { ...prevState, currentStep: 'idea', errorMessage: null };
    }
    if (currentStep === 'look_voice') {
      return { ...prevState, currentStep: 'duration', errorMessage: null };
    }
    if (currentStep === 'script') {
      return { ...prevState, currentStep: 'look_voice', errorMessage: null };
    }
    if (currentStep === 'consent') {
      return { ...prevState, currentStep: 'script', errorMessage: null };
    }
  }

  return prevState;
}

