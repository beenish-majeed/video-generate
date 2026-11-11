import React, { useState } from 'react';
import type { JobRecord } from '../../types/api';
import apiClient from '../../api/client';
import { mapAPIError } from '../../api/errorMapper';
import { motion, useReducedMotion } from 'framer-motion';
import { Download, Save, RotateCcw, CheckCircle2, AlertCircle, RefreshCw, Loader2, Sparkles } from 'lucide-react';

export interface PremiereStepProps {
  job: JobRecord;
  onRestart: () => void;
}

export async function triggerBrowserDownload(downloadUrl: string, filename: string): Promise<void> {
  const response = await fetch(downloadUrl);
  if (!response.ok) {
    throw new Error(`HTTP Error ${response.status}: ${response.statusText}`);
  }
  const blob = await response.blob();
  const blobUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(blobUrl);
}

export async function saveVideoWithPicker(
  downloadUrl: string,
  filename: string,
  fallback: () => Promise<void>
): Promise<void> {
  if (typeof window !== 'undefined' && 'showSaveFilePicker' in window) {
    try {
      const handle = await (window as any).showSaveFilePicker({
        suggestedName: filename,
        types: [
          {
            description: 'MP4 Video',
            accept: { 'video/mp4': ['.mp4'] },
          },
        ],
      });
      const writable = await handle.createWritable();
      const response = await fetch(downloadUrl);
      if (!response.ok) {
        throw new Error(`HTTP Error ${response.status}: ${response.statusText}`);
      }
      if (response.body && typeof response.body.pipeTo === 'function') {
        await response.body.pipeTo(writable);
      } else {
        const blob = await response.blob();
        await writable.write(blob);
        await writable.close();
      }
      return;
    } catch (err: unknown) {
      if ((err as Error)?.name === 'AbortError') {
        return; // User dismissed save dialog
      }
      await fallback();
      return;
    }
  }
  await fallback();
}

