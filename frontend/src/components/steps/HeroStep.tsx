import React from 'react';
import HeroScene from '../HeroScene';
import Tape from '../Tape';
import Sticker from '../Sticker';
import { ArrowRight, Sparkles, Upload, MessageSquare } from 'lucide-react';

export interface HeroStepProps {
  prompt: string;
  onPromptChange: (prompt: string) => void;
  onSelectPromptFlow: () => void;
  onSelectCustomMediaFlow: () => void;
}

const PROMPT_SUGGESTIONS = [
  'A serene mountain lake at sunset with gentle breeze',
  'Quiet morning tea in a cozy sunlit room',
  'Autumn leaves softly falling along a quiet park path',
];

export const HeroStep: React.FC<HeroStepProps> = ({
  prompt,
  onPromptChange,
  onSelectPromptFlow,
  onSelectCustomMediaFlow,
}) => {
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
      <Sticker label="MEMORY STUDIO" rotation="3deg" variant="terracotta" />

      {/* Header Section */}
      <header style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '10px' }}>
        <p className="handwritten" style={{ fontSize: '24px', color: 'var(--ink-terracotta)' }}>
          Welcome, traveler of memories...
        </p>
        <h1 className="editorial-title" style={{ fontSize: '32px', lineHeight: 1.2 }}>
          Turn your ideas into a quiet, living video memory.
        </h1>
        <p style={{ color: 'var(--ink-muted)', fontSize: '15px', lineHeight: 1.5 }}>
          Choose your creative path below to begin crafting your personal animated film.
        </p>
      </header>

      {/* Calm Illustrated Scene - Scales without distortion or cut-off */}
      <main style={{ margin: '4px 0', width: '100%' }}>
        <HeroScene />
      </main>

      {/* Choice Cards (2 Sticker-Style Options - Equal Height & Aligned Text) */}
      <div
        className="welcome-choice-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          alignItems: 'stretch',
          gap: '20px',
          marginTop: '8px',
        }}
      >
        {/* Card 1: Write a prompt and make a video */}
        <div
          style={{
            position: 'relative',
            backgroundColor: 'var(--paper-cream-alt)',
            border: '1.5px solid var(--paper-border)',
            borderRadius: 'var(--radius-paper)',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: '14px',
            boxShadow: 'var(--shadow-card)',
            transform: 'rotate(-0.5deg)',
            height: '100%',
          }}
        >
          <Tape rotation="-3deg" style={{ position: 'absolute', top: '-12px', right: '24px' }} />

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Sticker label="QUICK PROMPT" variant="amber" rotation="-1deg" />
            <Sparkles size={20} style={{ color: 'var(--ink-amber)' }} aria-hidden="true" />
          </div>

          <div style={{ minHeight: '64px' }}>
            <h2 className="editorial-title" style={{ fontSize: '20px', marginBottom: '4px' }}>
              Write a prompt and make a video
            </h2>
            <p style={{ fontSize: '14px', color: 'var(--ink-muted)', lineHeight: 1.4 }}>
              Type an idea or scene description to quickly generate your video memory.
            </p>
          </div>

          {/* Prompt Input Field & Suggestions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
            <label
              htmlFor="welcome-prompt-input"
              className="handwritten"
              style={{ fontSize: '17px', color: 'var(--ink-primary)', display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              <MessageSquare size={14} />
              <span>Your scene prompt:</span>
            </label>
            <textarea
              id="welcome-prompt-input"
              value={prompt}
              onChange={(e) => onPromptChange(e.target.value)}
              placeholder="e.g. Warm cinematic light, soft watercolor texture of a quiet sunset..."
              rows={3}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '8px',
                border: '1px solid var(--paper-border)',
                backgroundColor: 'var(--paper-cream)',
                fontFamily: 'var(--font-sans)',
                fontSize: '14px',
                color: 'var(--ink-primary)',
                resize: 'none',
              }}
            />

            {/* Quick Inspiration Chips */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
              {PROMPT_SUGGESTIONS.map((sug, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => onPromptChange(sug)}
                  className="handwritten"
                  style={{
                    fontSize: '13px',
                    padding: '2px 8px',
                    borderRadius: '12px',
                    border: '1px dashed var(--paper-border)',
                    backgroundColor: 'rgba(255, 255, 255, 0.6)',
                    color: 'var(--ink-muted)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                  aria-label={`Use suggestion: ${sug}`}
                >
                  ✨ {sug.slice(0, 24)}...
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={onSelectPromptFlow}
            className="btn-terracotta"
            aria-label="Start video creation using your prompt"
            style={{
              marginTop: 'auto',
              justifyContent: 'center',
              width: '100%',
              fontSize: '16px',
              padding: '12px 20px',
            }}
          >
            <span>Start with Prompt</span>
            <ArrowRight size={18} aria-hidden="true" />
          </button>
        </div>

        {/* Card 2: Upload your photo or voice */}
        <div
          style={{
            position: 'relative',
            backgroundColor: 'var(--paper-cream-alt)',
            border: '1.5px solid var(--paper-border)',
            borderRadius: 'var(--radius-paper)',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: '14px',
            boxShadow: 'var(--shadow-card)',
            transform: 'rotate(0.5deg)',
            height: '100%',
          }}
        >
          <Tape rotation="2deg" style={{ position: 'absolute', top: '-12px', right: '24px' }} />

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Sticker label="CUSTOM MEDIA" variant="sage" rotation="1deg" />
            <Upload size={20} style={{ color: 'var(--ink-sage)' }} aria-hidden="true" />
          </div>

          <div style={{ minHeight: '64px' }}>
            <h2 className="editorial-title" style={{ fontSize: '20px', marginBottom: '4px' }}>
              Upload your photo or voice
            </h2>
            <p style={{ fontSize: '14px', color: 'var(--ink-muted)', lineHeight: 1.4 }}>
              Upload your personal portrait image and voice sample for full customization.
            </p>
          </div>

          {/* Features Highlights */}
          <ul
            style={{
              listStyle: 'none',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              margin: '0',
              padding: '12px 14px',
              backgroundColor: 'rgba(255, 255, 255, 0.5)',
              borderRadius: '8px',
              border: '1px solid var(--paper-border)',
              flex: 1,
              justifyContent: 'center',
            }}
          >
            <li style={{ fontSize: '14px', color: 'var(--ink-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>📸</span>
              <span>Upload portrait photo (.jpg, .png)</span>
            </li>
            <li style={{ fontSize: '14px', color: 'var(--ink-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>🎙️</span>
              <span>Clone voice sample (.wav, .mp3, .ogg)</span>
            </li>
            <li style={{ fontSize: '14px', color: 'var(--ink-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>🎨</span>
              <span>Customize timing, script & narrative</span>
            </li>
          </ul>

          <button
            type="button"
            onClick={onSelectCustomMediaFlow}
            className="btn-secondary"
            aria-label="Start video creation by uploading photo or voice"
            style={{
              marginTop: 'auto',
              justifyContent: 'center',
              width: '100%',
              fontSize: '16px',
              padding: '12px 20px',
            }}
          >
            <span>Upload Photo & Voice</span>
            <ArrowRight size={18} aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default HeroStep;
