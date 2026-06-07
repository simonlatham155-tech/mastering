import { Target } from 'lucide-react';
import { Slider } from './ui/slider';
import { DeltaVisualizer } from './delta-visualizer';
import type { ReferenceCurve } from '../data/reference-curves';
import type { SpectralProfile } from '../services/spectral-analyzer';
import type { MatchingGains } from '../services/reference-matching-controller';

interface ReferenceMatchPanelProps {
  userProfile: SpectralProfile | null;
  referenceCurve: ReferenceCurve | null;
  matchingGains: MatchingGains | null;
  matchStrength: number;
  onMatchStrengthChange: (strength: number) => void;
  isAnalyzing?: boolean;
  gearLabel?: string;
}

export function ReferenceMatchPanel({
  userProfile,
  referenceCurve,
  matchingGains,
  matchStrength,
  onMatchStrengthChange,
  isAnalyzing = false,
  gearLabel,
}: ReferenceMatchPanelProps) {
  const ready = !!userProfile && !!referenceCurve;

  return (
    <div className="rounded-lg border border-violet-500/20 bg-violet-950/10 p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-violet-300 uppercase tracking-wider">
            <Target className="w-3.5 h-3.5" />
            Tonal balance match
          </div>
          <p className="text-[10px] font-mono text-zinc-500 mt-1 max-w-md">
            Optional fine-tune on top of the genre preset. 0% = genre only. Move the slider to
            apply corrections live — no separate Apply step.
          </p>
        </div>
        {referenceCurve && (
          <div className="text-right text-[9px] font-mono text-zinc-500">
            <div className="text-violet-300">{referenceCurve.name}</div>
            {gearLabel && <div>{gearLabel}</div>}
            <div>{referenceCurve.targetLUFS} LUFS ref</div>
          </div>
        )}
      </div>

      {!ready && (
        <div className="text-xs font-mono text-zinc-500 py-6 text-center border border-dashed border-zinc-800 rounded">
          {isAnalyzing
            ? 'Analyzing spectral balance…'
            : 'Spectral balance will appear here after upload analysis completes.'}
        </div>
      )}

      {ready && (
        <>
          <div>
            <div className="flex justify-between text-[10px] font-mono text-zinc-500 mb-2">
              <span>Match strength</span>
              <span className="text-violet-300">
                {matchStrength === 0 ? 'Off (genre only)' : `${matchStrength}%`}
              </span>
            </div>
            <Slider
              value={[matchStrength]}
              min={0}
              max={100}
              step={5}
              onValueChange={(v) => onMatchStrengthChange(v[0])}
              className="w-full"
            />
            <div className="flex justify-between text-[8px] font-mono text-zinc-600 mt-1">
              <span>Off</span>
              <span>Subtle (~30%)</span>
              <span>Full</span>
            </div>
          </div>

          {matchingGains && matchStrength > 0 && (
            <DeltaVisualizer matchingGains={matchingGains} matchStrength={matchStrength} />
          )}

          {matchStrength === 0 && (
            <p className="text-[10px] font-mono text-zinc-600 text-center py-2">
              Genre EQ is active. Raise strength only if you want extra tonal correction.
            </p>
          )}
        </>
      )}
    </div>
  );
}
