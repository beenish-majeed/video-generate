/**
 * Web Audio API utility to extract waveform amplitude peaks from an audio file.
 */

export interface WaveformAnalysis {
  peaks: number[];
  duration: number; // in seconds
}

export async function extractWaveformPeaks(
  file: File,
  numBars: number = 48
): Promise<WaveformAnalysis> {
  const arrayBuffer = await file.arrayBuffer();
  
  // Use standard AudioContext
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextClass) {
    // Fallback if Web Audio API is unavailable
    const mockPeaks = Array.from({ length: numBars }, () => Math.random() * 0.7 + 0.2);
    return { peaks: mockPeaks, duration: 15 };
  }

  const audioCtx = new AudioContextClass();

  try {
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    const duration = audioBuffer.duration;
    const rawData = audioBuffer.getChannelData(0); // Left channel or mono
    const samplesPerBar = Math.floor(rawData.length / numBars);

    const peaks: number[] = [];

    for (let i = 0; i < numBars; i++) {
      const startSample = i * samplesPerBar;
      let maxAmp = 0;
      for (let j = 0; j < samplesPerBar; j += 4) { // sample every 4th point for speed
        const val = Math.abs(rawData[startSample + j] || 0);
        if (val > maxAmp) {
          maxAmp = val;
        }
      }
      // Normalize peak between 0.15 and 1.0 for aesthetic display
      const normalized = Math.max(0.15, Math.min(1.0, maxAmp * 1.5));
      peaks.push(normalized);
    }

    await audioCtx.close();
    return { peaks, duration };
  } catch (err) {
    if (audioCtx.state !== 'closed') {
      await audioCtx.close();
    }
    throw new Error('We could not decode the audio data from this file.');
  }
}

export function formatDuration(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}
