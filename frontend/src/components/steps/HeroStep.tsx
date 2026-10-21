import React, { useRef, useEffect } from 'react';
import { ArrowRight } from 'lucide-react';

export interface HeroStepProps {
  onGetStarted: () => void;
  prompt?: string;
  onPromptChange?: (prompt: string) => void;
  onSelectPromptFlow?: () => void;
  onSelectCustomMediaFlow?: () => void;
}

export const HeroStep: React.FC<HeroStepProps> = ({ onGetStarted }) => {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div
      className="step-container"
      style={{
        minHeight: '100%',
        flex: 1,
        padding: '0 clamp(16px, 3vw, 48px)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        textAlign: 'center',
        gap: 'clamp(20px, 3.5dvh, 48px)',
        position: 'relative',
        maxWidth: 'min(1200px, 94%)',
        margin: 'auto',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      <header
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'clamp(14px, 2dvh, 24px)',
          alignItems: 'center',
          textAlign: 'center',
          width: '100%',
        }}
      >
        <h1
          ref={headingRef}
          tabIndex={-1}
          style={{
            fontSize: 'clamp(36px, 4.2vw, 64px)',
            lineHeight: 1.15,
            margin: 0,
            outline: 'none',
            maxWidth: 'clamp(18ch, 20ch, 22ch)',
            textWrap: 'balance',
            fontWeight: 700,
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-sans)',
          }}
        >
          Turn your ideas into a quiet, living video memory.
        </h1>
        <p
          style={{
            color: 'var(--text-muted)',
            fontSize: 'clamp(16px, 1.2vw, 20px)',
            lineHeight: 1.5,
            margin: 0,
            maxWidth: '680px',
            fontFamily: 'var(--font-sans)',
          }}
        >
          Craft an intimate animated memory with gentle sound.
        </p>
      </header>

      {/* Single "Get started" button */}
      <div style={{ display: 'flex', justifyContent: 'center', width: '100%', marginTop: 0 }}>
        <button
          type="button"
          onClick={onGetStarted}
          className="btn-primary"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            minHeight: '48px',
            padding: '14px 36px',
            fontSize: '17px',
            cursor: 'pointer',
          }}
        >
          <span>Get started</span>
          <ArrowRight size={20} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
};

export default HeroStep;
