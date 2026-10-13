import React, { useRef, useEffect } from 'react';
import HeroScene from '../HeroScene';
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
        padding: '28px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
        position: 'relative',
        maxWidth: '840px',
        margin: '0 auto',
        alignItems: 'center',
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
          gap: '8px',
          marginTop: '6px',
          textAlign: 'center',
          width: '100%',
        }}
      >
        <p className="handwritten" style={{ fontSize: '24px', color: 'var(--ink-terracotta)', margin: 0 }}>
          Welcome, traveler of memories...
        </p>
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="editorial-title"
          style={{ fontSize: '32px', lineHeight: 1.2, margin: 0, outline: 'none' }}
        >
          Turn your ideas into a quiet, living video memory.
        </h1>
        <p style={{ color: 'var(--ink-muted)', fontSize: '16px', lineHeight: 1.5, margin: 0 }}>
          Craft an intimate animated memory with handwritten notes and gentle sound.
        </p>
      </header>

      {/* Calm Illustrated Scene */}
      <div role="region" aria-label="Creative illustration" style={{ margin: '8px 0', width: '100%' }}>
        <HeroScene />
      </div>

      {/* Single "Get started" button */}
      <div style={{ display: 'flex', justifyContent: 'center', width: '100%', marginTop: '4px' }}>
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
            padding: '12px 32px',
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
