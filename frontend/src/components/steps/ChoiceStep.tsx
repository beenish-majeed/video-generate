import React, { useRef, useEffect } from 'react';
import Tape from '../Tape';
import Sticker from '../Sticker';
import { ArrowRight, ArrowLeft } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { DoodleCamera } from '../Doodles';
import ComputerCapabilitiesPanel from '../ComputerCapabilitiesPanel';

export const ENABLE_PROMPT_PATH = true;

export interface ChoiceStepProps {
  onSelectPromptFlow: () => void;
  onSelectImagesAudioFlow: () => void;
  onSelectCustomMediaFlow: () => void;
  onBack: () => void;
}

/**
 * Original hand-drawn SVG doodle for Prompt Idea
 */
const DoodlePromptIdea: React.FC<{ size?: number }> = ({ size = 52 }) => {
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
const DoodleCustomMedia: React.FC<{ size?: number }> = ({ size = 52 }) => {
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
  onSelectImagesAudioFlow,
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
        padding: 'clamp(16px, 3dvh, 32px) clamp(16px, 2.5vw, 36px)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'clamp(12px, 2dvh, 22px)',
        position: 'relative',
        maxWidth: 'min(1360px, 94%)',
        margin: 'auto',
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
            padding: '8px 16px',
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
      <header style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(4px, 0.8dvh, 8px)', marginTop: '2px' }}>
        <p className="handwritten" style={{ fontSize: 'clamp(18px, 1.2vw + 8px, 24px)', color: 'var(--ink-terracotta)', margin: 0 }}>
          Your story, your medium...
        </p>
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="editorial-title"
          style={{ fontSize: 'clamp(24px, 2.2vw + 6px, 34px)', lineHeight: 1.2, margin: 0, outline: 'none' }}
        >
          How would you like to begin?
        </h1>
        <p style={{ color: 'var(--ink-muted)', fontSize: 'clamp(14px, 0.9vw + 6px, 17px)', lineHeight: 1.45, margin: 0 }}>
          Choose your creative path below to begin crafting your personal film.
        </p>
      </header>

      {/* Three Choice Cards: Side-by-Side on wide screens, Stacked on narrow screens (320px to 2560px) */}
      <div
        className="choice-cards-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 'clamp(14px, 1.8vw, 24px)',
          alignItems: 'stretch',
          marginTop: 'clamp(4px, 1dvh, 12px)',
          width: '100%',
        }}
      >
        {/* Card 1: Write an idea (text to video) */}
        <div
          style={{
            position: 'relative',
            backgroundColor: 'var(--paper-cream-alt)',
            border: '1.5px solid var(--paper-border)',
            borderRadius: 'var(--radius-paper)',
            padding: 'clamp(16px, 2.2dvh, 26px) clamp(16px, 1.8vw, 24px)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: 'clamp(12px, 1.8dvh, 20px)',
            boxShadow: 'var(--shadow-card)',
            transform: 'rotate(-0.5deg)',
            boxSizing: 'border-box',
          }}
        >
          <Tape rotation="-3deg" style={{ position: 'absolute', top: '-12px', right: '24px' }} />

          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'clamp(8px, 1.2dvh, 14px)' }}>
              <Sticker label="TEXT TO VIDEO" variant="amber" rotation="-1deg" />
              <DoodlePromptIdea size={42} />
            </div>

            <h2 className="editorial-title" style={{ fontSize: 'clamp(18px, 1.3vw + 4px, 23px)', marginBottom: '6px' }}>
              Write an idea
            </h2>
            <p style={{ fontSize: 'clamp(13px, 0.8vw + 4px, 15.5px)', color: 'var(--ink-muted)', lineHeight: 1.45, margin: 0 }}>
              Type an idea, pick an animated visual style, and generate scenes with gentle camera moves.
            </p>
          </div>

          <button
            type="button"
            onClick={onSelectPromptFlow}
            className="btn-terracotta"
            style={{
              marginTop: 'auto',
              justifyContent: 'center',
              width: '100%',
              fontSize: 'clamp(14px, 0.8vw + 5px, 16px)',
              minHeight: '44px',
              padding: 'clamp(10px, 1.4dvh, 14px) 18px',
              cursor: 'pointer',
            }}
          >
            <span>Write an idea</span>
            <ArrowRight size={17} aria-hidden="true" />
          </button>
        </div>

        {/* Card 2: Use my photos and voice (images + audio) */}
        <div
          style={{
            position: 'relative',
            backgroundColor: 'var(--paper-cream-alt)',
            border: '1.5px solid var(--paper-border)',
            borderRadius: 'var(--radius-paper)',
            padding: 'clamp(16px, 2.2dvh, 26px) clamp(16px, 1.8vw, 24px)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: 'clamp(12px, 1.8dvh, 20px)',
            boxShadow: 'var(--shadow-card)',
            transform: 'rotate(0.3deg)',
            boxSizing: 'border-box',
          }}
        >
          <Tape rotation="1.5deg" style={{ position: 'absolute', top: '-12px', right: '24px' }} />

          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'clamp(8px, 1.2dvh, 14px)' }}>
              <Sticker label="PHOTOS &amp; AUDIO" variant="sage" rotation="1deg" />
              <DoodleCamera size={40} color="var(--ink-sage)" />
            </div>

            <h2 className="editorial-title" style={{ fontSize: 'clamp(18px, 1.3vw + 4px, 23px)', marginBottom: '6px' }}>
              Use my photos and voice
            </h2>
            <p style={{ fontSize: 'clamp(13px, 0.8vw + 4px, 15.5px)', color: 'var(--ink-muted)', lineHeight: 1.45, margin: 0 }}>
              Upload 1 to 30 photos with custom timing, your voice recording, and optional face lip sync.
            </p>
          </div>

          <button
            type="button"
            onClick={onSelectImagesAudioFlow}
            className="btn-secondary"
            style={{
              marginTop: 'auto',
              justifyContent: 'center',
              width: '100%',
              fontSize: 'clamp(14px, 0.8vw + 5px, 16px)',
              minHeight: '44px',
              padding: 'clamp(10px, 1.4dvh, 14px) 18px',
              cursor: 'pointer',
            }}
          >
            <span>Use my photos and voice</span>
            <ArrowRight size={17} aria-hidden="true" />
          </button>
        </div>

        {/* Card 3: A talking face (custom portrait + voice) */}
        <div
          style={{
            position: 'relative',
            backgroundColor: 'var(--paper-cream-alt)',
            border: '1.5px solid var(--paper-border)',
            borderRadius: 'var(--radius-paper)',
            padding: 'clamp(16px, 2.2dvh, 26px) clamp(16px, 1.8vw, 24px)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: 'clamp(12px, 1.8dvh, 20px)',
            boxShadow: 'var(--shadow-card)',
            transform: 'rotate(0.6deg)',
            boxSizing: 'border-box',
          }}
        >
          <Tape rotation="2deg" style={{ position: 'absolute', top: '-12px', right: '24px' }} />

          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'clamp(8px, 1.2dvh, 14px)' }}>
              <Sticker label="TALKING FACE" variant="blue" rotation="-1deg" />
              <DoodleCustomMedia size={42} />
            </div>

            <h2 className="editorial-title" style={{ fontSize: 'clamp(18px, 1.3vw + 4px, 23px)', marginBottom: '6px' }}>
              A talking face
            </h2>
            <p style={{ fontSize: 'clamp(13px, 0.8vw + 4px, 15.5px)', color: 'var(--ink-muted)', lineHeight: 1.45, margin: 0 }}>
              Bring a single portrait photo to life with synchronized facial expressions and speech.
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
              fontSize: 'clamp(14px, 0.8vw + 5px, 16px)',
              minHeight: '44px',
              padding: 'clamp(10px, 1.4dvh, 14px) 18px',
              cursor: 'pointer',
            }}
          >
            <span>A talking face</span>
            <ArrowRight size={17} aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Your computer panel with honest time estimate & limitations notice */}
      <div style={{ marginTop: 'clamp(4px, 0.8dvh, 10px)', width: '100%' }}>
        <ComputerCapabilitiesPanel mode="slideshow" durationSeconds={30} showLimitations={true} />
      </div>
    </div>
  );
};

export default ChoiceStep;
