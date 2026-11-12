/**
 * Encodes a Web Audio API AudioBuffer into a 16-bit PCM WAV Blob.
 */
export function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // 1 = PCM
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = buffer.length * blockAlign;
  const headerSize = 44;
  const totalSize = headerSize + dataSize;

  const arrayBuffer = new ArrayBuffer(totalSize);
  const dataView = new DataView(arrayBuffer);

  function writeString(offset: number, str: string) {
    for (let i = 0; i < str.length; i++) {
      dataView.setUint8(offset + i, str.charCodeAt(i));
    }
  }

  /* RIFF chunk descriptor */
  writeString(0, 'RIFF');
  dataView.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');

  /* fmt sub-chunk */
  writeString(12, 'fmt ');
  dataView.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  dataView.setUint16(20, format, true); // AudioFormat
  dataView.setUint16(22, numChannels, true); // NumChannels
  dataView.setUint32(24, sampleRate, true); // SampleRate
  dataView.setUint32(28, sampleRate * blockAlign, true); // ByteRate
  dataView.setUint16(32, blockAlign, true); // BlockAlign
  dataView.setUint16(34, bitDepth, true); // BitsPerSample

  /* data sub-chunk */
  writeString(36, 'data');
  dataView.setUint32(40, dataSize, true);

  /* Interleave channels & write 16-bit PCM samples */
  const channels: Float32Array[] = [];
  for (let i = 0; i < numChannels; i++) {
    channels.push(buffer.getChannelData(i));
  }

  let offset = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let channel = 0; channel < numChannels; channel++) {
      const sample = Math.max(-1, Math.min(1, channels[channel][i]));
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      dataView.setInt16(offset, intSample, true);
      offset += 2;
    }
  }

  const BlobCtor = typeof Blob !== 'undefined' ? Blob : require('buffer').Blob;
  return new BlobCtor([arrayBuffer], { type: 'audio/wav' });
}

/**
 * Encodes an array of mono Float32Array PCM chunks into a standard 16-bit PCM WAV Blob.
 */
export function pcmChunksToWavBlob(chunks: Float32Array[], sampleRate: number): Blob {
  let totalLength = 0;
  for (let i = 0; i < chunks.length; i++) {
    totalLength += chunks[i].length;
  }

  const numChannels = 1;
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8; // 2
  const blockAlign = numChannels * bytesPerSample; // 2
  const byteRate = sampleRate * blockAlign;
  const dataSize = totalLength * blockAlign;
  const headerSize = 44;
  const totalSize = headerSize + dataSize;

  const arrayBuffer = new ArrayBuffer(totalSize);
  const dataView = new DataView(arrayBuffer);

  function writeString(offset: number, str: string) {
    for (let i = 0; i < str.length; i++) {
      dataView.setUint8(offset + i, str.charCodeAt(i));
    }
  }

  /* RIFF chunk descriptor */
  writeString(0, 'RIFF');
  dataView.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');

  /* fmt sub-chunk */
  writeString(12, 'fmt ');
  dataView.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  dataView.setUint16(20, 1, true); // AudioFormat (1 = PCM)
  dataView.setUint16(22, numChannels, true); // NumChannels (1 = Mono)
  dataView.setUint32(24, sampleRate, true); // SampleRate
  dataView.setUint32(28, byteRate, true); // ByteRate
  dataView.setUint16(32, blockAlign, true); // BlockAlign
  dataView.setUint16(34, bitDepth, true); // BitsPerSample

  /* data sub-chunk */
  writeString(36, 'data');
  dataView.setUint32(40, dataSize, true);

  /* Write 16-bit PCM samples */
  let offset = 44;
  for (let c = 0; c < chunks.length; c++) {
    const chunk = chunks[c];
    for (let i = 0; i < chunk.length; i++) {
      const sample = Math.max(-1, Math.min(1, chunk[i]));
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      dataView.setInt16(offset, intSample, true);
      offset += 2;
    }
  }

  const BlobCtor = typeof Blob !== 'undefined' ? Blob : require('buffer').Blob;
  return new BlobCtor([arrayBuffer], { type: 'audio/wav' });
}

/**
 * Encodes an array of mono Float32Array PCM chunks into a standard 16-bit PCM WAV File object.
 */
export function pcmChunksToWavFile(
  chunks: Float32Array[],
  sampleRate: number,
  fileName: string = 'recorded_voice.wav'
): File {
  const blob = pcmChunksToWavBlob(chunks, sampleRate);
  if (typeof File !== 'undefined') {
    return new File([blob], fileName, { type: 'audio/wav' });
  }
  const f = blob as any;
  f.name = fileName;
  f.lastModified = Date.now();
  return f as File;
}

/**
 * Decodes any browser recording blob (WebM, OGG, MP4) and encodes it to a PCM WAV File object.
 */
export async function convertBlobToWavFile(
  inputBlob: Blob,
  fileName: string = 'recorded_voice.wav'
): Promise<File> {
  const arrayBuffer = await inputBlob.arrayBuffer();
  const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;

  if (!AudioCtx) {
    throw new Error('Web Audio API is not supported in this browser.');
  }

  const audioCtx = new AudioCtx();
  try {
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume().catch(() => {});
    }

    const audioBuffer = await new Promise<AudioBuffer>((resolve, reject) => {
      const bufferCopy = arrayBuffer.slice(0);
      let settled = false;
      try {
        const ret = audioCtx.decodeAudioData(
          bufferCopy,
          (decoded) => {
            if (!settled) {
              settled = true;
              resolve(decoded);
            }
          },
          (err) => {
            if (!settled) {
              settled = true;
              reject(err || new Error('Failed to decode audio data'));
            }
          }
        );
        if (ret && typeof (ret as any).then === 'function') {
          (ret as Promise<AudioBuffer>)
            .then((decoded) => {
              if (!settled) {
                settled = true;
                resolve(decoded);
              }
            })
            .catch((err) => {
              if (!settled) {
                settled = true;
                reject(err);
              }
            });
        }
      } catch (e) {
        if (!settled) {
          settled = true;
          reject(e);
        }
      }
    });

    const wavBlob = audioBufferToWav(audioBuffer);
    return new File([wavBlob], fileName, { type: 'audio/wav' });
  } finally {
    if (audioCtx.state !== 'closed') {
      await audioCtx.close().catch(() => {});
    }
  }
}
