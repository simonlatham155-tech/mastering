import { CheckCircle2, Target } from 'lucide-react';
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
  defaultStrength: number;
  onMatchStrengthChange: (strength: number) => void;
  onResetToDefault: () => void;
  isAnalyzing?: boolean;
  gearLabel?: string;
}

export function ReferenceMatchPanel({
  userProfile,
  referenceCurve,
  matchingGains,
  matchStrength,
  defaultStrength,
  onMatchStrengthChange,
  onResetToDefault,
  isAnalyzing = false,
  gearLabel,
}: ReferenceMatchPanelProps) {
  const ready = !!userProfile && !!referenceCurve;
  const isDefault = matchStrength === defaultStrength;

  return (
    <div className="rounded-lg border border-violet-500/20 bg-violet-950/10 p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-violet-300 uppercase tracking-wider">
            <Target className="w-3.5 h-3.5" />
            Tonal balance match
          </div>
          <p className="text-[10px] font-mono text-zinc-500 mt-1 max-w-md">
            Light correction on upload (default {defaultStrength}%). If the mix sounds muffled or
            hollow, slide to Off — then A/B with bypass.
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

      {ready && matchStrength > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
          <div className="flex items-center gap-2 text-[10px] font-mono text-emerald-300">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>
              <strong>Active</strong> — {matchStrength}% tonal correction on profile EQ
            </span>
          </div>
          {!isDefault && (
            <button
              type="button"
              onClick={onResetToDefault}
              className="text-[9px] font-mono text-zinc-400 hover:text-zinc-200 uppercase tracking-wider shrink-0"
            >
              Reset to {defaultStrength}%
            </button>
          )}
        </div>
      )}

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
              <span>Strength</span>
              <span className="text-violet-300">
                {matchStrength === 0 ? 'Off' : `${matchStrength}%`}
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
              <span>Default ({defaultStrength}%)</span>
              <span>Full</span>
            </div>
          </div>

          {matchingGains && matchStrength > 0 && (
            <DeltaVisualizer matchingGains={matchingGains} matchStrength={matchStrength} />
          )}
        </>
      )}
    </div>
  );
}
