import React, { useState } from 'react';
import { ArrowRight, ArrowLeft } from 'lucide-react';
import type { ScriptTone } from '../../types/api';
import { validateIdeaPrompt, MAX_IDEA_PROMPT_LENGTH } from '../../utils/ideaValidation';
import { playStickerPopSound } from '../../utils/soundEffects';
import StoryScrollSection from '../ui/StoryScrollSection';

export interface IdeaStepProps {
  initialIdea?: string;
  initialTone?: ScriptTone;
  label?: string;
  submitLabel?: string;
  maxWords?: number;
  onNext: (idea: string, tone: ScriptTone) => void;
  onBack: () => void;
}

export const EXAMPLE_CHIPS: Array<{ label: string; text: string }> = [
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

export const TONE_OPTIONS: Array<{ value: ScriptTone; label: string; description: string }> = [
  { value: 'friendly', label: 'Friendly', description: 'Warm & conversational' },
  { value: 'professional', label: 'Professional', description: 'Clear & polished' },
  { value: 'storytelling', label: 'Storytelling', description: 'Rich & descriptive' },
  { value: 'educational', label: 'Educational', description: 'Engaging & insightful' },
];

export const IdeaStep: React.FC<IdeaStepProps> = ({
  initialIdea = '',
  initialTone = 'friendly',
  label = 'Your prompt',
  submitLabel = 'Continue',
  maxWords,
  onNext,
  onBack,
}) => {
  const [idea, setIdea] = useState<string>(initialIdea);
  const [tone, setTone] = useState<ScriptTone>(initialTone);

  // Compute validation
  const wordCount = idea.trim() ? idea.trim().split(/\s+/).length : 0;
  const isWordLimited = typeof maxWords === 'number' && maxWords > 0;
  const isOverWordLimit = isWordLimited && wordCount > maxWords;

  const charValidation = validateIdeaPrompt(idea);
  const isCharLimited = !isWordLimited;
  const isOverCharLimit = isCharLimited && charValidation.remaining < 0;
  const isNearCharLimit = isCharLimited && charValidation.remaining <= 100 && charValidation.remaining >= 0;

  const isValid = isWordLimited
    ? idea.trim().length > 0 && !isOverWordLimit
    : charValidation.isValid;

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
    if (isValid) {
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
        gap: 'clamp(14px, 2dvh, 20px)',
        position: 'relative',
        maxWidth: 'min(900px, 96%)',
        margin: 'auto',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      {/* Label only */}
      <StoryScrollSection as="header" style={{ textAlign: 'left', width: '100%' }}>
        <h2 className="editorial-title" style={{ fontSize: 'clamp(22px, 2vw, 30px)', lineHeight: 1.2, margin: 0 }}>
          {label}
        </h2>
      </StoryScrollSection>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px', width: '100%' }}>
        {/* Large Textarea */}
        <StoryScrollSection delay={0.04} style={{ width: '100%' }}>
          <div
            className="card"
            style={{
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              borderColor: (isOverCharLimit || isOverWordLimit) ? 'var(--accent-danger)' : undefined,
              background: 'var(--bg-surface)',
              width: '100%',
              boxSizing: 'border-box',
            }}
          >
            <textarea
              id="idea-input"
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              maxLength={isCharLimited ? MAX_IDEA_PROMPT_LENGTH : undefined}
              placeholder="Describe your video..."
              rows={5}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '12px 14px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-light)',
                backgroundColor: 'var(--bg-subtle)',
                fontFamily: 'var(--font-sans)',
                fontSize: '15px',
                lineHeight: 1.5,
                color: 'var(--text-primary)',
                resize: 'vertical',
                outline: 'none',
                minHeight: '140px',
              }}
            />

            {/* Unobtrusive counter only near limit */}
            {isCharLimited && (isNearCharLimit || isOverCharLimit) && (
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <span
                  style={{
                    fontSize: '12px',
                    color: isOverCharLimit ? 'var(--accent-danger)' : 'var(--accent)',
                    fontWeight: 500,
                  }}
                >
                  {idea.length} / {MAX_IDEA_PROMPT_LENGTH} characters
                </span>
              </div>
            )}

            {isWordLimited && (
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <span
                  style={{
                    fontSize: '12px',
                    color: isOverWordLimit ? 'var(--accent-danger)' : 'var(--text-muted)',
                    fontWeight: isOverWordLimit ? 600 : 400,
                  }}
                >
                  {wordCount} / {maxWords} words
                </span>
              </div>
            )}
          </div>
        </StoryScrollSection>

        {/* 4 Example Chips in tidy equal-size row */}
        <StoryScrollSection delay={0.08} style={{ width: '100%' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
              gap: '8px',
              width: '100%',
            }}
          >
            {EXAMPLE_CHIPS.map((chip, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSelectExample(chip.text)}
                className="btn-secondary"
                style={{
                  padding: '8px 12px',
                  fontSize: '13px',
                  borderRadius: 'var(--radius-pill)',
                  minHeight: '40px',
                  cursor: 'pointer',
                  textAlign: 'center',
                  justifyContent: 'center',
                  border: '1px solid var(--border-light)',
                  background: 'var(--bg-surface)',
                  color: 'var(--text-primary)',
                }}
              >
                <span>{chip.label}</span>
              </button>
            ))}
          </div>
        </StoryScrollSection>

        {/* Tone Chips in tidy equal-size row */}
        <StoryScrollSection delay={0.12} style={{ width: '100%' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
              gap: '10px',
              width: '100%',
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
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '12px 10px',
                    minHeight: '44px',
                    cursor: 'pointer',
                    textAlign: 'center',
                    border: isSelected ? '2px solid var(--accent)' : '1px solid var(--border-light)',
                    background: isSelected ? 'var(--bg-card)' : 'var(--bg-surface)',
                    borderRadius: 'var(--radius-card)',
                  }}
                  aria-pressed={isSelected}
                >
                  <span
                    style={{
                      fontSize: '14px',
                      fontWeight: 600,
                      color: isSelected ? 'var(--accent)' : 'var(--text-primary)',
                    }}
                  >
                    {opt.label}
                  </span>
                  <span style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    {opt.description}
                  </span>
                </button>
              );
            })}
          </div>
        </StoryScrollSection>

        {/* Footer Actions - Only two buttons: Back and Continue */}
        <StoryScrollSection
          as="footer"
          delay={0.16}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: '8px',
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
            disabled={!isValid}
            className="btn-primary"
            style={{
              minHeight: '44px',
              padding: '10px 24px',
              cursor: isValid ? 'pointer' : 'not-allowed',
            }}
          >
            <span>{submitLabel}</span>
            <ArrowRight size={16} aria-hidden="true" />
          </button>
        </StoryScrollSection>
      </form>
    </div>
  );
};

export default IdeaStep;
