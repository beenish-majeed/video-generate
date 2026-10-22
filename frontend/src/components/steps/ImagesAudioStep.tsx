import React, { useState, useRef, useEffect } from 'react';
import apiClient from '../../api/client';
import { mapAPIError, type MappedAPIError } from '../../api/errorMapper';
import { playStickerPopSound } from '../../utils/soundEffects';
import { convertBlobToWavFile } from '../../utils/wavEncoder';
import { formatDuration } from '../../utils/audioWaveform';
import {
  Upload,
  ArrowRight,
  ArrowLeft,
  Loader2,
  Trash2,
  MoveLeft,
  MoveRight,
  Plus,
  Mic,
  Square,
  Music,
  Check,
  AlertCircle,
} from 'lucide-react';

export interface UploadedImageItem {
  id: string;
  assetId: string;
  previewUrl: string;
  fileName: string;
  duration: number; // in seconds (min 2.0s)
  facesDetected?: number;
}

export interface ImagesAudioStepProps {
  initialImages?: UploadedImageItem[];
  initialAudioId?: string;
  initialAudioDuration?: number;
  initialScript?: string;
  initialPreferLipSync?: boolean;
  initialBurnSubtitles?: boolean;
  initialBgMusicId?: string;
  initialBgMusicVolume?: number;
  onNext: (data: {
    images: UploadedImageItem[];
    audioAssetId?: string;
    audioDuration?: number;
    script?: string;
    preferLipSync: boolean;
    burnSubtitles: boolean;
    bgMusicAssetId?: string;
    bgMusicVolume: number;
  }) => void;
  onBack: () => void;
}

