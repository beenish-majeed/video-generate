import React from 'react';
import { ArrowLeft, Compass } from 'lucide-react';

interface NotFoundScreenProps {
  onBackToStart: () => void;
}

export const NotFoundScreen: React.FC<NotFoundScreenProps> = ({ onBackToStart }) => {
  return (
    <div
      className="step-container"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        minHeight: '65vh',
        padding: 'clamp(20px, 4vw, 40px)',
        boxSizing: 'border-box',
      }}
    >
      <div
        className="card"
        style={{
          background: 'var(--bg-surface)',
          borderRadius: 'var(--radius-card)',
          padding: 'clamp(32px, 5dvh, 56px) clamp(24px, 4vw, 48px)',
          boxShadow: 'var(--shadow-card)',
          border: '1px solid var(--border-light)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '18px',
          maxWidth: '540px',
          width: '100%',
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            backgroundColor: 'var(--accent-primary-light)',
            color: 'var(--accent-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Compass size={32} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <span
            style={{
              fontSize: '13px',
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--accent-primary)',
            }}
          >
            404 — Page Not Found
          </span>
          <h1
            className="editorial-title"
            style={{
              fontSize: 'clamp(24px, 2.5vw, 32px)',
              margin: 0,
              lineHeight: 1.2,
              color: 'var(--text-primary)',
            }}
          >
            We couldn't find that path
          </h1>
          <p
            style={{
              fontSize: '15px',
              color: 'var(--text-muted)',
              lineHeight: 1.5,
              margin: 0,
            }}
          >
            The landscape ahead is uncharted or this page has wandered away. Let's return to the studio.
          </p>
        </div>

        <button
          type="button"
          onClick={onBackToStart}
          className="btn-primary"
          style={{
            marginTop: '8px',
            minHeight: '44px',
            padding: '10px 24px',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <ArrowLeft size={16} />
          <span>Back to start</span>
        </button>
      </div>
    </div>
  );
};

export default NotFoundScreen;
