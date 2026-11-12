import React, { useState, useRef, useEffect } from 'react';
import apiClient from '../../api/client';
import { mapAPIError, type MappedAPIError } from '../../api/errorMapper';
import { extractWaveformPeaks, formatDuration, type WaveformAnalysis } from '../../utils/audioWaveform';
import { playStickerPopSound } from '../../utils/soundEffects';
import { convertBlobToWavFile, pcmChunksToWavFile } from '../../utils/wavEncoder';
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
  CheckCircle2,
} from 'lucide-react';

interface VoiceStepProps {
  selectedAssetId: string;
  onAssetSelected: (assetId: string) => void;
  onNext: () => void;
  onBack: () => void;
  isAiClipsMode?: boolean;
  onDurationDetected?: (durationSeconds: number) => void;
}

import {
  MAX_RECORD_SECONDS,
  validateRecordingDuration,
} from '../../utils/recordingLimits';

export type VoiceMode = 'default' | 'upload' | 'record';
type RecordingStatus = 'idle' | 'requesting' | 'recording' | 'recorded' | 'too_short' | 'error';

export const VoiceStep: React.FC<VoiceStepProps> = ({
  selectedAssetId,
  onAssetSelected,
  onNext,
  onBack,
  isAiClipsMode = false,
  onDurationDetected,
}) => {
  // Voice Mode & State: Default studio voice, upload audio file, or record voice now
  const [voiceMode, setVoiceMode] = useState<VoiceMode>(selectedAssetId ? 'upload' : 'default');

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

  // Recording Hardware Refs (Raw PCM direct from microphone)
  const pcmChunksRef = useRef<Float32Array[]>([]);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const sampleRateRef = useRef<number>(44100);
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
    if (scriptProcessorRef.current) {
      try {
        scriptProcessorRef.current.disconnect();
      } catch {
        // Ignore disconnect errors
      }
      scriptProcessorRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
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
    if (mode === 'default') {
      onAssetSelected('');
      setPreviewUrl(null);
      setRecordedFile(null);
      setWaveform(null);
      if (onDurationDetected) {
        onDurationDetected(0);
      }
    } else if (mode === 'upload') {
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

    // Inspect magic bytes: convert WebM or pseudo-WAV (e.g. WebM/Opus data labeled as .wav) to genuine PCM WAV
    let uploadFile = file;
    try {
      const headerBuf = await file.slice(0, 16).arrayBuffer();
      const headerBytes = new Uint8Array(headerBuf);
      const isRiffWave =
        headerBytes.length >= 12 &&
        headerBytes[0] === 0x52 && headerBytes[1] === 0x49 && headerBytes[2] === 0x46 && headerBytes[3] === 0x46 && // 'RIFF'
        headerBytes[8] === 0x57 && headerBytes[9] === 0x41 && headerBytes[10] === 0x56 && headerBytes[11] === 0x45; // 'WAVE'
      const isWebM =
        headerBytes.length >= 4 &&
        headerBytes[0] === 0x1A && headerBytes[1] === 0x45 && headerBytes[2] === 0xDF && headerBytes[3] === 0xA3;
      const isWavExt = file.name.toLowerCase().endsWith('.wav');
      const isWebMExt = file.name.toLowerCase().endsWith('.webm') || file.type.includes('webm');

      if (isWebM || isWebMExt || (isWavExt && !isRiffWave)) {
        const baseName = file.name.replace(/\.[^/.]+$/, '');
        uploadFile = await convertBlobToWavFile(file, `${baseName}.wav`);
      }
    } catch {
      setMappedError({
        title: 'Invalid or Corrupted Audio File',
        message: 'Could not decode audio header or file contains corrupt audio data. Please provide a valid MP3, WAV, or M4A recording.',
        kind: 'validation',
      });
      onAssetSelected('');
      setPreviewUrl(null);
      setFileName(null);
      setFileSizeStr(null);
      setWaveform(null);
      return;
    }

    // Extract real Web Audio API waveform peaks; fail early if audio cannot be decoded
    setAnalyzingAudio(true);
    let analysis: WaveformAnalysis;
    try {
      analysis = await extractWaveformPeaks(uploadFile, 44);
    } catch {
      setMappedError({
        title: 'Invalid or Corrupted Audio File',
        message: 'Could not decode audio header or file contains corrupt audio data. Please provide a valid audio recording.',
        kind: 'validation',
      });
      onAssetSelected('');
      setPreviewUrl(null);
      setFileName(null);
      setFileSizeStr(null);
      setWaveform(null);
      setAnalyzingAudio(false);
      return;
    } finally {
      setAnalyzingAudio(false);
    }

    // Audio decoded successfully — update state and waveform
    setWaveform(analysis);
    if (onDurationDetected && analysis.duration > 0) {
      onDurationDetected(analysis.duration);
    }
    setFileName(uploadFile.name);
    setFileSizeStr(formatFileSize(uploadFile.size));
    const objectUrl = URL.createObjectURL(uploadFile);
    setPreviewUrl(objectUrl);
    setIsPlaying(false);
    setCurrentTime(0);

    // Upload asset to backend
    setUploading(true);
    setUploadProgress(0);

    try {
      const res = await apiClient.uploadAsset('voice', uploadFile, (percent) => {
        setUploadProgress(percent);
      });
      playStickerPopSound();
      onAssetSelected(res.asset_id);
    } catch (err: unknown) {
      const mapped = mapAPIError(err);
      setMappedError(mapped);
      onAssetSelected('');
      setPreviewUrl(null);
      setFileName(null);
      setFileSizeStr(null);
      setWaveform(null);
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

    // Check 2: Browser AudioContext and getUserMedia API support
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx || !navigator?.mediaDevices?.getUserMedia) {
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

      const audioCtx = new AudioCtx();
      audioContextRef.current = audioCtx;
      sampleRateRef.current = audioCtx.sampleRate || 44100;
      pcmChunksRef.current = [];

      const source = audioCtx.createMediaStreamSource(stream);

      // Meter Analyser
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

      // Raw PCM Capture directly from microphone stream via ScriptProcessor
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      scriptProcessorRef.current = processor;
      processor.onaudioprocess = (e) => {
        const inputBuffer = e.inputBuffer.getChannelData(0);
        pcmChunksRef.current.push(new Float32Array(inputBuffer));
      };
      source.connect(processor);

      // Mute gain node connected to destination keeps processor running without audio feedback
      const muteGain = audioCtx.createGain();
      muteGain.gain.value = 0;
      processor.connect(muteGain);
      muteGain.connect(audioCtx.destination);

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
    playStickerPopSound();

    const sampleRate = sampleRateRef.current || 44100;
    const totalSamples = pcmChunksRef.current.reduce((acc, c) => acc + c.length, 0);
    const durationSeconds = Math.round(totalSamples / sampleRate);
    const finalSeconds = Math.max(recordingTime, durationSeconds);

    cleanupRecordingHardware();

    setRecordingTime(finalSeconds);

    const validation = validateRecordingDuration(finalSeconds);
    if (validation === 'too_short') {
      setRecordingStatus('too_short');
      setRecordedFile(null);
    } else {
      try {
        const wavFile = pcmChunksToWavFile(pcmChunksRef.current, sampleRate, `recorded_voice_${Date.now()}.wav`);
        setRecordedFile(wavFile);
        setRecordingStatus('recorded');
      } catch {
        setRecordingStatus('error');
        setPermissionError(
          'Failed to convert recorded audio into a valid WAV format. Please try recording again or upload an audio file.'
        );
        setRecordedFile(null);
      }
    }
  };

  const resetRecording = () => {
    cleanupRecordingHardware();
    pcmChunksRef.current = [];
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
        padding: 'clamp(16px, 2.5dvh, 32px) clamp(16px, 2.5vw, 44px)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'clamp(16px, 2dvh, 24px)',
        position: 'relative',
        maxWidth: 'min(1100px, 96%)',
        margin: 'auto',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      {/* Header Copy */}
      <header style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <h2 className="editorial-title" style={{ fontSize: 'clamp(24px, 2.2vw, 34px)', lineHeight: 1.2, margin: 0 }}>
          Provide a voice sample
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 'clamp(14px, 1vw, 16px)', lineHeight: 1.5, margin: 0 }}>
          Upload an existing audio recording or speak directly into your microphone (3 to 60 seconds).
        </p>
      </header>

      {/* 3 Optional Choices: Default Voice, Upload File, Record Voice */}
      {!previewUrl && !isAiClipsMode && (
        <div
          role="tablist"
          aria-label="Voice input options"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '6px',
            backgroundColor: 'var(--bg-subtle)',
            padding: '4px',
            borderRadius: 'var(--radius-pill)',
            border: '1px solid var(--border-light)',
            width: '100%',
            maxWidth: '520px',
            boxSizing: 'border-box',
          }}
        >
          <button
            type="button"
            role="tab"
            aria-selected={voiceMode === 'default'}
            onClick={() => handleSwitchMode('default')}
            style={{
              flex: '1 1 130px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '8px 14px',
              minHeight: '40px',
              borderRadius: 'var(--radius-pill)',
              fontSize: '13.5px',
              border: voiceMode === 'default' ? '1px solid var(--border-light)' : '1px solid transparent',
              backgroundColor: voiceMode === 'default' ? 'var(--bg-surface)' : 'transparent',
              color: voiceMode === 'default' ? 'var(--text-primary)' : 'var(--text-muted)',
              boxShadow: voiceMode === 'default' ? 'var(--shadow-sm)' : 'none',
              cursor: 'pointer',
              fontWeight: voiceMode === 'default' ? 600 : 500,
              fontFamily: 'var(--font-sans)',
              transition: 'all 0.15s ease',
              whiteSpace: 'nowrap',
            }}
          >
            <Volume2 size={15} />
            <span>Use default voice</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={voiceMode === 'upload'}
            onClick={() => handleSwitchMode('upload')}
            style={{
              flex: '1 1 130px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '8px 14px',
              minHeight: '40px',
              borderRadius: 'var(--radius-pill)',
              fontSize: '13.5px',
              border: voiceMode === 'upload' ? '1px solid var(--border-light)' : '1px solid transparent',
              backgroundColor: voiceMode === 'upload' ? 'var(--bg-surface)' : 'transparent',
              color: voiceMode === 'upload' ? 'var(--text-primary)' : 'var(--text-muted)',
              boxShadow: voiceMode === 'upload' ? 'var(--shadow-sm)' : 'none',
              cursor: 'pointer',
              fontWeight: voiceMode === 'upload' ? 600 : 500,
              fontFamily: 'var(--font-sans)',
              transition: 'all 0.15s ease',
              whiteSpace: 'nowrap',
            }}
          >
            <Upload size={15} />
            <span>Upload an audio file</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={voiceMode === 'record'}
            onClick={() => handleSwitchMode('record')}
            style={{
              flex: '1 1 130px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '8px 14px',
              minHeight: '40px',
              borderRadius: 'var(--radius-pill)',
              fontSize: '13.5px',
              border: voiceMode === 'record' ? '1px solid var(--border-light)' : '1px solid transparent',
              backgroundColor: voiceMode === 'record' ? 'var(--bg-surface)' : 'transparent',
              color: voiceMode === 'record' ? 'var(--text-primary)' : 'var(--text-muted)',
              boxShadow: voiceMode === 'record' ? 'var(--shadow-sm)' : 'none',
              cursor: 'pointer',
              fontWeight: voiceMode === 'record' ? 600 : 500,
              fontFamily: 'var(--font-sans)',
              transition: 'all 0.15s ease',
              whiteSpace: 'nowrap',
            }}
          >
            <Mic size={15} />
            <span>Record voice now</span>
          </button>
        </div>
      )}

      {/* Main Interactive Content */}
      <div role="region" aria-label="Voice recording workspace" style={{ width: '100%' }}>
        {voiceMode === 'default' && !previewUrl ? (
          <div
            className="card"
            style={{
              padding: 'clamp(28px, 4vw, 44px) clamp(20px, 3vw, 36px)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center',
              gap: '16px',
              width: '100%',
              maxWidth: '640px',
              margin: '0 auto',
              boxSizing: 'border-box',
            }}
          >
            <div
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                backgroundColor: 'var(--teal-subtle)',
                border: '1px solid var(--teal-border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--teal-primary)',
              }}
            >
              <Volume2 size={26} aria-hidden="true" />
            </div>
            <div style={{ maxWidth: '480px' }}>
              <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)' }}>
                Studio Default Voice
              </h3>
              <p style={{ margin: 0, fontSize: '14.5px', color: 'var(--text-muted)', lineHeight: 1.55 }}>
                Your film will be narrated using our natural, balanced studio preset voice. You do not need to record or upload anything.
              </p>
            </div>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                borderRadius: 'var(--radius-pill)',
                backgroundColor: 'rgba(0, 128, 128, 0.1)',
                border: '1px solid var(--teal-border)',
                color: 'var(--teal-primary)',
                fontSize: '13px',
                fontWeight: 600,
              }}
            >
              <CheckCircle2 size={15} />
              <span>Default voice selected</span>
            </div>
          </div>
        ) : previewUrl ? (
          /* Waveform Preview Player Box - Clean 16px Card */
          <div
            className="card"
            style={{
              padding: 'clamp(20px, 3vw, 28px)',
              display: 'flex',
              flexDirection: 'column',
              gap: '20px',
              width: '100%',
              boxSizing: 'border-box',
            }}
          >
            {/* Audio Info Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: '0', flex: '1' }}>
                <div
                  style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '12px',
                    backgroundColor: 'var(--accent-primary-light)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--accent-primary)',
                    flexShrink: 0,
                  }}
                >
                  <Volume2 size={20} />
                </div>
                <div style={{ minWidth: '0', overflow: 'hidden' }}>
                  <h4 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>
                    {fileName || 'Voice Sample'}
                  </h4>
                  <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px', margin: 0 }}>
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
                  backgroundColor: 'var(--accent-primary)',
                  color: '#ffffff',
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(0, 128, 128, 0.25)',
                  transition: 'all 0.15s ease',
                  flexShrink: 0,
                }}
              >
                {isPlaying ? <Pause size={18} fill="#ffffff" /> : <Play size={18} fill="#ffffff" style={{ marginLeft: '2px' }} />}
              </button>
            </div>

            {/* Real Audio Waveform Visualization */}
            <div
              style={{
                padding: '16px 12px',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--bg-subtle)',
                border: '1px solid var(--border-light)',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                width: '100%',
              }}
            >
              {analyzingAudio ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '16px 0', color: 'var(--accent-primary)' }}>
                  <Loader2 size={18} className="animate-spin" />
                  <span style={{ fontSize: '14.5px', fontWeight: 500, fontFamily: 'var(--font-sans)' }}>Reading audio frequencies...</span>
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
                          height: `${Math.max(8, amplitude * 100)}%`,
                          backgroundColor: isPlayed ? 'var(--accent-primary)' : 'var(--border-subtle)',
                          borderRadius: '2px',
                          transition: 'height 0.2s ease, background-color 0.1s ease',
                        }}
                      />
                    );
                  })}
                </div>
              ) : null}

              {/* Time Counter Bar */}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-muted)', fontWeight: 500, fontFamily: 'var(--font-sans)' }}>
                <span>{formatDuration(currentTime)}</span>
                <span>{formatDuration(waveform?.duration || 0)}</span>
              </div>
            </div>

            {/* Uploading Progress */}
            {uploading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: 600 }}>
                  <span style={{ color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Loader2 size={16} className="animate-spin" />
                    Sending voice sample to studio...
                  </span>
                  <span style={{ color: 'var(--text-primary)' }}>{uploadProgress}%</span>
                </div>
                <div style={{ width: '100%', height: '6px', backgroundColor: 'var(--bg-subtle)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${uploadProgress}%`,
                      height: '100%',
                      backgroundColor: 'var(--accent-primary)',
                      transition: 'width 0.2s ease',
                    }}
                  />
                </div>
              </div>
            ) : selectedAssetId ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
                <span style={{ color: 'var(--accent-success)', fontSize: '15px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <CheckCircle2 size={18} />
                  Voice sample locked in!
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
            className={`card upload-dropzone ${dragActive ? 'upload-dropzone--active' : ''}`}
            style={{
              padding: 'clamp(24px, 4dvh, 48px) 24px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '14px',
              minHeight: '220px',
              width: '100%',
              boxSizing: 'border-box',
              textAlign: 'center',
              cursor: 'pointer',
            }}
          >
            <div
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '16px',
                backgroundColor: 'var(--accent-light)',
                color: 'var(--accent)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Upload size={26} />
            </div>

            <div>
              <p style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '16px', margin: 0 }}>
                Drag & drop voice audio clip (.wav, .mp3, .m4a, .webm)
              </p>
              <p style={{ fontSize: '13.5px', color: 'var(--text-muted)', marginTop: '4px', margin: 0 }}>
                Clear speech with quiet background noise works best (Up to 20MB)
              </p>
            </div>

            <span className="btn-secondary" style={{ pointerEvents: 'none', marginTop: '4px' }}>
              <Upload size={16} />
              <span>Select Audio File</span>
            </span>
          </div>
        ) : (
          /* Option 2: Live Recording View */
          <div
            className="card"
            style={{
              padding: 'clamp(24px, 4dvh, 40px) 24px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '16px',
              minHeight: '220px',
              width: '100%',
              textAlign: 'center',
              boxSizing: 'border-box',
            }}
          >
            {/* Recording Status: Idle */}
            {recordingStatus === 'idle' && (
              <>
                <div
                  style={{
                    width: '56px',
                    height: '56px',
                    borderRadius: '16px',
                    backgroundColor: 'var(--accent-light)',
                    color: 'var(--accent)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Mic size={26} />
                </div>

                {/* Smooth Fallback Idle Wave */}
                <div
                  aria-hidden="true"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    height: '24px',
                    margin: '2px 0',
                  }}
                >
                  {[0.4, 0.7, 1.0, 0.55, 0.85, 0.6, 0.95, 0.45].map((scale, i) => (
                    <div
                      key={i}
                      className="idle-wave-bar"
                      style={{
                        width: '3px',
                        height: '100%',
                        backgroundColor: 'var(--accent)',
                        borderRadius: '2px',
                        animationDelay: `${i * 0.16}s`,
                        opacity: 0.35 + scale * 0.35,
                      }}
                    />
                  ))}
                </div>

                <div>
                  <h3 style={{ fontSize: '17px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                    Speak into your microphone
                  </h3>
                  <p style={{ fontSize: '13.5px', color: 'var(--text-muted)', marginTop: '4px', margin: 0 }}>
                    Recording length must be between <strong>3 seconds</strong> and <strong>60 seconds</strong>.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={startRecording}
                  className="btn-primary"
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
                <Loader2 size={32} className="animate-spin" style={{ color: 'var(--accent)' }} />
                <p style={{ fontSize: '16px', fontWeight: 600, color: 'var(--accent)', margin: 0 }}>
                  Requesting microphone permission...
                </p>
                <p style={{ fontSize: '13.5px', color: 'var(--text-muted)', margin: 0 }}>
                  Please allow microphone access in your browser prompt.
                </p>
              </div>
            )}

            {/* Recording Status: Active Recording */}
            {recordingStatus === 'recording' && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px', width: '100%' }}>
                {/* Live REC Timer with Tabular Numbers */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Radio size={18} className="animate-pulse" style={{ color: 'var(--accent-danger)' }} />
                  <span
                    style={{
                      fontSize: '20px',
                      color: 'var(--accent-danger)',
                      fontWeight: 700,
                      fontFamily: 'var(--font-sans)',
                      fontVariantNumeric: 'tabular-nums',
                      letterSpacing: '0.04em',
                    }}
                  >
                    REC {formatDuration(recordingTime)} / 01:00
                  </span>
                </div>

                <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
                  Speak clearly • Recording limit: 3s to 60s
                </p>

                {/* Live Pulsing Mic Orb Driven by Mic Volume */}
                {(() => {
                  const avgLevel = audioLevels.reduce((a, b) => a + b, 0) / (audioLevels.length || 1);
                  const orbScale = 1 + avgLevel * 0.35;
                  const glowSize = 16 + avgLevel * 30;
                  return (
                    <div
                      style={{
                        position: 'relative',
                        width: '76px',
                        height: '76px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        margin: '4px 0',
                      }}
                    >
                      <div
                        style={{
                          position: 'absolute',
                          width: '60px',
                          height: '60px',
                          borderRadius: '50%',
                          background: 'var(--teal-primary)',
                          boxShadow: `0 0 ${glowSize}px rgba(0, 128, 128, ${0.4 + avgLevel * 0.5})`,
                          transform: `scale(${orbScale})`,
                          transition: 'transform 0.08s ease, box-shadow 0.08s ease',
                          opacity: 0.9,
                        }}
                      />
                      <Mic size={24} style={{ color: '#ffffff', position: 'relative', zIndex: 2 }} />
                    </div>
                  );
                })()}

                {/* Clean Live Level Meter */}
                <div
                  role="img"
                  aria-label="Live audio volume level meter"
                  style={{
                    display: 'flex',
                    alignItems: 'flex-end',
                    justifyContent: 'center',
                    gap: '4px',
                    height: '48px',
                    width: '100%',
                    maxWidth: '220px',
                    padding: '6px 10px',
                    backgroundColor: 'rgba(255, 255, 255, 0.7)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                  }}
                >
                  {audioLevels.map((lvl, idx) => (
                    <div
                      key={idx}
                      style={{
                        flex: 1,
                        height: `${Math.max(12, lvl * 100)}%`,
                        backgroundColor:
                          lvl > 0.6 ? 'var(--accent-danger)' : lvl > 0.3 ? 'var(--accent-warning)' : 'var(--accent)',
                        borderRadius: '2px',
                        transition: 'height 0.1s ease',
                      }}
                    />
                  ))}
                </div>

                {/* Pulsing Breathing Record Stop Button */}
                <button
                  type="button"
                  onClick={stopRecording}
                  className="btn-primary record-btn-pulsing"
                  style={{
                    padding: '10px 24px',
                    fontSize: '14px',
                    borderRadius: 'var(--radius-full)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <Square size={14} fill="#ffffff" />
                  <span>Stop Recording</span>
                </button>
              </div>
            )}

            {/* Recording Status: Too Short Warning */}
            {recordingStatus === 'too_short' && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                <AlertCircle size={28} style={{ color: 'var(--accent-warning)' }} />
                <h4 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                  Recording was too short ({recordingTime}s)
                </h4>
                <p style={{ fontSize: '13.5px', color: 'var(--text-muted)', margin: 0 }}>
                  Please record a voice clip between <strong>3 seconds</strong> and <strong>60 seconds</strong>.
                </p>

                <button type="button" onClick={resetRecording} className="btn-primary" style={{ fontSize: '14px', padding: '8px 18px' }}>
                  <RefreshCw size={15} />
                  <span>Try Recording Again</span>
                </button>
              </div>
            )}

            {/* Recording Status: Recorded & Ready to Review with Scale Bounce */}
            {recordingStatus === 'recorded' && recordedFile && (
              <div
                className="scale-bounce"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '14px',
                  width: '100%',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent-success)' }}>
                  <CheckCircle2 size={18} className="checkmark-pop" />
                  <span style={{ fontSize: '16px', fontWeight: 600 }}>
                    Recording captured! ({recordingTime}s)
                  </span>
                </div>

                {/* Morphs into captured playback wave indicator */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    width: '100%',
                    maxWidth: '340px',
                    padding: '12px 16px',
                    borderRadius: 'var(--radius-md)',
                    background: 'rgba(255, 255, 255, 0.7)',
                    border: '1px solid var(--border-subtle)',
                    backdropFilter: 'blur(8px)',
                  }}
                >
                  <div
                    style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '50%',
                      background: 'var(--accent-light)',
                      color: 'var(--accent)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <Volume2 size={18} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', flex: 1, textAlign: 'left' }}>
                    <span style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text-primary)' }}>
                      Spoken Voice Memo
                    </span>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                      {formatDuration(recordingTime)} • Ready to convert
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', justifyContent: 'center', width: '100%' }}>
                  <button type="button" onClick={resetRecording} className="btn-secondary" style={{ fontSize: '13px', padding: '8px 14px', minHeight: '44px', flex: '1 1 120px' }}>
                    <RefreshCw size={14} />
                    <span>Re-record</span>
                  </button>

                  <button type="button" onClick={handleUseRecording} className="btn-primary" style={{ fontSize: '13px', padding: '8px 14px', minHeight: '44px', flex: '1 1 140px' }}>
                    <Check size={14} />
                    <span>Use this recording</span>
                  </button>
                </div>
              </div>
            )}

            {/* Recording Permission Error Card */}
            {permissionError && (
              <div
                className="card error-shake error-card-tint"
                style={{
                  padding: '14px 16px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '10px',
                  textAlign: 'left',
                  width: '100%',
                }}
              >
                <ShieldAlert size={20} style={{ color: 'var(--accent-danger)', flexShrink: 0, marginTop: '2px' }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <h4 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                    Microphone Notice
                  </h4>
                  <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.4, margin: 0 }}>{permissionError}</p>
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
      </div>

      {/* Error State Card */}
      {mappedError && (
        <div
          role="alert"
          className="card error-shake error-card-tint"
          style={{
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '12px',
          }}
        >
          <AlertCircle size={22} style={{ color: 'var(--accent-danger)', flexShrink: 0, marginTop: '2px' }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <h4 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
              {mappedError.title}
            </h4>
            <p style={{ fontSize: '13.5px', color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>
              {mappedError.message}
            </p>
          </div>
        </div>
      )}

      {/* Navigation Footer */}
      <footer
        className="step-footer"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: '8px',
          paddingTop: '16px',
          borderTop: '1px solid var(--border-light)',
        }}
      >
        <button
          type="button"
          onClick={onBack}
          className="btn-secondary"
          style={{ minHeight: '44px', padding: '10px 20px', cursor: 'pointer' }}
        >
          <ArrowLeft size={16} />
          <span>Back</span>
          <span className="kbd-hint" title="Keyboard shortcut: Esc">Esc</span>
        </button>

        <button
          type="button"
          onClick={onNext}
          disabled={((!selectedAssetId && voiceMode !== 'default' && !isAiClipsMode) || uploading)}
          className="btn-primary"
          style={{
            minHeight: '44px',
            padding: '10px 24px',
            cursor: ((!selectedAssetId && voiceMode !== 'default' && !isAiClipsMode) || uploading) ? 'not-allowed' : 'pointer',
          }}
        >
          <span>{isAiClipsMode ? 'Continue to Consent' : 'Continue to Duration'}</span>
          <span className="kbd-hint" title="Keyboard shortcut: Enter">↵</span>
          <ArrowRight size={16} />
        </button>
      </footer>
    </div>
  );
};

export default VoiceStep;
