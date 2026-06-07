import { Gauge, SlidersHorizontal } from 'lucide-react';

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
  autoInputTrimDB,
  presetCeilingDBTP,
  outputMomentaryLUFS,
  targetLUFS,
  isPlaying,
}: ProDynamicsPanelProps) {
  const effectiveInputTrim = settings.inputTrimDB ?? autoInputTrimDB ?? 0;
  const effectiveCeiling = settings.limiterCeilingDBTP ?? presetCeilingDBTP;

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
          <input
            type="range"
            min="-12"
            max="0"
            step="0.5"
            value={effectiveInputTrim}
            onChange={(e) => onChange(update(settings, 'inputTrimDB', parseFloat(e.target.value)))}
            className="w-full h-2 rounded-full appearance-none cursor-pointer accent-amber-500"
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
          <input
            type="range"
            min="-6"
            max="6"
            step="0.5"
            value={settings.outputTrimDB}
            onChange={(e) => onChange(update(settings, 'outputTrimDB', parseFloat(e.target.value)))}
            className="w-full h-2 rounded-full appearance-none cursor-pointer accent-cyan-500"
          />
        </div>

        {/* Limiter ceiling */}
        <div>
          <div className="flex justify-between items-baseline mb-1">
            <span className="text-xs font-mono text-zinc-600">Limiter ceiling</span>
            <span className="text-sm font-mono text-red-400">{effectiveCeiling.toFixed(1)} dBTP</span>
          </div>
          <input
            type="range"
            min="-3"
            max="-0.1"
            step="0.1"
            value={effectiveCeiling}
            onChange={(e) =>
              onChange(update(settings, 'limiterCeilingDBTP', parseFloat(e.target.value)))
            }
            className="w-full h-2 rounded-full appearance-none cursor-pointer accent-red-500"
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
          <div className="flex gap-2">
            {(['auto', 'gentle', 'firm'] as SSLGlueMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => onChange(update(settings, 'sslGlue', mode))}
                className={`flex-1 py-2 rounded border text-[10px] font-mono uppercase tracking-wider transition-colors ${
                  settings.sslGlue === mode
                    ? 'border-purple-500/60 bg-purple-950/40 text-purple-300'
                    : 'border-zinc-800 bg-zinc-950/50 text-zinc-500 hover:border-zinc-600'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>

        {/* Mono bass */}
        <div className="md:col-span-2 flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
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
          </label>
          {settings.forceMonoBass && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono text-zinc-600">HPF @</span>
              <input
                type="range"
                min="60"
                max="180"
                step="5"
                value={settings.monoBassHz}
                onChange={(e) =>
                  onChange(update(settings, 'monoBassHz', parseInt(e.target.value, 10)))
                }
                className="w-32 h-2 accent-purple-500"
              />
              <span className="text-xs font-mono text-purple-400">{settings.monoBassHz} Hz</span>
            </div>
          )}
          {settings.forceMonoBass != null && (
            <button
              type="button"
              onClick={() => onChange(update(settings, 'forceMonoBass', null))}
              className="text-[10px] font-mono text-zinc-500 hover:text-cyan-400"
            >
              Use genre default
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
