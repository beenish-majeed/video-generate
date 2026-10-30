import React, { useState, useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  UploadCloud,
  Film,
  Trash2,
  ChevronUp,
  ChevronDown,
  Info,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import type { UploadedClipItem, ScenePlanResponse } from '../../types/api';
import apiClient from '../../api/client';

export interface ClipsUploadStepProps {
  plan?: ScenePlanResponse | null;
  scenePlan?: ScenePlanResponse | null;
  clips?: UploadedClipItem[];
  initialClips?: UploadedClipItem[];
  onClipsChange?: (clips: UploadedClipItem[]) => void;
  onNext: (clips?: UploadedClipItem[]) => void;
  onBack: () => void;
}

export const ClipsUploadStep: React.FC<ClipsUploadStepProps> = ({
  plan = null,
  scenePlan = null,
  clips: propClips,
  initialClips = [],
  onClipsChange,
  onNext,
  onBack,
}) => {
  const shouldReduceMotion = useReducedMotion();
  const effectivePlan = plan || scenePlan || null;
  const [clips, setClips] = useState<UploadedClipItem[]>(propClips || initialClips);
  const [uploading, setUploading] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showTooltip, setShowTooltip] = useState<boolean>(false);

  const updateClips = (updater: UploadedClipItem[] | ((prev: UploadedClipItem[]) => UploadedClipItem[])) => {
    setClips((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      if (onClipsChange) {
        onClipsChange(next);
      }
      return next;
    });
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceIndexRef = useRef<number | null>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setUploadProgress(0);
    setErrorMessage(null);

    const newClips: UploadedClipItem[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const res = await apiClient.uploadClip(file, (percent) => {
          setUploadProgress(percent);
        });

        const objectUrl = URL.createObjectURL(file);
        newClips.push({
          id: `clip_${Date.now()}_${i}`,
          assetId: res.asset_id,
          fileName: file.name,
          duration: res.duration_seconds || 5.0,
          width: (res as any).width || 1280,
          height: (res as any).height || 720,
          fps: (res as any).fps || 30,
          objectUrl,
        });
      } catch (err: any) {
        setErrorMessage(`Failed to upload ${file.name}: ${err.message || 'Validation error'}`);
        break;
      }
    }

    updateClips((prev) => [...prev, ...newClips]);
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleReplaceFile = async (files: FileList | null) => {
    const idx = replaceIndexRef.current;
    if (idx === null || !files || files.length === 0) return;
    const file = files[0];
    setUploading(true);
    setErrorMessage(null);

    try {
      const res = await apiClient.uploadClip(file);
      const objectUrl = URL.createObjectURL(file);
      const updatedItem: UploadedClipItem = {
        id: `clip_${Date.now()}`,
        assetId: res.asset_id,
        fileName: file.name,
        duration: res.duration_seconds || 5.0,
        width: (res as any).width || 1280,
        height: (res as any).height || 720,
        fps: (res as any).fps || 30,
        objectUrl,
      };

      updateClips((prev) => {
        const copy = [...prev];
        copy[idx] = updatedItem;
        return copy;
      });
    } catch (err: any) {
      setErrorMessage(`Replace failed: ${err.message}`);
    } finally {
      setUploading(false);
      replaceIndexRef.current = null;
      if (replaceInputRef.current) replaceInputRef.current.value = '';
    }
  };

  const moveClip = (index: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= clips.length) return;
    updateClips((prev) => {
      const copy = [...prev];
      const temp = copy[index];
      copy[index] = copy[targetIdx];
      copy[targetIdx] = temp;
      return copy;
    });
  };

  const removeClip = (index: number) => {
    updateClips((prev) => prev.filter((_, i) => i !== index));
  };

  const triggerReplace = (index: number) => {
    replaceIndexRef.current = index;
    replaceInputRef.current?.click();
  };

  const activePlan = effectivePlan;
  const sceneCount = activePlan?.scenes?.length || 0;

  return (
    <div
      className="step-container"
      style={{
        padding: 'clamp(16px, 2.5dvh, 32px) 0',
        display: 'flex',
        flexDirection: 'column',
        gap: 'clamp(16px, 2dvh, 24px)',
        position: 'relative',
        maxWidth: 'min(1080px, 100%)',
        margin: 'auto',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      {/* Top Bar Navigation */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
        <button
          type="button"
          onClick={onBack}
          className="btn-secondary"
          aria-label="Back to scene plan step"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          <span>Back</span>
        </button>

        {sceneCount > 0 && (
          <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
            Uploaded: <strong>{clips.length}</strong> of <strong>{sceneCount}</strong> planned scenes
          </span>
        )}
      </div>

      {/* Header */}
      <header style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <h1 className="editorial-title" style={{ fontSize: 'clamp(24px, 2.6vw, 32px)', margin: 0 }}>
            Upload & Sequence Video Clips
          </h1>
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setShowTooltip(!showTooltip)}
              onMouseEnter={() => setShowTooltip(true)}
              onMouseLeave={() => setShowTooltip(false)}
              aria-label="Information about clip upload and reordering"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-muted)',
                display: 'flex',
                alignItems: 'center',
                padding: '4px',
              }}
            >
              <Info size={18} />
            </button>
            {showTooltip && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  zIndex: 20,
                  width: '280px',
                  padding: '12px',
                  background: 'var(--glass-bg)',
                  backdropFilter: 'blur(16px)',
                  border: '1px solid var(--glass-border)',
                  borderRadius: '12px',
                  boxShadow: 'var(--shadow-md)',
                  fontSize: '12.5px',
                  color: 'var(--text-primary)',
                  lineHeight: 1.45,
                }}
              >
                Upload your MP4 clips rendered from the Colab notebook. Clips are automatically mapped to
                scenes in order and crossfaded with your narration audio.
              </div>
            )}
          </div>
        </div>
        <p className="page-lead" style={{ margin: 0 }}>
          Drag and drop your generated video clips below. Reorder clips to match each scene in your plan.
        </p>
      </header>

      {/* Error Message */}
      {errorMessage && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: '12px',
            background: 'rgba(239, 68, 68, 0.12)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            color: 'var(--text-primary)',
            fontSize: '13.5px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <AlertCircle size={16} color="#ef4444" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Upload Dropzone */}
      <div
        className="glass-card"
        onClick={() => !uploading && fileInputRef.current?.click()}
        style={{
          border: '2px dashed var(--glass-border)',
          borderRadius: '16px',
          padding: '28px 20px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '12px',
          cursor: uploading ? 'wait' : 'pointer',
          background: 'rgba(255, 255, 255, 0.25)',
          transition: 'all 0.2s ease',
        }}
      >
        <UploadCloud size={36} color="var(--accent)" />
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontWeight: 600, fontSize: '15px', color: 'var(--text-primary)' }}>
            {uploading ? `Uploading clip... ${uploadProgress}%` : 'Click to upload video clips'}
          </div>
          <div style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Supports MP4, MOV, WEBM (H.264/HEVC/VP9/AV1), up to 30s each
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="video/mp4,video/quicktime,video/webm,video/x-matroska"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => handleFiles(e.target.files)}
        />
        <input
          ref={replaceInputRef}
          type="file"
          accept="video/mp4,video/quicktime,video/webm,video/x-matroska"
          style={{ display: 'none' }}
          onChange={(e) => handleReplaceFile(e.target.files)}
        />
      </div>

      {/* Uploaded Clips List */}
      {clips.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {clips.map((clip, idx) => {
            const matchedScene = effectivePlan?.scenes?.[idx];
            return (
              <motion.div
                key={clip.id}
                className="glass-card"
                initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 8 }}
                animate={{ opacity: 1, y: 0 }}
                style={{
                  padding: '12px 16px',
                  borderRadius: '14px',
                  background: 'var(--glass-bg)',
                  border: '1px solid var(--glass-border)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '14px',
                }}
              >
                {/* Thumbnail Preview */}
                <div
                  style={{
                    width: '88px',
                    height: '52px',
                    borderRadius: '8px',
                    overflow: 'hidden',
                    background: '#000',
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {clip.objectUrl ? (
                    <video
                      src={clip.objectUrl}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      muted
                      playsInline
                    />
                  ) : (
                    <Film size={20} color="#fff" />
                  )}
                </div>

                {/* Details */}
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        padding: '2px 6px',
                        borderRadius: '4px',
                        background: 'rgba(108, 77, 255, 0.12)',
                        color: 'var(--accent)',
                      }}
                    >
                      Clip {idx + 1}
                    </span>
                    <span
                      style={{
                        fontSize: '13.5px',
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {clip.fileName}
                    </span>
                  </div>

                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', gap: '10px' }}>
                    <span>{clip.duration.toFixed(1)}s</span>
                    <span>•</span>
                    <span>{clip.width}x{clip.height}{clip.fps ? ` • ${clip.fps}fps` : ''}</span>
                    {matchedScene && (
                      <>
                        <span>•</span>
                        <span style={{ color: 'var(--accent)', fontWeight: 500 }}>
                          Matches Scene {(matchedScene.scene_index ?? idx) + 1} ({((matchedScene.target_clip_seconds ?? matchedScene.duration_seconds) ?? 5.0).toFixed(1)}s)
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <button
                    type="button"
                    onClick={() => moveClip(idx, 'up')}
                    disabled={idx === 0}
                    className="btn-secondary"
                    style={{ padding: '6px', height: '32px', width: '32px' }}
                    aria-label={`Move clip ${idx + 1} up`}
                  >
                    <ChevronUp size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveClip(idx, 'down')}
                    disabled={idx === clips.length - 1}
                    className="btn-secondary"
                    style={{ padding: '6px', height: '32px', width: '32px' }}
                    aria-label={`Move clip ${idx + 1} down`}
                  >
                    <ChevronDown size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => triggerReplace(idx)}
                    className="btn-secondary"
                    style={{ padding: '6px', height: '32px', width: '32px' }}
                    title="Replace with another video file"
                    aria-label={`Replace clip ${idx + 1}`}
                  >
                    <RefreshCw size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeClip(idx)}
                    className="btn-secondary"
                    style={{ padding: '6px', height: '32px', width: '32px', color: '#ef4444' }}
                    title="Remove clip"
                    aria-label={`Remove clip ${idx + 1}`}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Action Footer */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingTop: '16px',
          borderTop: '1px solid var(--glass-border)',
        }}
      >
        <button type="button" onClick={onBack} className="btn-secondary">
          <span>Back</span>
        </button>

        <button
          type="button"
          onClick={() => onNext(clips)}
          disabled={clips.length === 0}
          className="btn-primary"
          style={{ minWidth: '180px' }}
        >
          <span>Continue to Voice</span>
          <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
};

export default ClipsUploadStep;
