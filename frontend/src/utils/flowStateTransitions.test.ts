import { describe, it, expect } from 'vitest';
import {
  transitionFlowMode,
  startJourney,
  navigateBackStep,
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
    durationPreset: '30s',
    targetSeconds: 60,
    script: 'A calm mountain path with autumn leaves falling gently.',
    prompt: 'Warm cinematic sunset watercolor style',
    errorMessage: 'Network timeout error from previous step',
  };

  it('1. Switching custom_media -> prompt_first keeps shared script, prompt, duration and clears error', () => {
    const nextState = transitionFlowMode(initialCustomState, 'prompt_first');

    expect(nextState.flowMode).toBe('prompt_first');
    expect(nextState.currentStep).toBe('idea');

    // Shared data RETAINED
    expect(nextState.script).toBe('A calm mountain path with autumn leaves falling gently.');
    expect(nextState.prompt).toBe('Warm cinematic sunset watercolor style');
    expect(nextState.durationPreset).toBe('30s');
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

  it('5. Welcome -> Choice transition moves from hero to choice step', () => {
    const heroState: StudioFlowState = {
      ...initialCustomState,
      currentStep: 'hero',
    };
    const choiceState = startJourney(heroState);
    expect(choiceState.currentStep).toBe('choice');
    expect(choiceState.script).toBe(initialCustomState.script);
  });

  it('6. Back navigation from choice screen returns to hero step keeping entered data', () => {
    const choiceState: StudioFlowState = {
      ...initialCustomState,
      currentStep: 'choice',
      photoAssetId: 'photo-1',
      voiceAssetId: 'voice-1',
      script: 'Personal memory text',
      prompt: 'Personal visual prompt',
    };
    const backState = navigateBackStep(choiceState);
    expect(backState.currentStep).toBe('hero');
    expect(backState.photoAssetId).toBe('photo-1');
    expect(backState.voiceAssetId).toBe('voice-1');
    expect(backState.script).toBe('Personal memory text');
    expect(backState.prompt).toBe('Personal visual prompt');
  });

  it('7. Back navigation from first step of upload path (photo) returns to choice screen keeping data', () => {
    const photoState: StudioFlowState = {
      ...initialCustomState,
      currentStep: 'photo',
      flowMode: 'custom_media',
      photoAssetId: 'uploaded-photo-99',
    };
    const backState = navigateBackStep(photoState);
    expect(backState.currentStep).toBe('choice');
    expect(backState.photoAssetId).toBe('uploaded-photo-99');
    expect(backState.script).toBe(initialCustomState.script);
  });

  it('8. Back navigation from first step of prompt path (idea) returns to choice screen keeping data', () => {
    const promptIdeaState: StudioFlowState = {
      ...initialCustomState,
      currentStep: 'idea',
      flowMode: 'prompt_first',
      script: 'Written idea text',
    };
    const backState = navigateBackStep(promptIdeaState);
    expect(backState.currentStep).toBe('choice');
    expect(backState.script).toBe('Written idea text');
  });

  it('9. Prompt path back navigation preserves data: consent -> script -> look_voice -> duration -> idea -> choice', () => {
    const fullPromptState: StudioFlowState = {
      ...initialCustomState,
      currentStep: 'consent',
      flowMode: 'prompt_first',
      script: 'Generated voice script',
      ideaText: 'Walk in autumn woods',
      avatarPresetId: 'avatar_default',
      voicePresetId: 'voice_piper_lessac',
      durationPreset: '1m',
      targetSeconds: 60,
    };

    // consent -> script
    const s1 = navigateBackStep(fullPromptState);
    expect(s1.currentStep).toBe('script');
    expect(s1.script).toBe('Generated voice script');

    // script -> look_voice
    const s2 = navigateBackStep(s1);
    expect(s2.currentStep).toBe('look_voice');
    expect(s2.avatarPresetId).toBe('avatar_default');

    // look_voice -> duration
    const s3 = navigateBackStep(s2);
    expect(s3.currentStep).toBe('duration');
    expect(s3.durationPreset).toBe('1m');

    // duration -> idea
    const s4 = navigateBackStep(s3);
    expect(s4.currentStep).toBe('idea');
    expect(s4.ideaText).toBe('Walk in autumn woods');

    // idea -> choice
    const s5 = navigateBackStep(s4);
    expect(s5.currentStep).toBe('choice');
    expect(s5.ideaText).toBe('Walk in autumn woods');
    expect(s5.script).toBe('Generated voice script');
  });
});

