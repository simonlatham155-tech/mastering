import { AlertCircle, CheckCircle2, Target, Wand2 } from 'lucide-react';
import { Button } from './ui/button';
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
  appliedStrength: number | null;
  onMatchStrengthChange: (strength: number) => void;
  onApplyMatching: () => void;
  onResetMatching: () => void;
  isAnalyzing?: boolean;
  gearLabel?: string;
}

export function ReferenceMatchPanel({
  userProfile,
  referenceCurve,
  matchingGains,
  matchStrength,
  appliedStrength,
  onMatchStrengthChange,
  onApplyMatching,
  onResetMatching,
  isAnalyzing = false,
  gearLabel,
}: ReferenceMatchPanelProps) {
  const ready = !!userProfile && !!referenceCurve;
  const isApplied = appliedStrength != null && appliedStrength > 0;
  const isPending =
    ready && matchStrength > 0 && (appliedStrength == null || appliedStrength !== matchStrength);

  return (
    <div className="rounded-lg border border-violet-500/20 bg-violet-950/10 p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-violet-300 uppercase tracking-wider">
            <Target className="w-3.5 h-3.5" />
            Tonal balance match
            <span className="text-[9px] text-zinc-600 normal-case tracking-normal">(optional)</span>
          </div>
          <p className="text-[10px] font-mono text-zinc-500 mt-1 max-w-md">
            Preview corrections with the slider, then click{' '}
            <span className="text-violet-300">Apply</span> to commit them to profile EQ. Until
            then, only the genre preset is active.
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

      {isApplied && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
          <div className="flex items-center gap-2 text-[10px] font-mono text-emerald-300">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>
              <strong>Applied</strong> — {appliedStrength}% tonal correction is live on profile EQ
            </span>
          </div>
          <button
            type="button"
            onClick={onResetMatching}
            className="text-[9px] font-mono text-zinc-400 hover:text-zinc-200 uppercase tracking-wider shrink-0"
          >
            Remove
          </button>
        </div>
      )}

      {isPending && (
        <div className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[10px] font-mono text-amber-200">
          <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
          <span>
            <strong>Preview only</strong> — {matchStrength}% shown below is not applied yet. Click
            Apply to commit.
          </span>
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
              <span>Preview strength</span>
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
              <span>Subtle (~30%)</span>
              <span>Full</span>
            </div>
          </div>

          {matchingGains && matchStrength > 0 && (
            <DeltaVisualizer matchingGains={matchingGains} matchStrength={matchStrength} />
          )}

          <Button
            onClick={onApplyMatching}
            disabled={!matchingGains || matchStrength === 0}
            className="w-full bg-violet-700 hover:bg-violet-600 disabled:opacity-40"
          >
            <Wand2 className="w-4 h-4 mr-2" />
            {matchStrength === 0
              ? 'Set strength above 0 to apply'
              : `Apply ${matchStrength}% to profile EQ`}
          </Button>

          {matchStrength === 0 && !isApplied && (
            <p className="text-[10px] font-mono text-zinc-600 text-center">
              Genre EQ from your gear profile is already active — no tonal match applied.
            </p>
          )}
        </>
      )}
    </div>
  );
}
