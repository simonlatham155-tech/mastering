import { motion } from 'motion/react';
import { Info } from 'lucide-react';

interface GenreProfileInfoProps {
  gearProfile: string;
}

interface ProfileSettings {
  name: string;
  description: string;
  characteristics: {
    saturation: string;
    compression: string;
    frequency: string;
    target: string;
  };
}

const profileData: Record<string, ProfileSettings> = {
  realprog: {
    name: 'Real Progressive',
    description: 'Clean, emotional, wide dynamics',
    characteristics: {
      saturation: 'Light (0.8x) - Preserves transients',
      compression: '2:1 ratio - Gentle glue',
      frequency: '+1.5dB low shelf, air boost',
      target: 'Heritage-friendly, high DR'
    }
  },
  modernprog: {
    name: 'Modern Progressive',
    description: 'Aggressive, punchy, competition loudness',
    characteristics: {
      saturation: 'Heavy (1.1x) - Adds aggression',
      compression: '4:1 ratio - Strong control',
      frequency: 'Mid scoop, presence boost',
      target: 'Festival-ready, -8 LUFS'
    }
  },
  trance: {
    name: 'Trance',
    description: 'Bright, clear, uplifting energy',
    characteristics: {
      saturation: 'Moderate (0.9x) - Clean clarity',
      compression: '3:1 ratio - Balanced punch',
      frequency: 'High bias, extended highs',
      target: 'Club standard, -10 LUFS'
    }
  },
  house: {
    name: 'House',
    description: 'Warm, balanced, groove-focused',
    characteristics: {
      saturation: 'Balanced (1.0x) - Natural warmth',
      compression: '2.5:1 ratio - Groove retention',
      frequency: 'Flat response, tape head bump',
      target: 'Streaming ready, -12 LUFS'
    }
  },
  techno: {
    name: 'Techno',
    description: 'Dark, heavy, industrial weight',
    characteristics: {
      saturation: 'Maximum (1.2x) - Gritty texture',
      compression: '5:1 ratio - Aggressive glue',
      frequency: 'Low bias, dark character',
      target: 'Warehouse power, -7 LUFS'
    }
  },
  rnb: {
    name: 'R&B / Hip-Hop',
    description: 'Smooth, minimal processing, vocal clarity',
    characteristics: {
      saturation: 'Minimal (0.7x) - Clean & modern',
      compression: '1.5:1 ratio - Transparent',
      frequency: 'High fidelity, vocal presence',
      target: 'Streaming optimized, -14 LUFS'
    }
  },
  tape: {
    name: 'Vintage Tape',
    description: 'Maximum analog color & warmth',
    characteristics: {
      saturation: 'Extreme (1.5x) - Vintage vibe',
      compression: '3:1 ratio - Tape compression',
      frequency: 'Head bump, warmth, highs rolled',
      target: 'Heritage aesthetic, variable'
    }
  }
};

export function GenreProfileInfo({ gearProfile }: GenreProfileInfoProps) {
  const profile = profileData[gearProfile];

  if (!profile) return null;

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="border-2 rounded-lg p-4"
      style={{
        borderColor: '#2a2a2a',
        background: 'linear-gradient(180deg, #1a1a1a, #0f0f0f)',
        boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.6)'
      }}
    >
      <div className="flex items-start gap-3">
        <div className="p-2 rounded bg-cyan-500/10 border border-cyan-500/30">
          <Info className="w-4 h-4 text-cyan-400" />
        </div>
        
        <div className="flex-1">
          <div className="flex items-baseline gap-2 mb-2">
            <div className="text-xs font-mono text-cyan-300 uppercase tracking-wider">
              {profile.name} Profile
            </div>
            <div className="text-[9px] font-mono text-zinc-600">
              {profile.description}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-[8px] font-mono text-zinc-600 uppercase tracking-wider mb-1">
                Saturation Amount
              </div>
              <div className="text-[9px] font-mono text-zinc-400">
                {profile.characteristics.saturation}
              </div>
            </div>

            <div>
              <div className="text-[8px] font-mono text-zinc-600 uppercase tracking-wider mb-1">
                Compression Ratio
              </div>
              <div className="text-[9px] font-mono text-zinc-400">
                {profile.characteristics.compression}
              </div>
            </div>

            <div>
              <div className="text-[8px] font-mono text-zinc-600 uppercase tracking-wider mb-1">
                Frequency Response
              </div>
              <div className="text-[9px] font-mono text-zinc-400">
                {profile.characteristics.frequency}
              </div>
            </div>

            <div>
              <div className="text-[8px] font-mono text-zinc-600 uppercase tracking-wider mb-1">
                Target Loudness
              </div>
              <div className="text-[9px] font-mono text-zinc-400">
                {profile.characteristics.target}
              </div>
            </div>
          </div>

          <div className="mt-3 pt-3 border-t border-zinc-800">
            <div className="text-[9px] font-mono text-zinc-600 leading-relaxed">
              <span className="text-amber-400 font-semibold">Note:</span> These settings use Web Audio API nodes 
              (WaveShaper, BiquadFilter, DynamicsCompressor). This is algorithmic processing, not ML-based mastering.
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
