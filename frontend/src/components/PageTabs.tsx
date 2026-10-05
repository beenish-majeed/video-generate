import React from 'react';
import { Check } from 'lucide-react';

export type JourneyStepId =
  | 'hero'
  | 'photo'
  | 'voice'
  | 'duration'
  | 'script'
  | 'consent'
  | 'waiting'
  | 'premiere'
  | 'failed';

export interface StepDefinition {
  id: JourneyStepId;
  label: string;
  tabTitle: string;
}

export const JOURNEY_STEPS: StepDefinition[] = [
  { id: 'hero', label: 'Start', tabTitle: '00. Intro' },
  { id: 'photo', label: 'Photo', tabTitle: '01. Memory Photo' },
  { id: 'voice', label: 'Voice', tabTitle: '02. Voice Sample' },
  { id: 'duration', label: 'Duration', tabTitle: '03. Pace & Time' },
  { id: 'script', label: 'Script', tabTitle: '04. Narrative' },
  { id: 'consent', label: 'Consent', tabTitle: '05. Rights & Consent' },
  { id: 'waiting', label: 'Creating', tabTitle: '06. Studio Render' },
  { id: 'premiere', label: 'Premiere', tabTitle: '07. Final Film' },
];

interface PageTabsProps {
  currentStep: JourneyStepId;
  onSelectStep?: (step: JourneyStepId) => void;
}

export const PageTabs: React.FC<PageTabsProps> = ({ currentStep, onSelectStep }) => {
  const currentIndex = JOURNEY_STEPS.findIndex((s) => s.id === currentStep);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        overflowX: 'auto',
        padding: '8px 16px 0 16px',
        backgroundColor: 'var(--paper-cream-dark)',
        borderBottom: '1px solid var(--paper-border)',
      }}
    >
      {JOURNEY_STEPS.map((step, idx) => {
        const isActive = step.id === currentStep;
        const isCompleted = currentIndex > idx && currentStep !== 'failed';
        const isClickable = idx <= currentIndex && currentStep !== 'waiting' && currentStep !== 'failed';

        return (
          <button
            key={step.id}
            onClick={() => isClickable && onSelectStep && onSelectStep(step.id)}
            disabled={!isClickable}
            style={{
              padding: '6px 14px',
              borderRadius: '8px 8px 0 0',
              border: '1px solid var(--paper-border)',
              borderBottom: isActive ? '1px solid var(--paper-cream)' : '1px solid var(--paper-border)',
              backgroundColor: isActive
                ? 'var(--paper-cream)'
                : isCompleted
                ? 'var(--paper-cream-alt)'
                : 'rgba(225, 215, 200, 0.5)',
              color: isActive
                ? 'var(--ink-terracotta)'
                : isCompleted
                ? 'var(--ink-primary)'
                : 'var(--ink-muted)',
              fontFamily: 'var(--font-hand)',
              fontSize: '17px',
              fontWeight: isActive ? 'bold' : '500',
              cursor: isClickable ? 'pointer' : 'default',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transform: isActive ? 'translateY(1px)' : 'none',
              transition: 'all 0.15s ease',
              whiteSpace: 'nowrap',
            }}
          >
            {isCompleted ? (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '16px',
                  height: '16px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--ink-sage)',
                  color: '#fff',
                }}
              >
                <Check size={10} strokeWidth={3} />
              </span>
            ) : null}
            <span>{step.tabTitle}</span>
          </button>
        );
      })}
    </div>
  );
};

export default PageTabs;
