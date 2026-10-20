import React, { useEffect, useState } from 'react';
import Tape from '../Tape';
import Sticker from '../Sticker';
import apiClient from '../../api/client';
import { mapAPIError } from '../../api/errorMapper';
import { analyzeScriptWords, type ScriptWordAnalysis } from '../../utils/scriptWordCount';
import { ArrowRight, ArrowLeft, FileText, Sparkles, AlertTriangle, Frown, Smile, RotateCcw, AlertCircle } from 'lucide-react';
import type { DurationPreset, ScriptTone } from '../../types/api';

export const DEFAULT_SCRIPT =
  'A peaceful sunny morning in a quiet valley surrounded by tall whispering pine trees.';

export interface ScriptStepProps {
  script: string;
  onScriptChange: (script: string) => void;
  prompt: string;
  onPromptChange: (prompt: string) => void;
  targetSeconds: number;
  durationPreset?: DurationPreset;
  wordsPerMinute?: number;
  ideaText?: string;
  tone?: ScriptTone;
  isPromptPath?: boolean;
  initialLoading?: boolean;
  initialError?: string | null;
  initialScriptSource?: string | null;
  onScriptSourceChange?: (source: string) => void;
  onNext: () => void;
  onBack: () => void;
}

export const ScriptStep: React.FC<ScriptStepProps> = ({
  script,
  onScriptChange,
  prompt,
  onPromptChange,
  targetSeconds,
  durationPreset = '30s',
  wordsPerMinute: propWpm,
  ideaText = '',
  tone = 'storytelling',
  isPromptPath = false,
  initialLoading,
  initialError = null,
  initialScriptSource = null,
  onScriptSourceChange,
  onNext,
  onBack,
}) => {
  const shouldAutoGenerate = isPromptPath && (!script || script === DEFAULT_SCRIPT);

  const [wpm, setWpm] = useState<number>(propWpm || 150);
  const [isLoading, setIsLoading] = useState<boolean>(
    initialLoading !== undefined ? initialLoading : (shouldAutoGenerate && !initialError)
  );
  const [generationError, setGenerationError] = useState<string | null>(initialError);
  const [scriptSource, setScriptSource] = useState<string | null>(initialScriptSource || null);
  const [lastGeneratedScript, setLastGeneratedScript] = useState<string>(script);
  const [hasGeneratedOnce, setHasGeneratedOnce] = useState<boolean>(
    Boolean(script && script !== DEFAULT_SCRIPT)
  );

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

  // Story-style generator function
  const executeGeneration = async () => {
    const topic = (ideaText || prompt || '').trim();
    if (!topic) return;

    setIsLoading(true);
    setGenerationError(null);

    try {
      const res = await apiClient.generateScript({
        prompt: topic,
        duration_preset: durationPreset,
        target_duration_seconds: targetSeconds,
        tone,
      });

      if (res && res.script) {
        onScriptChange(res.script);
        setLastGeneratedScript(res.script);
        setHasGeneratedOnce(true);
        if (res.script_source) {
          setScriptSource(res.script_source);
          onScriptSourceChange?.(res.script_source);
        }
      }
    } catch (err: unknown) {
      const mapped = mapAPIError(err);
      setGenerationError(mapped.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Call POST /v1/scripts/generate when user arrives on prompt path with ungenerated or default script
  useEffect(() => {
    if (isPromptPath && !hasGeneratedOnce && (!script || script === DEFAULT_SCRIPT)) {
      executeGeneration();
    }
  }, [isPromptPath]);

  // "Write it again": regenerates, asking before replacing user's edits
  const handleRegenerate = () => {
    const isEdited = lastGeneratedScript
      ? script.trim() !== lastGeneratedScript.trim()
      : Boolean(script.trim());

    if (isEdited) {
      const confirmDiscard =
        typeof window !== 'undefined' && typeof window.confirm === 'function'
          ? window.confirm(
              'You have made edits to your script. Discard your edits and write a new script with AI?'
            )
          : true;
      if (!confirmDiscard) return;
    }

    executeGeneration();
  };

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
          textColor: '#874c00',
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

  // Clear out of bounds feedback message after editing
  const getOutOfBoundsMessage = () => {
    if (analysis.status === 'too_short') {
      return `Your script has ${analysis.wordCount} words, which is under the minimum of ${analysis.minWords} words for a ${targetSeconds}s video. Please add more detail so speech covers the duration comfortably.`;
    }
    if (analysis.status === 'too_long') {
      return `Your script has ${analysis.wordCount} words, which exceeds the maximum of ${analysis.maxWords} words for a ${targetSeconds}s video. Please shorten your script so it doesn't rush or overflow.`;
    }
    if (analysis.status === 'empty') {
      return `Please write or generate a spoken script for your video narration.`;
    }
    return null;
  };

  const outOfBoundsMessage = getOutOfBoundsMessage();

  return (
    <div
      className="step-container"
      style={{
        padding: 'clamp(14px, 2.2dvh, 28px) clamp(16px, 2.2vw, 40px)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'clamp(10px, 1.5dvh, 18px)',
        position: 'relative',
        maxWidth: 'min(1500px, 96%)',
        margin: 'auto',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      <Tape rotation="-2deg" style={{ position: 'absolute', top: '10px', right: '40px' }} />
      <Sticker label="WHAT WILL YOU SAY?" rotation="2.5deg" variant="terracotta" />

      {/* Header Copy */}
      <header style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(2px, 0.4dvh, 6px)' }}>
        <p className="handwritten" style={{ fontSize: 'clamp(18px, 1.4vw, 24px)', margin: 0 }}>
          Write down your story or memory...
        </p>
        <h2 className="editorial-title" style={{ marginTop: '2px', fontSize: 'clamp(24px, 2.2vw, 36px)', lineHeight: 1.15 }}>
          Spoken narrative script
        </h2>
        <p style={{ color: 'var(--ink-muted)', fontSize: 'clamp(14px, 1vw, 17px)', marginTop: '2px' }}>
          Your synthesized voice will speak these words aloud during your {targetSeconds}s video.
        </p>
      </header>

      {/* 1. Calm Story-Style Loading State (Never a fake percentage) */}
      {isLoading ? (
        <div
          role="status"
          aria-live="polite"
          data-testid="story-loading-state"
          style={{
            padding: 'clamp(28px, 5vw, 44px) clamp(16px, 4vw, 32px)',
            borderRadius: 'var(--radius-paper)',
            backgroundColor: 'var(--paper-cream-alt)',
            border: '1.5px dashed var(--paper-border)',
            boxShadow: 'var(--shadow-card)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            gap: '16px',
            width: '100%',
            boxSizing: 'border-box',
          }}
        >
          <Tape rotation="-1deg" style={{ margin: '-10px auto 0 auto' }} />
          <Sticker label="DRAFTING YOUR STORY" variant="terracotta" rotation="1.5deg" />

          <div style={{ position: 'relative', margin: '10px 0' }}>
            <Sparkles size={40} className="animate-pulse" style={{ color: 'var(--ink-terracotta)' }} />
          </div>

          <h3
            className="editorial-title"
            style={{ fontSize: 'clamp(20px, 3vw, 24px)', margin: 0, color: 'var(--ink-primary)' }}
          >
            Listening to your idea...
          </h3>

          <p
            className="handwritten"
            style={{
              fontSize: 'clamp(17px, 2.5vw, 20px)',
              color: 'var(--ink-terracotta)',
              margin: 0,
              maxWidth: '540px',
              wordBreak: 'break-word',
            }}
          >
            "{ideaText || prompt || 'Your story idea'}"
          </p>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              maxWidth: '480px',
              color: 'var(--ink-muted)',
              fontSize: '14px',
              lineHeight: 1.5,
              marginTop: '4px',
            }}
          >
            <p style={{ margin: 0 }}>
              Turning your thought into complete spoken sentences for a {targetSeconds}s film...
            </p>
            <p style={{ margin: 0, fontSize: '13px', fontStyle: 'italic', color: '#7a7062' }}>
              This takes about 10–25 seconds. Take a quiet breath while our storyteller writes.
            </p>
          </div>

          <div style={{ marginTop: '12px' }}>
            <button
              type="button"
              onClick={onBack}
              className="btn-secondary"
              style={{ fontSize: '14px', padding: '8px 16px' }}
            >
              <ArrowLeft size={16} />
              <span>Back</span>
            </button>
          </div>
        </div>
      ) : generationError ? (
        /* 2. Generation Error State with Retry Button */
        <div
          role="alert"
          data-testid="story-error-state"
          style={{
            padding: 'clamp(24px, 4vw, 36px) clamp(16px, 4vw, 28px)',
            borderRadius: 'var(--radius-paper)',
            backgroundColor: '#fffaf8',
            border: '2px solid var(--ink-terracotta)',
            boxShadow: 'var(--shadow-card)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            gap: '14px',
            width: '100%',
            boxSizing: 'border-box',
          }}
        >
          <Tape rotation="1.5deg" style={{ margin: '-10px auto 0 auto' }} />
          <AlertCircle size={36} style={{ color: 'var(--ink-terracotta)' }} />

          <h3 className="editorial-title" style={{ fontSize: '22px', margin: 0, color: 'var(--ink-primary)' }}>
            Couldn't draft your script right now
          </h3>

          <p style={{ color: 'var(--ink-muted)', fontSize: '14px', maxWidth: '480px', lineHeight: 1.5, margin: 0 }}>
            {generationError}
          </p>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              flexWrap: 'wrap',
              justifyContent: 'center',
              marginTop: '8px',
            }}
          >
            <button
              type="button"
              onClick={executeGeneration}
              className="btn-terracotta"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
            >
              <RotateCcw size={16} />
              <span>Try Again</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setGenerationError(null);
                setHasGeneratedOnce(true);
              }}
              className="btn-secondary"
            >
              <span>Write manually</span>
            </button>

            <button type="button" onClick={onBack} className="btn-secondary">
              <ArrowLeft size={16} />
              <span>Back</span>
            </button>
          </div>
        </div>
      ) : (
        /* 3. Script Workspace with Editable Textarea & Write It Again */
        <div
          role="region"
          aria-label="Narrative script workspace"
          style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(8px, 1.2dvh, 12px)', width: '100%' }}
        >
          {/* Header Action Row */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '6px',
              width: '100%',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <label
                htmlFor="narrative-script-input"
                style={{
                  fontSize: '14.5px',
                  fontWeight: 600,
                  color: 'var(--ink-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <FileText size={17} />
                <span>Narrative Script</span>
              </label>

              {isPromptPath && (
                <button
                  type="button"
                  onClick={handleRegenerate}
                  className="btn-secondary"
                  data-testid="write-it-again-btn"
                  style={{
                    fontSize: '12.5px',
                    padding: '3px 9px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    minHeight: '30px',
                    cursor: 'pointer',
                  }}
                >
                  <Sparkles size={13} style={{ color: 'var(--ink-terracotta)' }} />
                  <span>Write it again</span>
                </button>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              <span className="handwritten" style={{ fontSize: '15px', color: 'var(--ink-muted)' }}>
                Target range: <strong>{analysis.minWords}–{analysis.maxWords}</strong> words (@ {wpm} WPM)
              </span>
              <span
                style={{
                  padding: '2px 8px',
                  borderRadius: '12px',
                  backgroundColor: mood.bgColor,
                  border: `1.5px solid ${mood.borderColor}`,
                  color: mood.textColor,
                  fontWeight: 'bold',
                  fontSize: '12.5px',
                  whiteSpace: 'nowrap',
                }}
              >
                {analysis.wordCount} words
              </span>
              {scriptSource && (
                <span
                  data-testid="script-source-badge"
                  style={{
                    fontSize: '11.5px',
                    fontFamily: 'var(--font-hand)',
                    padding: '2px 7px',
                    borderRadius: '8px',
                    backgroundColor: scriptSource === 'template' ? 'rgba(240, 160, 75, 0.15)' : 'rgba(110, 140, 115, 0.15)',
                    color: scriptSource === 'template' ? 'var(--ink-amber)' : 'var(--ink-sage)',
                    border: '1px solid var(--paper-border)',
                  }}
                >
                  source: {scriptSource}
                </span>
              )}
            </div>
          </div>

          {/* Honest Notice for Template Script */}
          {scriptSource === 'template' && (
            <div
              role="note"
              data-testid="template-script-notice"
              style={{
                padding: '8px 12px',
                borderRadius: '8px',
                backgroundColor: 'var(--paper-cream-alt)',
                border: '1.5px solid var(--paper-border)',
                color: 'var(--ink-muted)',
                fontSize: '12.5px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <AlertCircle size={15} style={{ color: 'var(--ink-amber)', flexShrink: 0 }} />
              <span>
                Basic script (no AI model installed). Edit it freely, or install Ollama for better scripts.
              </span>
            </div>
          )}

          {/* Textarea - Auto-scrolls into view on mobile keyboard focus */}
          <textarea
            id="narrative-script-input"
            value={script}
            onChange={(e) => onScriptChange(e.target.value)}
            onFocus={(e) => {
              e.target.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }}
            placeholder={`Write your story here... e.g., "A gentle morning mist hovered over the quiet valley, as tall whispering pine trees stood sentinel against the soft golden sky..."`}
            rows={4}
            aria-describedby="script-helper-text"
            style={{
              width: '100%',
              minHeight: 'clamp(72px, 11dvh, 120px)',
              padding: 'clamp(8px, 1.2dvh, 12px) 12px',
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
              fontSize: '14.5px',
              lineHeight: 1.5,
              color: 'var(--ink-primary)',
              boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.04)',
              resize: 'vertical',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />

          {/* Hand-Drawn Sketchbook Progress Bar */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              padding: 'clamp(6px, 1dvh, 10px) 12px',
              borderRadius: '8px',
              backgroundColor: 'var(--paper-cream-alt)',
              border: '1px solid var(--paper-border)',
              width: '100%',
              boxSizing: 'border-box',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '12.5px',
                fontWeight: 600,
                flexWrap: 'wrap',
                gap: '4px',
              }}
            >
              <span style={{ color: 'var(--ink-primary)' }}>
                Script Target Progress ({analysis.percentage}%)
              </span>
              <span style={{ color: mood.textColor }}>
                {analysis.wordCount} / {analysis.targetWords} target words (Range: {analysis.minWords}–{analysis.maxWords})
              </span>
            </div>

            <div
              style={{
                width: '100%',
                height: '8px',
                backgroundColor: 'var(--paper-border)',
                borderRadius: '4px',
                overflow: 'hidden',
              }}
            >
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

          {/* Mood / Out of Bounds Message Card */}
          <div
            id="script-helper-text"
            role="status"
            style={{
              padding: 'clamp(8px, 1.2dvh, 12px) 14px',
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
              <p
                className="handwritten"
                style={{
                  fontSize: '16px',
                  color: mood.textColor,
                  fontWeight: 'bold',
                  wordBreak: 'break-word',
                  lineHeight: 1.3,
                  margin: 0,
                }}
              >
                {analysis.helperText}
              </p>
              {outOfBoundsMessage && (
                <p
                  style={{
                    fontSize: '12.5px',
                    color: mood.textColor,
                    marginTop: '3px',
                    lineHeight: 1.35,
                    margin: '3px 0 0 0',
                  }}
                >
                  {outOfBoundsMessage}
                </p>
              )}
            </div>
          </div>

          {/* Optional Visual Style Prompt Field */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '2px', width: '100%' }}>
            <label
              style={{
                fontSize: '13.5px',
                fontWeight: 600,
                color: 'var(--ink-primary)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <Sparkles size={15} style={{ color: 'var(--ink-terracotta)' }} />
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
                padding: 'clamp(6px, 1dvh, 10px) 12px',
                borderRadius: '8px',
                border: '1px solid var(--paper-border)',
                backgroundColor: 'var(--paper-cream-alt)',
                fontSize: '13.5px',
                color: 'var(--ink-primary)',
                boxSizing: 'border-box',
                minHeight: '40px',
              }}
            />
          </div>

          {/* Navigation Footer */}
          <footer
            className="step-footer"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: '4px',
              paddingTop: 'clamp(8px, 1dvh, 12px)',
              borderTop: '1px solid var(--paper-border)',
            }}
          >
            <button
              type="button"
              onClick={onBack}
              className="btn-secondary"
              style={{ minHeight: '44px', padding: '8px 18px', cursor: 'pointer' }}
            >
              <ArrowLeft size={16} />
              <span>Back</span>
            </button>

            <button
              type="button"
              onClick={onNext}
              disabled={!analysis.isWithinBounds}
              className="btn-terracotta"
              style={{
                minHeight: '44px',
                padding: '10px 22px',
                opacity: !analysis.isWithinBounds ? 0.5 : 1,
                cursor: !analysis.isWithinBounds ? 'not-allowed' : 'pointer',
              }}
            >
              <span>Continue to Rights</span>
              <ArrowRight size={16} />
            </button>
          </footer>
        </div>
      )}
    </div>
  );
};

export default ScriptStep;
