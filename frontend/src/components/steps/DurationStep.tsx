import React, { useEffect, useState } from 'react';
import type { DurationPreset, DurationOption, DurationsResponse } from '../../types/api';
import apiClient from '../../api/client';
import { mapAPIError, type MappedAPIError } from '../../api/errorMapper';
import { playStickerPopSound } from '../../utils/soundEffects';
import Tape from '../Tape';
import Sticker from '../Sticker';
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
        padding: 'clamp(20px, 4vw, 32px) clamp(12px, 3vw, 24px)',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
        position: 'relative',
        width: '100%',
      }}
    >
      <Tape rotation="1.8deg" style={{ position: 'absolute', top: '10px', right: '40px' }} />
      <Sticker label="HOW LONG SHOULD IT BE?" rotation="-3deg" variant="amber" />

      {/* Header Copy */}
      <header>
        <p className="handwritten" style={{ fontSize: 'clamp(18px, 2vw + 12px, 22px)' }}>
          Setting the rhythm & pacing...
        </p>
        <h2 className="editorial-title" style={{ marginTop: '4px' }}>
          Select video duration
        </h2>
        <p style={{ color: 'var(--ink-muted)', fontSize: '15px', marginTop: '4px' }}>
          How long should your animated film be? We load options dynamically from the studio backend.
        </p>
      </header>

      {/* Main Interactive Preset Selection - Fluid Grid (1 col phone, 2 col tablet, 3-4 col desktop) */}
      <main style={{ minHeight: '180px', width: '100%' }}>
        {loading ? (
          /* Loading State */
          <div
            style={{
              padding: '40px 24px',
              borderRadius: '12px',
              backgroundColor: 'var(--paper-cream-alt)',
              border: '2px dashed var(--paper-border)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '12px',
              color: 'var(--ink-terracotta)',
              width: '100%',
            }}
          >
            <Loader2 size={32} className="animate-spin" />
            <p className="handwritten" style={{ fontSize: '20px' }}>
              Fetching duration options from the studio...
            </p>
          </div>
        ) : error ? (
          /* Failure / Error State */
          <div
            role="alert"
            style={{
              padding: '24px',
              borderRadius: '12px',
              backgroundColor: '#fff',
              border: '1.5px dashed var(--ink-terracotta)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '16px',
              textAlign: 'center',
              boxShadow: 'var(--shadow-card)',
              width: '100%',
            }}
          >
            <AlertCircle size={32} style={{ color: 'var(--ink-terracotta)' }} />
            <div>
              <h4 style={{ fontFamily: 'var(--font-serif)', fontSize: '18px', color: 'var(--ink-primary)' }}>
                {error.title}
              </h4>
              <p style={{ fontSize: '14px', color: 'var(--ink-muted)', marginTop: '4px', maxWidth: '460px' }}>
                {error.message}
              </p>
            </div>
            <button type="button" onClick={fetchDurations} className="btn-secondary" style={{ fontSize: '14px' }}>
              <RefreshCw size={14} />
              <span>Retry loading durations</span>
            </button>
          </div>
        ) : (
          /* Responsive Fluid Grid of Duration Preset Cards */
          <div className="duration-cards-grid">
            {presets.map((preset, idx) => {
              const isSelected = preset.value === selectedPreset;
              // Subtle hand-placed rotation tilt for unselected cards
              const tilt = isSelected ? 0 : idx % 2 === 0 ? -1.5 : 1.5;

              return (
                <motion.button
                  key={preset.value}
                  type="button"
                  onClick={() => {
                    playStickerPopSound();
                    onPresetSelected(preset.value, preset.seconds);
                  }}
                  whileHover={{ scale: 1.03, rotate: isSelected ? 0 : tilt * 0.5 }}
                  whileTap={{ scale: 0.95 }}
                  animate={{ scale: isSelected ? 1.03 : 1, y: isSelected ? -4 : 0 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                  aria-pressed={isSelected}
                  aria-label={`Select ${preset.label}, duration ${preset.seconds} seconds`}
                  style={{
                    position: 'relative',
                    padding: '18px 12px',
                    borderRadius: '12px',
                    backgroundColor: isSelected ? '#ffffff' : 'var(--paper-cream-alt)',
                    border: isSelected ? '2.5px solid var(--ink-terracotta)' : '1.5px solid var(--paper-border)',
                    color: isSelected ? 'var(--ink-terracotta)' : 'var(--ink-primary)',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '6px',
                    boxShadow: isSelected ? 'var(--shadow-paper-float)' : 'var(--shadow-card)',
                    transform: `rotate(${tilt}deg)`,
                    outline: 'none',
                    height: '100%',
                    width: '100%',
                  }}
                >
                  {/* Selected Badge Sticker */}
                  {isSelected && (
                    <div
                      style={{
                        position: 'absolute',
                        top: '-10px',
                        right: '-6px',
                        backgroundColor: 'var(--ink-terracotta)',
                        color: '#ffffff',
                        fontSize: '10px',
                        fontWeight: 'bold',
                        padding: '2px 8px',
                        borderRadius: '10px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        boxShadow: 'var(--shadow-tape)',
                      }}
                    >
                      Selected
                    </div>
                  )}

                  <Clock size={22} style={{ color: isSelected ? 'var(--ink-terracotta)' : 'var(--ink-muted)' }} />

                  <span style={{ fontWeight: 'bold', fontSize: '18px', fontFamily: 'var(--font-serif)', marginTop: '2px' }}>
                    {preset.label}
                  </span>

                  <span className="handwritten" style={{ fontSize: '16px', color: 'var(--ink-muted)' }}>
                    {preset.seconds}s length
                  </span>

                  <span style={{ fontSize: '11px', color: 'var(--ink-muted)', marginTop: '4px', fontStyle: 'italic', textAlign: 'center' }}>
                    {formatEstimatedRenderTime(preset.seconds)}
                  </span>
                </motion.button>
              );
            })}
          </div>
        )}
      </main>

      {/* Kind Note about Render Time & Pacing - Wraps Text Cleanly without Overflow */}
      <section
        style={{
          padding: 'clamp(14px, 3vw, 20px)',
          borderRadius: '12px',
          backgroundColor: '#ffffff',
          border: '1px dashed var(--paper-border)',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          boxShadow: 'var(--shadow-card)',
          width: '100%',
          boxSizing: 'border-box',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
          <Hourglass size={22} style={{ color: 'var(--ink-terracotta)', flexShrink: 0, marginTop: '2px' }} />
          <div>
            <h4 style={{ fontFamily: 'var(--font-serif)', fontSize: '17px', color: 'var(--ink-primary)' }}>
              A Kind Note on Studio Render Time
            </h4>
            <p style={{ fontSize: '14px', color: 'var(--ink-muted)', marginTop: '4px', lineHeight: 1.5 }}>
              Longer videos take longer to craft carefully: rendering takes about <strong>3.7 times</strong> the video length.
              For instance, a 5-minute video takes about 18 minutes to render completely.
            </p>
          </div>
        </div>

        <div style={{ height: '1px', backgroundColor: 'var(--paper-border)', margin: '2px 0' }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <Sparkles size={18} style={{ color: 'var(--ink-amber)', flexShrink: 0 }} />
          <p className="handwritten" style={{ fontSize: '18px', color: 'var(--ink-terracotta)', lineHeight: 1.3 }}>
            For {currentOption.label} ({currentOption.seconds}s), aim for ~{approxWords} spoken words (at {wpm} words/min rate).
          </p>
        </div>
      </section>

      {/* Navigation Footer */}
      <footer className="step-footer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '8px' }}>
        <button type="button" onClick={onBack} className="btn-secondary">
          <ArrowLeft size={16} />
          <span>Back</span>
        </button>

        <button type="button" onClick={onNext} className="btn-terracotta">
          <span>Continue to Script</span>
          <ArrowRight size={16} />
        </button>
      </footer>
    </div>
  );
};

export default DurationStep;
