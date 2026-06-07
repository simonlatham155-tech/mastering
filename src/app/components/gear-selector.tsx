import { useState } from 'react';
import * as Select from '@radix-ui/react-select';
import { ChevronDown, Check } from 'lucide-react';
import { GENRE_PRESETS, GenrePreset, getGenreCategories } from '../data/genre-presets';

export type GearProfileId = 
  // House Family
  | 'deephouse' 
  | 'techhouse' 
  | 'progressivehouse' 
  | 'house'
  // Techno Family
  | 'techno' 
  | 'melodictechno' 
  | 'hardtechno'
  // Trance Family
  | 'trance' 
  | 'psytrance' 
  | 'uplifting'
  // Bass Music
  | 'dnb' 
  | 'dubstep' 
  | 'trap' 
  | 'futurebass'
  // Hard Dance
  | 'hardstyle' 
  | 'hardcore'
  // UK Styles
  | 'ukgarage' 
  | 'breakbeat'
  // Legacy
  | 'rnb' 
  | 'tape';

// UI-only interface (for backward compatibility with App.tsx)
export interface GearProfile {
  id: GearProfileId;
  name: string;
  description: string;
  category: string;
  // Display-only values (mapped from genre preset)
  targetLUFS?: number;  // DEPRECATED: Now comes from export preset
  lowShelfBoost: number;
  highShelfBoost: number;
  midRangeAdjust: number;
  stereoWidth: number; // 0-100 (UI display only)
  saturationAmount: number; // 0-100 (UI display only)
}

// Convert genre preset to UI display format
function genrePresetToGearProfile(preset: GenrePreset): GearProfile {
  return {
    id: preset.id as GearProfileId,
    name: preset.name,
    description: preset.description,
    category: preset.category,
    lowShelfBoost: preset.biases.bassTilt,
    highShelfBoost: preset.biases.airTilt,
    midRangeAdjust: preset.biases.mudCut,
    stereoWidth: Math.round(preset.biases.width * 100), // 0.75 → 75%
    saturationAmount: Math.round(preset.biases.colorAmount * 100), // 0.6 → 60%
  };
}

// Build UI profiles from genre presets
const gearProfiles: GearProfile[] = Object.values(GENRE_PRESETS).map(genrePresetToGearProfile);

interface GearSelectorProps {
  selectedProfile: GearProfileId;
  onChange: (profile: GearProfileId) => void;
  variant?: 'default' | 'compact';
}

export function GearSelector({ selectedProfile, onChange, variant = 'default' }: GearSelectorProps) {
  const profile = gearProfiles.find((prof) => prof.id === selectedProfile);

  // Group profiles by category
  const categories = Array.from(new Set(gearProfiles.map(p => p.category)));

  return (
    <div className="flex flex-col gap-3">
      <div className="text-xs font-mono text-zinc-500 tracking-[0.3em] uppercase">Gear Profile</div>

      <Select.Root value={selectedProfile} onValueChange={(value) => onChange(value as GearProfileId)}>
        <Select.Trigger 
          className="w-full border rounded-md px-4 py-3 flex items-center justify-between hover:border-zinc-600 transition-colors group"
          style={{
            background: 'linear-gradient(180deg, #1a1a1a, #0f0f0f)',
            borderColor: '#2a2a2a',
            boxShadow: `
              inset 0 1px 0 rgba(255,255,255,0.03),
              0 2px 4px rgba(0,0,0,0.3)
            `
          }}
        >
          <Select.Value>
            <div className="flex flex-col items-start gap-1">
              <div className="text-xs font-mono text-zinc-300 tracking-wider uppercase">{profile?.name}</div>
              <div className="text-xs text-zinc-600 font-mono">{profile?.description}</div>
            </div>
          </Select.Value>
          <Select.Icon>
            <ChevronDown className="w-3 h-3 text-zinc-500 group-hover:text-zinc-300 transition-colors" />
          </Select.Icon>
        </Select.Trigger>

        <Select.Portal>
          <Select.Content 
            position="popper"
            sideOffset={5}
            className="border rounded-lg overflow-hidden w-[--radix-select-trigger-width] max-h-[500px]"
            style={{
              background: 'linear-gradient(180deg, #1a1a1a, #0f0f0f)',
              borderColor: '#2a2a2a',
              boxShadow: '0 8px 24px rgba(0,0,0,0.8)',
              zIndex: 9999
            }}
          >
            <Select.Viewport className="p-1">
              {categories.map((category) => (
                <Select.Group key={category}>
                  <Select.Label className="px-3 py-2 text-xs font-mono text-amber-500/60 uppercase tracking-wider">
                    {category}
                  </Select.Label>
                  {gearProfiles
                    .filter(prof => prof.category === category)
                    .map((prof) => (
                      <Select.Item
                        key={prof.id}
                        value={prof.id}
                        className="relative px-4 py-3 cursor-pointer hover:bg-zinc-800/70 transition-colors outline-none rounded data-[highlighted]:bg-zinc-800/70"
                      >
                        <Select.ItemText>
                          <div className="flex flex-col gap-1">
                            <div className="text-xs font-mono text-zinc-300 tracking-wider uppercase">{prof.name}</div>
                            <div className="text-xs text-zinc-600 font-mono">{prof.description}</div>
                          </div>
                        </Select.ItemText>
                        <Select.ItemIndicator className="absolute right-2 top-1/2 -translate-y-1/2">
                          <Check className="w-3 h-3 text-amber-500" />
                        </Select.ItemIndicator>
                      </Select.Item>
                    ))}
                </Select.Group>
              ))}
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>

      {variant === 'default' && (
      <div 
        className="border rounded px-3 py-2"
        style={{
          background: 'rgba(0,0,0,0.4)',
          borderColor: '#2a2a2a',
          boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.5)'
        }}
      >
        <div className="text-xs text-zinc-600 uppercase tracking-[0.3em] mb-2 font-mono">Active Profile</div>
        <div className="space-y-1">
          <div className="text-sm text-amber-500/80 font-mono leading-relaxed mb-2">{profile?.description}</div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1">
            <div className="text-sm text-zinc-600 font-mono">Width: <span className="text-purple-400">{profile?.stereoWidth}%</span></div>
            <div className="text-sm text-zinc-600 font-mono">Color: <span className="text-amber-400">{profile?.saturationAmount}%</span></div>
            <div className="text-sm text-zinc-600 font-mono">Low: <span className="text-emerald-400">{profile?.lowShelfBoost > 0 ? '+' : ''}{profile?.lowShelfBoost.toFixed(1)}dB</span></div>
            <div className="text-sm text-zinc-600 font-mono">High: <span className="text-blue-400">{profile?.highShelfBoost > 0 ? '+' : ''}{profile?.highShelfBoost.toFixed(1)}dB</span></div>
          </div>
        </div>
      </div>
      )}
    </div>
  );
}

// Export the profiles for use in AI engine
export { gearProfiles };