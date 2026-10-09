import React, { useEffect, useState } from 'react';
import Tape from '../Tape';
import Sticker from '../Sticker';
import apiClient from '../../api/client';
import { analyzeScriptWords, type ScriptWordAnalysis } from '../../utils/scriptWordCount';
import { ArrowRight, ArrowLeft, FileText, Sparkles, AlertTriangle, Frown, Smile } from 'lucide-react';

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
  wordsPerMinute: propWpm,
  onNext,
  onBack,
}) => {
  const [wpm, setWpm] = useState<number>(propWpm || 150);

  // Fetch real words_per_minute from GET /v1/durations dynamically
  useEffect(() => {
    let isMounted = true;
    apiClient
      .getDurations()
      .then((data) => {
        if (isMounted && data.words_per_minute) {
          setWpm(data.words_per_minute);
        }
      })
      .catch(() => {
        // Keeps default fallback if offline
      });
    return () => {
      isMounted = false;
    };
  }, []);

  // Compute structured word analysis via pure function
  const analysis: ScriptWordAnalysis = analyzeScriptWords(script, targetSeconds, wpm);

  // Determine helper text color & icon based on mood state
  const getMoodConfig = () => {
    switch (analysis.status) {
      case 'empty':
      case 'too_short':
        return {
          icon: <Frown size={22} style={{ color: 'var(--ink-amber)', flexShrink: 0 }} />,
          bgColor: '#fffcf5',
          borderColor: 'var(--ink-amber)',
          textColor: 'var(--ink-amber)',
        };
      case 'too_long':
        return {
          icon: <AlertTriangle size={22} style={{ color: 'var(--ink-terracotta)', flexShrink: 0 }} />,
          bgColor: '#fff8f6',
          borderColor: 'var(--ink-terracotta)',
          textColor: 'var(--ink-terracotta)',
        };
      case 'perfect':
      default:
        return {
          icon: <Smile size={22} style={{ color: 'var(--ink-sage)', flexShrink: 0 }} />,
          bgColor: '#f5faf6',
          borderColor: 'var(--ink-sage)',
          textColor: 'var(--ink-sage)',
        };
    }
  };

  const mood = getMoodConfig();

  return (
    <div
      className="step-container"
      style={{
        padding: 'clamp(20px, 4vw, 32px) clamp(12px, 3vw, 24px)',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
        position: 'relative',
        width: '100%',
      }}
    >
      <Tape rotation="-2deg" style={{ position: 'absolute', top: '10px', right: '40px' }} />
      <Sticker label="WHAT WILL YOU SAY?" rotation="2.5deg" variant="terracotta" />

      {/* Header Copy */}
      <header>
        <p className="handwritten" style={{ fontSize: 'clamp(18px, 2vw + 12px, 22px)' }}>
          Write down your story or memory...
        </p>
        <h2 className="editorial-title" style={{ marginTop: '4px' }}>
          Spoken narrative script
        </h2>
        <p style={{ color: 'var(--ink-muted)', fontSize: '15px', marginTop: '4px' }}>
          Your synthesized voice will speak these words aloud during your {targetSeconds}s video.
        </p>
      </header>

      {/* Script Text Area & Controls */}
      <main style={{ display: 'flex', flexDirection: 'column', gap: '14px', width: '100%' }}>
        {/* Label & Target Word Counter Header Bar - Responsive Flex Wrap */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', width: '100%' }}>
          <label
            htmlFor="narrative-script-input"
            style={{ fontSize: '15px', fontWeight: 600, color: 'var(--ink-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <FileText size={18} />
            <span>Narrative Script</span>
          </label>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span className="handwritten" style={{ fontSize: '16px', color: 'var(--ink-muted)' }}>
              Need at least <strong>{analysis.minWords}</strong> words for {targetSeconds}s (@ {wpm} WPM)
            </span>
            <span
              style={{
                padding: '3px 10px',
                borderRadius: '12px',
                backgroundColor: mood.bgColor,
                border: `1.5px solid ${mood.borderColor}`,
                color: mood.textColor,
                fontWeight: 'bold',
                fontSize: '13px',
                whiteSpace: 'nowrap',
              }}
            >
              {analysis.wordCount} words
            </span>
          </div>
        </div>

        {/* Textarea - Auto-scrolls into view on mobile keyboard focus */}
        <textarea
          id="narrative-script-input"
          value={script}
          onChange={(e) => onScriptChange(e.target.value)}
          onFocus={(e) => {
            // Scroll focused input into view on mobile virtual keyboard popup
            e.target.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }}
          placeholder={`Write your story here... e.g., "A gentle morning mist hovered over the quiet valley, as tall whispering pine trees stood sentinel against the soft golden sky..."`}
          rows={5}
          aria-describedby="script-helper-text"
          style={{
            width: '100%',
            padding: 'clamp(12px, 2.5vw, 16px)',
            borderRadius: '10px',
            border: `2px solid ${
              analysis.status === 'perfect'
                ? 'var(--ink-sage)'
                : analysis.status === 'too_long'
                ? 'var(--ink-terracotta)'
                : 'var(--paper-border)'
            }`,
            backgroundColor: '#ffffff',
            fontFamily: 'var(--font-sans)',
            fontSize: '15px',
            lineHeight: 1.6,
            color: 'var(--ink-primary)',
            boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.04)',
            resize: 'vertical',
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />

        {/* Hand-Drawn Sketchbook Progress Bar - Scales Fluidly */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            padding: '12px 14px',
            borderRadius: '8px',
            backgroundColor: 'var(--paper-cream-alt)',
            border: '1px solid var(--paper-border)',
            width: '100%',
            boxSizing: 'border-box',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: 600, flexWrap: 'wrap', gap: '4px' }}>
            <span style={{ color: 'var(--ink-primary)' }}>Script Target Progress ({analysis.percentage}%)</span>
            <span style={{ color: mood.textColor }}>
              {analysis.wordCount} / {analysis.targetWords} target words (Range: {analysis.minWords}–{analysis.maxWords})
            </span>
          </div>

          <div style={{ width: '100%', height: '10px', backgroundColor: 'var(--paper-border)', borderRadius: '5px', overflow: 'hidden' }}>
            <div
              style={{
                width: `${Math.min(100, analysis.percentage)}%`,
                height: '100%',
                backgroundColor: mood.textColor,
                transition: 'width 0.25s ease, background-color 0.25s ease',
              }}
            />
          </div>
        </div>

        {/* Mood Helper Text Card (Wraps Text Cleanly without Overlap) */}
        <div
          id="script-helper-text"
          role="status"
          style={{
            padding: '14px 16px',
            borderRadius: '10px',
            backgroundColor: mood.bgColor,
            border: `1.5px dashed ${mood.borderColor}`,
            display: 'flex',
            alignItems: 'flex-start',
            gap: '10px',
            boxShadow: 'var(--shadow-card)',
            transition: 'all 0.2s ease',
            width: '100%',
            boxSizing: 'border-box',
          }}
        >
          {mood.icon}
          <div style={{ flex: 1, minWidth: '0' }}>
            <p className="handwritten" style={{ fontSize: '18px', color: mood.textColor, fontWeight: 'bold', wordBreak: 'break-word', lineHeight: 1.3 }}>
              {analysis.helperText}
            </p>
          </div>
        </div>

        {/* Optional Visual Style Prompt Field */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '4px', width: '100%' }}>
          <label style={{ fontSize: '14px', fontWeight: 600, color: 'var(--ink-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Sparkles size={16} style={{ color: 'var(--ink-terracotta)' }} />
            <span>Visual Style Prompt (Optional)</span>
          </label>
          <input
            type="text"
            value={prompt}
            onChange={(e) => onPromptChange(e.target.value)}
            onFocus={(e) => {
              e.target.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }}
            placeholder="e.g., Warm cinematic sunlight, Studio Ghibli watercolor aesthetic, soft bokeh"
            style={{
              width: '100%',
              padding: '12px 14px',
              borderRadius: '8px',
              border: '1px solid var(--paper-border)',
              backgroundColor: 'var(--paper-cream-alt)',
              fontSize: '14px',
              color: 'var(--ink-primary)',
              boxSizing: 'border-box',
            }}
          />
        </div>
      </main>

      {/* Navigation Footer */}
      <footer className="step-footer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '8px' }}>
        <button type="button" onClick={onBack} className="btn-secondary">
          <ArrowLeft size={16} />
          <span>Back</span>
        </button>

        <button
          type="button"
          onClick={onNext}
          disabled={!analysis.isWithinBounds}
          className="btn-terracotta"
          style={{
            opacity: !analysis.isWithinBounds ? 0.5 : 1,
            cursor: !analysis.isWithinBounds ? 'not-allowed' : 'pointer',
          }}
        >
          <span>Continue to Rights</span>
          <ArrowRight size={16} />
        </button>
      </footer>
    </div>
  );
};

export default ScriptStep;
