import { describe, it, expect } from 'vitest';
import { audioBufferToWav } from './wavEncoder';

describe('audioBufferToWav PCM WAV Encoder', () => {
  it('encodes AudioBuffer into a valid 16-bit PCM WAV Blob with 44-byte RIFF header', async () => {
    const sampleRate = 44100;
    const numChannels = 1;
    const length = 44100; // 1 second of audio

    const mockBuffer = {
      numberOfChannels: numChannels,
      sampleRate: sampleRate,
      length: length,
      duration: 1.0,
      getChannelData: () => new Float32Array(length).fill(0.5),
    } as unknown as AudioBuffer;

    const wavBlob = audioBufferToWav(mockBuffer);
    expect(wavBlob).toBeDefined();
    expect(wavBlob.type).toBe('audio/wav');

    // Header (44 bytes) + 1 second * 44100 samples * 2 bytes/sample = 44 + 88200 = 88244 bytes
    expect(wavBlob.size).toBe(44 + 88200);

    // Verify WAV Header Magic Bytes
    const arrayBuffer = await wavBlob.arrayBuffer();
    const dataView = new DataView(arrayBuffer);

    const riffStr = String.fromCharCode(
      dataView.getUint8(0),
      dataView.getUint8(1),
      dataView.getUint8(2),
      dataView.getUint8(3)
    );
    const waveStr = String.fromCharCode(
      dataView.getUint8(8),
      dataView.getUint8(9),
      dataView.getUint8(10),
      dataView.getUint8(11)
    );
    const fmtStr = String.fromCharCode(
      dataView.getUint8(12),
      dataView.getUint8(13),
      dataView.getUint8(14),
      dataView.getUint8(15)
    );
    const dataStr = String.fromCharCode(
      dataView.getUint8(36),
      dataView.getUint8(37),
      dataView.getUint8(38),
      dataView.getUint8(39)
    );

    expect(riffStr).toBe('RIFF');
    expect(waveStr).toBe('WAVE');
    expect(fmtStr).toBe('fmt ');
    expect(dataStr).toBe('data');

    // Format = 1 (PCM), Channels = 1, Sample Rate = 44100, Bits per sample = 16
    expect(dataView.getUint16(20, true)).toBe(1);
    expect(dataView.getUint16(22, true)).toBe(1);
    expect(dataView.getUint32(24, true)).toBe(44100);
    expect(dataView.getUint16(34, true)).toBe(16);
  });
});
