import React, { useEffect, useState } from 'react';
import type { DurationPreset, DurationOption, DurationsResponse } from '../../types/api';
import apiClient from '../../api/client';
import { mapAPIError, type MappedAPIError } from '../../api/errorMapper';
import { playStickerPopSound } from '../../utils/soundEffects';
import { motion } from 'framer-motion';
import { ArrowRight, ArrowLeft, Clock, Sparkles, Loader2, AlertCircle, RefreshCw, Hourglass } from 'lucide-react';

interface DurationStepProps {
  selectedPreset: DurationPreset;
  onPresetSelected: (preset: DurationPreset, targetSeconds: number) => void;
  onNext: () => void;
  onBack: () => void;
}

export const DurationStep: React.FC<DurationStepProps> = ({
  selectedPreset,
  onPresetSelected,
  onNext,
  onBack,
}) => {
  const [durationsInfo, setDurationsInfo] = useState<DurationsResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<MappedAPIError | null>(null);

  const fetchDurations = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.getDurations();
      setDurationsInfo(data);
      // If no preset selected yet, default to 30s or first preset
      if (!selectedPreset && data.allowed_presets.length > 0) {
        const defaultOpt = data.allowed_presets.find((p) => p.value === '30s') || data.allowed_presets[0];
        onPresetSelected(defaultOpt.value, defaultOpt.seconds);
      }
    } catch (err: unknown) {
      setError(mapAPIError(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDurations();
  }, []);

  const presets: DurationOption[] = durationsInfo?.allowed_presets || [];
  const currentOption = presets.find((p) => p.value === selectedPreset) || presets[1] || { label: '30s', value: '30s', seconds: 30 };
  const wpm = durationsInfo?.words_per_minute || 150;
  const approxWords = Math.round((currentOption.seconds / 60) * wpm);

  // Format estimated render time (3.7x multiplier)
  const formatEstimatedRenderTime = (videoSeconds: number): string => {
    const renderSeconds = Math.round(videoSeconds * 3.7);
    if (renderSeconds < 60) {
      return `~${renderSeconds} sec render time`;
    }
    const mins = (renderSeconds / 60).toFixed(1);
    return `~${mins} min render time`;
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
      {/* Header Copy */}
      <header style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <h2 className="editorial-title" style={{ fontSize: 'clamp(24px, 2.2vw, 34px)', lineHeight: 1.2, margin: 0 }}>
          Select video duration
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 'clamp(14px, 1vw, 16px)', lineHeight: 1.5, margin: 0 }}>
          How long should your animated film be? We load options dynamically from the studio backend.
        </p>
      </header>

      {/* Main Interactive Preset Selection - Fluid Grid */}
      <div role="region" aria-label="Duration preset selection" style={{ width: '100%' }}>
        {loading ? (
          /* Loading State */
          <div
            className="card"
            style={{
              padding: '40px 20px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '12px',
              color: 'var(--accent-primary)',
              width: '100%',
            }}
          >
            <Loader2 size={28} className="animate-spin" />
            <p style={{ fontSize: '15px', color: 'var(--text-secondary)', fontFamily: 'var(--font-sans)', fontWeight: 500 }}>
              Fetching duration options from the studio...
            </p>
          </div>
        ) : error ? (
          /* Failure / Error State */
          <div
            role="alert"
            className="card"
            style={{
              padding: '24px',
              borderColor: 'var(--accent-danger)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '12px',
              textAlign: 'center',
              width: '100%',
            }}
          >
            <AlertCircle size={28} style={{ color: 'var(--accent-danger)' }} />
            <div>
              <h4 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>
                {error.title}
              </h4>
              <p style={{ fontSize: '13.5px', color: 'var(--text-muted)', marginTop: '4px', maxWidth: '460px' }}>
                {error.message}
              </p>
            </div>
            <button type="button" onClick={fetchDurations} className="btn-secondary" style={{ fontSize: '14px', minHeight: '44px' }}>
              <RefreshCw size={14} />
              <span>Retry loading durations</span>
            </button>
          </div>
        ) : (
          /* Responsive Fluid Grid of Duration Preset Cards */
          <div className="duration-cards-grid">
            {presets.map((preset) => {
              const isSelected = preset.value === selectedPreset;

              return (
                <motion.button
                  key={preset.value}
                  type="button"
                  onClick={() => {
                    playStickerPopSound();
                    onPresetSelected(preset.value, preset.seconds);
                  }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                  aria-pressed={isSelected}
                  className={`card ${isSelected ? 'card-selected' : ''}`}
                  style={{
                    position: 'relative',
                    padding: 'clamp(14px, 1.8dvh, 20px) clamp(10px, 1.2vw, 16px)',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '6px',
                    height: '100%',
                    width: '100%',
                    minHeight: '44px',
                    textAlign: 'center',
                    overflow: 'visible',
                  }}
                >
                  {isSelected && (
                    <motion.div
                      layoutId="durationCardHighlight"
                      style={{
                        position: 'absolute',
                        inset: -2,
                        borderRadius: 'calc(var(--radius-card) + 2px)',
                        border: '2px solid var(--accent)',
                        boxShadow: '0 0 20px rgba(108, 77, 255, 0.22), inset 0 0 10px rgba(108, 77, 255, 0.05)',
                        pointerEvents: 'none',
                        zIndex: 1,
                      }}
                      transition={{ type: 'spring', stiffness: 380, damping: 28 }}
                    />
                  )}

                  <Clock size={22} style={{ color: isSelected ? 'var(--accent)' : 'var(--text-muted)', position: 'relative', zIndex: 2 }} />

                  <span style={{ fontWeight: 700, fontSize: '18px', color: isSelected ? 'var(--accent)' : 'var(--text-primary)', marginTop: '4px', position: 'relative', zIndex: 2 }}>
                    {preset.label}
                  </span>

                  <span style={{ fontSize: '13.5px', color: 'var(--text-secondary)', fontWeight: 500, position: 'relative', zIndex: 2 }}>
                    {preset.seconds}s length
                  </span>

                  <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px', position: 'relative', zIndex: 2 }}>
                    {formatEstimatedRenderTime(preset.seconds)}
                  </span>
                </motion.button>
              );
            })}
          </div>
        )}
      </div>

      {/* Kind Note about Render Time & Pacing */}
      <section
        className="card"
        style={{
          padding: 'clamp(14px, 1.8dvh, 20px) clamp(16px, 2vw, 24px)',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          width: '100%',
          boxSizing: 'border-box',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
          <Hourglass size={20} style={{ color: 'var(--accent-primary)', flexShrink: 0, marginTop: '2px' }} />
          <div>
            <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
              Estimated Studio Render Time
            </h3>
            <p style={{ fontSize: '13.5px', color: 'var(--text-muted)', marginTop: '4px', lineHeight: 1.5, margin: 0 }}>
              Rendering takes about <strong>3.7 times</strong> the video length.
              For instance, a 5-minute video takes about 18 minutes to render completely.
            </p>
          </div>
        </div>

        <div style={{ height: '1px', backgroundColor: 'var(--border-light)', margin: '2px 0' }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <Sparkles size={16} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', fontWeight: 500, lineHeight: 1.4, margin: 0 }}>
            For {currentOption.label} ({currentOption.seconds}s), aim for ~{approxWords} spoken words (at {wpm} words/min rate).
          </p>
        </div>
      </section>

      {/* Navigation Footer */}
      <footer className="step-footer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '4px' }}>
        <button type="button" onClick={onBack} className="btn-secondary" style={{ minHeight: '44px', padding: '10px 20px' }}>
          <ArrowLeft size={16} />
          <span>Back</span>
          <span className="kbd-hint" title="Keyboard shortcut: Esc">Esc</span>
        </button>

        <button type="button" onClick={onNext} className="btn-primary" style={{ minHeight: '44px', padding: '10px 24px' }}>
          <span>Continue to Script</span>
          <ArrowRight size={16} />
          <span className="kbd-hint" title="Keyboard shortcut: Enter">↵</span>
        </button>
      </footer>
    </div>
  );
};

export default DurationStep;
