import type { ExportPresetId } from '../data/export-presets';

export function computeAutoInputTrimDB(peakLevelDB: number): number | undefined {
  const TARGET_HEADROOM = -6;
  const TRIM_THRESHOLD = -3;
  if (peakLevelDB > TRIM_THRESHOLD) {
    return TARGET_HEADROOM - peakLevelDB;
  }
  return undefined;
}

export function masterExportFilename(
  originalFilename: string,
  presetId: ExportPresetId
): string {
  const base = originalFilename.replace(/\.[^/.]+$/, '') || 'track';
  return `${base}_${presetId}_master.wav`;
}

export function batchZipFilename(presetId: ExportPresetId): string {
  const stamp = new Date().toISOString().slice(0, 10);
  return `latham_album_${presetId}_${stamp}.zip`;
}
