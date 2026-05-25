/**
 * EXPORT PRESETS
 * 
 * Delivery targets only. No genre, no DSP style.
 * Answer: "Where am I delivering this?"
 */

export type ExportPresetId = 'spotify' | 'club' | 'extreme';

export interface ExportPreset {
  id: ExportPresetId;
  name: string;
  description: string;
  lufs: number;        // Target integrated LUFS
  ceiling: number;     // dBTP ceiling
  color: string;       // UI color
}

export const EXPORT_PRESETS: Record<ExportPresetId, ExportPreset> = {
  spotify: {
    id: 'spotify',
    name: 'Spotify Standard',
    description: 'Streaming optimized, preserves dynamics',
    lufs: -14,
    ceiling: -1.0,
    color: '#1DB954'
  },
  
  club: {
    id: 'club',
    name: 'Club / Festival',
    description: 'High-energy sound systems, competitive loudness',
    lufs: -8,
    ceiling: -0.5,
    color: '#FF9FF3'
  },
  
  extreme: {
    id: 'extreme',
    name: 'Extreme / Hardstyle',
    description: 'Maximum loudness (may back off if GR exceeded)',
    lufs: -6,
    ceiling: -0.3,
    color: '#FF4444'
  }
};

export function getExportPreset(id: ExportPresetId): ExportPreset {
  return EXPORT_PRESETS[id];
}

export function getExportPresetList(): ExportPreset[] {
  return Object.values(EXPORT_PRESETS);
}
