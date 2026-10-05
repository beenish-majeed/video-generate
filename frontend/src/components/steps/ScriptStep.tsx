import React from 'react';
import Tape from '../Tape';
import Sticker from '../Sticker';
import { ArrowRight, ArrowLeft, FileText, Sparkles } from 'lucide-react';

interface ScriptStepProps {
  script: string;
  onScriptChange: (script: string) => void;
  prompt: string;
  onPromptChange: (prompt: string) => void;
  targetSeconds: number;
  wordsPerMinute?: number;
  onNext: () => void;
  onBack: () => void;
}

export const ScriptStep: React.FC<ScriptStepProps> = ({
  script,
  onScriptChange,
  prompt,
  onPromptChange,
  targetSeconds,
  wordsPerMinute = 150,
  onNext,
  onBack,
}) => {
  const wordCount = script.trim() ? script.trim().split(/\s+/).length : 0;
  const targetWords = Math.round((targetSeconds / 60) * wordsPerMinute);
  const isWordCountGood = Math.abs(wordCount - targetWords) <= Math.ceil(targetWords * 0.3);

  return (
    <div style={{ padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: '24px', position: 'relative' }}>
      <Tape rotation="-2deg" style={{ position: 'absolute', top: '10px', right: '40px' }} />
      <Sticker label="STEP 04" rotation="2.5deg" variant="terracotta" />

      <div>
        <p className="handwritten" style={{ fontSize: '22px' }}>
          Write down your story or memory...
        </p>
        <h2 className="editorial-title" style={{ fontSize: '28px', marginTop: '4px' }}>
          Spoken narrative script
        </h2>
        <p style={{ color: 'var(--ink-muted)', fontSize: '15px', marginTop: '4px' }}>
          This is the text your synthesized voice will speak aloud during the video.
        </p>
      </div>

      {/* Script Text Area with Notebook Lines */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <label style={{ fontSize: '14px', fontWeight: 600, color: 'var(--ink-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <FileText size={16} />
            <span>Script Text</span>
          </label>
          <span className="handwritten" style={{ fontSize: '18px', color: isWordCountGood ? 'var(--ink-sage)' : 'var(--ink-amber)' }}>
            Word Count: {wordCount} / ~{targetWords} words (Target: {targetSeconds}s)
          </span>
        </div>

        <textarea
          value={script}
          onChange={(e) => onScriptChange(e.target.value)}
          placeholder="Write your story here... e.g., 'Once upon a time in a quiet little cabin surrounded by tall whispering pine trees...'"
          rows={6}
          style={{
            width: '100%',
            padding: '16px',
            borderRadius: '10px',
            border: '1.5px solid var(--paper-border)',
            backgroundColor: '#fff',
            fontFamily: 'var(--font-sans)',
            fontSize: '15px',
            lineHeight: 1.6,
            color: 'var(--ink-primary)',
            boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.04)',
            resize: 'vertical',
          }}
        />
      </div>

      {/* Optional Visual Style Prompt */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <label style={{ fontSize: '14px', fontWeight: 600, color: 'var(--ink-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Sparkles size={16} style={{ color: 'var(--ink-terracotta)' }} />
          <span>Visual Style Prompt (Optional)</span>
        </label>
        <input
          type="text"
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          placeholder="e.g., Cinematic warm sunlight, Studio Ghibli watercolor aesthetic, soft bokeh"
          style={{
            width: '100%',
            padding: '12px 16px',
            borderRadius: '8px',
            border: '1px solid var(--paper-border)',
            backgroundColor: 'var(--paper-cream-alt)',
            fontSize: '14px',
            color: 'var(--ink-primary)',
          }}
        />
      </div>

      {/* Navigation Buttons */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '12px' }}>
        <button onClick={onBack} className="btn-secondary">
          <ArrowLeft size={16} />
          <span>Back</span>
        </button>
        <button
          onClick={onNext}
          disabled={!script.trim()}
          className="btn-terracotta"
          style={{ opacity: !script.trim() ? 0.5 : 1, cursor: !script.trim() ? 'not-allowed' : 'pointer' }}
        >
          <span>Continue to Rights</span>
          <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
};

export default ScriptStep;
