import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { ClipsUploadStep } from './ClipsUploadStep';
import type { UploadedClipItem, ScenePlanResponse } from '../../types/api';

describe('ClipsUploadStep UI component', () => {
  const samplePlan: ScenePlanResponse = {
    plan_id: 'plan-test-123',
    style: 'cinematic',
    total_duration_seconds: 30,
    plain_text_prompts: 'prompt 1\n\nprompt 2',
    version: '1.0',
    total_scenes: 2,
    target_duration_seconds: 30,
    scenes: [
      {
        id: 'scene_1',
        scene_index: 0,
        start_seconds: 0.0,
        end_seconds: 5.0,
        duration_seconds: 5.0,
        target_clip_seconds: 5.0,
        narration: 'Scene 1 text',
        narration_text: 'Scene 1 text',
        visual_prompt: 'Visual prompt 1',
        negative_prompt: 'neg',
        motion_bucket: 127,
      },
      {
        id: 'scene_2',
        scene_index: 1,
        start_seconds: 5.0,
        end_seconds: 10.0,
        duration_seconds: 5.0,
        target_clip_seconds: 5.0,
        narration: 'Scene 2 text',
        narration_text: 'Scene 2 text',
        visual_prompt: 'Visual prompt 2',
        negative_prompt: 'neg',
        motion_bucket: 127,
      },
    ],
  };

  const sampleClips: UploadedClipItem[] = [
    {
      id: 'clip-1',
      assetId: 'asset-clip-1',
      fileName: 'scene_01.mp4',
      duration: 5.0,
      width: 1280,
      height: 720,
      fps: 30,
    },
    {
      id: 'clip-2',
      assetId: 'asset-clip-2',
      fileName: 'scene_02.mp4',
      duration: 5.0,
      width: 1280,
      height: 720,
      fps: 30,
    },
  ];

  it('1. Renders empty state dropzone when no clips uploaded', () => {
    const markup = renderToStaticMarkup(
      React.createElement(ClipsUploadStep, {
        plan: samplePlan,
        clips: [],
        onNext: () => {},
        onBack: () => {},
      })
    );

    expect(markup).toContain('Upload &amp; Sequence Video Clips');
    expect(markup).toContain('Click to upload video clips');
    expect(markup).toContain('Supports MP4, MOV, WEBM (H.264/HEVC/VP9/AV1), up to 30s each');
    expect(markup).toContain('Continue to Voice');
  });

  it('2. Renders clip item details with scene mapping badge and metrics', () => {
    const markup = renderToStaticMarkup(
      React.createElement(ClipsUploadStep, {
        plan: samplePlan,
        clips: sampleClips,
        onNext: () => {},
        onBack: () => {},
      })
    );

    expect(markup).toContain('scene_01.mp4');
    expect(markup).toContain('scene_02.mp4');
    expect(markup).toContain('Matches Scene 1');
    expect(markup).toContain('Matches Scene 2');
    expect(markup).toContain('1280x720');
    expect(markup).toContain('30fps');
    expect(markup).toContain('5.0s');
    expect(markup).toContain('Replace');
    expect(markup).toContain('Remove');
  });
});
