import { Activity } from 'lucide-react';
import type { LufsMeterData } from '../services/lufs-meter-manager';

interface CompactLufsMeterProps {
  lufs: LufsMeterData | null;
  targetLUFS: number;
  isPlaying: boolean;
}

function fmt(lufs: number): string {
  if (!Number.isFinite(lufs) || lufs === -Infinity) return '—';
  return lufs.toFixed(1);
}

export function CompactLufsMeter({ lufs, targetLUFS, isPlaying }: CompactLufsMeterProps) {
  const integrated = lufs?.integrated ?? -Infinity;
  const onTarget =
    Number.isFinite(integrated) &&
    integrated !== -Infinity &&
    Math.abs(integrated - targetLUFS) <= 0.5;

  return (
    <div
      className="border rounded-lg p-4"
      style={{
        background: 'linear-gradient(180deg, #0f0f0f, #0a0a0a)',
        borderColor: '#2a2a2a',
      }}
    >
      <div className="flex items-center gap-2 mb-3">
        <Activity className="w-4 h-4 text-cyan-400" />
        <div>
          <div className="text-xs font-mono text-cyan-400 uppercase tracking-wider">
            BS.1770 Loudness
          </div>
          <div className="text-[9px] font-mono text-zinc-600">K-weighted · gated · same path as export</div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 text-center">
        <div>
          <div className="text-[9px] font-mono text-zinc-600 uppercase mb-1">Momentary</div>
          <div className={`text-lg font-mono font-bold ${isPlaying ? 'text-cyan-400' : 'text-zinc-600'}`}>
            {fmt(lufs?.momentary ?? -Infinity)}
          </div>
        </div>
        <div>
          <div className="text-[9px] font-mono text-zinc-600 uppercase mb-1">Short-term</div>
          <div className={`text-lg font-mono font-bold ${isPlaying ? 'text-purple-400' : 'text-zinc-600'}`}>
            {fmt(lufs?.shortTerm ?? -Infinity)}
          </div>
        </div>
        <div>
          <div className="text-[9px] font-mono text-zinc-600 uppercase mb-1">Integrated</div>
          <div
            className={`text-lg font-mono font-bold ${
              onTarget ? 'text-yellow-400' : isPlaying ? 'text-orange-400' : 'text-zinc-600'
            }`}
          >
            {fmt(integrated)}
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between text-[10px] font-mono">
        <span className="text-zinc-500">Target {targetLUFS} LUFS</span>
        {onTarget && isPlaying && (
          <span className="text-yellow-400">On target</span>
        )}
        {!isPlaying && (
          <span className="text-zinc-600">Play to measure</span>
        )}
      </div>
    </div>
  );
}
