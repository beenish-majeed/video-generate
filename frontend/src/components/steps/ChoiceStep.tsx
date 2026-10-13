import React, { useRef, useEffect } from 'react';
import Tape from '../Tape';
import Sticker from '../Sticker';
import { ArrowRight, ArrowLeft } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';

export const ENABLE_PROMPT_PATH = false;

export interface ChoiceStepProps {
  onSelectPromptFlow: () => void;
  onSelectCustomMediaFlow: () => void;
  onBack: () => void;
}

/**
 * Original hand-drawn SVG doodle for Prompt Idea
 */
const DoodlePromptIdea: React.FC<{ size?: number }> = ({ size = 56 }) => {
  const shouldReduceMotion = useReducedMotion();
  const transition = (delay: number) => ({
    duration: shouldReduceMotion ? 0 : 0.6,
    delay: shouldReduceMotion ? 0 : delay,
    ease: 'easeOut',
  });

  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      {/* Lightbulb glass outline */}
      <motion.path
        d="M32 10 C21 10, 15 18, 15 28 C15 35, 22 40, 24 45 L40 45 C42 40, 49 35, 49 28 C49 18, 43 10, 32 10 Z"
        stroke="var(--ink-amber)"
        strokeWidth="2.5"
        strokeLinecap="round"
        fill="rgba(240, 160, 75, 0.12)"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={transition(0)}
      />
      {/* Filament scribble */}
      <motion.path
        d="M27 28 C29 23, 31 23, 32 28 C33 23, 35 23, 37 28"
        stroke="var(--ink-amber)"
        strokeWidth="2"
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={transition(0.2)}
      />
      {/* Base screw thread */}
      <motion.path
        d="M26 49 L38 49 M28 53 L36 53 M30 57 L34 57"
        stroke="var(--ink-primary)"
        strokeWidth="2"
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={transition(0.3)}
      />
      {/* Idea sparkle rays */}
      <motion.path
        d="M32 3 L32 7 M10 20 L14 22 M54 20 L50 22"
        stroke="var(--ink-amber)"
        strokeWidth="2"
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={transition(0.4)}
      />
    </svg>
  );
};

/**
 * Original hand-drawn SVG doodle for Custom Media (Portrait + Mic)
 */
const DoodleCustomMedia: React.FC<{ size?: number }> = ({ size = 56 }) => {
  const shouldReduceMotion = useReducedMotion();
  const transition = (delay: number) => ({
    duration: shouldReduceMotion ? 0 : 0.6,
    delay: shouldReduceMotion ? 0 : delay,
    ease: 'easeOut',
  });

  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      {/* Polaroid photo frame */}
      <motion.rect
        x="8"
        y="12"
        width="32"
        height="40"
        rx="3"
        stroke="var(--ink-primary)"
        strokeWidth="2.5"
        fill="var(--paper-cream)"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={transition(0)}
      />
      {/* Photo inner window */}
      <motion.rect
        x="12"
        y="16"
        width="24"
        height="24"
        stroke="var(--ink-primary)"
        strokeWidth="1.5"
        fill="rgba(110, 140, 115, 0.15)"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={transition(0.15)}
      />
      {/* Simple portrait person outline inside frame */}
      <motion.circle
        cx="24"
        cy="25"
        r="5"
        stroke="var(--ink-sage)"
        strokeWidth="2"
        fill="none"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={transition(0.25)}
      />
      <motion.path
        d="M17 38 C17 33, 31 33, 31 38"
        stroke="var(--ink-sage)"
        strokeWidth="2"
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={transition(0.35)}
      />
      {/* Microphone on right side */}
      <motion.rect
        x="44"
        y="16"
        width="10"
        height="18"
        rx="5"
        stroke="var(--ink-terracotta)"
        strokeWidth="2"
        fill="rgba(196, 98, 77, 0.15)"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={transition(0.2)}
      />
      <motion.path
        d="M40 26 C40 33, 58 33, 58 26"
        stroke="var(--ink-terracotta)"
        strokeWidth="2"
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={transition(0.3)}
      />
      <motion.path
        d="M49 33 L49 46 M43 46 L55 46"
        stroke="var(--ink-terracotta)"
        strokeWidth="2"
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={transition(0.4)}
      />
    </svg>
  );
};

