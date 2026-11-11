import React, { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { type JourneyStepId, type FlowMode, getStepListForMode } from './PageTabs';

export interface StoryTimelineProps {
  currentStep: JourneyStepId;
  flowMode?: FlowMode;
  onSelectStep?: (step: JourneyStepId) => void;
}

export interface StoryChapter {
  id: JourneyStepId;
  label: string;
  chapterNumber: string;
}

export const StoryTimeline: React.FC<StoryTimelineProps> = ({
  currentStep,
  flowMode = 'custom_media',
  onSelectStep,
}) => {
  const shouldReduceMotion = useReducedMotion();
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  // If on hero or choice, provide a high-level prologue overview
  const isIntro = currentStep === 'hero' || currentStep === 'choice';

  const stepsList = isIntro
    ? [
        { id: 'hero' as JourneyStepId, label: 'Prologue', tabTitle: 'Prologue' },
        { id: 'choice' as JourneyStepId, label: 'Path', tabTitle: 'Direction' },
        { id: (flowMode === 'prompt_first' ? 'idea' : 'photo') as JourneyStepId, label: 'Concept', tabTitle: 'Create' },
        { id: 'script' as JourneyStepId, label: 'Story', tabTitle: 'Narrative' },
        { id: 'waiting' as JourneyStepId, label: 'Render', tabTitle: 'Studio' },
        { id: 'premiere' as JourneyStepId, label: 'Film', tabTitle: 'Premiere' },
      ]
    : getStepListForMode(flowMode);

  const currentIndex = stepsList.findIndex((s) => s.id === currentStep);
  const activeIndex = currentIndex >= 0 ? currentIndex : 0;
  const totalSteps = stepsList.length;
  const progressRatio = totalSteps > 1 ? activeIndex / (totalSteps - 1) : 0;

  return (
    <aside
      className="story-timeline-rail horizontal-timeline"
      aria-label="Story Progress Timeline"
      role="navigation"
      style={{
        width: '100%',
        maxWidth: '680px',
        margin: '0 auto',
        padding: '4px 8px',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        userSelect: 'none',
      }}
    >
      <div
        className="story-timeline-container"
        style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          height: '24px',
        }}
      >
        {/* Background track connecting line */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: '6px',
            right: '6px',
            height: '2px',
            top: '50%',
            transform: 'translateY(-50%)',
            backgroundColor: 'rgba(0, 128, 128, 0.2)',
            borderRadius: '1px',
            zIndex: 0,
          }}
        >
          {/* Animated filled progress line */}
          <motion.div
            initial={false}
            animate={{
              width: `${Math.min(100, Math.max(0, progressRatio * 100))}%`,
            }}
            transition={{
              duration: shouldReduceMotion ? 0 : 0.4,
              ease: [0.16, 1, 0.3, 1],
            }}
            style={{
              height: '100%',
              backgroundColor: 'var(--teal-primary)',
              borderRadius: '1px',
            }}
          />
        </div>

        {/* Story Dots */}
        {stepsList.map((step, idx) => {
          const isActive = step.id === currentStep;
          const isCompleted = activeIndex > idx && currentStep !== 'failed';
          const isClickable =
            idx <= activeIndex &&
            currentStep !== 'waiting' &&
            currentStep !== 'failed' &&
            step.id !== currentStep;
          const isHovered = hoveredIdx === idx;

          return (
            <div
              key={step.id}
              style={{
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1,
              }}
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
            >
              {/* Interactive Dot */}
              <button
                type="button"
                onClick={() => isClickable && onSelectStep && onSelectStep(step.id)}
                disabled={!isClickable}
                aria-label={`Story step ${idx + 1}: ${step.tabTitle || step.label}${isActive ? ' (current step)' : isCompleted ? ' (completed)' : ''}`}
                aria-current={isActive ? 'step' : undefined}
                style={{
                  width: isActive ? '14px' : '10px',
                  height: isActive ? '14px' : '10px',
                  borderRadius: '50%',
                  border: isActive
                    ? '2px solid var(--teal-primary)'
                    : isCompleted
                    ? '2px solid var(--teal-primary)'
                    : '2px solid rgba(0, 128, 128, 0.35)',
                  backgroundColor: isActive
                    ? 'var(--teal-primary)'
                    : isCompleted
                    ? 'var(--teal-primary)'
                    : 'var(--beige-surface)',
                  boxShadow: isActive
                    ? '0 0 0 3px rgba(0, 128, 128, 0.25), 0 0 10px rgba(0, 128, 128, 0.35)'
                    : 'none',
                  cursor: isClickable ? 'pointer' : 'default',
                  padding: 0,
                  outline: 'none',
                  transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transform: isHovered && isClickable ? 'scale(1.25)' : 'scale(1)',
                }}
              >
                {isActive && (
                  <span
                    style={{
                      width: '4px',
                      height: '4px',
                      borderRadius: '50%',
                      backgroundColor: 'var(--beige-surface)',
                    }}
                  />
                )}
              </button>

              {/* Story Tooltip / Label */}
              <motion.div
                initial={false}
                animate={{
                  opacity: isActive || isHovered ? 1 : 0,
                  y: isActive || isHovered ? 0 : -4,
                  pointerEvents: isActive || isHovered ? 'auto' : 'none',
                }}
                transition={{ duration: shouldReduceMotion ? 0 : 0.2 }}
                style={{
                  position: 'absolute',
                  top: '24px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  whiteSpace: 'nowrap',
                  padding: '3px 8px',
                  borderRadius: 'var(--radius-pill)',
                  backgroundColor: 'var(--beige-surface)',
                  border: '1px solid rgba(0, 128, 128, 0.3)',
                  boxShadow: '0 2px 8px rgba(0, 128, 128, 0.12)',
                  color: 'var(--text-primary)',
                  fontSize: '11px',
                  fontWeight: isActive ? 600 : 500,
                  fontFamily: 'var(--font-sans)',
                  pointerEvents: 'none',
                  zIndex: 20,
                }}
              >
                <span style={{ color: 'var(--teal-primary)', marginRight: '4px', fontWeight: 700 }}>
                  {String(idx + 1).padStart(2, '0')}.
                </span>
                {step.tabTitle || step.label}
              </motion.div>
            </div>
          );
        })}
      </div>
    </aside>
  );
};

export default StoryTimeline;
