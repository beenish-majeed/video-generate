import React, { useRef, useEffect } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Check } from 'lucide-react';

export type JourneyStepId =
  | 'hero'
  | 'choice'
  | 'idea'
  | 'photo'
  | 'voice'
  | 'images_audio'
  | 'duration'
  | 'look_voice'
  | 'script'
  | 'scene_plan'
  | 'upload_clips'
  | 'consent'
  | 'waiting'
  | 'premiere'
  | 'failed';

export type FlowMode = 'custom_media' | 'prompt_first' | 'images_audio' | 'ai_clips';

export interface StepDefinition {
  id: JourneyStepId;
  label: string;
  tabTitle: string;
}

// Single config flag to toggle between streamlined 2-mode workflows and legacy studio steps
export const ENABLE_EXTENDED_WORKFLOWS = false;

// Streamlined Flow A: Text to video
export const STREAMLINED_PROMPT_STEPS: StepDefinition[] = [
  { id: 'idea', label: 'Prompt', tabTitle: '01. Prompt' },
  { id: 'duration', label: 'Duration', tabTitle: '02. Duration' },
  { id: 'waiting', label: 'Creating', tabTitle: '03. Studio Render' },
  { id: 'premiere', label: 'Premiere', tabTitle: '04. Premiere' },
];

// Streamlined Flow B: Picture to video (Default voice: includes prompt for script generation)
export const STREAMLINED_PICTURE_STEPS: StepDefinition[] = [
  { id: 'photo', label: 'Picture', tabTitle: '01. Picture' },
  { id: 'voice', label: 'Voice', tabTitle: '02. Voice' },
  { id: 'duration', label: 'Duration', tabTitle: '03. Duration' },
  { id: 'idea', label: 'Prompt', tabTitle: '04. Prompt' },
  { id: 'consent', label: 'Consent', tabTitle: '05. Consent' },
  { id: 'waiting', label: 'Creating', tabTitle: '06. Studio Render' },
  { id: 'premiere', label: 'Premiere', tabTitle: '07. Premiere' },
];

// Streamlined Flow B: Picture to video (Own voice uploaded/recorded: skips prompt screen)
export const STREAMLINED_PICTURE_STEPS_OWN_VOICE: StepDefinition[] = [
  { id: 'photo', label: 'Picture', tabTitle: '01. Picture' },
  { id: 'voice', label: 'Voice', tabTitle: '02. Voice' },
  { id: 'duration', label: 'Duration', tabTitle: '03. Duration' },
  { id: 'consent', label: 'Consent', tabTitle: '04. Consent' },
  { id: 'waiting', label: 'Creating', tabTitle: '05. Studio Render' },
  { id: 'premiere', label: 'Premiere', tabTitle: '06. Premiere' },
];

// Legacy / Extended workflows (preserved intact behind ENABLE_EXTENDED_WORKFLOWS flag)
export const CUSTOM_MEDIA_STEPS: StepDefinition[] = [
  { id: 'photo', label: 'Photo', tabTitle: '01. Memory Photo' },
  { id: 'voice', label: 'Voice', tabTitle: '02. Voice Sample' },
  { id: 'duration', label: 'Duration', tabTitle: '03. Pace & Time' },
  { id: 'script', label: 'Script', tabTitle: '04. Narrative' },
  { id: 'consent', label: 'Consent', tabTitle: '05. Rights & Consent' },
  { id: 'waiting', label: 'Creating', tabTitle: '06. Studio Render' },
  { id: 'premiere', label: 'Premiere', tabTitle: '07. Final Film' },
];

export const PROMPT_FIRST_STEPS: StepDefinition[] = [
  { id: 'idea', label: 'Idea', tabTitle: '01. Idea' },
  { id: 'duration', label: 'Length', tabTitle: '02. Length' },
  { id: 'look_voice', label: 'Look & Voice', tabTitle: '03. Look & Voice' },
  { id: 'script', label: 'Script', tabTitle: '04. Script' },
  { id: 'consent', label: 'Consent', tabTitle: '05. Rights & Consent' },
  { id: 'waiting', label: 'Creating', tabTitle: '06. Studio Render' },
  { id: 'premiere', label: 'Premiere', tabTitle: '07. Final Film' },
];

export const IMAGES_AUDIO_STEPS: StepDefinition[] = [
  { id: 'images_audio', label: 'Photos & Voice', tabTitle: '01. Photos & Audio' },
  { id: 'consent', label: 'Consent', tabTitle: '02. Rights & Consent' },
  { id: 'waiting', label: 'Creating', tabTitle: '03. Studio Render' },
  { id: 'premiere', label: 'Premiere', tabTitle: '04. Final Film' },
];

