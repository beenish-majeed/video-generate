import React, { useEffect, useState } from 'react';
import type { DurationPreset, DurationOption, DurationsResponse } from '../../types/api';
import apiClient from '../../api/client';
import Tape from '../Tape';
import Sticker from '../Sticker';
import { ArrowRight, ArrowLeft, Clock, Sparkles } from 'lucide-react';

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

  useEffect(() => {
    let isMounted = true;
    apiClient
      .getDurations()
      .then((data) => {
        if (isMounted) {
          setDurationsInfo(data);
          // Default selection if none selected yet
          if (!selectedPreset && data.allowed_presets.length > 0) {
            const defaultOpt = data.allowed_presets.find((p) => p.value === '30s') || data.allowed_presets[0];
            onPresetSelected(defaultOpt.value, defaultOpt.seconds);
          }
        }
      })
      .catch((err) => {
        console.error('Error fetching durations:', err);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const presets: DurationOption[] = durationsInfo?.allowed_presets || [
    { label: '5s Teaser', value: '5s', seconds: 5 },
    { label: '30s Scene', value: '30s', seconds: 30 },
    { label: '2 min Story', value: '2m', seconds: 120 },
    { label: '5 min Narrative', value: '5m', seconds: 300 },
    { label: '10 min Epic', value: '10m', seconds: 600 },
  ];

  const currentOption = presets.find((p) => p.value === selectedPreset) || presets[1];
  const wpm = durationsInfo?.words_per_minute || 150;
  const approxWords = Math.round((currentOption.seconds / 60) * wpm);

  return (
    <div style={{ padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: '24px', position: 'relative' }}>
      <Tape rotation="1.8deg" style={{ position: 'absolute', top: '10px', right: '40px' }} />
      <Sticker label="STEP 03" rotation="-3deg" variant="amber" />

      <div>
        <p className="handwritten" style={{ fontSize: '22px' }}>
          Setting the rhythm & pacing...
        </p>
        <h2 className="editorial-title" style={{ fontSize: '28px', marginTop: '4px' }}>
          Select video duration
        </h2>
        <p style={{ color: 'var(--ink-muted)', fontSize: '15px', marginTop: '4px' }}>
          How long should your animated film be? We automatically calculate script length pacing.
        </p>
      </div>

      {/* Duration Options Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '12px' }}>
        {presets.map((preset) => {
          const isSelected = preset.value === selectedPreset;
          return (
            <button
              key={preset.value}
              onClick={() => onPresetSelected(preset.value, preset.seconds)}
              style={{
                padding: '16px 12px',
                borderRadius: '10px',
                backgroundColor: isSelected ? '#fff' : 'var(--paper-cream-alt)',
                border: isSelected ? '2px solid var(--ink-terracotta)' : '1px solid var(--paper-border)',
                color: isSelected ? 'var(--ink-terracotta)' : 'var(--ink-primary)',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '6px',
                boxShadow: isSelected ? 'var(--shadow-paper-float)' : 'var(--shadow-card)',
                transform: isSelected ? 'translateY(-2px)' : 'none',
                transition: 'all 0.15s ease',
              }}
            >
              <Clock size={20} style={{ color: isSelected ? 'var(--ink-terracotta)' : 'var(--ink-muted)' }} />
              <span style={{ fontWeight: 'bold', fontSize: '18px', fontFamily: 'var(--font-serif)' }}>
                {preset.label}
              </span>
              <span className="handwritten" style={{ fontSize: '15px', color: 'var(--ink-muted)' }}>
                {preset.seconds} seconds
              </span>
            </button>
          );
        })}
      </div>

      {/* Script Guidance Box */}
      <div
        style={{
          padding: '18px 20px',
          borderRadius: '10px',
          backgroundColor: '#fff',
          border: '1px dashed var(--paper-border)',
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
          boxShadow: 'var(--shadow-card)',
        }}
      >
        <Sparkles size={24} style={{ color: 'var(--ink-amber)', flexShrink: 0 }} />
        <div>
          <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--ink-primary)' }}>
            Pacing Recommendation for {currentOption.label} ({currentOption.seconds}s):
          </p>
          <p className="handwritten" style={{ fontSize: '18px', color: 'var(--ink-terracotta)', marginTop: '2px' }}>
            Aim for ~{approxWords} words of spoken narrative (calculated at {wpm} words/min rate).
          </p>
        </div>
      </div>

      {/* Navigation Buttons */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '12px' }}>
        <button onClick={onBack} className="btn-secondary">
          <ArrowLeft size={16} />
          <span>Back</span>
        </button>
        <button onClick={onNext} className="btn-terracotta">
          <span>Continue to Script</span>
          <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
};

export default DurationStep;
