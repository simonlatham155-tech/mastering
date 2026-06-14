import { SlidersHorizontal } from 'lucide-react';
import {
  RangeSliderWithSuggested,
  SuggestedButtonGroup,
} from './range-slider-with-suggested';
import { getSuggestedProDynamics } from '../utils/suggested-settings';
import type { GearProfileId } from './gear-selector';

export type SSLGlueMode = 'auto' | 'gentle' | 'firm';

export interface ProDynamicsSettings {
  /** Manual input trim in dB; null = use auto headroom from analysis */
  inputTrimDB: number | null;
  /** Post-chain output trim in dB */
  outputTrimDB: number;
  /** Limiter ceiling dBTP; null = delivery preset default */
  limiterCeilingDBTP: number | null;
  sslGlue: SSLGlueMode;
  forceMonoBass: boolean | null;
  monoBassHz: number;
  /** Iteratively trim output on export until integrated LUFS hits target */
  autoStageOnExport: boolean;
  /** Gently nudge output trim during playback toward target */
  autoStageLive: boolean;
}

export const DEFAULT_PRO_DYNAMICS: ProDynamicsSettings = {
  inputTrimDB: null,
  outputTrimDB: 0,
  limiterCeilingDBTP: null,
  sslGlue: 'auto',
  forceMonoBass: null,
  monoBassHz: 120,
  autoStageOnExport: true,
  autoStageLive: false,
};

interface ProDynamicsPanelProps {
  settings: ProDynamicsSettings;
  onChange: (settings: ProDynamicsSettings) => void;
  gearProfile: GearProfileId;
  autoInputTrimDB?: number;
  presetCeilingDBTP: number;
}

function update<K extends keyof ProDynamicsSettings>(
  settings: ProDynamicsSettings,
  key: K,
  value: ProDynamicsSettings[K]
): ProDynamicsSettings {
  return { ...settings, [key]: value };
}

