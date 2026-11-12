import React, { useEffect, useState } from 'react';
import type { DurationPreset, DurationsResponse } from '../../types/api';
import apiClient from '../../api/client';
import { mapAPIError, type MappedAPIError } from '../../api/errorMapper';
import { playStickerPopSound } from '../../utils/soundEffects';
import { motion } from 'framer-motion';
import { ArrowRight, ArrowLeft, Clock, Loader2, AlertCircle, RefreshCw, Volume2 } from 'lucide-react';
import StoryScrollSection from '../ui/StoryScrollSection';

export const RENDER_SECONDS_PER_VIDEO_SECOND = 3.7;

export function formatRenderEstimate(videoSeconds: number): string {
  const renderSeconds = Math.round(videoSeconds * RENDER_SECONDS_PER_VIDEO_SECOND);
  if (renderSeconds < 60) {
    return `~${renderSeconds} sec`;
  }
  const mins = renderSeconds / 60;
  const formatted = mins % 1 === 0 ? `${mins}` : mins.toFixed(1).replace(/\.0$/, '');
  return `~${formatted} min`;
}

export interface PresetCardItem {
  value: DurationPreset;
  label: string;
  seconds: number;
}

export const DURATION_ROW_1: PresetCardItem[] = [
  { value: '5s', label: '5 sec', seconds: 5 },
  { value: '30s', label: '30 sec', seconds: 30 },
  { value: '1m', label: '1 min', seconds: 60 },
];

export const DURATION_ROW_2: PresetCardItem[] = [
  { value: '2m', label: '2 min', seconds: 120 },
  { value: '3m', label: '3 min', seconds: 180 },
  { value: '5m', label: '5 min', seconds: 300 },
  { value: '10m', label: '10 min', seconds: 600 },
];

export interface DurationStepProps {
  selectedPreset: DurationPreset;
  onPresetSelected: (preset: DurationPreset, targetSeconds: number) => void;
  onNext: () => void;
  onBack: () => void;
  detectedAudioSeconds?: number | null;
}

