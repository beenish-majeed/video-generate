import { describe, it, expect } from 'vitest';
import {
  transitionFlowMode,
  DEFAULT_PHOTO_ASSET_ID,
  DEFAULT_VOICE_ASSET_ID,
  type StudioFlowState,
} from './flowStateTransitions';

describe('Switching Paths State Retention & Clearing Unit Tests', () => {
  const initialCustomState: StudioFlowState = {
    flowMode: 'custom_media',
    currentStep: 'photo',
    photoAssetId: '',
    voiceAssetId: '',
    durationPreset: '60s',
    targetSeconds: 60,
    script: 'A calm mountain path with autumn leaves falling gently.',
    prompt: 'Warm cinematic sunset watercolor style',
    errorMessage: 'Network timeout error from previous step',
  };

  it('1. Switching custom_media -> prompt_first keeps shared script, prompt, duration and clears error', () => {
    const nextState = transitionFlowMode(initialCustomState, 'prompt_first');

    expect(nextState.flowMode).toBe('prompt_first');
    expect(nextState.currentStep).toBe('duration');

    // Shared data RETAINED
    expect(nextState.script).toBe('A calm mountain path with autumn leaves falling gently.');
    expect(nextState.prompt).toBe('Warm cinematic sunset watercolor style');
    expect(nextState.durationPreset).toBe('60s');
    expect(nextState.targetSeconds).toBe(60);

    // Transient error CLEARED
    expect(nextState.errorMessage).toBeNull();
  });

  it('2. Switching custom_media -> prompt_first assigns default studio asset IDs when custom assets are empty', () => {
    const nextState = transitionFlowMode(initialCustomState, 'prompt_first');

    expect(nextState.photoAssetId).toBe(DEFAULT_PHOTO_ASSET_ID);
    expect(nextState.voiceAssetId).toBe(DEFAULT_VOICE_ASSET_ID);
  });

  it('3. Switching prompt_first -> custom_media retains custom uploaded asset IDs if user previously uploaded custom media', () => {
    const stateWithCustomAssets: StudioFlowState = {
      ...initialCustomState,
      photoAssetId: 'user-custom-photo-123',
      voiceAssetId: 'user-custom-voice-456',
    };

    // Switch to prompt_first
    const promptState = transitionFlowMode(stateWithCustomAssets, 'prompt_first');
    expect(promptState.photoAssetId).toBe('user-custom-photo-123');
    expect(promptState.voiceAssetId).toBe('user-custom-voice-456');

    // Switch back to custom_media
    const backToCustomState = transitionFlowMode(promptState, 'custom_media');
    expect(backToCustomState.flowMode).toBe('custom_media');
    expect(backToCustomState.currentStep).toBe('photo');
    expect(backToCustomState.photoAssetId).toBe('user-custom-photo-123');
    expect(backToCustomState.voiceAssetId).toBe('user-custom-voice-456');

    // Shared data STILL RETAINED
    expect(backToCustomState.script).toBe('A calm mountain path with autumn leaves falling gently.');
  });

  it('4. Switching prompt_first -> custom_media resets default studio asset IDs back to empty for custom upload', () => {
    const promptState = transitionFlowMode(initialCustomState, 'prompt_first');
    expect(promptState.photoAssetId).toBe(DEFAULT_PHOTO_ASSET_ID);

    const backToCustomState = transitionFlowMode(promptState, 'custom_media');
    expect(backToCustomState.photoAssetId).toBe('');
    expect(backToCustomState.voiceAssetId).toBe('');
  });
});
