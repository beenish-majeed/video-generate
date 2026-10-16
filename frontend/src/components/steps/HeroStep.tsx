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
    headingRef.current?.focus();
  }, []);

  return (
    <div
      className="step-container"
      style={{
        padding: 'clamp(32px, 6dvh, 56px) clamp(20px, 4vw, 40px)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 'clamp(20px, 3.5dvh, 32px)',
        position: 'relative',
        maxWidth: '720px',
        margin: '0 auto',
        minHeight: 'clamp(360px, 52dvh, 520px)',
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
          gap: 'clamp(10px, 2dvh, 16px)',
          textAlign: 'center',
          width: '100%',
          maxWidth: '640px',
        }}
      >
        <p className="handwritten" style={{ fontSize: '24px', color: 'var(--ink-terracotta)', margin: 0 }}>
          Welcome, traveler of memories...
        </p>
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="editorial-title"
          style={{ fontSize: 'clamp(26px, 3vw, 36px)', lineHeight: 1.25, margin: 0, outline: 'none' }}
        >
          Turn your ideas into a quiet, living video memory.
        </h1>
        <p style={{ color: 'var(--ink-muted)', fontSize: 'clamp(15px, 1.2vw, 17px)', lineHeight: 1.5, margin: 0 }}>
          Craft an intimate animated memory with handwritten notes and gentle sound.
        </p>
      </header>

      {/* Single "Get started" button */}
      <div style={{ display: 'flex', justifyContent: 'center', width: '100%', marginTop: '8px' }}>
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
            padding: '12px 36px',
            fontSize: '17px',
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
