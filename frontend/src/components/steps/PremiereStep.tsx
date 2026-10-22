import React, { useState } from 'react';
import type { JobRecord } from '../../types/api';
import apiClient from '../../api/client';
import { mapAPIError } from '../../api/errorMapper';
import { motion, useReducedMotion } from 'framer-motion';
import { Download, RotateCcw, CheckCircle2, AlertCircle, RefreshCw, Loader2, Sparkles } from 'lucide-react';

interface PremiereStepProps {
  job: JobRecord;
  onRestart: () => void;
}

const PastelConfetti: React.FC = () => {
  const shouldReduceMotion = useReducedMotion();
  if (shouldReduceMotion) return null;

  const particles = [
    { x: -55, y: -45, color: 'var(--blob-lavender)', size: 8, delay: 0 },
    { x: 50, y: -50, color: 'var(--blob-peach)', size: 6, delay: 0.05 },
    { x: -85, y: -20, color: 'var(--blob-sky)', size: 7, delay: 0.1 },
    { x: 75, y: -25, color: 'var(--blob-pink)', size: 9, delay: 0.08 },
    { x: -35, y: -70, color: 'var(--accent)', size: 6, delay: 0.12 },
    { x: 35, y: -65, color: 'var(--blob-peach)', size: 8, delay: 0.04 },
    { x: -105, y: 10, color: 'var(--blob-lavender)', size: 6, delay: 0.15 },
    { x: 100, y: 15, color: 'var(--blob-sky)', size: 7, delay: 0.14 },
    { x: -18, y: -80, color: 'var(--blob-pink)', size: 8, delay: 0.06 },
    { x: 18, y: -75, color: 'var(--accent)', size: 6, delay: 0.1 },
    { x: -70, y: -60, color: 'var(--blob-peach)', size: 7, delay: 0.12 },
    { x: 65, y: -60, color: 'var(--blob-lavender)', size: 8, delay: 0.08 },
  ];

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        top: '60px',
        left: '50%',
        transform: 'translateX(-50%)',
        pointerEvents: 'none',
        zIndex: 30,
      }}
    >
      {particles.map((p, i) => (
        <motion.div
          key={i}
          initial={{ x: 0, y: 0, scale: 0, opacity: 1 }}
          animate={{ x: p.x * 2.2, y: p.y * 1.8 + 20, scale: 1, opacity: 0 }}
          transition={{ duration: 1.8, delay: p.delay, ease: [0.16, 1, 0.3, 1] }}
          style={{
            position: 'absolute',
            width: `${p.size}px`,
            height: `${p.size}px`,
            borderRadius: i % 2 === 0 ? '50%' : '2px',
            backgroundColor: p.color,
          }}
        />
      ))}
    </div>
  );
};