export const AI_CLIPS_STEPS: StepDefinition[] = [
  { id: 'idea', label: 'Idea', tabTitle: '01. Idea' },
  { id: 'duration', label: 'Length & Style', tabTitle: '02. Length & Style' },
  { id: 'script', label: 'Script', tabTitle: '03. Script' },
  { id: 'scene_plan', label: 'Scene Plan', tabTitle: '04. Scene Plan' },
  { id: 'upload_clips', label: 'Upload Clips', tabTitle: '05. Upload Clips' },
  { id: 'voice', label: 'Voice', tabTitle: '06. Voice' },
  { id: 'consent', label: 'Consent', tabTitle: '07. Consent' },
  { id: 'waiting', label: 'Creating', tabTitle: '08. Studio Render' },
  { id: 'premiere', label: 'Premiere', tabTitle: '09. Final Film' },
];

// Helper to get step definitions for a given flow mode
export function getStepListForMode(
  flowMode: FlowMode = 'custom_media',
  hasOwnVoice: boolean = false,
  enableExtended: boolean = ENABLE_EXTENDED_WORKFLOWS
): StepDefinition[] {
  if (enableExtended) {
    if (flowMode === 'prompt_first') return PROMPT_FIRST_STEPS;
    if (flowMode === 'images_audio') return IMAGES_AUDIO_STEPS;
    if (flowMode === 'ai_clips') return AI_CLIPS_STEPS;
    return CUSTOM_MEDIA_STEPS;
  }

  if (flowMode === 'prompt_first') {
    return STREAMLINED_PROMPT_STEPS;
  }
  return hasOwnVoice ? STREAMLINED_PICTURE_STEPS_OWN_VOICE : STREAMLINED_PICTURE_STEPS;
}

export interface PageTabsProps {
  currentStep: JourneyStepId;
  flowMode?: FlowMode;
  hasOwnVoice?: boolean;
  onSelectStep?: (step: JourneyStepId) => void;
}

export const PageTabs: React.FC<PageTabsProps> = ({
  currentStep,
  flowMode = 'custom_media',
  hasOwnVoice = false,
  onSelectStep,
}) => {
  const shouldReduceMotion = useReducedMotion();

  // Step tabs are hidden on welcome and choice screens
  if (currentStep === 'hero' || currentStep === 'choice') {
    return null;
  }

  const stepsList = getStepListForMode(flowMode, hasOwnVoice);
  const currentIndex = stepsList.findIndex((s) => s.id === currentStep);

  const activeTabRef = useRef<HTMLButtonElement | null>(null);

  // Keep active tab smoothly scrolled into view on mobile / small screens
  useEffect(() => {
    if (activeTabRef.current) {
      activeTabRef.current.scrollIntoView({
        behavior: 'smooth',
        inline: 'center',
        block: 'nearest',
      });
    }
  }, [currentStep, flowMode, hasOwnVoice]);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
      }}
    >
      {/* Scrollable Tabs List */}
      <div
        className="hide-scrollbar"
        role="tablist"
        aria-label="Step navigation"
        tabIndex={0}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          overflowX: 'auto',
          WebkitOverflowScrolling: 'touch',
          padding: '4px 0',
          maxWidth: '100%',
        }}
      >
        {stepsList.map((step, idx) => {
          const isActive = step.id === currentStep;
          const isCompleted = currentIndex > idx && currentStep !== 'failed';
          const isClickable =
            idx <= currentIndex && currentStep !== 'waiting' && currentStep !== 'failed';

          return (
            <React.Fragment key={step.id}>
              {/* Smooth connecting line between steps */}
              {idx > 0 && (
                <div
                  aria-hidden="true"
                  style={{
                    width: '12px',
                    height: '2px',
                    backgroundColor: isCompleted ? 'var(--teal-primary)' : 'rgba(0, 128, 128, 0.2)',
                    transition: shouldReduceMotion ? 'none' : 'background-color 0.3s ease',
                  }}
                />
              )}

              <motion.button
                ref={isActive ? activeTabRef : null}
                type="button"
                role="tab"
                aria-selected={isActive}
                disabled={!isClickable}
                onClick={() => isClickable && onSelectStep?.(step.id)}
                whileHover={isClickable ? { scale: 1.03 } : {}}
                whileTap={isClickable ? { scale: 0.97 } : {}}
                transition={{ type: 'spring', stiffness: 450, damping: 28 }}
                className={`step-tab ${isActive ? 'step-tab-active' : ''} ${
                  isCompleted ? 'step-tab-completed' : ''
                }`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  borderRadius: 'var(--radius-pill)',
                  border: isActive ? '1px solid var(--accent)' : '1px solid transparent',
                  backgroundColor: isActive ? 'var(--bg-card)' : 'transparent',
                  color: isActive
                    ? 'var(--accent)'
                    : isCompleted
                    ? 'var(--text-secondary)'
                    : 'var(--text-muted)',
                  cursor: isClickable ? 'pointer' : 'default',
                  whiteSpace: 'nowrap',
                  fontSize: '13px',
                  fontWeight: isActive ? 600 : 500,
                  outline: 'none',
                }}
              >
                {isCompleted && (
                  <Check size={12} style={{ color: 'var(--accent)', strokeWidth: 3 }} />
                )}
                <span>{step.label}</span>
              </motion.button>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};

export default PageTabs;
