import { Cpu, Disc3, Radio, Sliders, Zap } from 'lucide-react';
import type { ProcessingPlan } from '../data/preset-resolution';
import type { RackStageOverrides } from '../services/app-processing-context';

interface RackStageControlsProps {
  plan: ProcessingPlan;
  overrides: RackStageOverrides;
  onChange: (overrides: RackStageOverrides) => void;
}

type StageKey = keyof RackStageOverrides;

interface StageDefinition {
  key: StageKey;
  name: string;
  detail: string;
  active: (plan: ProcessingPlan) => boolean;
  icon: typeof Zap;
}

const STAGES: StageDefinition[] = [
  {
    key: 'transformer',
    name: 'Transformer',
    detail: 'Transformer-style harmonic colour',
    active: (plan) => plan.genreBehavior.useTransformer,
    icon: Zap,
  },
  {
    key: 'tape',
    name: 'Tape',
    detail: 'Tape saturation and head-bump stage',
    active: (plan) => plan.genreBehavior.useTape,
    icon: Radio,
  },
  {
    key: 'multiband',
    name: 'Multiband',
    detail: 'Four-band dynamics processor',
    active: (plan) => plan.genreBehavior.useMultiband,
    icon: Sliders,
  },
  {
    key: 'midSide',
    name: 'M/S matrix',
    detail: 'Stereo width and mono-bass routing',
    active: (plan) => plan.genreBehavior.useMidSide,
    icon: Disc3,
  },
  {
    key: 'clipper',
    name: 'Clipper',
    detail: 'Pressure-mode transient stage',
    active: (plan) =>
      plan.logicMode === 'brickwall' && plan.genreBehavior.useClipper,
    icon: Cpu,
  },
];

export function RackStageControls({
  plan,
  overrides,
  onChange,
}: RackStageControlsProps) {
  const setOverride = (key: StageKey, value: boolean | null) => {
    onChange({ ...overrides, [key]: value });
  };

  return (
    <div className="space-y-3">
      <div>
        <div className="text-sm font-mono text-zinc-300 uppercase tracking-[0.2em]">
          Stage routing
        </div>
        <p className="text-[10px] font-mono text-zinc-600 mt-1 leading-relaxed">
          Each switch controls the real DSP route. Strategy means the selected genre decides;
          a manual change remains visible until reset.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {STAGES.map((stage) => {
          const active = stage.active(plan);
          const manual = overrides[stage.key] != null;
          const Icon = stage.icon;

          return (
            <div
              key={stage.key}
              className="rounded-lg border border-zinc-800 bg-black/25 px-3 py-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2">
                  <Icon
                    className={`w-4 h-4 mt-0.5 ${
                      active ? 'text-cyan-400' : 'text-zinc-600'
                    }`}
                  />
                  <div>
                    <div className="text-xs font-mono text-zinc-300">{stage.name}</div>
                    <div className="text-[9px] font-mono text-zinc-600 mt-0.5">
                      {stage.detail}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={active}
                  aria-label={`${stage.name} ${active ? 'active' : 'bypassed'}`}
                  onClick={() => setOverride(stage.key, !active)}
                  className={`shrink-0 rounded-full border px-2.5 py-1 text-[9px] font-mono uppercase tracking-wider transition-colors ${
                    active
                      ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300'
                      : 'border-zinc-700 bg-zinc-900 text-zinc-500'
                  }`}
                >
                  {active ? 'Active' : 'Bypassed'}
                </button>
              </div>

              <div className="mt-2 min-h-4">
                {manual ? (
                  <button
                    type="button"
                    onClick={() => setOverride(stage.key, null)}
                    className="text-[9px] font-mono text-amber-400 hover:text-amber-300"
                  >
                    Manual override · reset to strategy
                  </button>
                ) : (
                  <span className="text-[9px] font-mono text-zinc-700">
                    Following genre strategy
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {plan.logicMode !== 'brickwall' && plan.genreBehavior.useClipper && (
        <p className="text-[10px] font-mono text-amber-400/80">
          Clipper is armed by the strategy but remains bypassed in Flow mode.
        </p>
      )}
    </div>
  );
}
