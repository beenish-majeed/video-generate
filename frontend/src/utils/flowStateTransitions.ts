import type { FlowMode, JourneyStepId } from '../components/PageTabs';
import type { DurationPreset } from '../types/api';

export const DEFAULT_PHOTO_ASSET_ID = 'default-studio-photo';
export const DEFAULT_VOICE_ASSET_ID = 'default-studio-voice';

export interface StudioFlowState {
  flowMode: FlowMode;
  currentStep: JourneyStepId;
  photoAssetId: string;
  voiceAssetId: string;
  durationPreset: DurationPreset;
  targetSeconds: number;
  script: string;
  prompt: string;
  errorMessage: string | null;
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
      currentStep: 'duration',
      photoAssetId: prevState.photoAssetId || DEFAULT_PHOTO_ASSET_ID,
      voiceAssetId: prevState.voiceAssetId || DEFAULT_VOICE_ASSET_ID,
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
