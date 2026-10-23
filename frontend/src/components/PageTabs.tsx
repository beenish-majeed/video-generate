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
  | 'consent'
  | 'waiting'
  | 'premiere'
  | 'failed';

export type FlowMode = 'custom_media' | 'prompt_first' | 'images_audio';

export interface StepDefinition {
  id: JourneyStepId;
  label: string;
  tabTitle: string;
}

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

// Helper to get step definitions for a given flow mode
export function getStepListForMode(flowMode: FlowMode = 'custom_media'): StepDefinition[] {
  if (flowMode === 'prompt_first') return PROMPT_FIRST_STEPS;
  if (flowMode === 'images_audio') return IMAGES_AUDIO_STEPS;
  return CUSTOM_MEDIA_STEPS;
}

interface PageTabsProps {
  currentStep: JourneyStepId;
  flowMode?: FlowMode;
  onSelectStep?: (step: JourneyStepId) => void;
}

export const PageTabs: React.FC<PageTabsProps> = ({
  currentStep,
  flowMode = 'custom_media',
  onSelectStep,
}) => {
  const shouldReduceMotion = useReducedMotion();

  // Step tabs are hidden on welcome and choice screens
  if (currentStep === 'hero' || currentStep === 'choice') {
    return null;
  }

  const stepsList = getStepListForMode(flowMode);
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
  }, [currentStep, flowMode]);

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
                    backgroundColor: 'rgba(108, 77, 255, 0.12)',
                    borderRadius: '2px',
                    overflow: 'hidden',
                    flexShrink: 0,
                    position: 'relative',
                  }}
                >
                  <motion.div
                    initial={false}
                    animate={{ scaleX: idx <= currentIndex ? 1 : 0 }}
                    transition={{
                      duration: shouldReduceMotion ? 0 : 0.35,
                      ease: [0.16, 1, 0.3, 1],
                    }}
                    style={{
                      width: '100%',
                      height: '100%',
                      backgroundColor: 'var(--accent-primary)',
                      transformOrigin: 'left',
                    }}
                  />
                </div>
              )}
              <button
                ref={isActive ? activeTabRef : null}
                role="tab"
                aria-selected={isActive}
                aria-disabled={!isClickable}
                onClick={() => isClickable && onSelectStep && onSelectStep(step.id)}
                disabled={!isClickable}
                style={{
                  padding: '6px 14px',
                  minHeight: '36px',
                  borderRadius: 'var(--radius-pill)',
                  border: isActive
                    ? '1px solid var(--accent-primary-border)'
                    : isCompleted
                    ? '1px solid var(--border-light)'
                    : '1px solid transparent',
                  backgroundColor: isActive
                    ? 'var(--accent-primary-light)'
                    : isCompleted
                    ? 'var(--bg-surface)'
                    : 'transparent',
                  color: isActive
                    ? 'var(--accent-primary)'
                    : isCompleted
                    ? 'var(--text-secondary)'
                    : 'var(--text-muted)',
                  fontFamily: 'var(--font-sans)',
                  fontSize: '13px',
                  fontWeight: isActive ? 600 : 500,
                  cursor: isClickable ? 'pointer' : 'default',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.15s ease',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
              >
                {isCompleted ? (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '15px',
                      height: '15px',
                      borderRadius: '50%',
                      backgroundColor: 'var(--accent-primary)',
                      color: '#fff',
                    }}
                  >
                    <Check size={10} strokeWidth={3} />
                  </span>
                ) : null}
                <span>{step.tabTitle}</span>
              </button>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};

export default PageTabs;
