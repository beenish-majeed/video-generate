import React, { useState } from 'react';
import Tape from '../Tape';
import Sticker from '../Sticker';
import { Sparkles, ArrowRight, ArrowLeft } from 'lucide-react';
import type { ScriptTone } from '../../types/api';
import { validateIdeaPrompt, MAX_IDEA_PROMPT_LENGTH } from '../../utils/ideaValidation';
import { playStickerPopSound } from '../../utils/soundEffects';

export interface IdeaStepProps {
  initialIdea?: string;
  initialTone?: ScriptTone;
  onNext: (idea: string, tone: ScriptTone) => void;
  onBack: () => void;
}

const EXAMPLE_CHIPS: Array<{ label: string; text: string }> = [
  {
    label: '🍂 Autumn Walk',
    text: 'A quiet autumn morning walk along a winding forest trail, watching golden leaves drift down in the gentle sunlight.',
  },
  {
    label: '💛 Community Thanks',
    text: 'A warm and sincere thank-you message celebrating our wonderful creative community for all their support this year.',
  },
  {
    label: '🚀 Studio Journey',
    text: 'A short reflection on how our small studio began with a simple notebook idea and grew into an animated dream.',
  },
  {
    label: '✨ Starlit Tale',
    text: 'A gentle bedtime story about looking up at the constellations on a quiet night and dreaming under the stars.',
  },
];

const TONE_OPTIONS: Array<{ value: ScriptTone; label: string; description: string }> = [
  { value: 'friendly', label: 'Friendly', description: 'Warm & conversational' },
  { value: 'professional', label: 'Professional', description: 'Clear & polished' },
  { value: 'storytelling', label: 'Storytelling', description: 'Rich & descriptive' },
  { value: 'educational', label: 'Educational', description: 'Engaging & insightful' },
];

