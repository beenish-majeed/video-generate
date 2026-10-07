import React, { useEffect, useState } from 'react';
import type { JobRecord } from '../../types/api';
import { mapFailedJobError } from '../../utils/failedJobMapper';
import Tape from '../Tape';
import Sticker from '../Sticker';
import { AlertCircle, RotateCcw, ChevronDown, ChevronUp, HelpCircle } from 'lucide-react';

interface FailedStepProps {
  job?: JobRecord | null;
  errorMessage?: string | null;
  onRetry: (recommendedStep?: 'script' | 'consent' | 'photo' | 'voice') => void;
}

export const FailedStep: React.FC<FailedStepProps> = ({ job, errorMessage, onRetry }) => {
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);

  // Clear stored active job ID from localStorage so staled failed job IDs aren't persisted
  useEffect(() => {
    try {
      localStorage.removeItem('memory_studio_active_job_id');
    } catch {}
  }, []);

  const rawError = errorMessage || job?.error || null;
  const mapped = mapFailedJobError(rawError);

  const handleTryAgain = () => {
    try {
      localStorage.removeItem('memory_studio_active_job_id');
    } catch {}
    onRetry(mapped.recommendedStep);
  };

  return (
    <div style={{ padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: '24px', position: 'relative' }}>
      <Tape rotation="-2deg" style={{ position: 'absolute', top: '10px', right: '40px' }} />
      <Sticker label="STUDIO NOTE" rotation="-3deg" variant="amber" />

      {/* Header Copy */}
      <header>
        <p className="handwritten" style={{ fontSize: '24px', color: 'var(--ink-terracotta)' }}>
          Ah, a gentle bump along the creative path...
        </p>
        <h2 className="editorial-title" style={{ fontSize: '28px', marginTop: '4px' }}>
          {mapped.title}
        </h2>
        <p style={{ color: 'var(--ink-muted)', fontSize: '15px', marginTop: '4px' }}>
          Don’t worry—your story text and uploaded files are safely kept in memory. You don’t have to start over.
        </p>
      </header>

      {/* Main Kind Explanation Card */}
      <main
        style={{
          padding: '24px',
          borderRadius: '12px',
          backgroundColor: '#ffffff',
          border: '1.5px dashed var(--ink-terracotta)',
          display: 'flex',
          flexDirection: 'column',
          gap: '18px',
          boxShadow: 'var(--shadow-card)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
          <AlertCircle size={28} style={{ color: 'var(--ink-terracotta)', flexShrink: 0, marginTop: '2px' }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: '19px', color: 'var(--ink-primary)' }}>
              What Happened
            </h3>
            <p className="handwritten" style={{ fontSize: '20px', color: 'var(--ink-terracotta)' }}>
              "{mapped.explanation}"
            </p>
          </div>
        </div>

        <div style={{ height: '1px', backgroundColor: 'var(--paper-border)' }} />

        {/* Recommended Next Step */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', backgroundColor: 'var(--paper-cream-alt)', padding: '14px 16px', borderRadius: '8px' }}>
          <HelpCircle size={20} style={{ color: 'var(--ink-sage)', flexShrink: 0, marginTop: '2px' }} />
          <div>
            <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--ink-primary)' }}>Recommended Next Step</p>
            <p style={{ fontSize: '14px', color: 'var(--ink-muted)', marginTop: '2px', lineHeight: 1.5 }}>
              {mapped.nextStep}
            </p>
          </div>
        </div>

        {/* Technical Summary Collapsible Toggle */}
        <div style={{ marginTop: '4px' }}>
          <button
            type="button"
            onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--ink-muted)',
              fontSize: '13px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: 0,
            }}
          >
            <span>{showTechnicalDetails ? 'Hide technical logs' : 'View technical log details'}</span>
            {showTechnicalDetails ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          {showTechnicalDetails && (
            <pre
              style={{
                marginTop: '10px',
                padding: '12px',
                borderRadius: '6px',
                backgroundColor: 'var(--paper-cream-alt)',
                fontSize: '12px',
                color: 'var(--ink-primary)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                fontFamily: 'monospace',
                border: '1px solid var(--paper-border)',
              }}
            >
              {JSON.stringify({ rawError: rawError, jobState: job?.state, jobId: job?.job_id }, null, 2)}
            </pre>
          )}
        </div>
      </main>

      {/* Action Footer */}
      <footer style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '8px' }}>
        <p className="handwritten" style={{ fontSize: '19px', color: 'var(--ink-muted)' }}>
          Let’s adjust parameters and try once more →
        </p>

        <button type="button" onClick={handleTryAgain} className="btn-terracotta" style={{ fontSize: '16px', padding: '12px 28px' }}>
          <RotateCcw size={16} />
          <span>Try Again</span>
        </button>
      </footer>
    </div>
  );
};

export default FailedStep;
