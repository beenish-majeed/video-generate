import React, { useState, useRef, useEffect } from 'react';
import { DoodleMic } from '../Doodles';
import Tape from '../Tape';
import Sticker from '../Sticker';
import apiClient from '../../api/client';
import { mapAPIError, type MappedAPIError } from '../../api/errorMapper';
import { extractWaveformPeaks, formatDuration, type WaveformAnalysis } from '../../utils/audioWaveform';
import { playStickerPopSound } from '../../utils/soundEffects';
import { convertBlobToWavFile } from '../../utils/wavEncoder';
import {
  Upload,
  ArrowRight,
  ArrowLeft,
  Loader2,
  Play,
  Pause,
  RefreshCw,
  AlertCircle,
  Volume2,
  Mic,
  Square,
  Check,
  Radio,
  ShieldAlert,
} from 'lucide-react';

interface VoiceStepProps {
  selectedAssetId: string;
  onAssetSelected: (assetId: string) => void;
  onNext: () => void;
  onBack: () => void;
}

import {
  MIN_RECORD_SECONDS,
  MAX_RECORD_SECONDS,
  validateRecordingDuration,
} from '../../utils/recordingLimits';

type VoiceMode = 'upload' | 'record';
type RecordingStatus = 'idle' | 'requesting' | 'recording' | 'recorded' | 'too_short' | 'error';

