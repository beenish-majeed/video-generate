import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { ScenePlanStep } from './ScenePlanStep';
import type { ScenePlanResponse } from '../../types/api';

describe('ScenePlanStep UI component', () => {
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
        end_seconds: 6.0,
        duration_seconds: 6.0,
        target_clip_seconds: 6.0,
        narration: 'The sun rises over the quiet mountain lake.',
        narration_text: 'The sun rises over the quiet mountain lake.',
        visual_prompt: 'A tranquil alpine lake at sunrise with golden mist rising from the water, cinematic 35mm photography, warm soft light',
        negative_prompt: 'blurry, low quality, distorted, jitter, text watermark',
        motion_bucket: 127,
        camera_cue: 'slow cinematic push-in towards the mist',
        lighting: 'warm golden hour morning light',
        mood: 'serene and contemplative',
        subject: 'alpine lake with pine reflection',
        setting: 'rugged mountain basin',
      },
      {
        id: 'scene_2',
        scene_index: 1,
        start_seconds: 6.0,
        end_seconds: 12.0,
        duration_seconds: 6.0,
        target_clip_seconds: 6.0,
        narration: 'A wooden dock extends into the still glass-like water.',
        narration_text: 'A wooden dock extends into the still glass-like water.',
        visual_prompt: 'Old wooden boat dock stretching into reflective lake surface, cinematic 35mm photography, peaceful atmosphere',
        negative_prompt: 'blurry, low quality, distorted, jitter, text watermark',
        motion_bucket: 127,
        camera_cue: 'gentle tracking shot across wooden planks',
        lighting: 'soft diffused morning radiance',
        mood: 'peaceful',
        subject: 'weathered wooden dock',
        setting: 'lakeside shore',
      },
    ],
  };

  it('1. Renders scene plan title and scene item details when plan is loaded', () => {
    const markup = renderToStaticMarkup(
      React.createElement(ScenePlanStep, {
        script: 'A peaceful sunrise by the lake.',
        targetSeconds: 30,
        imageStyle: 'cinematic',
        initialPlan: samplePlan,
        onNext: () => {},
        onBack: () => {},
      })
    );

    expect(markup).toContain('Scene Plan &amp; Visual Prompts');
    expect(markup).toContain('Scene 1');
    expect(markup).toContain('Scene 2');
    expect(markup).toContain('The sun rises over the quiet mountain lake.');
    expect(markup).toContain('A tranquil alpine lake at sunrise');
    expect(markup).toContain('Copy Prompt');
    expect(markup).toContain('Download Scene Plan');
    expect(markup).toContain('Colab Notebook');
    expect(markup).toContain('Continue to Upload Clips');
  });

  it('2. Shows duration and time range badges for each scene', () => {
    const markup = renderToStaticMarkup(
      React.createElement(ScenePlanStep, {
        script: 'A peaceful sunrise by the lake.',
        targetSeconds: 30,
        imageStyle: 'cinematic',
        initialPlan: samplePlan,
        onNext: () => {},
        onBack: () => {},
      })
    );

    expect(markup).toContain('0.0s – 6.0s');
    expect(markup).toContain('6.0s – 12.0s');
    expect(markup).toContain('6.0s duration');
  });

  it('3. Renders empty/loading state placeholder when no initial plan is provided', () => {
    const markup = renderToStaticMarkup(
      React.createElement(ScenePlanStep, {
        script: 'A peaceful sunrise by the lake.',
        targetSeconds: 30,
        imageStyle: 'cinematic',
        initialPlan: null,
        onNext: () => {},
        onBack: () => {},
      })
    );

    expect(markup).toContain('Crafting scene plan and visual prompts');
  });
});
