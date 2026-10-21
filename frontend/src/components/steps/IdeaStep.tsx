import React, { useState } from 'react';
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
        gap: 'clamp(16px, 2dvh, 24px)',
        position: 'relative',
        maxWidth: 'min(1100px, 96%)',
        margin: 'auto',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      {/* Title & Description */}
      <header style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <h1 className="editorial-title" style={{ fontSize: 'clamp(24px, 2.2vw, 34px)', lineHeight: 1.2, margin: 0 }}>
          What is your video about?
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 'clamp(14px, 1vw, 16px)', lineHeight: 1.5, margin: 0 }}>
          Write a thought, a memory, or an idea. Our studio writer will turn it into a tailored spoken script.
        </p>
      </header>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(10px, 1.4dvh, 18px)' }}>
        {/* Textarea Box with Live Counter */}
        <div
          className="card"
          style={{
            padding: 'clamp(14px, 1.8dvh, 20px)',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            borderColor: isOverLimit ? 'var(--accent-danger)' : undefined,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <label
              htmlFor="idea-input"
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: '15px',
                fontWeight: 600,
                color: 'var(--text-primary)',
              }}
            >
              Your Idea Prompt
            </label>
            <span
              id="idea-counter"
              aria-live="polite"
              style={{
                fontSize: '12.5px',
                fontFamily: 'var(--font-sans)',
                color: isOverLimit
                  ? 'var(--accent-danger)'
                  : isNearLimit
                  ? 'var(--accent-warning)'
                  : 'var(--text-muted)',
                fontWeight: isNearLimit ? 600 : 400,
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
              padding: '12px 14px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-light)',
              backgroundColor: 'var(--bg-subtle)',
              fontFamily: 'var(--font-sans)',
              fontSize: '14.5px',
              lineHeight: 1.5,
              color: 'var(--text-primary)',
              resize: 'vertical',
              outline: 'none',
              minHeight: 'clamp(80px, 11dvh, 110px)',
            }}
          />

          {validation.error && (
            <p style={{ margin: 0, fontSize: '13px', color: 'var(--accent-danger)' }} role="alert">
              {validation.error}
            </p>
          )}
        </div>

        {/* 4 Example Chips */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Sparkles size={16} style={{ color: 'var(--accent-primary)' }} aria-hidden="true" />
            <span
              id="idea-examples-hint"
              style={{ fontSize: '13.5px', fontFamily: 'var(--font-sans)', fontWeight: 500, color: 'var(--text-secondary)' }}
            >
              Or pick an idea to get started:
            </span>
          </div>

          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '8px',
            }}
          >
            {EXAMPLE_CHIPS.map((chip, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSelectExample(chip.text)}
                className="btn-secondary"
                style={{
                  padding: '6px 14px',
                  fontSize: '13px',
                  borderRadius: 'var(--radius-pill)',
                  minHeight: '44px',
                  cursor: 'pointer',
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-light)',
                  color: 'var(--text-primary)',
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <label
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '15px',
              fontWeight: 600,
              color: 'var(--text-primary)',
            }}
          >
            Narrator Tone
          </label>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: '12px',
            }}
          >
            {TONE_OPTIONS.map((opt) => {
              const isSelected = tone === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleSelectTone(opt.value)}
                  className={`card ${isSelected ? 'card-selected' : ''}`}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    justifyContent: 'center',
                    padding: '12px 16px',
                    minHeight: '44px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.15s ease',
                  }}
                  aria-pressed={isSelected}
                >
                  <span
                    style={{
                      fontFamily: 'var(--font-sans)',
                      fontSize: '14.5px',
                      fontWeight: 600,
                      color: isSelected ? 'var(--accent-primary)' : 'var(--text-primary)',
                    }}
                  >
                    {opt.label}
                  </span>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{opt.description}</span>
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
            marginTop: '8px',
            paddingTop: '16px',
            borderTop: '1px solid var(--border-light)',
          }}
        >
          <button
            type="button"
            onClick={onBack}
            className="btn-secondary"
            style={{ minHeight: '44px', padding: '10px 20px', cursor: 'pointer' }}
          >
            <ArrowLeft size={16} aria-hidden="true" />
            <span>Back</span>
          </button>

          <button
            type="submit"
            disabled={!validation.isValid}
            className="btn-primary"
            style={{
              minHeight: '44px',
              padding: '10px 24px',
              cursor: validation.isValid ? 'pointer' : 'not-allowed',
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
