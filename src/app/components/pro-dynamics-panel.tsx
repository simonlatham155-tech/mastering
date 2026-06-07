import { Gauge, SlidersHorizontal } from 'lucide-react';
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
}

export const DEFAULT_PRO_DYNAMICS: ProDynamicsSettings = {
  inputTrimDB: null,
  outputTrimDB: 0,
  limiterCeilingDBTP: null,
  sslGlue: 'auto',
  forceMonoBass: null,
  monoBassHz: 120,
};

interface ProDynamicsPanelProps {
  settings: ProDynamicsSettings;
  onChange: (settings: ProDynamicsSettings) => void;
  gearProfile: GearProfileId;
  autoInputTrimDB?: number;
  presetCeilingDBTP: number;
  outputMomentaryLUFS: number | null;
  targetLUFS: number;
  isPlaying: boolean;
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
  outputMomentaryLUFS,
  targetLUFS,
  isPlaying,
}: ProDynamicsPanelProps) {
  const suggested = getSuggestedProDynamics(gearProfile, presetCeilingDBTP, autoInputTrimDB);
  const effectiveInputTrim = settings.inputTrimDB ?? autoInputTrimDB ?? 0;
  const effectiveCeiling = settings.limiterCeilingDBTP ?? presetCeilingDBTP;
  const effectiveForceMonoBass = settings.forceMonoBass ?? suggested.forceMonoBass;

  return (
    <div
      className="border rounded-lg p-4"
      style={{
        background: 'linear-gradient(180deg, #0f0f0f, #0a0a0a)',
        borderColor: '#2a2a2a',
        boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5)',
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="w-4 h-4 text-purple-400" />
          <div>
            <div className="text-sm font-mono text-zinc-300 uppercase tracking-[0.2em]">
              Pro Dynamics
            </div>
            <div className="text-[10px] font-mono text-zinc-600 mt-0.5">
              Level staging + bus glue + ceiling
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 text-[10px] font-mono uppercase tracking-wider">
          <Gauge className="w-3.5 h-3.5 text-cyan-400" />
          <span className="text-zinc-500">Output</span>
          <span className={`${isPlaying ? 'text-cyan-400' : 'text-zinc-600'}`}>
            {outputMomentaryLUFS != null ? `${outputMomentaryLUFS.toFixed(1)} LUFS` : '—'}
          </span>
          <span className="text-zinc-700">/</span>
          <span className="text-emerald-400">{targetLUFS} target</span>
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
              Use genre default ({suggested.forceMonoBass ? 'on' : 'off'})
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
