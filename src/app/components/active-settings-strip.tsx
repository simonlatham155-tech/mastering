import { CheckCircle2, Circle } from 'lucide-react';
import type { GearProfileId } from './gear-selector';
import type { ExportPresetId } from '../data/export-presets';
import { getExportPreset } from '../data/export-presets';
import { gearProfiles } from './gear-selector';

type LogicMode = 'brickwall' | 'dynamics';

interface ActiveSettingsStripProps {
  gearProfile: GearProfileId;
  exportPreset: ExportPresetId;
  circuitDrive: number;
  logicMode: LogicMode;
  appliedTonalMatchStrength: number | null;
  hasInputTrim: boolean;
  inputTrimDB?: number;
}

function AppliedRow({ label, detail }: { label: string; detail: string }) {
  return (
    <div className="flex items-start gap-2 text-[10px] font-mono">
      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
      <div>
        <span className="text-emerald-300/90">{label}</span>
        <span className="text-zinc-500"> — {detail}</span>
      </div>
    </div>
  );
}

function PendingRow({ label, detail }: { label: string; detail: string }) {
  return (
    <div className="flex items-start gap-2 text-[10px] font-mono">
      <Circle className="w-3.5 h-3.5 text-zinc-600 shrink-0 mt-0.5" />
      <div>
        <span className="text-zinc-500">{label}</span>
        <span className="text-zinc-600"> — {detail}</span>
      </div>
    </div>
  );
}

export function ActiveSettingsStrip({
  gearProfile,
  exportPreset,
  circuitDrive,
  logicMode,
  appliedTonalMatchStrength,
  hasInputTrim,
  inputTrimDB,
}: ActiveSettingsStripProps) {
  const gearName = gearProfiles.find((p) => p.id === gearProfile)?.name ?? gearProfile;
  const preset = getExportPreset(exportPreset);
  const logicLabel = logicMode === 'brickwall' ? 'Pressure' : 'Flow';

  return (
    <div
      className="mb-6 rounded-lg border border-emerald-500/25 bg-emerald-950/10 px-4 py-3"
      role="status"
      aria-live="polite"
    >
      <div className="text-[10px] font-mono text-emerald-400 uppercase tracking-[0.2em] mb-2">
        Active on your master
      </div>
      <p className="text-[10px] font-mono text-zinc-500 mb-3 leading-relaxed">
        These settings are applied automatically when you upload. Preview uses them immediately —
        no extra Apply step unless you use optional tonal match below (expert).
      </p>
      <div className="space-y-1.5">
        <AppliedRow label="Gear profile" detail={`${gearName} (genre EQ + chain)`} />
        <AppliedRow
          label="Delivery target"
          detail={`${preset.name} · ${preset.lufs} LUFS · ${preset.ceiling} dBTP ceiling`}
        />
        <AppliedRow label="Warmth" detail={`${circuitDrive}% THD`} />
        <AppliedRow label="Dynamics mode" detail={logicLabel} />
        {hasInputTrim && inputTrimDB != null && (
          <AppliedRow label="Input headroom" detail={`${inputTrimDB.toFixed(1)} dB trim (auto)`} />
        )}
        {appliedTonalMatchStrength != null && appliedTonalMatchStrength > 0 ? (
          <AppliedRow
            label="Tonal balance match"
            detail={`${appliedTonalMatchStrength}% applied to profile EQ (expert)`}
          />
        ) : (
          <PendingRow label="Tonal balance match" detail="not applied — genre EQ only (optional in expert)" />
        )}
      </div>
    </div>
  );
}
