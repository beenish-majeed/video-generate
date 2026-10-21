import React, { useRef, useEffect } from 'react';
import { ArrowRight, ArrowLeft, Sparkles, Image, User } from 'lucide-react';

export const ENABLE_PROMPT_PATH = true;

export interface ChoiceStepProps {
  onSelectPromptFlow: () => void;
  onSelectImagesAudioFlow: () => void;
  onSelectCustomMediaFlow: () => void;
  onBack: () => void;
}

export const ChoiceStep: React.FC<ChoiceStepProps> = ({
  onSelectPromptFlow,
  onSelectImagesAudioFlow,
  onSelectCustomMediaFlow,
  onBack,
}) => {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div
      className="step-container"
      style={{
        padding: 'clamp(16px, 2.5dvh, 32px) 0',
        display: 'flex',
        flexDirection: 'column',
        gap: 'clamp(16px, 2dvh, 28px)',
        position: 'relative',
        maxWidth: 'min(1280px, 100%)',
        margin: 'auto',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      {/* Top Navigation Row: Back Button */}
      <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
        <button
          type="button"
          onClick={onBack}
          className="btn-secondary"
          aria-label="Back to welcome page"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          <span>Back</span>
        </button>
      </div>

      {/* Header Section */}
      <header style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="editorial-title"
          style={{ fontSize: 'clamp(26px, 2.8vw, 36px)', margin: 0, outline: 'none' }}
        >
          How would you like to begin?
        </h1>
        <p className="page-lead" style={{ margin: 0 }}>
          Choose your creative path below to begin crafting your personal film.
        </p>
      </header>

      {/* Three Choice Cards: Side-by-Side on wide screens, Stacked on narrow screens */}
      <div
        className="choice-cards-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: 'clamp(16px, 2vw, 24px)',
          alignItems: 'stretch',
          width: '100%',
        }}
      >
        {/* Card 1: Write an idea (text to video) */}
        <div
          className="card"
          style={{
            padding: 'clamp(20px, 2.5vw, 28px)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: '20px',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '12px',
                backgroundColor: 'var(--accent-primary-light)',
                color: 'var(--accent-primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Sparkles size={22} />
            </div>

            <h2 style={{ fontSize: 'clamp(18px, 1.4vw, 22px)', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
              Write an idea
            </h2>
            <p style={{ fontSize: '14.5px', color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>
              Type an idea, pick an animated visual style, and generate scenes with gentle camera moves.
            </p>
          </div>

          <button
            type="button"
            onClick={onSelectPromptFlow}
            className="btn-primary"
            style={{ width: '100%', marginTop: 'auto' }}
          >
            <span>Write an idea</span>
            <ArrowRight size={17} aria-hidden="true" />
          </button>
        </div>

        {/* Card 2: Use my photos and voice (images + audio) */}
        <div
          className="card"
          style={{
            padding: 'clamp(20px, 2.5vw, 28px)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: '20px',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '12px',
                backgroundColor: 'var(--accent-primary-light)',
                color: 'var(--accent-primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Image size={22} />
            </div>

            <h2 style={{ fontSize: 'clamp(18px, 1.4vw, 22px)', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
              Use my photos and voice
            </h2>
            <p style={{ fontSize: '14.5px', color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>
              Upload 1 to 30 photos with custom timing, your voice recording, and optional face lip sync.
            </p>
          </div>

          <button
            type="button"
            onClick={onSelectImagesAudioFlow}
            className="btn-secondary"
            style={{ width: '100%', marginTop: 'auto' }}
          >
            <span>Use my photos and voice</span>
            <ArrowRight size={17} aria-hidden="true" />
          </button>
        </div>

        {/* Card 3: A talking face (custom portrait + voice) */}
        <div
          className="card"
          style={{
            padding: 'clamp(20px, 2.5vw, 28px)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: '20px',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '12px',
                backgroundColor: 'var(--accent-primary-light)',
                color: 'var(--accent-primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <User size={22} />
            </div>

            <h2 style={{ fontSize: 'clamp(18px, 1.4vw, 22px)', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
              A talking face
            </h2>
            <p style={{ fontSize: '14.5px', color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>
              Bring a single portrait photo to life with synchronized facial expressions and speech.
            </p>
          </div>

          <button
            type="button"
            onClick={onSelectCustomMediaFlow}
            className="btn-secondary"
            style={{ width: '100%', marginTop: 'auto' }}
          >
            <span>A talking face</span>
            <ArrowRight size={17} aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChoiceStep;