export const IdeaStep: React.FC<IdeaStepProps> = ({
  initialIdea = '',
  initialTone = 'friendly',
  onNext,
  onBack,
}) => {
  const [idea, setIdea] = useState<string>(initialIdea);
  const [tone, setTone] = useState<ScriptTone>(initialTone);

  const validation = validateIdeaPrompt(idea);
  const isNearLimit = validation.remaining <= 100;
  const isOverLimit = validation.remaining < 0;

  const handleSelectExample = (text: string) => {
    playStickerPopSound();
    setIdea(text);
  };

  const handleSelectTone = (selectedTone: ScriptTone) => {
    playStickerPopSound();
    setTone(selectedTone);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validation.isValid) {
      onNext(idea.trim(), tone);
    }
  };

  return (
    <div
      className="step-container"
      style={{
        padding: 'clamp(16px, 2.5dvh, 32px) clamp(16px, 2.5vw, 44px)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'clamp(12px, 1.8dvh, 22px)',
        position: 'relative',
        maxWidth: 'min(1500px, 96%)',
        margin: 'auto',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      <Tape rotation="-2deg" style={{ position: 'absolute', top: '10px', left: '28px' }} />

      {/* Top Header Row with Back Button */}
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
          aria-label="Back to previous screen"
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

        <Sticker label="STEP 01" rotation="2deg" variant="amber" />
      </div>

      {/* Title & Description */}
      <header style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(3px, 0.6dvh, 8px)' }}>
        <p className="handwritten" style={{ fontSize: 'clamp(18px, 1.4vw, 24px)', color: 'var(--ink-terracotta)', margin: 0 }}>
          Where every story starts...
        </p>
        <h1 className="editorial-title" style={{ fontSize: 'clamp(24px, 2.2vw, 36px)', lineHeight: 1.2, margin: 0 }}>
          What is your video about?
        </h1>
        <p style={{ color: 'var(--ink-muted)', fontSize: 'clamp(14px, 1vw, 17px)', lineHeight: 1.45, margin: 0 }}>
          Write a thought, a memory, or an idea. Our studio writer will turn it into a tailored spoken script.
        </p>
      </header>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(10px, 1.4dvh, 18px)' }}>
        {/* Textarea Box with Live Counter */}
        <div
          style={{
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: 'var(--paper-cream-alt)',
            border: isOverLimit ? '2px solid var(--ink-terracotta)' : '1.5px solid var(--paper-border)',
            borderRadius: 'var(--radius-paper)',
            padding: 'clamp(10px, 1.4dvh, 16px) clamp(12px, 1.5vw, 16px)',
            boxShadow: 'var(--shadow-card)',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <label
              htmlFor="idea-input"
              style={{
                fontFamily: 'var(--font-hand)',
                fontSize: '17px',
                fontWeight: 'bold',
                color: 'var(--ink-primary)',
              }}
            >
              Your Idea Prompt
            </label>
            <span
              id="idea-counter"
              aria-live="polite"
              style={{
                fontSize: '12px',
                fontFamily: 'var(--font-mono, monospace)',
                color: isOverLimit
                  ? 'var(--ink-terracotta)'
                  : isNearLimit
                  ? 'var(--ink-amber)'
                  : 'var(--ink-muted)',
                fontWeight: isNearLimit ? 'bold' : 'normal',
              }}
            >
              {idea.length} / {MAX_IDEA_PROMPT_LENGTH} characters
            </span>
          </div>

          <textarea
            id="idea-input"
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            maxLength={MAX_IDEA_PROMPT_LENGTH}
            aria-describedby="idea-counter idea-examples-hint"
            placeholder="Describe the story, memory, or message you want to animate..."
            rows={3}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '10px 12px',
              borderRadius: '8px',
              border: '1px solid var(--paper-border)',
              backgroundColor: '#fffcf7',
              fontFamily: 'var(--font-sans)',
              fontSize: '14px',
              lineHeight: 1.5,
              color: 'var(--ink-primary)',
              resize: 'vertical',
              outline: 'none',
              minHeight: 'clamp(72px, 10dvh, 100px)',
            }}
          />

          {validation.error && (
            <p style={{ margin: 0, fontSize: '13px', color: 'var(--ink-terracotta)' }} role="alert">
              {validation.error}
            </p>
          )}
        </div>

        {/* 4 Example Chips */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Sparkles size={16} style={{ color: 'var(--ink-amber)' }} aria-hidden="true" />
            <span
              id="idea-examples-hint"
              style={{ fontSize: '13.5px', fontFamily: 'var(--font-hand)', color: 'var(--ink-primary)' }}
            >
              Or pick an idea to get started:
            </span>
          </div>

          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 'clamp(6px, 1vw, 10px)',
            }}
          >
            {EXAMPLE_CHIPS.map((chip, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSelectExample(chip.text)}
                className="btn-secondary"
                style={{
                  padding: 'clamp(6px, 1dvh, 8px) clamp(10px, 1vw, 14px)',
                  fontSize: '12.5px',
                  borderRadius: '16px',
                  minHeight: '44px',
                  cursor: 'pointer',
                  backgroundColor: 'var(--paper-cream)',
                  borderColor: 'var(--paper-border)',
                  color: 'var(--ink-primary)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <span>{chip.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Tone Selector */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(6px, 1dvh, 10px)' }}>
          <label
            style={{
              fontFamily: 'var(--font-hand)',
              fontSize: '17px',
              fontWeight: 'bold',
              color: 'var(--ink-primary)',
            }}
          >
            Narrator Tone
          </label>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: 'clamp(8px, 1.2vw, 12px)',
            }}
          >
            {TONE_OPTIONS.map((opt) => {
              const isSelected = tone === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleSelectTone(opt.value)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    justifyContent: 'center',
                    padding: 'clamp(8px, 1dvh, 12px) clamp(10px, 1vw, 14px)',
                    minHeight: '44px',
                    borderRadius: '8px',
                    border: isSelected ? '2px solid var(--ink-terracotta)' : '1px solid var(--paper-border)',
                    backgroundColor: isSelected ? '#fffcf5' : 'var(--paper-cream)',
                    boxShadow: isSelected ? 'var(--shadow-card)' : 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.15s ease',
                  }}
                  aria-pressed={isSelected}
                >
                  <span
                    style={{
                      fontFamily: 'var(--font-hand)',
                      fontSize: '15px',
                      fontWeight: 'bold',
                      color: isSelected ? 'var(--ink-terracotta)' : 'var(--ink-primary)',
                    }}
                  >
                    {opt.label}
                  </span>
                  <span style={{ fontSize: '11.5px', color: 'var(--ink-muted)' }}>{opt.description}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Actions Row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: '4px',
            paddingTop: 'clamp(8px, 1.2dvh, 14px)',
            borderTop: '1px solid var(--paper-border)',
          }}
        >
          <button
            type="button"
            onClick={onBack}
            className="btn-secondary"
            style={{ minHeight: '44px', padding: '8px 18px', cursor: 'pointer' }}
          >
            <ArrowLeft size={16} aria-hidden="true" />
            <span>Back</span>
          </button>

          <button
            type="submit"
            disabled={!validation.isValid}
            className="btn-terracotta"
            style={{
              minHeight: '44px',
              padding: '10px 22px',
              cursor: validation.isValid ? 'pointer' : 'not-allowed',
              opacity: validation.isValid ? 1 : 0.6,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <span>Choose Length</span>
            <ArrowRight size={18} aria-hidden="true" />
          </button>
        </div>
      </form>
    </div>
  );
};

export default IdeaStep;