export const VoiceStep: React.FC<VoiceStepProps> = ({
  selectedAssetId,
  onAssetSelected,
  onNext,
  onBack,
}) => {
  // Voice Mode & State
  const [voiceMode, setVoiceMode] = useState<VoiceMode>('upload');

  // File Upload State
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [analyzingAudio, setAnalyzingAudio] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileSizeStr, setFileSizeStr] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [mappedError, setMappedError] = useState<MappedAPIError | null>(null);

  // Live Recording State
  const [recordingStatus, setRecordingStatus] = useState<RecordingStatus>('idle');
  const [recordingTime, setRecordingTime] = useState<number>(0);
  const [audioLevels, setAudioLevels] = useState<number[]>(Array(10).fill(0.12));
  const [recordedFile, setRecordedFile] = useState<File | null>(null);
  const [permissionError, setPermissionError] = useState<string | null>(null);

  // Audio Playback & Waveform State
  const [waveform, setWaveform] = useState<WaveformAnalysis | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Recording Hardware Refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024 * 1024) {
      return `${Math.round(bytes / 1024)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Thorough cleanup of microphone tracks, audio context, and timer loops
  const cleanupRecordingHardware = () => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        // Ignore if already stopped
      }
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // Ignore if track already stopped
        }
      });
      streamRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      cleanupRecordingHardware();
    };
  }, []);

  const handleSwitchMode = (mode: VoiceMode) => {
    cleanupRecordingHardware();
    playStickerPopSound();
    setVoiceMode(mode);
    if (mode === 'upload') {
      resetRecording();
    }
  };

  const processFile = async (file: File) => {
    setMappedError(null);

    // Client-side validation 1: Audio File Type
    const isAudioType =
      file.type.startsWith('audio/') ||
      file.type.includes('webm') ||
      /\.(mp3|wav|m4a|ogg|flac|aac|webm)$/i.test(file.name);

    if (!isAudioType) {
      setMappedError({
        title: 'Please Select an Audio File',
        message:
          'We could not read this audio format. Please choose a voice sample in MP3, WAV, M4A, or WEBM format.',
        kind: 'validation',
      });
      return;
    }

    // Client-side validation 2: File Size (20MB Max)
    const MAX_SIZE_BYTES = 20 * 1024 * 1024;
    if (file.size > MAX_SIZE_BYTES) {
      setMappedError({
        title: 'Audio File is Too Large',
        message: `This recording is ${formatFileSize(
          file.size
        )}, exceeding our 20MB limit. Please upload a shorter audio clip.`,
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
      playStickerPopSound();
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

  // Live Microphone Recording Actions with Error Handling & Resource Cleanup
  const startRecording = async () => {
    setPermissionError(null);
    setRecordingStatus('requesting');

    // Check 1: Insecure Origin (Microphone APIs require HTTPS or localhost/127.0.0.1)
    const isLocalhost =
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      window.location.hostname === '[::1]';
    const isSecureContext =
      typeof window.isSecureContext !== 'undefined'
        ? window.isSecureContext
        : window.location.protocol === 'https:' || isLocalhost;

    if (!isSecureContext) {
      cleanupRecordingHardware();
      setRecordingStatus('error');
      setPermissionError(
        'Microphone access requires a secure connection (HTTPS or localhost). Please open this website over HTTPS or choose "Upload a file".'
      );
      return;
    }

    // Check 2: Browser MediaRecorder and getUserMedia API support
    if (typeof window.MediaRecorder === 'undefined' || !navigator?.mediaDevices?.getUserMedia) {
      cleanupRecordingHardware();
      setRecordingStatus('error');
      setPermissionError(
        'Live microphone recording is not supported in this browser version. Please update your browser or choose "Upload a file".'
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Set up AudioContext for live level meter
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          const audioCtx = new AudioCtx();
          audioContextRef.current = audioCtx;
          const source = audioCtx.createMediaStreamSource(stream);
          const analyser = audioCtx.createAnalyser();
          analyser.fftSize = 32;
          source.connect(analyser);

          const dataArray = new Uint8Array(analyser.frequencyBinCount);

          const updateMeter = () => {
            analyser.getByteFrequencyData(dataArray);
            const levels: number[] = [];
            const step = Math.floor(dataArray.length / 10) || 1;
            for (let i = 0; i < 10; i++) {
              const val = dataArray[i * step] || 0;
              levels.push(Math.max(0.12, val / 255));
            }
            setAudioLevels(levels);
            animFrameRef.current = requestAnimationFrame(updateMeter);
          };
          updateMeter();
        }
      } catch {
        // Non-fatal if AudioContext initialization blocked
      }

      // Set up MediaRecorder
      audioChunksRef.current = [];
      const mimeType = MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4')
        ? 'audio/mp4'
        : '';
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        const rawBlob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        try {
          const wavFile = await convertBlobToWavFile(rawBlob, `recorded_voice_${Date.now()}.wav`);
          setRecordedFile(wavFile);
        } catch {
          const fallbackFile = new File([rawBlob], `recorded_voice_${Date.now()}.wav`, { type: 'audio/wav' });
          setRecordedFile(fallbackFile);
        }
      };

      recorder.onerror = () => {
        cleanupRecordingHardware();
        setRecordingStatus('error');
        setPermissionError(
          'An unexpected recording error occurred. Please try again or choose "Upload a file".'
        );
      };

      recorder.start(100);
      playStickerPopSound();
      setRecordingStatus('recording');
      setRecordingTime(0);

      // Timer counter loop
      timerIntervalRef.current = window.setInterval(() => {
        setRecordingTime((prev) => {
          if (prev >= MAX_RECORD_SECONDS - 1) {
            stopRecording();
            return MAX_RECORD_SECONDS;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (err: any) {
      cleanupRecordingHardware();
      setRecordingStatus('error');

      const errName = err?.name || '';
      if (
        errName === 'NotAllowedError' ||
        errName === 'PermissionDeniedError' ||
        errName === 'SecurityError'
      ) {
        setPermissionError(
          'Microphone permission was denied. Please allow microphone access in your browser address bar settings or choose "Upload a file".'
        );
      } else if (
        errName === 'NotFoundError' ||
        errName === 'DevicesNotFoundError' ||
        errName === 'OverconstrainedError'
      ) {
        setPermissionError(
          'No microphone input device was detected on your system. Please connect a microphone or choose "Upload a file".'
        );
      } else {
        setPermissionError(
          'Could not access microphone. Please check browser permissions or choose "Upload a file".'
        );
      }
    }
  };

  const stopRecording = () => {
    cleanupRecordingHardware();
    playStickerPopSound();

    setRecordingTime((finalTime) => {
      if (finalTime < MIN_RECORD_SECONDS) {
        setRecordingStatus('too_short');
      } else {
        setRecordingStatus('recorded');
      }
      return finalTime;
    });
  };

  const resetRecording = () => {
    cleanupRecordingHardware();
    setRecordingStatus('idle');
    setRecordingTime(0);
    setRecordedFile(null);
    setPermissionError(null);
  };

  const handleUseRecording = () => {
    if (recordedFile) {
      processFile(recordedFile);
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
    <div
      className="step-container"
      style={{
        padding: 'clamp(20px, 4vw, 32px) clamp(12px, 3vw, 24px)',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
        position: 'relative',
        width: '100%',
      }}
    >
      <Tape rotation="-1.5deg" style={{ position: 'absolute', top: '10px', right: '50px' }} />
      <Sticker label="LET US HEAR YOU" rotation="2deg" variant="blue" />

      {/* Header Copy */}
      <header>
        <p className="handwritten" style={{ fontSize: 'clamp(18px, 2vw + 12px, 22px)' }}>
          Now, let’s give your story a voice...
        </p>
        <h2 className="editorial-title" style={{ marginTop: '4px' }}>
          Provide a voice sample
        </h2>
        <p style={{ color: 'var(--ink-muted)', fontSize: '15px', marginTop: '4px' }}>
          Upload an existing audio recording or speak directly into your microphone (3 to 60 seconds).
        </p>
      </header>

      {/* Responsive Option Mode Selector (Upload vs Record Now) */}
      {!previewUrl && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: 'var(--paper-cream-alt)',
            padding: '6px',
            borderRadius: '10px',
            border: '1px solid var(--paper-border)',
            width: '100%',
            maxWidth: '440px',
          }}
        >
          <button
            type="button"
            onClick={() => handleSwitchMode('upload')}
            className="handwritten"
            style={{
              flex: '1 1 140px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '8px 14px',
              minHeight: '44px',
              borderRadius: '8px',
              fontSize: '17px',
              border: voiceMode === 'upload' ? '1.5px solid var(--ink-terracotta)' : '1px transparent',
              backgroundColor: voiceMode === 'upload' ? 'var(--paper-cream)' : 'transparent',
              color: voiceMode === 'upload' ? 'var(--ink-terracotta)' : 'var(--ink-muted)',
              cursor: 'pointer',
              fontWeight: voiceMode === 'upload' ? 'bold' : 'normal',
              transition: 'all 0.15s ease',
              whiteSpace: 'nowrap',
            }}
            aria-label="Upload an audio file option"
          >
            <Upload size={16} />
            <span>Upload a file</span>
          </button>

          <button
            type="button"
            onClick={() => handleSwitchMode('record')}
            className="handwritten"
            style={{
              flex: '1 1 140px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '8px 14px',
              minHeight: '44px',
              borderRadius: '8px',
              fontSize: '17px',
              border: voiceMode === 'record' ? '1.5px solid var(--ink-terracotta)' : '1px transparent',
              backgroundColor: voiceMode === 'record' ? 'var(--paper-cream)' : 'transparent',
              color: voiceMode === 'record' ? 'var(--ink-terracotta)' : 'var(--ink-muted)',
              cursor: 'pointer',
              fontWeight: voiceMode === 'record' ? 'bold' : 'normal',
              transition: 'all 0.15s ease',
              whiteSpace: 'nowrap',
            }}
            aria-label="Record voice live option"
          >
            <Mic size={16} />
            <span>Record now</span>
          </button>
        </div>
      )}

      {/* Main Interactive Content */}
      <main style={{ width: '100%' }}>
        {previewUrl ? (
          /* Waveform Preview Player Box - Scales Fluidly to Container Width */
          <div
            style={{
              position: 'relative',
              padding: 'clamp(16px, 3vw, 24px)',
              borderRadius: '12px',
              backgroundColor: '#ffffff',
              border: '1.5px dashed var(--paper-border)',
              boxShadow: 'var(--shadow-paper-float)',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              width: '100%',
              boxSizing: 'border-box',
            }}
          >
            <Tape rotation="1.5deg" style={{ position: 'absolute', top: '-14px', left: '30px' }} />

            {/* Audio Info Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: '0', flex: '1' }}>
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
                    flexShrink: 0,
                  }}
                >
                  <Volume2 size={20} />
                </div>
                <div style={{ minWidth: '0', overflow: 'hidden' }}>
                  <h4 style={{ fontFamily: 'var(--font-serif)', fontSize: '16px', color: 'var(--ink-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
                  width: '42px',
                  height: '42px',
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
                  flexShrink: 0,
                }}
              >
                {isPlaying ? <Pause size={18} fill="#ffffff" /> : <Play size={18} fill="#ffffff" style={{ marginLeft: '2px' }} />}
              </button>
            </div>

            {/* Real Audio Waveform Visualization - Scales 100% */}
            <div
              style={{
                padding: '14px 10px',
                borderRadius: '8px',
                backgroundColor: 'var(--paper-cream-alt)',
                border: '1px solid var(--paper-border)',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                width: '100%',
              }}
            >
              {analyzingAudio ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '16px 0', color: 'var(--ink-terracotta)' }}>
                  <Loader2 size={18} className="animate-spin" />
                  <span className="handwritten" style={{ fontSize: '18px' }}>Reading audio frequencies...</span>
                </div>
              ) : waveform ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '2px', height: '52px', width: '100%' }}>
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
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
                <span className="handwritten" style={{ color: 'var(--ink-sage)', fontSize: '18px', fontWeight: 'bold' }}>
                  ✓ Voice sample locked in!
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setPreviewUrl(null);
                    setFileName(null);
                    resetRecording();
                  }}
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
        ) : voiceMode === 'upload' ? (
          /* Option 1: File Upload Dropzone */
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
              padding: 'clamp(24px, 4vw, 36px) clamp(16px, 3vw, 24px)',
              borderRadius: '12px',
              backgroundColor: dragActive ? 'var(--paper-cream-dark)' : 'var(--paper-cream-alt)',
              border: dragActive ? '2.5px dashed var(--ink-terracotta)' : '2px dashed var(--paper-border)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '16px',
              minHeight: 'clamp(200px, 35vh, 250px)',
              width: '100%',
              textAlign: 'center',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              boxShadow: dragActive ? 'var(--shadow-paper-float)' : 'none',
            }}
          >
            <Tape rotation="2deg" style={{ position: 'absolute', top: '-14px', left: '40px' }} />

            <DoodleMic size={50} />

            <div>
              <p style={{ fontWeight: 600, color: 'var(--ink-primary)', fontSize: 'clamp(15px, 2.5vw, 17px)' }}>
                Drag & drop voice audio clip (.wav, .mp3, .m4a, .webm)
              </p>
              <p style={{ fontSize: '13px', color: 'var(--ink-muted)', marginTop: '4px' }}>
                Clear speech with quiet background noise works best (Up to 20MB)
              </p>
            </div>

            <span className="btn-secondary" style={{ pointerEvents: 'none', marginTop: '4px' }}>
              <Upload size={16} />
              <span>Select Audio File</span>
            </span>
          </div>
        ) : (
          /* Option 2: Live Recording View - Responsive at 320px */
          <div
            style={{
              position: 'relative',
              padding: 'clamp(18px, 3vw, 28px) clamp(12px, 2.5vw, 24px)',
              borderRadius: '12px',
              backgroundColor: 'var(--paper-cream-alt)',
              border: '2px dashed var(--paper-border)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '16px',
              minHeight: 'clamp(220px, 35vh, 260px)',
              width: '100%',
              textAlign: 'center',
              boxSizing: 'border-box',
            }}
          >
            <Tape rotation="-2deg" style={{ position: 'absolute', top: '-14px', right: '40px' }} />

            {/* Recording Status: Idle */}
            {recordingStatus === 'idle' && (
              <>
                <DoodleMic size={44} />
                <div>
                  <h3 className="editorial-title" style={{ fontSize: 'clamp(17px, 2.5vw, 20px)' }}>
                    Speak into your microphone
                  </h3>
                  <p style={{ fontSize: '13px', color: 'var(--ink-muted)', marginTop: '4px' }}>
                    Recording length must be between <strong>3 seconds</strong> and <strong>60 seconds</strong>.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={startRecording}
                  className="btn-terracotta"
                  style={{ padding: '10px 24px', fontSize: '15px' }}
                >
                  <Mic size={18} />
                  <span>Start Recording</span>
                </button>
              </>
            )}

            {/* Recording Status: Requesting Permission */}
            {recordingStatus === 'requesting' && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                <Loader2 size={32} className="animate-spin" style={{ color: 'var(--ink-terracotta)' }} />
                <p className="handwritten" style={{ fontSize: '20px', color: 'var(--ink-terracotta)' }}>
                  Requesting microphone permission...
                </p>
                <p style={{ fontSize: '13px', color: 'var(--ink-muted)' }}>
                  Please allow microphone access in your browser prompt.
                </p>
              </div>
            )}

            {/* Recording Status: Active Recording - Fits 320px without overlap */}
            {recordingStatus === 'recording' && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px', width: '100%' }}>
                {/* Live REC Timer Indicator */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Radio size={16} className="animate-pulse" style={{ color: 'var(--ink-terracotta)' }} />
                  <span className="handwritten" style={{ fontSize: 'clamp(18px, 4vw, 22px)', color: 'var(--ink-terracotta)', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                    REC {formatDuration(recordingTime)} / 01:00
                  </span>
                </div>

                <p style={{ fontSize: '12px', color: 'var(--ink-muted)' }}>
                  Speak clearly • Recording limit: 3s to 60s
                </p>

                {/* Hand-Drawn Live Level Meter */}
                <div
                  aria-label="Live audio volume level meter"
                  style={{
                    display: 'flex',
                    alignItems: 'flex-end',
                    justifyContent: 'center',
                    gap: '4px',
                    height: '52px',
                    width: '100%',
                    maxWidth: '220px',
                    padding: '6px 10px',
                    backgroundColor: 'var(--paper-cream)',
                    border: '1.5px solid var(--paper-border)',
                    borderRadius: '8px',
                  }}
                >
                  {audioLevels.map((lvl, idx) => (
                    <div
                      key={idx}
                      style={{
                        flex: 1,
                        height: `${Math.max(12, lvl * 100)}%`,
                        backgroundColor:
                          lvl > 0.6 ? 'var(--ink-terracotta)' : lvl > 0.3 ? 'var(--ink-amber)' : 'var(--ink-sage)',
                        borderRadius: '3px',
                        border: '1px solid var(--ink-primary)',
                        transition: 'height 0.1s ease',
                      }}
                    />
                  ))}
                </div>

                <button
                  type="button"
                  onClick={stopRecording}
                  className="btn-terracotta"
                  style={{ padding: '8px 20px', backgroundColor: 'var(--ink-primary)', fontSize: '14px' }}
                >
                  <Square size={15} fill="#ffffff" />
                  <span>Stop Recording</span>
                </button>
              </div>
            )}

            {/* Recording Status: Too Short Warning */}
            {recordingStatus === 'too_short' && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                <AlertCircle size={28} style={{ color: 'var(--ink-amber)' }} />
                <h4 style={{ fontFamily: 'var(--font-serif)', fontSize: '17px', color: 'var(--ink-primary)' }}>
                  Recording was too short ({recordingTime}s)
                </h4>
                <p style={{ fontSize: '13px', color: 'var(--ink-muted)' }}>
                  Please record a voice clip between <strong>3 seconds</strong> and <strong>60 seconds</strong>.
                </p>

                <button type="button" onClick={resetRecording} className="btn-terracotta" style={{ fontSize: '14px', padding: '8px 18px' }}>
                  <RefreshCw size={15} />
                  <span>Try Recording Again</span>
                </button>
              </div>
            )}

            {/* Recording Status: Recorded & Ready to Review - Fits 320px */}
            {recordingStatus === 'recorded' && recordedFile && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px', width: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--ink-sage)' }}>
                  <Check size={18} />
                  <span className="handwritten" style={{ fontSize: 'clamp(18px, 4vw, 22px)', fontWeight: 'bold' }}>
                    Recording captured! ({recordingTime}s)
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', justifyContent: 'center', width: '100%' }}>
                  <button type="button" onClick={resetRecording} className="btn-secondary" style={{ fontSize: '13px', padding: '8px 14px', minHeight: '44px', flex: '1 1 120px' }}>
                    <RefreshCw size={14} />
                    <span>Re-record</span>
                  </button>

                  <button type="button" onClick={handleUseRecording} className="btn-terracotta" style={{ fontSize: '13px', padding: '8px 14px', minHeight: '44px', flex: '1 1 140px' }}>
                    <Check size={14} />
                    <span>Use this recording</span>
                  </button>
                </div>
              </div>
            )}

            {/* Recording Permission / Device / Context Error Card */}
            {permissionError && (
              <div
                style={{
                  padding: '14px 16px',
                  borderRadius: '10px',
                  backgroundColor: '#fff',
                  border: '1.5px dashed var(--ink-terracotta)',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '10px',
                  textAlign: 'left',
                  width: '100%',
                  boxShadow: 'var(--shadow-card)',
                }}
              >
                <ShieldAlert size={20} style={{ color: 'var(--ink-terracotta)', flexShrink: 0, marginTop: '2px' }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <h4 style={{ fontFamily: 'var(--font-serif)', fontSize: '15px', color: 'var(--ink-primary)' }}>
                    Microphone Notice
                  </h4>
                  <p style={{ fontSize: '13px', color: 'var(--ink-muted)', lineHeight: 1.4 }}>{permissionError}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Hidden File Input for Upload mode */}
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*,.mp3,.wav,.m4a,.ogg,.flac,.aac,.webm"
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
      <footer className="step-footer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '8px' }}>
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
