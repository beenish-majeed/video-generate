import React, { useState } from 'react';
import type { JobRecord } from '../../types/api';
import apiClient from '../../api/client';
import { mapAPIError } from '../../api/errorMapper';
import { DoodleSparkle } from '../Doodles';
import Tape from '../Tape';
import Sticker from '../Sticker';
import { motion, useReducedMotion } from 'framer-motion';
import { Download, RotateCcw, CheckCircle2, AlertCircle, RefreshCw, Loader2 } from 'lucide-react';

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
    <div className="step-container" style={{ padding: 'clamp(20px, 4vw, 32px) clamp(14px, 3vw, 24px)', display: 'flex', flexDirection: 'column', gap: '24px', position: 'relative', width: '100%', boxSizing: 'border-box' }}>
      <Tape rotation="-3deg" style={{ position: 'absolute', top: '10px', left: '30px' }} />
      <Sticker label="DIRECTOR'S CUT" rotation="4deg" variant="terracotta" />

      {/* Header Copy */}
      <header style={{ width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <CheckCircle2 size={24} style={{ color: 'var(--ink-sage)', flexShrink: 0 }} />
          <p className="handwritten" style={{ fontSize: 'clamp(20px, 4vw, 24px)', color: 'var(--ink-sage)', wordBreak: 'break-word' }}>
            Your film is ready!
          </p>
        </div>
        <h2 className="editorial-title" style={{ fontSize: 'clamp(24px, 5vw, 32px)', marginTop: '4px', wordBreak: 'break-word' }}>
          Grand Premiere
        </h2>
        <p style={{ color: 'var(--ink-muted)', fontSize: '15px', marginTop: '4px', wordBreak: 'break-word' }}>
          Here is your finished animated memory ({formattedDuration}). Press play to watch.
        </p>
      </header>

      {/* Theater Frame with Opening Curtains Animation */}
      <main
        style={{
          position: 'relative',
          borderRadius: '12px',
          backgroundColor: '#121212',
          boxShadow: 'var(--shadow-notebook)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 'clamp(200px, 40dvh, 380px)',
          width: '100%',
          boxSizing: 'border-box',
          border: '4px solid var(--paper-cream-alt)',
        }}
      >
        <Tape rotation="1.5deg" style={{ position: 'absolute', top: '12px', right: '20px', zIndex: 20 }} />

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
            backgroundColor: 'var(--paper-cream-dark)',
            borderRight: '2px dashed var(--paper-border)',
            zIndex: 15,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingRight: 'clamp(8px, 3vw, 20px)',
            boxShadow: '4px 0 12px rgba(0,0,0,0.2)',
            boxSizing: 'border-box',
          }}
        >
          <span className="handwritten" style={{ fontSize: 'clamp(18px, 4vw, 26px)', color: 'var(--ink-terracotta)', wordBreak: 'break-word' }}>Grand</span>
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
            backgroundColor: 'var(--paper-cream-dark)',
            borderLeft: '2px dashed var(--paper-border)',
            zIndex: 15,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-start',
            paddingLeft: 'clamp(8px, 3vw, 20px)',
            boxShadow: '-4px 0 12px rgba(0,0,0,0.2)',
            boxSizing: 'border-box',
          }}
        >
          <span className="handwritten" style={{ fontSize: 'clamp(18px, 4vw, 26px)', color: 'var(--ink-terracotta)', wordBreak: 'break-word' }}>Premiere</span>
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
            <AlertCircle size={36} style={{ color: 'var(--ink-terracotta)' }} />
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
      </main>

      {/* Download Error Card */}
      {downloadError && (
        <div
          role="alert"
          style={{
            padding: '16px 20px',
            borderRadius: '10px',
            backgroundColor: '#fff',
            border: '1.5px dashed var(--ink-terracotta)',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            boxShadow: 'var(--shadow-card)',
            width: '100%',
            boxSizing: 'border-box',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <AlertCircle size={20} style={{ color: 'var(--ink-terracotta)', flexShrink: 0 }} />
            <p style={{ fontSize: '14px', color: 'var(--ink-muted)', wordBreak: 'break-word' }}>{downloadError}</p>
          </div>
          <button type="button" onClick={handleDownload} className="btn-secondary" style={{ fontSize: '13px', padding: '6px 12px' }}>
            <RefreshCw size={14} />
            <span>Retry Download</span>
          </button>
        </div>
      )}

      {/* Action Buttons: Download & Make Another */}
      <footer
        className="step-footer"
        style={{
          padding: 'clamp(14px, 3vw, 20px)',
          borderRadius: '12px',
          backgroundColor: 'var(--paper-cream-alt)',
          border: '1px dashed var(--paper-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
          boxShadow: 'var(--shadow-card)',
          flexWrap: 'wrap',
          width: '100%',
          boxSizing: 'border-box',
        }}
      >
        <button type="button" onClick={onRestart} className="btn-secondary">
          <RotateCcw size={16} />
          <span>Make another video</span>
        </button>

        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px', justifyContent: 'flex-end' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <DoodleSparkle size={20} />
            <span className="handwritten" style={{ fontSize: 'clamp(15px, 3.5vw, 18px)', color: 'var(--ink-muted)', wordBreak: 'break-word' }}>
              MP4 Format with AI Disclosure
            </span>
          </div>

          <button
            type="button"
            onClick={handleDownload}
            disabled={downloading}
            className="btn-terracotta"
            style={{ fontSize: '15px', padding: '12px 24px', minHeight: '44px' }}
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
