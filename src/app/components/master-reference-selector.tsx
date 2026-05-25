import { motion } from 'motion/react';

type MasterReference = 'spotify' | 'club';

interface MasterReferenceConfig {
  id: MasterReference;
  name: string;
  lufs: number;
  truePeak: number;
  color: string;
}

const masterReferences: MasterReferenceConfig[] = [
  {
    id: 'spotify',
    name: 'Spotify Standard',
    lufs: -14,
    truePeak: -1.0,
    color: '#1DB954'
  },
  {
    id: 'club',
    name: 'Club/Festival',
    lufs: -8,
    truePeak: -0.1,
    color: '#FF9FF3'
  }
];

interface MasterReferenceSelectorProps {
  selected: MasterReference;
  onChange: (reference: MasterReference) => void;
}

export function MasterReferenceSelector({ selected, onChange }: MasterReferenceSelectorProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4">
        {masterReferences.map((ref) => (
          <button
            key={ref.id}
            onClick={() => onChange(ref.id)}
            className={`relative px-6 py-4 rounded-lg border-2 transition-all ${
              selected === ref.id
                ? 'border-opacity-100 bg-opacity-10'
                : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700'
            }`}
            style={{
              borderColor: selected === ref.id ? ref.color : undefined,
              backgroundColor: selected === ref.id ? `${ref.color}15` : undefined,
              boxShadow: selected === ref.id 
                ? `0 0 20px ${ref.color}40, inset 0 0 16px ${ref.color}20`
                : 'none'
            }}
          >
            <div className="flex flex-col gap-2">
              <div 
                className="font-mono text-sm uppercase tracking-wider"
                style={{ 
                  color: selected === ref.id ? ref.color : '#71717a'
                }}
              >
                {ref.name}
              </div>
              <div className="flex items-baseline gap-3">
                <div className="flex items-baseline gap-1">
                  <span 
                    className="text-lg font-mono font-bold"
                    style={{ color: selected === ref.id ? ref.color : '#52525b' }}
                  >
                    {ref.lufs}
                  </span>
                  <span className="text-[9px] font-mono text-zinc-600 uppercase">LUFS</span>
                </div>
                <span className="text-zinc-700">•</span>
                <div className="flex items-baseline gap-1">
                  <span 
                    className="text-sm font-mono"
                    style={{ color: selected === ref.id ? ref.color : '#52525b' }}
                  >
                    {ref.truePeak}
                  </span>
                  <span className="text-[9px] font-mono text-zinc-600 uppercase">dBTP</span>
                </div>
              </div>
            </div>

            {selected === ref.id && (
              <motion.div
                layoutId="reference-indicator"
                className="absolute inset-0 border-2 rounded-lg pointer-events-none"
                style={{
                  borderColor: ref.color,
                  boxShadow: `0 0 24px ${ref.color}60`
                }}
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              />
            )}
          </button>
        ))}
      </div>

      {/* Technical Info */}
      <div 
        className="px-4 py-3 rounded-md"
        style={{
          background: 'rgba(0,0,0,0.4)',
          border: '1px solid rgba(255,255,255,0.05)',
        }}
      >
        <div className="text-[9px] font-mono text-zinc-600 uppercase tracking-wider mb-1">
          ITU-R BS.1770-4 Metering
        </div>
        <div className="text-[10px] font-mono text-zinc-500">
          K-Weighted • Dual-gating (-70 LUFS absolute, -10 LU relative) • 400ms momentary integration
        </div>
      </div>
    </div>
  );
}

export type { MasterReference };