export const ChoiceStep: React.FC<ChoiceStepProps> = ({
  onSelectPromptFlow,
  onSelectCustomMediaFlow,
  onBack,
}) => {
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Focus heading on mount for accessibility screen transition
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <div
      className="step-container"
      style={{
        padding: '28px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
        position: 'relative',
        maxWidth: '840px',
        margin: '0 auto',
      }}
    >
      <Tape rotation="-2deg" style={{ position: 'absolute', top: '10px', left: '30px' }} />

      {/* Top Navigation Row: Back Button & Header Sticker */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
        }}
      >
        <button
          type="button"
          onClick={onBack}
          className="btn-secondary"
          aria-label="Back to welcome page"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            minHeight: '44px',
            minWidth: '44px',
            padding: '10px 18px',
            fontSize: '15px',
            cursor: 'pointer',
          }}
        >
          <ArrowLeft size={16} aria-hidden="true" />
          <span>Back</span>
        </button>

        <Sticker label="CREATIVE PATH" rotation="2deg" variant="terracotta" />
      </div>

      {/* Header Section */}
      <header style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '4px' }}>
        <p className="handwritten" style={{ fontSize: '22px', color: 'var(--ink-terracotta)', margin: 0 }}>
          Your story, your medium...
        </p>
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="editorial-title"
          style={{ fontSize: '30px', lineHeight: 1.2, margin: 0, outline: 'none' }}
        >
          How would you like to begin?
        </h1>
        <p style={{ color: 'var(--ink-muted)', fontSize: '15px', lineHeight: 1.5, margin: 0 }}>
          Choose your creative path below to begin crafting your personal animated film.
        </p>
      </header>

      {/* Two Choice Cards: Equal, Side-by-Side on wide screens, Stacked on narrow screens (320px to 2560px) */}
      <div
        className="choice-cards-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '20px',
          alignItems: 'stretch',
          marginTop: '6px',
          width: '100%',
        }}
      >
        {/* Card 1: Start with a prompt */}
        <div
          aria-disabled={!ENABLE_PROMPT_PATH}
          style={{
            position: 'relative',
            backgroundColor: ENABLE_PROMPT_PATH ? 'var(--paper-cream-alt)' : 'rgba(247, 243, 235, 0.7)',
            border: ENABLE_PROMPT_PATH ? '1.5px solid var(--paper-border)' : '1.5px dashed var(--paper-border)',
            borderRadius: 'var(--radius-paper)',
            padding: '24px 20px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: '16px',
            boxShadow: 'var(--shadow-card)',
            transform: 'rotate(-0.5deg)',
            opacity: ENABLE_PROMPT_PATH ? 1 : 0.85,
            boxSizing: 'border-box',
          }}
        >
          <Tape rotation="-3deg" style={{ position: 'absolute', top: '-12px', right: '24px' }} />

          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              {ENABLE_PROMPT_PATH ? (
                <Sticker label="QUICK PROMPT" variant="amber" rotation="-1deg" />
              ) : (
                <Sticker label="COMING SOON" variant="terracotta" rotation="-1deg" />
              )}
              <DoodlePromptIdea size={52} />
            </div>

            <h2 className="editorial-title" style={{ fontSize: '22px', marginBottom: '6px' }}>
              Start with a prompt
            </h2>
            <p style={{ fontSize: '14px', color: 'var(--ink-muted)', lineHeight: 1.45, margin: 0 }}>
              Write an idea and make a video.
            </p>

            {!ENABLE_PROMPT_PATH && (
              <p
                style={{
                  fontSize: '13px',
                  color: 'var(--ink-terracotta)',
                  lineHeight: 1.4,
                  marginTop: '10px',
                  fontStyle: 'italic',
                }}
              >
                Default studio assets are not yet available on the backend. Please use your own photo and voice for now.
              </p>
            )}
          </div>

          {ENABLE_PROMPT_PATH ? (
            <button
              type="button"
              onClick={onSelectPromptFlow}
              className="btn-terracotta"
              style={{
                marginTop: 'auto',
                justifyContent: 'center',
                width: '100%',
                fontSize: '16px',
                minHeight: '44px',
                padding: '12px 20px',
                cursor: 'pointer',
              }}
            >
              <span>Start with Prompt</span>
              <ArrowRight size={18} aria-hidden="true" />
            </button>
          ) : (
            <div
              aria-hidden="true"
              style={{
                marginTop: 'auto',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: '44px',
                padding: '12px 20px',
                borderRadius: '8px',
                border: '1px dashed var(--paper-border)',
                backgroundColor: 'rgba(235, 227, 215, 0.4)',
                color: 'var(--ink-muted)',
                fontSize: '14px',
                fontFamily: 'var(--font-sans)',
                userSelect: 'none',
              }}
            >
              <span>Coming soon (needs default assets)</span>
            </div>
          )}
        </div>

        {/* Card 2: Use my own photo and voice */}
        <div
          style={{
            position: 'relative',
            backgroundColor: 'var(--paper-cream-alt)',
            border: '1.5px solid var(--paper-border)',
            borderRadius: 'var(--radius-paper)',
            padding: '24px 20px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: '16px',
            boxShadow: 'var(--shadow-card)',
            transform: 'rotate(0.5deg)',
            boxSizing: 'border-box',
          }}
        >
          <Tape rotation="2deg" style={{ position: 'absolute', top: '-12px', right: '24px' }} />

          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <Sticker label="CUSTOM MEDIA" variant="sage" rotation="1deg" />
              <DoodleCustomMedia size={52} />
            </div>

            <h2 className="editorial-title" style={{ fontSize: '22px', marginBottom: '6px' }}>
              Use my own photo and voice
            </h2>
            <p style={{ fontSize: '14px', color: 'var(--ink-muted)', lineHeight: 1.45, margin: 0 }}>
              The current flow: photo, voice, duration, script, and consent.
            </p>
          </div>

          <button
            type="button"
            onClick={onSelectCustomMediaFlow}
            className="btn-secondary"
            style={{
              marginTop: 'auto',
              justifyContent: 'center',
              width: '100%',
              fontSize: '16px',
              minHeight: '44px',
              padding: '12px 20px',
              cursor: 'pointer',
            }}
          >
            <span>Use my photo &amp; voice</span>
            <ArrowRight size={18} aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChoiceStep;
