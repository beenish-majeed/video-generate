import React, { useState, useRef, useEffect } from 'react';
import { DoodleMic } from '../Doodles';
import Tape from '../Tape';
import Sticker from '../Sticker';
import apiClient from '../../api/client';
import { mapAPIError, type MappedAPIError } from '../../api/errorMapper';
import { extractWaveformPeaks, formatDuration, type WaveformAnalysis } from '../../utils/audioWaveform';
import { Upload, ArrowRight, ArrowLeft, Loader2, Play, Pause, RefreshCw, AlertCircle, Volume2 } from 'lucide-react';

interface VoiceStepProps {
  selectedAssetId: string;
  onAssetSelected: (assetId: string) => void;
  onNext: () => void;
  onBack: () => void;
}

export const VoiceStep: React.FC<VoiceStepProps> = ({
  selectedAssetId,
  onAssetSelected,
  onNext,
  onBack,
}) => {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [analyzingAudio, setAnalyzingAudio] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileSizeStr, setFileSizeStr] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [mappedError, setMappedError] = useState<MappedAPIError | null>(null);

  // Audio Playback & Waveform State
  const [waveform, setWaveform] = useState<WaveformAnalysis | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024 * 1024) {
      return `${Math.round(bytes / 1024)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const processFile = async (file: File) => {
    setMappedError(null);

    // Client-side validation 1: Audio File Type
    const isAudioType = file.type.startsWith('audio/') || /\.(mp3|wav|m4a|ogg|flac|aac)$/i.test(file.name);
    if (!isAudioType) {
      setMappedError({
        title: 'Please Select an Audio File',
        message: 'We could not read this audio format. Please choose a voice sample in MP3, WAV, or M4A format.',
        kind: 'validation',
      });
      return;
    }

    // Client-side validation 2: File Size (20MB Max)
    const MAX_SIZE_BYTES = 20 * 1024 * 1024;
    if (file.size > MAX_SIZE_BYTES) {
      setMappedError({
        title: 'Audio File is Too Large',
        message: `This recording is ${formatFileSize(file.size)}, exceeding our 20MB limit. Please upload a shorter audio clip.`,
        kind: 'too_large',
      });
      return;
    }

    setFileName(file.name);
    setFileSizeStr(formatFileSize(file.size));
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    setIsPlaying(false);
    setCurrentTime(0);

    // Extract real Web Audio API waveform peaks
    setAnalyzingAudio(true);
    try {
      const analysis = await extractWaveformPeaks(file, 44);
      setWaveform(analysis);
    } catch {
      // Non-fatal fallback for waveform display
      setWaveform({ peaks: Array.from({ length: 44 }, () => Math.random() * 0.6 + 0.2), duration: 15 });
    } finally {
      setAnalyzingAudio(false);
    }

    // Upload asset to backend
    setUploading(true);
    setUploadProgress(0);

    try {
      const res = await apiClient.uploadAsset('voice', file, (percent) => {
        setUploadProgress(percent);
      });
      onAssetSelected(res.asset_id);
    } catch (err: unknown) {
      const mapped = mapAPIError(err);
      setMappedError(mapped);
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleKeyDownDropzone = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInputRef.current?.click();
    }
  };

  const togglePlayPause = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch(() => {});
    }
    setIsPlaying(!isPlaying);
  };

  // Sync audio playback progress
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [previewUrl]);

  return (
    <div style={{ padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: '24px', position: 'relative' }}>
      <Tape rotation="-1.5deg" style={{ position: 'absolute', top: '10px', right: '50px' }} />
      <Sticker label="LET US HEAR YOU" rotation="2deg" variant="blue" />

      {/* Header Copy */}
      <header>
        <p className="handwritten" style={{ fontSize: '22px' }}>
          Now, let’s give your story a voice...
        </p>
        <h2 className="editorial-title" style={{ fontSize: '28px', marginTop: '4px' }}>
          Upload a voice recording
        </h2>
        <p style={{ color: 'var(--ink-muted)', fontSize: '15px', marginTop: '4px' }}>
          Upload a clear audio sample (10–30 seconds). We will generate speech matching this tone.
        </p>
      </header>

      {/* Main Interactive Content */}
      <main>
        {previewUrl ? (
          /* Handcrafted Audio Player & Waveform Box */
          <div
            style={{
              position: 'relative',
              padding: '24px',
              borderRadius: '12px',
              backgroundColor: '#ffffff',
              border: '1.5px dashed var(--paper-border)',
              boxShadow: 'var(--shadow-paper-float)',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            <Tape rotation="1.5deg" style={{ position: 'absolute', top: '-14px', left: '30px' }} />

            {/* Audio Info Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '50%',
                    backgroundColor: 'var(--paper-cream-alt)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--ink-terracotta)',
                  }}
                >
                  <Volume2 size={20} />
                </div>
                <div>
                  <h4 style={{ fontFamily: 'var(--font-serif)', fontSize: '17px', color: 'var(--ink-primary)' }}>
                    {fileName || 'Voice Sample'}
                  </h4>
                  <p style={{ fontSize: '13px', color: 'var(--ink-muted)' }}>
                    {fileSizeStr} {waveform ? `• ${formatDuration(waveform.duration)}` : ''}
                  </p>
                </div>
              </div>

              {/* Play / Pause Toggle Button */}
              <button
                type="button"
                onClick={togglePlayPause}
                aria-label={isPlaying ? 'Pause voice audio preview' : 'Play voice audio preview'}
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--ink-terracotta)',
                  color: '#ffffff',
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  boxShadow: '0 4px 10px rgba(200, 90, 50, 0.3)',
                  transition: 'all 0.15s ease',
                }}
              >
                {isPlaying ? <Pause size={20} fill="#ffffff" /> : <Play size={20} fill="#ffffff" style={{ marginLeft: '2px' }} />}
              </button>
            </div>

            {/* Real Audio Waveform Visualization */}
            <div
              style={{
                padding: '16px 12px',
                borderRadius: '8px',
                backgroundColor: 'var(--paper-cream-alt)',
                border: '1px solid var(--paper-border)',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              {analyzingAudio ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '16px 0', color: 'var(--ink-terracotta)' }}>
                  <Loader2 size={18} className="animate-spin" />
                  <span className="handwritten" style={{ fontSize: '18px' }}>Reading audio frequencies...</span>
                </div>
              ) : waveform ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '3px', height: '56px', width: '100%' }}>
                  {waveform.peaks.map((amplitude, idx) => {
                    const progressRatio = waveform.duration > 0 ? currentTime / waveform.duration : 0;
                    const barRatio = idx / waveform.peaks.length;
                    const isPlayed = barRatio <= progressRatio;

                    return (
                      <div
                        key={idx}
                        style={{
                          flex: 1,
                          height: `${amplitude * 100}%`,
                          backgroundColor: isPlayed ? 'var(--ink-terracotta)' : 'var(--paper-border)',
                          borderRadius: '2px',
                          transition: 'height 0.2s ease, background-color 0.1s ease',
                        }}
                      />
                    );
                  })}
                </div>
              ) : null}

              {/* Time Counter Bar */}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--ink-muted)', fontWeight: 600 }}>
                <span>{formatDuration(currentTime)}</span>
                <span>{formatDuration(waveform?.duration || 0)}</span>
              </div>
            </div>

            {/* Uploading Progress */}
            {uploading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: 600 }}>
                  <span style={{ color: 'var(--ink-terracotta)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Loader2 size={16} className="animate-spin" />
                    Sending voice sample to studio...
                  </span>
                  <span style={{ color: 'var(--ink-primary)' }}>{uploadProgress}%</span>
                </div>
                <div style={{ width: '100%', height: '8px', backgroundColor: 'var(--paper-border)', borderRadius: '4px', overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${uploadProgress}%`,
                      height: '100%',
                      backgroundColor: 'var(--ink-terracotta)',
                      transition: 'width 0.2s ease',
                    }}
                  />
                </div>
              </div>
            ) : selectedAssetId ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span className="handwritten" style={{ color: 'var(--ink-sage)', fontSize: '19px', fontWeight: 'bold' }}>
                  ✓ Voice sample locked in!
                </span>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="btn-secondary"
                  style={{ fontSize: '13px', padding: '6px 14px' }}
                >
                  <RefreshCw size={14} />
                  <span>Choose different sample</span>
                </button>
              </div>
            ) : null}

            {/* Hidden HTML5 Audio Element for Preview */}
            <audio ref={audioRef} src={previewUrl} preload="auto" />
          </div>
        ) : (
          /* Empty / Drag & Drop Dropzone */
          <div
            role="button"
            tabIndex={0}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={handleKeyDownDropzone}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            aria-label="Upload voice recording audio dropzone. Click or drag and drop an audio file here."
            style={{
              position: 'relative',
              padding: '36px 24px',
              borderRadius: '12px',
              backgroundColor: dragActive ? 'var(--paper-cream-dark)' : 'var(--paper-cream-alt)',
              border: dragActive ? '2.5px dashed var(--ink-terracotta)' : '2px dashed var(--paper-border)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '16px',
              minHeight: '240px',
              textAlign: 'center',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              boxShadow: dragActive ? 'var(--shadow-paper-float)' : 'none',
            }}
          >
            <Tape rotation="2deg" style={{ position: 'absolute', top: '-14px', left: '40px' }} />

            <DoodleMic size={52} />

            <div>
              <p style={{ fontWeight: 600, color: 'var(--ink-primary)', fontSize: '17px' }}>
                Drag & drop voice audio clip (.wav, .mp3, .m4a)
              </p>
              <p style={{ fontSize: '14px', color: 'var(--ink-muted)', marginTop: '4px' }}>
                Clear speech with quiet background noise works best (Up to 20MB)
              </p>
            </div>

            <span className="btn-secondary" style={{ pointerEvents: 'none', marginTop: '4px' }}>
              <Upload size={16} />
              <span>Select Audio File</span>
            </span>
          </div>
        )}

        {/* Hidden File Input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*,.mp3,.wav,.m4a,.ogg,.flac,.aac"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />
      </main>

      {/* Kind Human Error State Card */}
      {mappedError && (
        <div
          role="alert"
          style={{
            padding: '16px 20px',
            borderRadius: '10px',
            backgroundColor: '#fff',
            border: '1.5px dashed var(--ink-terracotta)',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '12px',
            boxShadow: 'var(--shadow-card)',
          }}
        >
          <AlertCircle size={22} style={{ color: 'var(--ink-terracotta)', flexShrink: 0, marginTop: '2px' }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <h4 style={{ fontFamily: 'var(--font-serif)', fontSize: '17px', color: 'var(--ink-primary)' }}>
              {mappedError.title}
            </h4>
            <p style={{ fontSize: '14px', color: 'var(--ink-muted)', lineHeight: 1.5 }}>
              {mappedError.message}
            </p>
          </div>
        </div>
      )}

      {/* Navigation Footer */}
      <footer style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '8px' }}>
        <button type="button" onClick={onBack} className="btn-secondary">
          <ArrowLeft size={16} />
          <span>Back</span>
        </button>

        <button
          type="button"
          onClick={onNext}
          disabled={!selectedAssetId || uploading}
          className="btn-terracotta"
          style={{
            opacity: !selectedAssetId || uploading ? 0.5 : 1,
            cursor: !selectedAssetId || uploading ? 'not-allowed' : 'pointer',
          }}
        >
          <span>Continue to Duration</span>
          <ArrowRight size={16} />
        </button>
      </footer>
    </div>
  );
};

export default VoiceStep;
