import { CheckCircle2 } from 'lucide-react';
import type { GearProfileId } from './gear-selector';
import type { ExportPresetId } from '../data/export-presets';
import { getExportPreset } from '../data/export-presets';
import { gearProfiles } from './gear-selector';
import type { ProDynamicsSettings, SSLGlueMode } from './pro-dynamics-panel';

type LogicMode = 'brickwall' | 'dynamics';

interface ActiveSettingsStripProps {
  gearProfile: GearProfileId;
  exportPreset: ExportPresetId;
  circuitDrive: number;
  logicMode: LogicMode;
  tonalMatchStrength: number;
  proDynamics: ProDynamicsSettings;
  hqMode: boolean;
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

function sslGlueLabel(mode: SSLGlueMode): string {
  if (mode === 'gentle') return 'Gentle glue';
  if (mode === 'firm') return 'Firm glue';
  return 'Auto glue';
}

export function ActiveSettingsStrip({
  gearProfile,
  exportPreset,
  circuitDrive,
  logicMode,
  tonalMatchStrength,
  proDynamics,
  hqMode,
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
        Full quality stack is applied on upload — genre chain, staging, tonal match, and delivery
        prep. Open <span className="text-zinc-400">Pro controls</span> below to adjust anything.
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
        <AppliedRow
          label="Export staging"
          detail={proDynamics.autoStageOnExport ? 'Auto-staging to target LUFS' : 'Manual output level'}
        />
        <AppliedRow label="Bus glue" detail={sslGlueLabel(proDynamics.sslGlue)} />
        {proDynamics.forceMonoBass && (
          <AppliedRow
            label="Mono bass"
            detail={`Below ${proDynamics.monoBassHz} Hz`}
          />
        )}
        <AppliedRow
          label="Tonal balance match"
          detail={
            tonalMatchStrength > 0
              ? `${tonalMatchStrength}% on profile EQ`
              : 'Off (genre EQ only)'
          }
        />
        <AppliedRow
          label="True-peak mode"
          detail={hqMode ? 'HQ oversampling (reference-grade meters)' : 'Standard peak detect'}
        />
      </div>
    </div>
  );
}
