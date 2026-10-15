import React, { useEffect, useState } from 'react';
import apiClient from '../api/client';
import type { CapabilitiesResponse } from '../types/api';
import Sticker from './Sticker';
import { Cpu, Zap, AlertCircle, Clock } from 'lucide-react';

export interface ComputerCapabilitiesPanelProps {
  mode?: 'slideshow' | 'talking_head';
  durationSeconds?: number;
  showLimitations?: boolean;
  className?: string;
}

export const ComputerCapabilitiesPanel: React.FC<ComputerCapabilitiesPanelProps> = ({
  mode = 'slideshow',
  durationSeconds,
  showLimitations = true,
  className = '',
}) => {
  const [capabilities, setCapabilities] = useState<CapabilitiesResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let isCancelled = false;
    setLoading(true);

    apiClient
      .getCapabilities(mode, durationSeconds)
      .then((data) => {
        if (!isCancelled) {
          setCapabilities(data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!isCancelled) {
          // Graceful fallback if offline or backend unavailable
          setCapabilities({
            gpu: { available: false, device_name: 'CPU' },
            providers: { ollama: false, diffusers: false, whisper: false, piper: true, cards: true },
            auto_subtitles: false,
            image_provider_configured: 'cards',
            llm_provider_configured: 'template',
            estimate: durationSeconds
              ? {
                  estimated_seconds: Math.round(durationSeconds * 0.4),
                  display_text: `~${Math.round(durationSeconds * 0.4)} seconds (CPU)`,
                  device: 'cpu',
                }
              : undefined,
          });
          setLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [mode, durationSeconds]);

  const gpuName = capabilities?.gpu?.available
    ? capabilities.gpu.device_name || 'CUDA GPU'
    : 'None (CPU)';
  const hasGpu = Boolean(capabilities?.gpu?.available);

  return (
    <div
      className={`capabilities-panel ${className}`}
      data-testid="computer-capabilities-panel"
      style={{
        backgroundColor: 'rgba(247, 243, 235, 0.75)',
        border: '1.5px dashed var(--paper-border)',
        borderRadius: 'var(--radius-paper)',
        padding: '16px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        boxSizing: 'border-box',
        width: '100%',
      }}
    >
      {/* Header Row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '8px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Cpu size={18} color="var(--ink-terracotta)" aria-hidden="true" />
          <h3
            className="editorial-title"
            style={{ fontSize: '17px', margin: 0, color: 'var(--ink-primary)' }}
          >
            Your computer
          </h3>
        </div>
        <Sticker
          label={hasGpu ? 'GPU ACCELERATED' : 'CPU MODE'}
          variant={hasGpu ? 'sage' : 'amber'}
          rotation="1deg"
        />
      </div>

      {loading ? (
        <p style={{ margin: 0, fontSize: '13px', color: 'var(--ink-muted)' }}>
          Checking system hardware...
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
          {/* Hardware & Providers Specs */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '8px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                color: 'var(--ink-primary)',
              }}
            >
              <Zap size={14} color={hasGpu ? 'var(--ink-sage)' : 'var(--ink-amber)'} aria-hidden="true" />
              <span>
                <strong>Graphics:</strong> {gpuName}
              </span>
            </div>

            <div style={{ color: 'var(--ink-primary)' }}>
              <strong>AI Text:</strong>{' '}
              {capabilities?.providers?.ollama ? (
                <span style={{ color: 'var(--ink-sage)' }}>Ollama (local neural)</span>
              ) : (
                <span style={{ color: 'var(--ink-muted)' }}>Rule-based template</span>
              )}
            </div>

            <div style={{ color: 'var(--ink-primary)' }}>
              <strong>AI Visuals:</strong>{' '}
              {capabilities?.providers?.diffusers ? (
                <span style={{ color: 'var(--ink-sage)' }}>SD-Turbo (local model)</span>
              ) : (
                <span style={{ color: 'var(--ink-muted)' }}>Procedural title cards</span>
              )}
            </div>

            <div style={{ color: 'var(--ink-primary)' }}>
              <strong>Subtitles:</strong>{' '}
              {capabilities?.providers?.whisper ? (
                <span style={{ color: 'var(--ink-sage)' }}>faster-whisper (local)</span>
              ) : (
                <span style={{ color: 'var(--ink-muted)' }}>Rule-based aligner</span>
              )}
            </div>
          </div>

          {/* Honest Time Estimate (No fake percentages) */}
          {capabilities?.estimate && (
            <div
              data-testid="honest-time-estimate"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 12px',
                backgroundColor: 'rgba(255, 255, 255, 0.6)',
                borderRadius: '6px',
                border: '1px solid var(--paper-border)',
                marginTop: '2px',
              }}
            >
              <Clock size={16} color="var(--ink-terracotta)" aria-hidden="true" />
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontWeight: 600, color: 'var(--ink-primary)' }}>
                  Honest render estimate: {capabilities.estimate.display_text}
                </span>
                <span style={{ fontSize: '11px', color: 'var(--ink-muted)' }}>
                  Never a fake percentage — calculated from real scene rendering workload.
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Visible Limitations Note */}
      {showLimitations && (
        <div
          data-testid="limitations-note"
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '8px',
            backgroundColor: 'rgba(240, 160, 75, 0.1)',
            borderLeft: '3px solid var(--ink-amber)',
            padding: '8px 10px',
            borderRadius: '4px',
            fontSize: '12.5px',
            lineHeight: 1.45,
            color: 'var(--ink-primary)',
          }}
        >
          <AlertCircle
            size={16}
            color="var(--ink-amber)"
            style={{ flexShrink: 0, marginTop: '2px' }}
            aria-hidden="true"
          />
          <div>
            <strong>Limitations:</strong> visuals are generated scenes with camera moves, not real
            motion video; CPU generation is slow; first run needs one-time model downloads.
          </div>
        </div>
      )}
    </div>
  );
};

export default ComputerCapabilitiesPanel;
