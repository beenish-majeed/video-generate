import React, { useEffect, useState } from 'react';
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
      {/* Header Copy */}
      <header style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <h2 className="editorial-title" style={{ fontSize: 'clamp(24px, 2.2vw, 34px)', lineHeight: 1.2, margin: 0 }}>
          Spoken narrative script
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 'clamp(14px, 1vw, 16px)', lineHeight: 1.5, margin: 0 }}>
          Your synthesized voice will speak these words aloud during your {targetSeconds}s video.
        </p>
      </header>

      {/* 1. Calm Story-Style Loading State (Never a fake percentage) */}
      {isLoading ? (
        <div
          role="status"
          aria-live="polite"
          data-testid="story-loading-state"
          className="card"
          style={{
            padding: 'clamp(28px, 5vw, 44px) clamp(16px, 4vw, 32px)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            gap: '16px',
            width: '100%',
            boxSizing: 'border-box',
          }}
        >
          <span
            style={{
              padding: '4px 12px',
              borderRadius: 'var(--radius-pill)',
              backgroundColor: 'var(--accent-primary-light)',
              border: '1px solid var(--accent-primary-border)',
              color: 'var(--accent-primary)',
              fontSize: '12px',
              fontWeight: 700,
              letterSpacing: '0.05em',
            }}
          >
            DRAFTING YOUR STORY
          </span>

          <div style={{ position: 'relative', margin: '4px 0' }}>
            <Sparkles size={36} className="animate-pulse" style={{ color: 'var(--accent-primary)' }} />
          </div>

          <h3
            style={{ fontSize: 'clamp(20px, 2.5vw, 24px)', fontWeight: 600, margin: 0, color: 'var(--text-primary)', fontFamily: 'var(--font-sans)' }}
          >
            Listening to your idea...
          </h3>

          <p
            style={{
              fontSize: '16px',
              color: 'var(--text-secondary)',
              margin: 0,
              maxWidth: '540px',
              wordBreak: 'break-word',
              fontFamily: 'var(--font-sans)',
            }}
          >
            "{ideaText || prompt || 'Your story idea'}"
          </p>

          {/* Soft Writing State Shimmer & Blinking Caret */}
          <div
            aria-hidden="true"
            style={{
              width: '100%',
              maxWidth: '440px',
              padding: '16px 20px',
              borderRadius: 'var(--radius-md)',
              background: 'rgba(255, 255, 255, 0.7)',
              border: '1px solid var(--border-subtle)',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              margin: '6px 0',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
              <div className="writing-skeleton-line" style={{ width: '85%' }} />
              <span className="blinking-caret" />
            </div>
            <div className="writing-skeleton-line" style={{ width: '92%', animationDelay: '0.4s' }} />
            <div className="writing-skeleton-line" style={{ width: '68%', animationDelay: '0.8s' }} />
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              maxWidth: '480px',
              color: 'var(--text-muted)',
              fontSize: '14px',
              lineHeight: 1.5,
              marginTop: '4px',
              fontFamily: 'var(--font-sans)',
            }}
          >
            <p style={{ margin: 0 }}>
              Turning your thought into complete spoken sentences for a {targetSeconds}s film...
            </p>
            <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-muted)' }}>
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
          className="card"
          style={{
            padding: 'clamp(24px, 4vw, 36px) clamp(16px, 4vw, 28px)',
            borderColor: 'var(--accent-danger)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            gap: '14px',
            width: '100%',
            boxSizing: 'border-box',
          }}
        >
          <AlertCircle size={36} style={{ color: 'var(--accent-danger)' }} />

          <h3 style={{ fontSize: '20px', fontWeight: 600, margin: 0, color: 'var(--text-primary)', fontFamily: 'var(--font-sans)' }}>
            Couldn't draft your script right now
          </h3>

          <p style={{ color: 'var(--text-muted)', fontSize: '14px', maxWidth: '480px', lineHeight: 1.5, margin: 0 }}>
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
              className="btn-primary"
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
          style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(10px, 1.4dvh, 16px)', width: '100%' }}
        >
          {/* Header Action Row */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '8px',
              width: '100%',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <label
                htmlFor="narrative-script-input"
                style={{
                  fontSize: '15px',
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontFamily: 'var(--font-sans)',
                }}
              >
                <FileText size={18} />
                <span>Narrative Script</span>
              </label>

              {isPromptPath && (
                <button
                  type="button"
                  onClick={handleRegenerate}
                  className="btn-secondary"
                  data-testid="write-it-again-btn"
                  style={{
                    fontSize: '13px',
                    padding: '4px 12px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    minHeight: '32px',
                    cursor: 'pointer',
                  }}
                >
                  <Sparkles size={14} style={{ color: 'var(--accent-primary)' }} />
                  <span>Write it again</span>
                </button>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '13.5px', color: 'var(--text-muted)', fontFamily: 'var(--font-sans)' }}>
                Target range: <strong>{analysis.minWords}–{analysis.maxWords}</strong> words (@ {wpm} WPM)
              </span>
              <span
                style={{
                  padding: '3px 10px',
                  borderRadius: 'var(--radius-pill)',
                  backgroundColor: mood.bgColor,
                  border: `1px solid ${mood.borderColor}`,
                  color: mood.textColor,
                  fontWeight: 600,
                  fontSize: '13px',
                  whiteSpace: 'nowrap',
                  fontFamily: 'var(--font-sans)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {analysis.wordCount} words
              </span>
              {scriptSource && (
                <span
                  data-testid="script-source-badge"
                  style={{
                    fontSize: '12px',
                    fontFamily: 'var(--font-sans)',
                    padding: '3px 8px',
                    borderRadius: 'var(--radius-pill)',
                    backgroundColor: 'var(--bg-subtle)',
                    color: 'var(--text-muted)',
                    border: '1px solid var(--border-light)',
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
              className="card"
              style={{
                padding: '10px 14px',
                color: 'var(--text-muted)',
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <AlertCircle size={16} style={{ color: 'var(--accent-warning)', flexShrink: 0 }} />
              <span>
                Basic script (no AI model installed). Edit it freely, or install Ollama for better scripts.
              </span>
            </div>
          )}

          {/* Textarea */}
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
              minHeight: 'clamp(80px, 12dvh, 130px)',
              padding: '12px 14px',
              borderRadius: 'var(--radius-md)',
              border: `1px solid ${
                analysis.status === 'perfect'
                  ? 'var(--accent-success)'
                  : analysis.status === 'too_long'
                  ? 'var(--accent-danger)'
                  : 'var(--border-light)'
              }`,
              backgroundColor: 'var(--bg-surface)',
              fontFamily: 'var(--font-sans)',
              fontSize: '14.5px',
              lineHeight: 1.5,
              color: 'var(--text-primary)',
              resize: 'vertical',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />

          {/* Progress Bar Card */}
          <div
            className="card"
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              padding: '12px 16px',
              width: '100%',
              boxSizing: 'border-box',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '13px',
                fontWeight: 600,
                flexWrap: 'wrap',
                gap: '4px',
                fontFamily: 'var(--font-sans)',
              }}
            >
              <span style={{ color: 'var(--text-primary)' }}>
                Script Target Progress ({analysis.percentage}%)
              </span>
              <span style={{ color: mood.textColor, fontVariantNumeric: 'tabular-nums' }}>
                {analysis.wordCount} / {analysis.targetWords} target words (Range: {analysis.minWords}–{analysis.maxWords})
              </span>
            </div>

            <div
              style={{
                width: '100%',
                height: '8px',
                backgroundColor: 'rgba(108, 77, 255, 0.08)',
                borderRadius: 'var(--radius-full)',
                overflow: 'hidden',
                boxShadow: 'inset 0 1px 2px rgba(45, 38, 74, 0.06)',
              }}
            >
              <div
                style={{
                  width: `${Math.min(100, analysis.percentage)}%`,
                  height: '100%',
                  background:
                    analysis.status === 'perfect'
                      ? 'linear-gradient(90deg, var(--accent) 0%, var(--blob-peach) 100%)'
                      : analysis.status === 'too_long'
                      ? 'linear-gradient(90deg, #ff9e7d 0%, #e67e50 100%)'
                      : 'linear-gradient(90deg, var(--accent) 0%, var(--blob-lavender) 100%)',
                  borderRadius: 'var(--radius-full)',
                  transition: 'width 0.35s cubic-bezier(0.16, 1, 0.3, 1), background 0.35s ease',
                }}
              />
            </div>
          </div>

          {/* Helper Status Card */}
          <div
            id="script-helper-text"
            role="status"
            className="card"
            style={{
              padding: '12px 16px',
              backgroundColor: mood.bgColor,
              borderColor: mood.borderColor,
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px',
              width: '100%',
              boxSizing: 'border-box',
            }}
          >
            {mood.icon}
            <div style={{ flex: 1, minWidth: '0' }}>
              <p
                style={{
                  fontSize: '14px',
                  color: mood.textColor,
                  fontWeight: 600,
                  wordBreak: 'break-word',
                  lineHeight: 1.4,
                  margin: 0,
                  fontFamily: 'var(--font-sans)',
                }}
              >
                {analysis.helperText}
              </p>
              {outOfBoundsMessage && (
                <p
                  style={{
                    fontSize: '13px',
                    color: mood.textColor,
                    lineHeight: 1.4,
                    margin: '4px 0 0 0',
                    fontFamily: 'var(--font-sans)',
                  }}
                >
                  {outOfBoundsMessage}
                </p>
              )}
            </div>
          </div>

          {/* Optional Visual Style Prompt Field */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '4px', width: '100%' }}>
            <label
              style={{
                fontSize: '14px',
                fontWeight: 600,
                color: 'var(--text-primary)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontFamily: 'var(--font-sans)',
              }}
            >
              <Sparkles size={16} style={{ color: 'var(--accent-primary)' }} />
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
                padding: '10px 14px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-light)',
                backgroundColor: 'var(--bg-surface)',
                fontSize: '14px',
                color: 'var(--text-primary)',
                boxSizing: 'border-box',
                minHeight: '42px',
                fontFamily: 'var(--font-sans)',
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
              <ArrowLeft size={16} />
              <span>Back</span>
            </button>

            <button
              type="button"
              onClick={onNext}
              disabled={!analysis.isWithinBounds}
              className="btn-primary"
              style={{
                minHeight: '44px',
                padding: '10px 24px',
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
