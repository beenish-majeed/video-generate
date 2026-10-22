import React, { useEffect, useState } from 'react';
import type { JobRecord } from '../../types/api';
import { mapFailedJobError } from '../../utils/failedJobMapper';
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
    <div
      className="step-container"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'clamp(16px, 2.5dvh, 28px)',
        position: 'relative',
        maxWidth: 'min(900px, 96%)',
        margin: 'auto',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      {/* Header Copy */}
      <header style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', flexWrap: 'wrap', gap: '8px' }}>
          <h2 className="editorial-title" style={{ fontSize: 'clamp(24px, 2.2vw, 36px)', margin: 0, lineHeight: 1.15 }}>
            {mapped.title}
          </h2>
          <span className="step-indicator-pill">STUDIO NOTE</span>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: 'clamp(14px, 1vw, 16px)', margin: 0 }}>
          Don’t worry—your story text and uploaded files are safely kept in memory. You don’t have to start over.
        </p>
      </header>

      {/* Main Kind Explanation Card */}
      <div
        role="region"
        aria-label="Error explanation card"
        className="card error-shake error-card-tint"
        style={{
          padding: 'clamp(20px, 3dvh, 28px)',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          width: '100%',
          boxSizing: 'border-box',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
          <AlertCircle size={28} style={{ color: 'var(--accent-danger)', flexShrink: 0, marginTop: '2px' }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%' }}>
            <h3 style={{ fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: '18px', color: 'var(--text-primary)', margin: 0 }}>
              What Happened
            </h3>
            <p style={{ fontSize: '15px', color: 'var(--accent-danger)', margin: 0, lineHeight: 1.5 }}>
              "{mapped.explanation}"
            </p>
          </div>
        </div>

        <div style={{ height: '1px', backgroundColor: 'var(--border-light)' }} />

        {/* Recommended Next Step */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', backgroundColor: 'var(--bg-subtle)', padding: '14px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)', width: '100%', boxSizing: 'border-box' }}>
          <HelpCircle size={20} style={{ color: 'var(--accent-primary)', flexShrink: 0, marginTop: '2px' }} />
          <div style={{ width: '100%' }}>
            <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Recommended Next Step</p>
            <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginTop: '2px', lineHeight: 1.5 }}>
              {mapped.nextStep}
            </p>
          </div>
        </div>

        {/* Technical Summary Collapsible Toggle */}
        <div style={{ marginTop: '4px', width: '100%' }}>
          <button
            type="button"
            onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
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
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--bg-subtle)',
                fontSize: '12px',
                color: 'var(--text-primary)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                fontFamily: 'monospace',
                border: '1px solid var(--border-light)',
                maxWidth: '100%',
                overflowX: 'auto',
              }}
            >
              {JSON.stringify({ rawError: rawError, jobState: job?.state, jobId: job?.job_id }, null, 2)}
            </pre>
          )}
        </div>
      </div>

      {/* Action Footer */}
      <footer
        className="card"
        style={{
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          flexWrap: 'wrap',
          width: '100%',
          boxSizing: 'border-box',
        }}
      >
        <p style={{ fontSize: '14px', color: 'var(--text-muted)', margin: 0 }}>
          Adjust parameters and try once more.
        </p>

        <button
          type="button"
          onClick={handleTryAgain}
          className="btn-primary"
          style={{ fontSize: '15px', padding: '10px 22px', minHeight: '44px', cursor: 'pointer' }}
        >
          <RotateCcw size={16} />
          <span>Try Again</span>
        </button>
      </footer>
    </div>
  );
};

export default FailedStep;
