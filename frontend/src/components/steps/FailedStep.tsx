import React, { useState } from 'react';
import type { JobRecord } from '../../types/api';
import Tape from '../Tape';
import Sticker from '../Sticker';
import { AlertCircle, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react';

interface FailedStepProps {
  job?: JobRecord | null;
  errorMessage?: string | null;
  onRetry: () => void;
}

export const FailedStep: React.FC<FailedStepProps> = ({ job, errorMessage, onRetry }) => {
  const [showDetails, setShowDetails] = useState(false);
  const detail = errorMessage || job?.error || 'An unexpected rendering pause occurred while processing audio/video timing.';

  return (
    <div style={{ padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: '24px', position: 'relative' }}>
      <Tape rotation="-2deg" style={{ position: 'absolute', top: '10px', right: '40px' }} />
      <Sticker label="STUDIO NOTE" rotation="-3deg" variant="amber" />

      <div>
        <p className="handwritten" style={{ fontSize: '24px', color: 'var(--ink-terracotta)' }}>
          Ah, a gentle bump along the path...
        </p>
        <h2 className="editorial-title" style={{ fontSize: '28px', marginTop: '4px' }}>
          We hit a small hiccup
        </h2>
        <p style={{ color: 'var(--ink-muted)', fontSize: '15px', marginTop: '4px' }}>
          Don't worry—your story and files are safe. We can adjust the script or audio and try again.
        </p>
      </div>

      <div
        style={{
          padding: '24px',
          borderRadius: '12px',
          backgroundColor: '#fff',
          border: '1.5px dashed var(--ink-terracotta)',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          boxShadow: 'var(--shadow-card)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
          <AlertCircle size={28} style={{ color: 'var(--ink-terracotta)', flexShrink: 0, marginTop: '2px' }} />
          <div>
            <h4 style={{ fontFamily: 'var(--font-serif)', fontSize: '18px', color: 'var(--ink-primary)' }}>
              Render Exception Detail
            </h4>
            <p className="handwritten" style={{ fontSize: '18px', color: 'var(--ink-terracotta)', marginTop: '4px' }}>
              "{detail}"
            </p>
          </div>
        </div>

        {/* Collapsible Technical Details */}
        <button
          onClick={() => setShowDetails(!showDetails)}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--ink-muted)',
            fontSize: '13px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '4px 0',
            width: 'fit-content',
          }}
        >
          <span>{showDetails ? 'Hide technical summary' : 'View technical summary'}</span>
          {showDetails ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>

        {showDetails && (
          <pre
            style={{
              padding: '12px',
              borderRadius: '6px',
              backgroundColor: 'var(--paper-cream-alt)',
              fontSize: '12px',
              color: 'var(--ink-primary)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
              fontFamily: 'monospace',
            }}
          >
            {JSON.stringify(job || { error: detail }, null, 2)}
          </pre>
        )}
      </div>

      {/* Action Buttons */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '12px' }}>
        <p className="handwritten" style={{ fontSize: '18px', color: 'var(--ink-muted)' }}>
          Let's adjust parameters and try once more →
        </p>
        <button onClick={onRetry} className="btn-terracotta">
          <RotateCcw size={16} />
          <span>Try Again</span>
        </button>
      </div>
    </div>
  );
};

export default FailedStep;
