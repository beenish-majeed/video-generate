import React, { useRef, useEffect } from 'react';
import Tape from '../Tape';
import Sticker from '../Sticker';
import { ArrowRight } from 'lucide-react';

export interface HeroStepProps {
  onGetStarted: () => void;
  // Optional backwards compatibility props
  prompt?: string;
  onPromptChange?: (prompt: string) => void;
  onSelectPromptFlow?: () => void;
  onSelectCustomMediaFlow?: () => void;
}

export const HeroStep: React.FC<HeroStepProps> = ({ onGetStarted }) => {
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Focus heading on transition for accessibility
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div
      className="step-container"
      style={{
        padding: 'clamp(28px, 5dvh, 60px) clamp(20px, 4vw, 48px)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 'clamp(20px, 3.5dvh, 36px)',
        position: 'relative',
        maxWidth: 'min(920px, 92%)',
        margin: 'auto',
        width: '100%',
      }}
    >
      <Tape rotation="-2deg" style={{ position: 'absolute', top: '10px', left: '30px' }} />
      <div style={{ alignSelf: 'flex-start' }}>
        <Sticker label="MEMORY STUDIO" rotation="3deg" variant="terracotta" />
      </div>

      {/* Header Section */}
      <header
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'clamp(12px, 2dvh, 20px)',
          textAlign: 'center',
          width: '100%',
          maxWidth: '820px',
        }}
      >
        <p className="handwritten" style={{ fontSize: 'clamp(18px, 1.2vw + 10px, 28px)', color: 'var(--ink-terracotta)', margin: 0 }}>
          Welcome, traveler of memories...
        </p>
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="editorial-title"
          style={{ fontSize: 'clamp(26px, 2.8vw + 8px, 48px)', lineHeight: 1.25, margin: 0, outline: 'none' }}
        >
          Turn your ideas into a quiet, living video memory.
        </h1>
        <p style={{ color: 'var(--ink-muted)', fontSize: 'clamp(15px, 0.8vw + 8px, 19px)', lineHeight: 1.5, margin: 0, maxWidth: '680px', alignSelf: 'center' }}>
          Craft an intimate animated memory with handwritten notes and gentle sound.
        </p>
      </header>

      {/* Single "Get started" button */}
      <div style={{ display: 'flex', justifyContent: 'center', width: '100%', marginTop: 'clamp(8px, 1.5dvh, 16px)' }}>
        <button
          type="button"
          onClick={onGetStarted}
          className="btn-secondary"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            minHeight: '48px',
            padding: 'clamp(12px, 1.5dvh, 16px) clamp(28px, 2.5vw, 42px)',
            fontSize: 'clamp(16px, 0.8vw + 8px, 19px)',
            cursor: 'pointer',
          }}
        >
          <span>Get started</span>
          <ArrowRight size={18} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
};

export default HeroStep;
