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
        minHeight: 'clamp(420px, 59dvh, 860px)',
        padding: 'clamp(12px, 1.5dvh, 24px) clamp(16px, 3vw, 48px)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        textAlign: 'center',
        gap: 'clamp(18px, 3.2dvh, 48px)',
        position: 'relative',
        maxWidth: 'min(1400px, 94%)',
        margin: 'auto',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      {/* Header Section with Sticker, Handwritten Lead, Title, and Body */}
      <header
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'clamp(10px, 1.8dvh, 24px)',
          alignItems: 'center',
          textAlign: 'center',
          width: '100%',
        }}
      >
        {/* Centered Sticker & Tape directly above headline as part of group */}
        <div
          style={{
            position: 'relative',
            display: 'inline-flex',
            flexDirection: 'column',
            alignItems: 'center',
            marginBottom: 'clamp(4px, 0.8dvh, 10px)',
          }}
        >
          <Tape
            rotation="-2deg"
            style={{
              position: 'absolute',
              top: '-12px',
              left: '50%',
              transform: 'translateX(-50%) rotate(-2deg)',
            }}
          />
          <Sticker label="MEMORY STUDIO" rotation="2deg" variant="terracotta" />
        </div>

        <p
          className="handwritten"
          style={{
            fontSize: 'clamp(18px, 1.6vw, 32px)',
            color: 'var(--ink-terracotta)',
            margin: 0,
          }}
        >
          Welcome, traveler of memories...
        </p>
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="editorial-title"
          style={{
            fontSize: 'clamp(40px, 4.2vw, 88px)',
            lineHeight: 1.15,
            margin: 0,
            outline: 'none',
            maxWidth: '1280px',
          }}
        >
          Turn your ideas into a quiet, living video memory.
        </h1>
        <p
          style={{
            color: 'var(--ink-muted)',
            fontSize: 'clamp(16px, 1.3vw, 26px)',
            lineHeight: 1.5,
            margin: 0,
            maxWidth: '960px',
          }}
        >
          Craft an intimate animated memory with handwritten notes and gentle sound.
        </p>
      </header>

      {/* Single "Get started" button */}
      <div style={{ display: 'flex', justifyContent: 'center', width: '100%', marginTop: 'clamp(8px, 1.6dvh, 22px)' }}>
        <button
          type="button"
          onClick={onGetStarted}
          className="btn-secondary"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            minHeight: 'clamp(48px, 3.6vw, 72px)',
            padding: 'clamp(12px, 1.2vw, 20px) clamp(32px, 2.8vw, 64px)',
            fontSize: 'clamp(17px, 1.2vw, 24px)',
            cursor: 'pointer',
          }}
        >
          <span>Get started</span>
          <ArrowRight size={22} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
};

export default HeroStep;