export const PremiereStep: React.FC<PremiereStepProps> = ({ job, onRestart }) => {
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [videoStreamError, setVideoStreamError] = useState<boolean>(false);

  const shouldReduceMotion = useReducedMotion();
  const downloadUrl = apiClient.getDownloadUrl(job.job_id);

  // Trigger download via proxy with error mapping
  const handleDownload = async () => {
    setDownloading(true);
    setDownloadError(null);

    try {
      const response = await fetch(downloadUrl);
      if (!response.ok) {
        throw new Error(`HTTP Error ${response.status}: ${response.statusText}`);
      }
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `memory-${job.job_id.slice(0, 8)}.mp4`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
    } catch (err: unknown) {
      const mapped = mapAPIError(err);
      setDownloadError(mapped.message || 'We could not download the video file. Please check connection and try again.');
    } finally {
      setDownloading(false);
    }
  };

  const formattedDuration = job.final_video_duration_seconds
    ? `${job.final_video_duration_seconds.toFixed(1)}s`
    : job.target_duration_seconds
    ? `${job.target_duration_seconds}s`
    : '30s';

  return (
    <div
      className="step-container"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'clamp(16px, 2.5dvh, 28px)',
        position: 'relative',
        maxWidth: 'min(1100px, 96%)',
        margin: 'auto',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      <PastelConfetti />

      {/* Header Copy */}
      <header style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', flexWrap: 'wrap', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <CheckCircle2 size={24} style={{ color: 'var(--accent-success)', flexShrink: 0 }} />
            <h2 className="editorial-title" style={{ fontSize: 'clamp(24px, 2.2vw, 36px)', margin: 0, lineHeight: 1.15 }}>
              Grand Premiere
            </h2>
          </div>
          <span className="step-indicator-pill">DIRECTOR&apos;S CUT</span>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: 'clamp(14px, 1vw, 16px)', margin: 0 }}>
          Here is your finished animated memory ({formattedDuration}). Press play to watch.
        </p>
      </header>

      {/* Theater Frame with Opening Curtains Animation & Shadow Bloom */}
      <motion.div
        role="region"
        aria-label="Theater screening frame"
        initial={{ scale: shouldReduceMotion ? 1 : 0.97, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        style={{
          position: 'relative',
          borderRadius: 'var(--radius-card)',
          backgroundColor: '#0f172a',
          boxShadow: '0 12px 40px rgba(108, 77, 255, 0.16), 0 2px 10px rgba(0, 0, 0, 0.06)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '220px',
          maxHeight: 'min(580px, 54dvh)',
          aspectRatio: '16 / 9',
          width: '100%',
          maxWidth: 'min(1080px, 100%)',
          margin: '0 auto',
          boxSizing: 'border-box',
          border: '1px solid var(--border-light)',
        }}
      >
        <div className="premiere-sweep-overlay" aria-hidden="true" />
        {/* Left Opening Curtain */}
        <motion.div
          initial={{ x: 0 }}
          animate={{ x: shouldReduceMotion ? 0 : '-105%' }}
          transition={{ duration: shouldReduceMotion ? 0 : 1.2, ease: [0.77, 0, 0.175, 1], delay: 0.3 }}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '50.5%',
            height: '100%',
            backgroundColor: 'var(--bg-muted)',
            borderRight: '1px solid var(--border-light)',
            zIndex: 15,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingRight: 'clamp(12px, 3vw, 24px)',
            boxShadow: '4px 0 12px rgba(15,23,42,0.1)',
            boxSizing: 'border-box',
          }}
        >
          <span style={{ fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: 'clamp(18px, 3vw, 24px)', color: 'var(--text-primary)' }}>Grand</span>
        </motion.div>

        {/* Right Opening Curtain */}
        <motion.div
          initial={{ x: 0 }}
          animate={{ x: shouldReduceMotion ? 0 : '105%' }}
          transition={{ duration: shouldReduceMotion ? 0 : 1.2, ease: [0.77, 0, 0.175, 1], delay: 0.3 }}
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            width: '50.5%',
            height: '100%',
            backgroundColor: 'var(--bg-muted)',
            borderLeft: '1px solid var(--border-light)',
            zIndex: 15,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-start',
            paddingLeft: 'clamp(12px, 3vw, 24px)',
            boxShadow: '-4px 0 12px rgba(15,23,42,0.1)',
            boxSizing: 'border-box',
          }}
        >
          <span style={{ fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: 'clamp(18px, 3vw, 24px)', color: 'var(--text-primary)' }}>Premiere</span>
        </motion.div>

        {/* Video Player: NO AUTOPLAY WITH SOUND! autoPlay={false} */}
        {videoStreamError ? (
          <div
            style={{
              padding: 'clamp(20px, 4vw, 32px)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '12px',
              color: '#ffffff',
              textAlign: 'center',
            }}
          >
            <AlertCircle size={36} style={{ color: 'var(--accent-danger)' }} />
            <p style={{ fontSize: '15px' }}>Could not load video preview stream.</p>
            <button
              type="button"
              onClick={() => setVideoStreamError(false)}
              className="btn-secondary"
              style={{ fontSize: '13px', padding: '6px 14px' }}
            >
              <RefreshCw size={14} />
              <span>Retry loading video</span>
            </button>
          </div>
        ) : (
          <video
            controls
            autoPlay={false}
            preload="metadata"
            src={downloadUrl}
            onError={() => setVideoStreamError(true)}
            style={{ width: '100%', maxHeight: '460px', objectFit: 'contain', display: 'block' }}
          />
        )}
      </motion.div>

      {/* Download Error Card */}
      {downloadError && (
        <div
          role="alert"
          style={{
            padding: '14px 18px',
            borderRadius: 'var(--radius-card)',
            backgroundColor: 'var(--accent-danger-light)',
            border: '1px solid var(--accent-danger)',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            width: '100%',
            boxSizing: 'border-box',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <AlertCircle size={20} style={{ color: 'var(--accent-danger)', flexShrink: 0 }} />
            <p style={{ fontSize: '14px', color: 'var(--text-primary)' }}>{downloadError}</p>
          </div>
          <button type="button" onClick={handleDownload} className="btn-secondary" style={{ fontSize: '13px', padding: '6px 12px' }}>
            <RefreshCw size={14} />
            <span>Retry Download</span>
          </button>
        </div>
      )}

      {/* Action Buttons: Download & Make Another */}
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
        <motion.button
          type="button"
          onClick={onRestart}
          className="btn-secondary"
          initial={{ opacity: shouldReduceMotion ? 1 : 0, y: shouldReduceMotion ? 0 : 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          style={{ minHeight: '44px', padding: '8px 18px', cursor: 'pointer' }}
        >
          <RotateCcw size={16} />
          <span>Make another video</span>
        </motion.button>

        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '14px', justifyContent: 'flex-end' }}>
          <motion.div
            initial={{ opacity: shouldReduceMotion ? 1 : 0, y: shouldReduceMotion ? 0 : 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Sparkles size={16} style={{ color: 'var(--accent-primary)' }} />
            <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              MP4 Format with AI Disclosure
            </span>
          </motion.div>

          <motion.button
            type="button"
            onClick={handleDownload}
            disabled={downloading}
            className="btn-primary"
            initial={{ opacity: shouldReduceMotion ? 1 : 0, y: shouldReduceMotion ? 0 : 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
            style={{ fontSize: '15px', padding: '10px 22px', minHeight: '44px', cursor: downloading ? 'not-allowed' : 'pointer' }}
          >
            {downloading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Downloading...</span>
              </>
            ) : (
              <>
                <Download size={18} />
                <span>Download Video</span>
              </>
            )}
          </motion.button>
        </div>
      </footer>
    </div>
  );
};

export default PremiereStep;