const PastelConfetti: React.FC = () => {
  const shouldReduceMotion = useReducedMotion();
  if (shouldReduceMotion) return null;

  const particles = [
    { x: -55, y: -45, color: 'var(--accent)', size: 8, delay: 0 },
    { x: 50, y: -50, color: 'var(--accent)', size: 6, delay: 0.05 },
    { x: -85, y: -20, color: 'var(--accent)', size: 7, delay: 0.1 },
    { x: 75, y: -25, color: 'var(--accent)', size: 9, delay: 0.08 },
    { x: -35, y: -70, color: 'var(--accent)', size: 6, delay: 0.12 },
    { x: 35, y: -65, color: 'var(--accent)', size: 8, delay: 0.04 },
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
      {(typeof window !== 'undefined' && window.innerWidth < 640 ? particles.slice(0, 4) : particles).map((p, i) => (
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
  const [saving, setSaving] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [videoStreamError, setVideoStreamError] = useState<boolean>(false);

  const shouldReduceMotion = useReducedMotion();
  const downloadUrl = apiClient.getDownloadUrl(job.job_id);
  const filename = `memory-${job.job_id.slice(0, 8)}.mp4`;

  // Standard Download
  const handleDownload = async () => {
    setDownloading(true);
    setDownloadError(null);
    try {
      await triggerBrowserDownload(downloadUrl, filename);
    } catch (err: unknown) {
      const mapped = mapAPIError(err);
      setDownloadError(mapped.message || 'We could not download the video file. Please check connection and try again.');
    } finally {
      setDownloading(false);
    }
  };

  // Native Save File Picker with fallback
  const handleSave = async () => {
    setSaving(true);
    setDownloadError(null);
    try {
      await saveVideoWithPicker(downloadUrl, filename, async () => {
        await triggerBrowserDownload(downloadUrl, filename);
      });
    } catch (err: unknown) {
      const mapped = mapAPIError(err);
      setDownloadError(mapped.message || 'Could not save video file.');
    } finally {
      setSaving(false);
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
        gap: 'clamp(16px, 2.5dvh, 24px)',
        position: 'relative',
        maxWidth: 'min(960px, 96%)',
        margin: 'auto',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      <PastelConfetti />

      {/* Header */}
      <header style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', flexWrap: 'wrap', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <CheckCircle2 size={24} style={{ color: 'var(--accent)', flexShrink: 0 }} />
            <h2 className="editorial-title" style={{ fontSize: 'clamp(24px, 2.2vw, 36px)', margin: 0, lineHeight: 1.15 }}>
              Grand Premiere
            </h2>
          </div>
          <span className="step-indicator-pill">READY</span>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: 'clamp(14px, 1vw, 16px)', margin: 0 }}>
          Your finished animated video ({formattedDuration}). Press play to watch.
        </p>
      </header>

      {/* Theater Video Player Frame */}
      <motion.div
        role="region"
        aria-label="Theater screening frame"
        initial={{ opacity: shouldReduceMotion ? 1 : 0, scale: shouldReduceMotion ? 1 : 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="card"
        style={{
          position: 'relative',
          padding: 0,
          borderRadius: 'var(--radius-card)',
          overflow: 'hidden',
          backgroundColor: '#000000',
          boxShadow: 'var(--shadow-lg)',
          border: '1px solid var(--border-light)',
          width: '100%',
          boxSizing: 'border-box',
        }}
      >
        {videoStreamError ? (
          <div
            style={{
              padding: '60px 20px',
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

      {/* Download Error Alert */}
      {downloadError && (
        <div
          role="alert"
          style={{
            padding: '12px 16px',
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertCircle size={18} style={{ color: 'var(--accent-danger)', flexShrink: 0 }} />
            <p style={{ fontSize: '13.5px', color: 'var(--text-primary)', margin: 0 }}>{downloadError}</p>
          </div>
          <button type="button" onClick={handleDownload} className="btn-secondary" style={{ fontSize: '13px', padding: '6px 12px' }}>
            <RefreshCw size={14} />
            <span>Retry</span>
          </button>
        </div>
      )}

      {/* Footer Controls: Make another, Save, Download */}
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
          <span>Make another</span>
        </motion.button>

        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px', justifyContent: 'flex-end' }}>
          <motion.div
            initial={{ opacity: shouldReduceMotion ? 1 : 0, y: shouldReduceMotion ? 0 : 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', marginRight: '6px' }}
          >
            <Sparkles size={14} style={{ color: 'var(--accent)' }} />
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              MP4 AI Disclosed
            </span>
          </motion.div>

          {/* Save Button (showSaveFilePicker with fallback) */}
          <motion.button
            type="button"
            onClick={handleSave}
            disabled={saving || downloading}
            className="btn-secondary"
            initial={{ opacity: shouldReduceMotion ? 1 : 0, y: shouldReduceMotion ? 0 : 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
            style={{ minHeight: '44px', padding: '10px 18px', cursor: (saving || downloading) ? 'not-allowed' : 'pointer' }}
          >
            {saving ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <Save size={16} />
                <span>Save</span>
              </>
            )}
          </motion.button>

          {/* Download Button */}
          <motion.button
            type="button"
            onClick={handleDownload}
            disabled={downloading || saving}
            className="btn-primary"
            initial={{ opacity: shouldReduceMotion ? 1 : 0, y: shouldReduceMotion ? 0 : 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.25, ease: [0.16, 1, 0.3, 1] }}
            style={{ fontSize: '15px', padding: '10px 22px', minHeight: '44px', cursor: (downloading || saving) ? 'not-allowed' : 'pointer' }}
          >
            {downloading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Downloading...</span>
              </>
            ) : (
              <>
                <Download size={18} />
                <span>Download</span>
              </>
            )}
          </motion.button>
        </div>
      </footer>
    </div>
  );
};

export default PremiereStep;
