import type { JobState } from '../types/api';

export interface JobStateStory {
  title: string;
  storyLine: string;
  doodleKind: 'spiral' | 'star' | 'clock' | 'camera' | 'mic' | 'sparkle' | 'person' | 'plant';
  progressPercent: number;
}

export const ALL_JOB_STATES: JobState[] = [
  'RECEIVED',
  'CONSENT_PENDING',
  'CONSENT_VERIFIED',
  'COMPILING_PROMPT',
  'PLANNING_TIMELINE',
  'PREPARING_IDENTITY',
  'SYNTHESIZING_AUDIO',
  'SCHEDULING_SEGMENTS',
  'GENERATING_SEGMENTS',
  'QA_CHECKING',
  'ASSEMBLING',
  'COMPLETED',
  'FAILED',
];

export function mapJobStateToStory(state: string | JobState): JobStateStory {
  const normalizedState = (state || '').toUpperCase() as JobState;

  switch (normalizedState) {
    case 'RECEIVED':
      return {
        title: 'Notebook Opened',
        storyLine: 'Opening the studio sketchbook and preparing canvas...',
        doodleKind: 'spiral',
        progressPercent: 5,
      };
    case 'CONSENT_PENDING':
      return {
        title: 'Permissions Verification',
        storyLine: 'Verifying media permissions and rights attestation...',
        doodleKind: 'star',
        progressPercent: 10,
      };
    case 'CONSENT_VERIFIED':
      return {
        title: 'Permissions Confirmed',
        storyLine: 'Permissions confirmed, starting creative process...',
        doodleKind: 'star',
        progressPercent: 15,
      };
    case 'COMPILING_PROMPT':
      return {
        title: 'Preparing Narrative',
        storyLine: 'Polishing narrative and visual style prompts...',
        doodleKind: 'star',
        progressPercent: 20,
      };
    case 'PLANNING_TIMELINE':
      return {
        title: 'Planning Pacing',
        storyLine: 'Setting keyframe pacing and scene timing...',
        doodleKind: 'clock',
        progressPercent: 30,
      };
    case 'PREPARING_IDENTITY':
      return {
        title: 'Preparing Portrait',
        storyLine: 'Teaching your portrait to speak with natural expression...',
        doodleKind: 'camera',
        progressPercent: 40,
      };
    case 'SYNTHESIZING_AUDIO':
      return {
        title: 'Voice Synthesis',
        storyLine: 'Your voice is being listened to and synthesized...',
        doodleKind: 'mic',
        progressPercent: 55,
      };
    case 'SCHEDULING_SEGMENTS':
      return {
        title: 'Scheduling Segments',
        storyLine: 'Arranging video segments into scene sequence...',
        doodleKind: 'sparkle',
        progressPercent: 65,
      };
    case 'GENERATING_SEGMENTS':
      return {
        title: 'Stitching Scenes',
        storyLine: 'Stitching the scenes together frame by frame...',
        doodleKind: 'person',
        progressPercent: 80,
      };
    case 'QA_CHECKING':
      return {
        title: 'Final Touches',
        storyLine: 'Final touches: verifying motion smoothness & audio sync...',
        doodleKind: 'sparkle',
        progressPercent: 90,
      };
    case 'ASSEMBLING':
      return {
        title: 'Final Touches',
        storyLine: 'Final touches: binding audio soundtrack into MP4 film...',
        doodleKind: 'plant',
        progressPercent: 95,
      };
    case 'COMPLETED':
      return {
        title: 'Premiere Ready',
        storyLine: 'Your memory film is ready to watch!',
        doodleKind: 'star',
        progressPercent: 100,
      };
    case 'FAILED':
      return {
        title: 'Render Hiccup',
        storyLine: 'A gentle pause occurred during rendering.',
        doodleKind: 'star',
        progressPercent: 0,
      };
    default:
      // Safe fallback for unknown or unhandled states
      return {
        title: 'Crafting Memory',
        storyLine: 'Crafting your memory film in the studio...',
        doodleKind: 'sparkle',
        progressPercent: 50,
      };
  }
}