export const ImagesAudioStep: React.FC<ImagesAudioStepProps> = ({
  initialImages = [],
  initialAudioId = '',
  initialAudioDuration = 0,
  initialScript = '',
  initialPreferLipSync = false,
  initialBurnSubtitles = true,
  initialBgMusicId = '',
  initialBgMusicVolume = 0.2,
  onNext,
  onBack,
}) => {
  // Images state (1 to 30)
  const [images, setImages] = useState<UploadedImageItem[]>(initialImages);
  const [uploadingImage, setUploadingImage] = useState<boolean>(false);
  const [dragActive, setDragActive] = useState<boolean>(false);

  // Audio state (upload, record, or typed script)
  const [audioMode, setAudioMode] = useState<'upload' | 'record' | 'script'>('upload');
  const [audioAssetId, setAudioAssetId] = useState<string>(initialAudioId);
  const [audioFileName, setAudioFileName] = useState<string>('');
  const [audioDuration, setAudioDuration] = useState<number>(initialAudioDuration);
  const [uploadingAudio, setUploadingAudio] = useState<boolean>(false);

  // Mic recording
  const [recording, setRecording] = useState<boolean>(false);
  const [recordingSeconds, setRecordingSeconds] = useState<number>(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  // Piper typed script fallback if no audio uploaded
  const [scriptText, setScriptText] = useState<string>(initialScript);

  // Options: Lip sync, Subtitles, Background Music
  const [preferLipSync, setPreferLipSync] = useState<boolean>(initialPreferLipSync);
  const [burnSubtitles, setBurnSubtitles] = useState<boolean>(initialBurnSubtitles);
  const [bgMusicAssetId, setBgMusicAssetId] = useState<string>(initialBgMusicId);
  const [bgMusicName, setBgMusicName] = useState<string>('');
  const [bgMusicVolume, setBgMusicVolume] = useState<number>(initialBgMusicVolume);
  const [uploadingBgMusic, setUploadingBgMusic] = useState<boolean>(false);

  // Error handling
  const [mappedError, setMappedError] = useState<MappedAPIError | null>(null);

  // File input refs
  const imageInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const bgMusicInputRef = useRef<HTMLInputElement>(null);

  // Total detected faces across all images
  const totalFaces = images.reduce((acc, img) => acc + (img.facesDetected || 0), 0);
  const isSingleFace = totalFaces === 1;

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      images.forEach((img) => {
        if (img.previewUrl.startsWith('blob:')) {
          URL.revokeObjectURL(img.previewUrl);
        }
      });
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);


  // Image Upload handler
  const handleImageFiles = async (files: FileList | File[]) => {
    setMappedError(null);
    const fileArray = Array.from(files);

    if (images.length + fileArray.length > 30) {
      setMappedError({
        title: 'Maximum 30 Images',
        message: 'You can upload between 1 and 30 images for your video.',
        kind: 'validation',
      });
      return;
    }

    setUploadingImage(true);
    try {
      const newItems: UploadedImageItem[] = [];
      for (const file of fileArray) {
        if (!file.type.startsWith('image/') && !/\.(png|jpe?g|webp)$/i.test(file.name)) {
          continue;
        }

        const res = await apiClient.uploadAsset('image', file);
        const previewUrl = URL.createObjectURL(file);
        newItems.push({
          id: res.asset_id,
          assetId: res.asset_id,
          previewUrl,
          fileName: file.name,
          duration: 3.5, // default 3.5 seconds
          facesDetected: res.faces_detected !== undefined ? res.faces_detected : 0,
        });
      }

      if (newItems.length > 0) {
        playStickerPopSound();
        setImages((prev) => {
          const combined = [...prev, ...newItems];
          if (audioDuration > 0 && combined.length > 0) {
            const perImg = Math.max(2.0, Math.round((audioDuration / combined.length) * 10) / 10);
            return combined.map((img) => ({ ...img, duration: perImg }));
          }
          return combined;
        });
      }
    } catch (err: unknown) {
      setMappedError(mapAPIError(err));
    } finally {
      setUploadingImage(false);
    }
  };

  // Reorder Images (Move left / right)
  const moveImage = (index: number, direction: 'left' | 'right') => {
    playStickerPopSound();
    setImages((prev) => {
      const next = [...prev];
      const targetIndex = direction === 'left' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= next.length) return prev;
      const temp = next[index];
      next[index] = next[targetIndex];
      next[targetIndex] = temp;
      return next;
    });
  };

  // Remove an image
  const removeImage = (index: number) => {
    playStickerPopSound();
    setImages((prev) => prev.filter((_, idx) => idx !== index));
  };

  // Update per-image duration (min 2.0s)
  const updateImageDuration = (index: number, newDur: number) => {
    const clamped = Math.max(2.0, Math.round(newDur * 10) / 10);
    setImages((prev) =>
      prev.map((img, idx) => (idx === index ? { ...img, duration: clamped } : img))
    );
  };

  // Audio Upload handler
  const handleAudioFile = async (file: File) => {
    setMappedError(null);
    setUploadingAudio(true);
    setAudioFileName(file.name);

    try {
      // Decode duration in browser
      const audioEl = new Audio();
      const objectUrl = URL.createObjectURL(file);
      audioEl.src = objectUrl;
      audioEl.onloadedmetadata = () => {
        if (audioEl.duration && !isNaN(audioEl.duration)) {
          setAudioDuration(Math.round(audioEl.duration * 10) / 10);
        }
      };

      const res = await apiClient.uploadAsset('audio', file);
      playStickerPopSound();
      setAudioAssetId(res.asset_id);
      const effectiveAudioDur = res.duration_seconds || (audioEl.duration && !isNaN(audioEl.duration) ? Math.round(audioEl.duration * 10) / 10 : 30.0);
      setAudioDuration(effectiveAudioDur);
      setImages((prev) => {
        if (prev.length === 0) return prev;
        const perImg = Math.max(2.0, Math.round((effectiveAudioDur / prev.length) * 10) / 10);
        return prev.map((img) => ({ ...img, duration: perImg }));
      });
    } catch (err: unknown) {
      setMappedError(mapAPIError(err));
    } finally {
      setUploadingAudio(false);
    }
  };

  // Mic recording start/stop
  const startRecording = async () => {
    setMappedError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const rawBlob = new Blob(audioChunksRef.current, { type: mediaRecorder.mimeType });
        const wavFile = await convertBlobToWavFile(rawBlob, 'recorded_voice.wav');
        await handleAudioFile(wavFile);
      };

      mediaRecorder.start(250);
      setRecording(true);
      setRecordingSeconds(0);

      timerRef.current = window.setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err: unknown) {
      setMappedError({
        title: 'Microphone Permission Needed',
        message: 'Could not access microphone. Please allow microphone permissions or upload an audio file.',
        kind: 'validation',
      });
    }
  };

  const stopRecording = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      setRecording(false);
    }
  };

  // Background Music Upload handler
  const handleBgMusicFile = async (file: File) => {
    setMappedError(null);
    setUploadingBgMusic(true);
    setBgMusicName(file.name);

    try {
      const res = await apiClient.uploadAsset('audio', file);
      playStickerPopSound();
      setBgMusicAssetId(res.asset_id);
    } catch (err: unknown) {
      setMappedError(mapAPIError(err));
    } finally {
      setUploadingBgMusic(false);
    }
  };

  // Validate and Continue to Consent
  const handleContinue = () => {
    setMappedError(null);
    if (images.length === 0) {
      setMappedError({
        title: 'Please Add At Least 1 Image',
        message: 'You need at least 1 photo to create your slideshow video.',
        kind: 'validation',
      });
      return;
    }

    if (!audioAssetId && !scriptText.trim()) {
      setMappedError({
        title: 'Audio or Script Required',
        message: 'Please upload audio, record your voice, or write a short script to generate narration.',
        kind: 'validation',
      });
      return;
    }

    const finalImages = images.map((img) => ({ ...img }));
    if (audioDuration > 0 && finalImages.length > 0) {
      const curSum = finalImages.reduce((acc, img) => acc + img.duration, 0);
      if (Math.abs(curSum - audioDuration) > 0.5) {
        const perImg = Math.max(2.0, Math.round((audioDuration / finalImages.length) * 10) / 10);
        finalImages.forEach((img) => {
          img.duration = perImg;
        });
        const roundedSum = perImg * (finalImages.length - 1);
        finalImages[finalImages.length - 1].duration = Math.max(2.0, Math.round((audioDuration - roundedSum) * 10) / 10);
      }
    }

    onNext({
      images: finalImages,
      audioAssetId: audioAssetId || undefined,
      audioDuration: audioDuration || undefined,
      script: scriptText.trim() || undefined,
      preferLipSync: preferLipSync && isSingleFace,
      burnSubtitles,
      bgMusicAssetId: bgMusicAssetId || undefined,
      bgMusicVolume,
    });
  };

  return (
    <div
      className="step-container"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'clamp(16px, 2dvh, 24px)',
        position: 'relative',
        maxWidth: 'min(1200px, 96%)',
        margin: 'auto',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      {/* Title & Description */}
      <header style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', flexWrap: 'wrap', gap: '8px' }}>
          <h1 className="editorial-title" style={{ fontSize: 'clamp(24px, 2.2vw, 36px)', lineHeight: 1.15, margin: 0 }}>
            Photos, Voice &amp; Music
          </h1>
          <span className="step-indicator-pill">PHOTOS &amp; AUDIO</span>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: 'clamp(14px, 1vw, 17px)', lineHeight: 1.4, margin: 0 }}>
          Upload 1 to 30 photos, arrange their order, adjust pacing, and pair with your voice or spoken narration.
        </p>
      </header>

      {mappedError && (
        <div
          role="alert"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '12px 16px',
            borderRadius: 'var(--radius-card)',
            backgroundColor: 'var(--accent-danger-light)',
            border: '1px solid var(--accent-danger)',
            color: 'var(--accent-danger)',
            fontSize: '14px',
          }}
        >
          <AlertCircle size={18} style={{ flexShrink: 0 }} />
          <div>
            <strong>{mappedError.title}:</strong> {mappedError.message}
          </div>
        </div>
      )}

      {/* SECTION 1: Multi-Image Upload & Photo Sequence */}
      <section
        className="card"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          padding: 'clamp(16px, 2dvh, 24px)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <h2
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: '18px',
                fontWeight: 600,
                color: 'var(--text-primary)',
                margin: 0,
              }}
            >
              1. Your Photos ({images.length}/30)
            </h2>
            <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              Reorder sequence with left/right buttons and set per-image duration (min 2.0s).
            </span>
          </div>

          <button
            type="button"
            onClick={() => imageInputRef.current?.click()}
            disabled={uploadingImage || images.length >= 30}
            className="btn-secondary"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '14px',
              padding: '8px 14px',
              cursor: images.length >= 30 ? 'not-allowed' : 'pointer',
            }}
          >
            {uploadingImage ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            <span>Add Photos</span>
          </button>
          <input
            ref={imageInputRef}
            type="file"
            multiple
            accept="image/png,image/jpeg,image/webp"
            style={{ display: 'none' }}
            onChange={(e) => e.target.files && handleImageFiles(e.target.files)}
          />
        </div>

        {/* Drop zone if empty */}
        {images.length === 0 ? (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragActive(false);
              if (e.dataTransfer.files) handleImageFiles(e.dataTransfer.files);
            }}
            onClick={() => imageInputRef.current?.click()}
            className={`upload-dropzone ${dragActive ? 'upload-dropzone--active' : ''}`}
            style={{
              padding: '36px 20px',
              textAlign: 'center',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '10px',
            }}
          >
            <Upload size={32} style={{ color: 'var(--accent)' }} />
            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
              Drag &amp; drop 1 to 30 photos here, or click to browse
            </span>
            <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              Supports JPG, PNG, WEBP. EXIF rotation handled automatically.
            </span>
          </div>
        ) : (
          /* Thumbnail Grid / Sequence */
          <div
            className="image-sequence-grid"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
              gap: '14px',
              width: '100%',
            }}
          >
            {images.map((img, idx) => (
              <div
                key={img.id}
                className="thumbnail-pop"
                style={{
                  position: 'relative',
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border-light)',
                  borderRadius: 'var(--radius-md)',
                  padding: '8px 8px 12px 8px',
                  boxShadow: 'var(--shadow-sm)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  boxSizing: 'border-box',
                }}
              >
                {/* Index badge */}
                <div
                  style={{
                    position: 'absolute',
                    top: '-6px',
                    left: '-6px',
                    width: '22px',
                    height: '22px',
                    borderRadius: '50%',
                    backgroundColor: 'var(--accent-primary)',
                    color: '#fff',
                    fontSize: '11px',
                    fontWeight: 'bold',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 2,
                  }}
                >
                  {idx + 1}
                </div>

                {/* Thumbnail */}
                <div
                  style={{
                    width: '100%',
                    aspectRatio: '1 / 1',
                    borderRadius: '4px',
                    overflow: 'hidden',
                    backgroundColor: 'var(--bg-muted)',
                  }}
                >
                  <img
                    src={img.previewUrl}
                    alt={img.fileName}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                </div>

                {/* Duration Control (min 2.0s) */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px' }}>
                  <label htmlFor={`dur-${img.id}`} style={{ color: 'var(--text-muted)' }}>
                    Secs:
                  </label>
                  <input
                    id={`dur-${img.id}`}
                    type="number"
                    min={2.0}
                    step={0.5}
                    value={img.duration}
                    onChange={(e) => updateImageDuration(idx, parseFloat(e.target.value) || 2.0)}
                    style={{
                      width: '54px',
                      padding: '2px 4px',
                      fontSize: '12px',
                      border: '1px solid var(--border-light)',
                      borderRadius: '4px',
                      textAlign: 'center',
                      fontFamily: 'var(--font-sans)',
                    }}
                  />
                </div>

                {/* Action buttons: Move left, Move right, Delete */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '2px' }}>
                  <button
                    type="button"
                    onClick={() => moveImage(idx, 'left')}
                    disabled={idx === 0}
                    aria-label={`Move photo ${idx + 1} earlier`}
                    style={{
                      border: 'none',
                      background: 'none',
                      cursor: idx === 0 ? 'default' : 'pointer',
                      opacity: idx === 0 ? 0.2 : 0.7,
                      padding: '2px',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    <MoveLeft size={14} />
                  </button>

                  <button
                    type="button"
                    onClick={() => removeImage(idx)}
                    aria-label={`Delete photo ${idx + 1}`}
                    style={{
                      border: 'none',
                      background: 'none',
                      cursor: 'pointer',
                      color: 'var(--accent-danger)',
                      padding: '2px',
                    }}
                  >
                    <Trash2 size={14} />
                  </button>

                  <button
                    type="button"
                    onClick={() => moveImage(idx, 'right')}
                    disabled={idx === images.length - 1}
                    aria-label={`Move photo ${idx + 1} later`}
                    style={{
                      border: 'none',
                      background: 'none',
                      cursor: idx === images.length - 1 ? 'default' : 'pointer',
                      opacity: idx === images.length - 1 ? 0.2 : 0.7,
                      padding: '2px',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    <MoveRight size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* SECTION 2: Voice Narration (Upload, Record, or Typed Script) */}
      <section
        className="card"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          padding: 'clamp(16px, 2dvh, 24px)',
        }}
      >
        <h2
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '18px',
            fontWeight: 600,
            color: 'var(--text-primary)',
            margin: 0,
          }}
        >
          2. Voice or Narration
        </h2>

        {/* Tab selection */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setAudioMode('upload')}
            className={audioMode === 'upload' ? 'btn-primary' : 'btn-secondary'}
            style={{ fontSize: '13px', padding: '6px 14px' }}
          >
            Upload Audio
          </button>
          <button
            type="button"
            onClick={() => setAudioMode('record')}
            className={audioMode === 'record' ? 'btn-primary' : 'btn-secondary'}
            style={{ fontSize: '13px', padding: '6px 14px' }}
          >
            Record Mic
          </button>
          <button
            type="button"
            onClick={() => setAudioMode('script')}
            className={audioMode === 'script' ? 'btn-primary' : 'btn-secondary'}
            style={{ fontSize: '13px', padding: '6px 14px' }}
          >
            Type Script (AI Voice)
          </button>
        </div>

        {/* Mode A: Upload Audio */}
        {audioMode === 'upload' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div
              onClick={() => audioInputRef.current?.click()}
              className="upload-dropzone"
              style={{
                padding: '20px',
                textAlign: 'center',
                cursor: 'pointer',
              }}
            >
              {uploadingAudio ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                  <Loader2 size={18} className="animate-spin" />
                  <span>Uploading audio...</span>
                </div>
              ) : audioAssetId ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                  <Check size={18} style={{ color: 'var(--accent-success)' }} />
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Audio ready: {audioFileName || 'Uploaded voice'}</span>
                  {audioDuration > 0 && <span style={{ color: 'var(--text-muted)' }}>({formatDuration(audioDuration)})</span>}
                </div>
              ) : (
                <span style={{ color: 'var(--text-secondary)' }}>Click to upload spoken voice audio (WAV, MP3, M4A)</span>
              )}
            </div>
            <input
              ref={audioInputRef}
              type="file"
              accept="audio/*"
              style={{ display: 'none' }}
              onChange={(e) => e.target.files?.[0] && handleAudioFile(e.target.files[0])}
            />
          </div>
        )}

        {/* Mode B: Record Mic */}
        {audioMode === 'record' && (
          <div
            style={{
              padding: '16px',
              border: '1px solid var(--border-light)',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--bg-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '10px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  backgroundColor: recording ? 'var(--accent-danger)' : 'var(--accent-primary)',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Mic size={18} className={recording ? 'animate-pulse' : ''} />
              </div>
              <div>
                <span style={{ fontWeight: 600, display: 'block', color: 'var(--text-primary)' }}>
                  {recording ? `Recording... (${recordingSeconds}s)` : audioAssetId ? `Recorded: ${formatDuration(audioDuration)}` : 'Ready to record voice'}
                </span>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  Speak clearly into your microphone
                </span>
              </div>
            </div>

            <div>
              {!recording ? (
                <button
                  type="button"
                  onClick={startRecording}
                  className="btn-primary"
                  style={{ fontSize: '13px', padding: '6px 14px' }}
                >
                  <Mic size={14} />
                  <span>Start Recording</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={stopRecording}
                  className="btn-secondary"
                  style={{ fontSize: '13px', padding: '6px 14px', color: 'var(--accent-danger)' }}
                >
                  <Square size={14} />
                  <span>Stop &amp; Save</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Mode C: Typed Script for Piper */}
        {audioMode === 'script' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <textarea
              value={scriptText}
              onChange={(e) => setScriptText(e.target.value)}
              placeholder="Type your narration here. Local Piper voice synthesizer will generate the spoken audio..."
              rows={3}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-light)',
                fontFamily: 'inherit',
                fontSize: '14px',
                boxSizing: 'border-box',
              }}
            />
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Spoken narration will be synthesized offline with local voice models.
            </span>
          </div>
        )}
      </section>

      {/* SECTION 3: Options (Lip Sync, Subtitles, Background Music) */}
      <section
        className="card"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          padding: 'clamp(16px, 2dvh, 24px)',
        }}
      >
        <h2
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '18px',
            fontWeight: 600,
            color: 'var(--text-primary)',
            margin: 0,
          }}
        >
          3. Video Presentation Options
        </h2>

        {/* Lip Sync Option */}
        <div
          style={{
            padding: '12px 16px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-light)',
            backgroundColor: 'var(--bg-subtle)',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
          }}
        >
          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: isSingleFace ? 'pointer' : 'default' }}>
            <input
              type="checkbox"
              checked={preferLipSync && isSingleFace}
              disabled={!isSingleFace}
              onChange={(e) => setPreferLipSync(e.target.checked)}
              style={{ width: '18px', height: '18px', accentColor: 'var(--accent-primary)' }}
            />
            <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)' }}>
              Enable face lip sync (Wav2Lip)
            </span>
          </label>
          <span style={{ fontSize: '12px', color: isSingleFace ? 'var(--accent-primary)' : 'var(--text-muted)' }}>
            {isSingleFace
              ? 'Exactly 1 face detected! Lip sync is enabled for your portrait.'
              : totalFaces === 0
              ? 'Ken Burns slideshow mode will be used (no face detected in your photos).'
              : `Ken Burns slideshow mode will be used (${totalFaces} faces detected; lip sync requires exactly one face).`}
          </span>
        </div>

        {/* Subtitles Option */}
        <div
          style={{
            padding: '12px 16px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-light)',
            backgroundColor: 'var(--bg-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={burnSubtitles}
              onChange={(e) => setBurnSubtitles(e.target.checked)}
              style={{ width: '18px', height: '18px', accentColor: 'var(--accent-primary)' }}
            />
            <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)' }}>
              Burn in subtitles
            </span>
          </label>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Auto-synchronized with speech
          </span>
        </div>

        {/* Background Music Option */}
        <div
          style={{
            padding: '12px 16px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-light)',
            backgroundColor: 'var(--bg-subtle)',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Music size={18} style={{ color: 'var(--accent-primary)' }} />
              <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)' }}>
                Optional Background Music (Uploaded by you only)
              </span>
            </div>
            <button
              type="button"
              onClick={() => bgMusicInputRef.current?.click()}
              className="btn-secondary"
              style={{ fontSize: '12px', padding: '4px 10px' }}
            >
              {uploadingBgMusic ? 'Uploading...' : bgMusicAssetId ? 'Change Music' : 'Upload Track'}
            </button>
            <input
              ref={bgMusicInputRef}
              type="file"
              accept="audio/*"
              style={{ display: 'none' }}
              onChange={(e) => e.target.files?.[0] && handleBgMusicFile(e.target.files[0])}
            />
          </div>

          {bgMusicAssetId && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '12px' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Track: {bgMusicName || 'Uploaded music'}</span>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)' }}>
                <span>Volume: {Math.round(bgMusicVolume * 100)}%</span>
                <input
                  type="range"
                  min="0.0"
                  max="1.0"
                  step="0.05"
                  value={bgMusicVolume}
                  onChange={(e) => setBgMusicVolume(parseFloat(e.target.value))}
                  style={{ width: '100px', accentColor: 'var(--accent-primary)' }}
                />
              </label>
            </div>
          )}
        </div>
      </section>

      {/* Navigation Buttons */}
      <footer
        className="step-footer"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: '4px',
          paddingTop: 'clamp(8px, 1dvh, 14px)',
        }}
      >
        <button
          type="button"
          onClick={onBack}
          className="btn-secondary"
          style={{ minHeight: '44px', padding: '8px 18px', cursor: 'pointer' }}
        >
          <ArrowLeft size={16} aria-hidden="true" />
          <span>Back</span>
        </button>

        <button
          type="button"
          onClick={handleContinue}
          className="btn-primary"
          style={{
            minHeight: '44px',
            padding: '10px 22px',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <span>Continue to Consent</span>
          <ArrowRight size={18} aria-hidden="true" />
        </button>
      </footer>
    </div>
  );
};

export default ImagesAudioStep;