export const DurationStep: React.FC<DurationStepProps> = ({
  selectedPreset,
  onPresetSelected,
  onNext,
  onBack,
  detectedAudioSeconds,
}) => {
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<MappedAPIError | null>(null);

  const fetchDurations = async () => {
    setLoading(true);
    setError(null);
    try {
      const data: DurationsResponse = await apiClient.getDurations();
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

  const hasDetectedAudio = typeof detectedAudioSeconds === 'number' && detectedAudioSeconds > 0;

  const renderCard = (card: PresetCardItem) => {
    const isSelected = card.value === selectedPreset;

    return (
      <motion.button
        key={card.value}
        type="button"
        onClick={() => {
          playStickerPopSound();
          onPresetSelected(card.value, card.seconds);
        }}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
        aria-pressed={isSelected}
        className={`card ${isSelected ? 'card-selected' : ''}`}
        style={{
          position: 'relative',
          padding: '12px 14px',
          cursor: 'pointer',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '4px',
          flex: '1 1 125px',
          minWidth: '105px',
          maxWidth: '155px',
          textAlign: 'center',
          border: isSelected ? '2px solid var(--accent)' : '1px solid var(--border-light)',
          background: isSelected ? 'rgba(0, 128, 128, 0.08)' : 'var(--bg-surface)',
          borderRadius: 'var(--radius-md)',
          boxShadow: isSelected ? '0 0 0 1px var(--accent), 0 2px 8px rgba(0, 128, 128, 0.10)' : 'none',
          boxSizing: 'border-box',
          transition: 'all 0.18s ease',
        }}
      >
        <Clock size={16} style={{ color: isSelected ? 'var(--accent)' : 'var(--text-muted)' }} />
        <span
          style={{
            fontWeight: isSelected ? 700 : 600,
            fontSize: '15px',
            color: isSelected ? 'var(--accent)' : 'var(--text-primary)',
          }}
        >
          {card.label}
        </span>
        <span
          style={{
            fontSize: '11.5px',
            color: isSelected ? 'var(--accent)' : 'var(--text-muted)',
            fontWeight: isSelected ? 500 : 400,
          }}
        >
          {formatRenderEstimate(card.seconds)}
        </span>
      </motion.button>
    );
  };

  return (
    <div
      className="step-container"
      style={{
        padding: 'clamp(16px, 2.5dvh, 32px) clamp(16px, 2.5vw, 44px)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'clamp(18px, 2.5dvh, 28px)',
        position: 'relative',
        maxWidth: 'min(900px, 96%)',
        margin: 'auto',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      {/* Heading only */}
      <StoryScrollSection as="header" style={{ textAlign: 'center' }}>
        <h2 className="editorial-title" style={{ fontSize: 'clamp(24px, 2.2vw, 34px)', lineHeight: 1.2, margin: 0 }}>
          Select video duration
        </h2>
      </StoryScrollSection>

      {/* Main duration selection */}
      <StoryScrollSection as="div" delay={0.06} role="region" aria-label="Duration preset selection" style={{ width: '100%' }}>
        {loading ? (
          <div
            className="card"
            style={{
              padding: '36px 20px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '12px',
              color: 'var(--accent-primary)',
              width: '100%',
            }}
          >
            <Loader2 size={26} className="animate-spin" />
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', fontWeight: 500, margin: 0 }}>
              Loading duration presets...
            </p>
          </div>
        ) : error ? (
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
            <AlertCircle size={26} style={{ color: 'var(--accent-danger)' }} />
            <div>
              <h4 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                {error.title}
              </h4>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px', margin: 0 }}>
                {error.message}
              </p>
            </div>
            <button type="button" onClick={fetchDurations} className="btn-secondary" style={{ fontSize: '13px', minHeight: '40px' }}>
              <RefreshCw size={14} />
              <span>Retry</span>
            </button>
          </div>
        ) : hasDetectedAudio ? (
          /* Detected Audio Duration Display for Flow B */
          <div style={{ display: 'flex', justifyContent: 'center', width: '100%', padding: '12px 0' }}>
            <div
              className="card card-selected"
              style={{
                padding: '28px 32px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '8px',
                textAlign: 'center',
                border: '2px solid var(--accent)',
                borderRadius: 'var(--radius-card)',
                background: 'var(--bg-card)',
                maxWidth: '380px',
                width: '100%',
                boxSizing: 'border-box',
              }}
            >
              <Volume2 size={28} style={{ color: 'var(--accent)' }} />
              <span style={{ fontWeight: 700, fontSize: '22px', color: 'var(--accent)' }}>
                {detectedAudioSeconds < 60
                  ? `${Math.round(detectedAudioSeconds)} sec`
                  : `${(detectedAudioSeconds / 60).toFixed(1)} min`}
              </span>
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 500 }}>
                Detected from your voice audio
              </span>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                {formatRenderEstimate(detectedAudioSeconds)} render estimate
              </span>
            </div>
          </div>
        ) : (
          /* Two rows: Row 1 = 3 cards centered, Row 2 = 4 cards aligned below */
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              width: '100%',
              maxWidth: '680px',
              margin: '0 auto',
              alignItems: 'center',
            }}
          >
            {/* Row 1: 3 cards centered (5 sec, 30 sec, 1 min) */}
            <div
              className="duration-row-1"
              style={{
                display: 'flex',
                justifyContent: 'center',
                gap: '10px',
                flexWrap: 'wrap',
                width: '100%',
              }}
            >
              {DURATION_ROW_1.map(renderCard)}
            </div>

            {/* Row 2: 4 cards aligned below (2 min, 3 min, 5 min, 10 min) */}
            <div
              className="duration-row-2"
              style={{
                display: 'flex',
                justifyContent: 'center',
                gap: '10px',
                flexWrap: 'wrap',
                width: '100%',
              }}
            >
              {DURATION_ROW_2.map(renderCard)}
            </div>
          </div>
        )}
      </StoryScrollSection>

      {/* Navigation Footer - Only two buttons: Back and Continue */}
      <StoryScrollSection
        as="footer"
        delay={0.12}
        className="step-footer"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '6px' }}
      >
        <button
          type="button"
          onClick={onBack}
          className="btn-secondary"
          style={{ minHeight: '44px', padding: '10px 20px' }}
        >
          <ArrowLeft size={16} />
          <span>Back</span>
        </button>

        <button
          type="button"
          onClick={onNext}
          className="btn-primary"
          style={{ minHeight: '44px', padding: '10px 24px' }}
        >
          <span>Continue</span>
          <ArrowRight size={16} />
        </button>
      </StoryScrollSection>
    </div>
  );
};

export default DurationStep;
