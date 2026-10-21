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

      {/* Theater Frame with Opening Curtains Animation */}
      <div
        role="region"
        aria-label="Theater screening frame"
        style={{
          position: 'relative',
          borderRadius: 'var(--radius-card)',
          backgroundColor: '#0f172a',
          boxShadow: 'var(--shadow-card)',
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
      </div>

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
        <button
          type="button"
          onClick={onRestart}
          className="btn-secondary"
          style={{ minHeight: '44px', padding: '8px 18px', cursor: 'pointer' }}
        >
          <RotateCcw size={16} />
          <span>Make another video</span>
        </button>

        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '14px', justifyContent: 'flex-end' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Sparkles size={16} style={{ color: 'var(--accent-primary)' }} />
            <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              MP4 Format with AI Disclosure
            </span>
          </div>

          <button
            type="button"
            onClick={handleDownload}
            disabled={downloading}
            className="btn-primary"
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
          </button>
        </div>
      </footer>
    </div>
  );
};

export default PremiereStep;
