/** Encode an AudioBuffer as a PCM WAV Blob (16- or 24-bit integer). */

export type WavBitDepth = 16 | 24;

export interface EncodeWavOptions {
  bitDepth?: WavBitDepth;
}

function writeString(view: DataView, offset: number, value: string): void {
  for (let i = 0; i < value.length; i++) {
    view.setUint8(offset + i, value.charCodeAt(i));
  }
}

function clampSample(sample: number): number {
  return Math.max(-1, Math.min(1, sample));
}

export function encodeWavBlob(buffer: AudioBuffer, options: EncodeWavOptions = {}): Blob {
  const bitDepth = options.bitDepth ?? 24;
  const bytesPerSample = bitDepth / 8;
  const numberOfChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const blockAlign = numberOfChannels * bytesPerSample;
  const dataBytes = buffer.length * blockAlign;
  const arrayBuffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(arrayBuffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numberOfChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataBytes, true);

  let offset = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let channel = 0; channel < numberOfChannels; channel++) {
      const sample = clampSample(buffer.getChannelData(channel)[i]);

      if (bitDepth === 16) {
        const int16 = Math.round(sample * 0x7fff);
        view.setInt16(offset, int16, true);
        offset += 2;
      } else {
        const int24 = Math.round(sample * 0x7fffff);
        const clamped = Math.max(-0x800000, Math.min(0x7fffff, int24));
        const unsigned = clamped < 0 ? clamped + 0x1000000 : clamped;
        view.setUint8(offset, unsigned & 0xff);
        view.setUint8(offset + 1, (unsigned >> 8) & 0xff);
        view.setUint8(offset + 2, (unsigned >> 16) & 0xff);
        offset += 3;
      }
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}