export function ProDynamicsPanel({
  settings,
  onChange,
  gearProfile,
  autoInputTrimDB,
  presetCeilingDBTP,
}: ProDynamicsPanelProps) {
  const suggested = getSuggestedProDynamics(gearProfile, presetCeilingDBTP, autoInputTrimDB);
  const effectiveInputTrim = settings.inputTrimDB ?? autoInputTrimDB ?? 0;
  const effectiveCeiling = settings.limiterCeilingDBTP ?? presetCeilingDBTP;
  const effectiveForceMonoBass = settings.forceMonoBass === true;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <SlidersHorizontal className="w-4 h-4 text-purple-400" />
        <div>
          <div className="text-sm font-mono text-zinc-300 uppercase tracking-[0.2em]">
            Level &amp; dynamics
          </div>
          <div className="text-[10px] font-mono text-zinc-600 mt-0.5">
            Staging, bus glue, ceiling override — loudness meters are above
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Input trim */}
        <div>
          <div className="flex justify-between items-baseline mb-1">
            <span className="text-xs font-mono text-zinc-600">Input trim</span>
            <span className="text-sm font-mono text-amber-400">
              {effectiveInputTrim.toFixed(1)} dB
              {settings.inputTrimDB == null && autoInputTrimDB != null && (
                <span className="text-zinc-600 text-[10px] ml-1">(auto)</span>
              )}
            </span>
          </div>
          <RangeSliderWithSuggested
            min={-12}
            max={0}
            step={0.5}
            value={effectiveInputTrim}
            suggestedValue={suggested.inputTrimDB}
            suggestedLabel={`${suggested.inputTrimDB.toFixed(1)} dB`}
            accentClassName="accent-amber-500"
            onChange={(v) => onChange(update(settings, 'inputTrimDB', v))}
          />
          {settings.inputTrimDB != null && (
            <button
              type="button"
              onClick={() => onChange(update(settings, 'inputTrimDB', null))}
              className="mt-1 text-[10px] font-mono text-zinc-500 hover:text-cyan-400"
            >
              Reset to auto
            </button>
          )}
        </div>

        {/* Output trim */}
        <div>
          <div className="flex justify-between items-baseline mb-1">
            <span className="text-xs font-mono text-zinc-600">Output trim</span>
            <span className="text-sm font-mono text-cyan-400">
              {settings.outputTrimDB > 0 ? '+' : ''}{settings.outputTrimDB.toFixed(1)} dB
            </span>
          </div>
          <RangeSliderWithSuggested
            min={-6}
            max={6}
            step={0.5}
            value={settings.outputTrimDB}
            suggestedValue={suggested.outputTrimDB}
            suggestedLabel="0 dB"
            accentClassName="accent-cyan-500"
            onChange={(v) => onChange(update(settings, 'outputTrimDB', v))}
          />
          <div className="mt-2 flex flex-wrap gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.autoStageOnExport}
                onChange={(e) =>
                  onChange(update(settings, 'autoStageOnExport', e.target.checked))
                }
                className="rounded border-zinc-700"
              />
              <span className="text-[10px] font-mono text-zinc-400">
                Auto-stage on export
              </span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.autoStageLive}
                onChange={(e) =>
                  onChange(update(settings, 'autoStageLive', e.target.checked))
                }
                className="rounded border-zinc-700"
              />
              <span className="text-[10px] font-mono text-zinc-400">
                Auto-stage while playing
              </span>
            </label>
          </div>
        </div>

        {/* Limiter ceiling */}
        <div>
          <div className="flex justify-between items-baseline mb-1">
            <span className="text-xs font-mono text-zinc-600">Limiter ceiling</span>
            <span className="text-sm font-mono text-red-400">{effectiveCeiling.toFixed(1)} dBTP</span>
          </div>
          <RangeSliderWithSuggested
            min={-3}
            max={-0.1}
            step={0.1}
            value={effectiveCeiling}
            suggestedValue={suggested.limiterCeilingDBTP}
            suggestedLabel={`${suggested.limiterCeilingDBTP.toFixed(1)} dBTP`}
            accentClassName="accent-red-500"
            onChange={(v) => onChange(update(settings, 'limiterCeilingDBTP', v))}
          />
          {settings.limiterCeilingDBTP != null && (
            <button
              type="button"
              onClick={() => onChange(update(settings, 'limiterCeilingDBTP', null))}
              className="mt-1 text-[10px] font-mono text-zinc-500 hover:text-cyan-400"
            >
              Reset to preset ({presetCeilingDBTP.toFixed(1)} dBTP)
            </button>
          )}
        </div>

        {/* SSL glue macro */}
        <div>
          <div className="text-xs font-mono text-zinc-600 mb-2">SSL bus glue</div>
          <SuggestedButtonGroup
            options={['auto', 'gentle', 'firm'] as SSLGlueMode[]}
            value={settings.sslGlue}
            suggestedValue={suggested.sslGlue}
            onChange={(mode) => onChange(update(settings, 'sslGlue', mode))}
          />
        </div>

        {/* Mono bass */}
        <div className="md:col-span-2 flex flex-wrap items-center gap-4">
          <label className="relative flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.forceMonoBass === true}
              onChange={(e) =>
                onChange(
                  update(settings, 'forceMonoBass', e.target.checked ? true : null)
                )
              }
              className="rounded border-zinc-700"
            />
            <span className="text-xs font-mono text-zinc-400">Force mono bass</span>
            {settings.forceMonoBass == null && (
              <span
                className="inline-block w-1 h-3 rounded-full bg-cyan-400"
                style={{ boxShadow: '0 0 4px rgba(34, 211, 238, 0.8)' }}
                title={`Genre suggests: ${suggested.forceMonoBass ? 'on' : 'off'}`}
                aria-hidden
              />
            )}
          </label>
          {effectiveForceMonoBass && (
            <div className="flex items-center gap-2 flex-1 min-w-[200px] max-w-xs">
              <span className="text-[10px] font-mono text-zinc-600 shrink-0">HPF @</span>
              <RangeSliderWithSuggested
                min={60}
                max={180}
                step={5}
                value={settings.monoBassHz}
                suggestedValue={suggested.monoBassHz}
                suggestedLabel={`${suggested.monoBassHz} Hz`}
                accentClassName="accent-purple-500"
                onChange={(v) => onChange(update(settings, 'monoBassHz', v))}
              />
              <span className="text-xs font-mono text-purple-400 shrink-0 w-12">
                {settings.monoBassHz} Hz
              </span>
            </div>
          )}
          {settings.forceMonoBass != null && (
            <button
              type="button"
              onClick={() => onChange(update(settings, 'forceMonoBass', null))}
              className="text-[10px] font-mono text-zinc-500 hover:text-cyan-400"
            >
              Reset (off — genre suggests {suggested.forceMonoBass ? 'on' : 'off'})
            </button>
          )}
        </div>
      </div>

      <p className="text-[10px] font-mono text-zinc-600 mt-4 leading-relaxed">
        <span className="inline-block w-0.5 h-2.5 bg-cyan-400 rounded-full align-middle mr-1.5" />
        Cyan tick = suggested for current genre
      </p>
    </div>
  );
}
