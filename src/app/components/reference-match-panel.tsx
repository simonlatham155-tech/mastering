import { Wand2, Target } from 'lucide-react';
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
  onMatchStrengthChange: (strength: number) => void;
  onApplyMatching: () => void;
  isAnalyzing?: boolean;
  gearLabel?: string;
}

export function ReferenceMatchPanel({
  userProfile,
  referenceCurve,
  matchingGains,
  matchStrength,
  onMatchStrengthChange,
  onApplyMatching,
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
            Compares your upload to the genre reference curve, then folds corrections into the
            3-band profile EQ. Does not replace export loudness staging.
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
              <span className="text-violet-300">{matchStrength}%</span>
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
              <span>Subtle</span>
              <span>Balanced</span>
              <span>Full</span>
            </div>
          </div>

          {matchingGains && (
            <DeltaVisualizer matchingGains={matchingGains} matchStrength={matchStrength} />
          )}

          <Button
            onClick={onApplyMatching}
            disabled={!matchingGains || matchStrength === 0}
            className="w-full bg-violet-700 hover:bg-violet-600"
          >
            <Wand2 className="w-4 h-4 mr-2" />
            Apply to profile EQ
          </Button>
        </>
      )}
    </div>
  );
}
