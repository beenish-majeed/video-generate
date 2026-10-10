import { describe, it, expect } from 'vitest';
import { audioBufferToWav } from './wavEncoder';

describe('audioBufferToWav PCM WAV Encoder Unit Tests', () => {
  // Helper to read ASCII string from DataView
  function readString(dataView: DataView, offset: number, length: number): string {
    let str = '';
    for (let i = 0; i < length; i++) {
      str += String.fromCharCode(dataView.getUint8(offset + i));
    }
    return str;
  }

  it('1. Valid header: produces correct RIFF, WAVE, "fmt ", and "data" markers', async () => {
    const sampleRate = 44100;
    const numChannels = 1;
    const length = 100;

    const mockBuffer = {
      numberOfChannels: numChannels,
      sampleRate: sampleRate,
      length: length,
      duration: length / sampleRate,
      getChannelData: () => new Float32Array(length).fill(0),
    } as unknown as AudioBuffer;

    const wavBlob = audioBufferToWav(mockBuffer);
    const arrayBuffer = await wavBlob.arrayBuffer();
    const dataView = new DataView(arrayBuffer);

    expect(readString(dataView, 0, 4)).toBe('RIFF');
    expect(readString(dataView, 8, 4)).toBe('WAVE');
    expect(readString(dataView, 12, 4)).toBe('fmt ');
    expect(readString(dataView, 36, 4)).toBe('data');
  });

  it('2. Correct sample rate, channel count, byte rate, block align, and bits per sample', async () => {
    const sampleRate = 48000;
    const numChannels = 2; // Stereo
    const bitDepth = 16;
    const bytesPerSample = bitDepth / 8; // 2
    const blockAlign = numChannels * bytesPerSample; // 4
    const byteRate = sampleRate * blockAlign; // 192000
    const length = 480;

    const mockBuffer = {
      numberOfChannels: numChannels,
      sampleRate: sampleRate,
      length: length,
      duration: length / sampleRate,
      getChannelData: () => new Float32Array(length).fill(0),
    } as unknown as AudioBuffer;

    const wavBlob = audioBufferToWav(mockBuffer);
    const arrayBuffer = await wavBlob.arrayBuffer();
    const dataView = new DataView(arrayBuffer);

    expect(dataView.getUint16(20, true)).toBe(1); // AudioFormat (1 = PCM)
    expect(dataView.getUint16(22, true)).toBe(numChannels); // NumChannels (2)
    expect(dataView.getUint32(24, true)).toBe(sampleRate); // SampleRate (48000)
    expect(dataView.getUint32(28, true)).toBe(byteRate); // ByteRate (192000)
    expect(dataView.getUint16(32, true)).toBe(blockAlign); // BlockAlign (4)
    expect(dataView.getUint16(34, true)).toBe(bitDepth); // BitsPerSample (16)
  });

  it('3. Correct byte length and data size for 1 second of audio samples', async () => {
    // Test 3a: 1 second at 44100 Hz Mono
    const sampleRateMono = 44100;
    const lengthMono = 44100; // 1 second
    const mockMono = {
      numberOfChannels: 1,
      sampleRate: sampleRateMono,
      length: lengthMono,
      duration: 1.0,
      getChannelData: () => new Float32Array(lengthMono).fill(0.1),
    } as unknown as AudioBuffer;

    const wavMono = audioBufferToWav(mockMono);
    const expectedDataMono = lengthMono * 1 * 2; // 88200 bytes
    const expectedTotalMono = 44 + expectedDataMono; // 88244 bytes
    const expectedRiffMono = 36 + expectedDataMono; // 88236 bytes

    expect(wavMono.size).toBe(expectedTotalMono);

    const dataViewMono = new DataView(await wavMono.arrayBuffer());
    expect(dataViewMono.getUint32(4, true)).toBe(expectedRiffMono);
    expect(dataViewMono.getUint32(40, true)).toBe(expectedDataMono);

    // Test 3b: 1 second at 48000 Hz Stereo
    const sampleRateStereo = 48000;
    const lengthStereo = 48000; // 1 second per channel
    const mockStereo = {
      numberOfChannels: 2,
      sampleRate: sampleRateStereo,
      length: lengthStereo,
      duration: 1.0,
      getChannelData: () => new Float32Array(lengthStereo).fill(0.2),
    } as unknown as AudioBuffer;

    const wavStereo = audioBufferToWav(mockStereo);
    const expectedDataStereo = lengthStereo * 2 * 2; // 192000 bytes
    const expectedTotalStereo = 44 + expectedDataStereo; // 192044 bytes
    const expectedRiffStereo = 36 + expectedDataStereo; // 192036 bytes

    expect(wavStereo.size).toBe(expectedTotalStereo);

    const dataViewStereo = new DataView(await wavStereo.arrayBuffer());
    expect(dataViewStereo.getUint32(4, true)).toBe(expectedRiffStereo);
    expect(dataViewStereo.getUint32(40, true)).toBe(expectedDataStereo);
  });

  it('4. Clamps sample values to [-1.0, 1.0] and encodes 16-bit signed PCM integers', async () => {
    // Provide out-of-bounds Float32 samples: 2.0 (over 1.0), -3.0 (under -1.0), 0.0, 0.5, -0.5
    const samples = new Float32Array([2.0, -3.0, 0.0, 0.5, -0.5]);

    const mockBuffer = {
      numberOfChannels: 1,
      sampleRate: 44100,
      length: samples.length,
      duration: samples.length / 44100,
      getChannelData: () => samples,
    } as unknown as AudioBuffer;

    const wavBlob = audioBufferToWav(mockBuffer);
    const dataView = new DataView(await wavBlob.arrayBuffer());

    // Sample 0: +2.0 clamped to +1.0 -> 0x7FFF (32767)
    expect(dataView.getInt16(44, true)).toBe(32767);

    // Sample 1: -3.0 clamped to -1.0 -> -0x8000 (-32768)
    expect(dataView.getInt16(46, true)).toBe(-32768);

    // Sample 2: 0.0 -> 0
    expect(dataView.getInt16(48, true)).toBe(0);

    // Sample 3: 0.5 -> 0.5 * 32767 = 16383
    expect(dataView.getInt16(50, true)).toBe(16383);

    // Sample 4: -0.5 -> -0.5 * 32768 = -16384
    expect(dataView.getInt16(52, true)).toBe(-16384);
  });

  it('5. Handles empty input (0 samples) gracefully without crashing', async () => {
    const emptyBuffer = {
      numberOfChannels: 1,
      sampleRate: 44100,
      length: 0,
      duration: 0,
      getChannelData: () => new Float32Array(0),
    } as unknown as AudioBuffer;

    const wavBlob = audioBufferToWav(emptyBuffer);
    expect(wavBlob).toBeDefined();
    expect(wavBlob.type).toBe('audio/wav');
    expect(wavBlob.size).toBe(44); // Header size only

    const dataView = new DataView(await wavBlob.arrayBuffer());
    expect(readString(dataView, 0, 4)).toBe('RIFF');
    expect(readString(dataView, 8, 4)).toBe('WAVE');
    expect(readString(dataView, 12, 4)).toBe('fmt ');
    expect(readString(dataView, 36, 4)).toBe('data');

    expect(dataView.getUint32(4, true)).toBe(36); // ChunkSize = 36 + 0
    expect(dataView.getUint32(40, true)).toBe(0); // Subchunk2Size = 0
  });
});
