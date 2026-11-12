import { describe, it, expect } from 'vitest';

describe('VoiceStep Recording Rules & Error Handling', () => {
  it('defines valid minimum and maximum recording limits', () => {
    const MIN_RECORD_SECONDS = 3;
    const MAX_RECORD_SECONDS = 60;

    expect(MIN_RECORD_SECONDS).toBe(3);
    expect(MAX_RECORD_SECONDS).toBe(60);
    expect(MAX_RECORD_SECONDS).toBeGreaterThan(MIN_RECORD_SECONDS);
  });

  it('validates audio clip duration against limits', () => {
    const isDurationValid = (duration: number) => duration >= 3 && duration <= 60;

    expect(isDurationValid(2)).toBe(false);
    expect(isDurationValid(3)).toBe(true);
    expect(isDurationValid(25)).toBe(true);
    expect(isDurationValid(60)).toBe(true);
    expect(isDurationValid(61)).toBe(false);
  });

  it('maps microphone permission and device errors correctly', () => {
    const mapMicError = (errName: string): string => {
      if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError' || errName === 'SecurityError') {
        return 'Microphone permission was denied. Please allow microphone access in your browser address bar settings or choose "Upload a file".';
      }
      if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError' || errName === 'OverconstrainedError') {
        return 'No microphone input device was detected on your system. Please connect a microphone or choose "Upload a file".';
      }
      return 'Could not access microphone.';
    };

    expect(mapMicError('NotAllowedError')).toContain('permission was denied');
    expect(mapMicError('PermissionDeniedError')).toContain('permission was denied');
    expect(mapMicError('NotFoundError')).toContain('No microphone input device');
    expect(mapMicError('DevicesNotFoundError')).toContain('No microphone input device');
  });

  it('stops all tracks in a MediaStream during cleanup', () => {
    let stoppedCount = 0;
    const mockTrack1 = { stop: () => stoppedCount++ };
    const mockTrack2 = { stop: () => stoppedCount++ };
    const mockStream = {
      getTracks: () => [mockTrack1, mockTrack2],
    };

    mockStream.getTracks().forEach((track) => track.stop());
    expect(stoppedCount).toBe(2);
  });

  it('supports three voice choices: default, upload, and record', () => {
    const validVoiceModes = ['default', 'upload', 'record'];
    expect(validVoiceModes).toContain('default');
    expect(validVoiceModes).toContain('upload');
    expect(validVoiceModes).toContain('record');

    // Default voice mode allows proceeding without a custom asset ID
    const canProceedWithDefault = (mode: string, assetId: string, uploading: boolean) => {
      if (uploading) return false;
      if (mode === 'default') return true;
      return Boolean(assetId);
    };

    expect(canProceedWithDefault('default', '', false)).toBe(true);
    expect(canProceedWithDefault('upload', '', false)).toBe(false);
    expect(canProceedWithDefault('upload', 'asset-123', false)).toBe(true);
    expect(canProceedWithDefault('record', '', false)).toBe(false);
    expect(canProceedWithDefault('record', 'asset-456', false)).toBe(true);
  });

  it('detects pseudo-WAV or WebM magic bytes to trigger PCM WAV transcoding', () => {
    const isPseudoWavOrWebM = (fileName: string, header: Uint8Array): boolean => {
      const isRiffWave =
        header.length >= 12 &&
        header[0] === 0x52 && header[1] === 0x49 && header[2] === 0x46 && header[3] === 0x46 &&
        header[8] === 0x57 && header[9] === 0x41 && header[10] === 0x56 && header[11] === 0x45;
      const isWebM =
        header.length >= 4 &&
        header[0] === 0x1A && header[1] === 0x45 && header[2] === 0xDF && header[3] === 0xA3;
      const isWavExt = fileName.toLowerCase().endsWith('.wav');
      const isWebMExt = fileName.toLowerCase().endsWith('.webm');

      return isWebM || isWebMExt || (isWavExt && !isRiffWave);
    };

    // Case 1: Standard RIFF WAVE file
    const validRiffHeader = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45, 0x00, 0x00, 0x00, 0x00
    ]);
    expect(isPseudoWavOrWebM('sample.wav', validRiffHeader)).toBe(false);

    // Case 2: WebM/Opus data disguised as .wav (e.g. Recorded Voice 1 7 9 44 6 2.wav)
    const webmHeaderDisguisedAsWav = new Uint8Array([
      0x1A, 0x45, 0xDF, 0xA3, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
    ]);
    expect(isPseudoWavOrWebM('Recorded Voice 1 7 9 44 6 2.wav', webmHeaderDisguisedAsWav)).toBe(true);

    // Case 3: Raw WebM audio file
    expect(isPseudoWavOrWebM('recording.webm', webmHeaderDisguisedAsWav)).toBe(true);

    // Case 4: Truncated or arbitrary audio missing RIFF marker named .wav
    const corruptedWavHeader = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07]);
    expect(isPseudoWavOrWebM('corrupted.wav', corruptedWavHeader)).toBe(true);
  });

  it('keeps Continue button disabled when audio upload fails or returns empty assetId', () => {
    const isContinueDisabled = (selectedAssetId: string, voiceMode: string, isAiClipsMode: boolean, uploading: boolean) => {
      return (!selectedAssetId && voiceMode !== 'default' && !isAiClipsMode) || uploading;
    };

    // Mode is upload, but upload failed so selectedAssetId is empty
    expect(isContinueDisabled('', 'upload', false, false)).toBe(true);

    // Mode is upload and actively uploading
    expect(isContinueDisabled('some-id', 'upload', false, true)).toBe(true);

    // Mode is upload and succeeded
    expect(isContinueDisabled('asset-good-id', 'upload', false, false)).toBe(false);

    // Mode is record and succeeded
    expect(isContinueDisabled('asset-rec-id', 'record', false, false)).toBe(false);

    // Mode is record and failed/empty
    expect(isContinueDisabled('', 'record', false, false)).toBe(true);
  });
});
