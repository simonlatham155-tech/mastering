import { Activity, Radio } from 'lucide-react';
import { motion } from 'motion/react';
import { GearSelector, GearProfileId } from './gear-selector';
import { EXPORT_PRESETS, ExportPresetId } from '../data/export-presets';

export interface MixSetupSummary {
  reasoning: string;
  confidence: number;
  inputLufs: number;
  suggestedGenre: string;
}

interface MixSetupPanelProps {
  summary: MixSetupSummary | null;
  gearProfile: GearProfileId;
  exportPreset: ExportPresetId;
  onGearChange: (profile: GearProfileId) => void;
  onExportPresetChange: (preset: ExportPresetId) => void;
}

function confidenceColor(confidence: number): string {
  if (confidence >= 85) return '#10b981';
  if (confidence >= 70) return '#f59e0b';
  return '#ef4444';
}

export function MixSetupPanel({
  summary,
  gearProfile,
  exportPreset,
  onGearChange,
  onExportPresetChange,
}: MixSetupPanelProps) {
  const accent = summary ? confidenceColor(summary.confidence) : '#22d3ee';
  const exportPresets = Object.values(EXPORT_PRESETS);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="border-2 rounded-lg p-6 mb-6"
      style={{
        borderColor: '#2a2a2a',
        background: 'linear-gradient(180deg, #1a1a1a, #0f0f0f)',
        boxShadow: `
          inset 0 2px 4px rgba(0,0,0,0.6),
          0 0 16px ${accent}22
        `,
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center"
            style={{
              background: `linear-gradient(135deg, ${accent}, ${accent}cc)`,
              boxShadow: `0 0 12px ${accent}55`,
            }}
          >
            <Activity className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="text-sm font-mono text-zinc-200 uppercase tracking-wider">
              Mix Setup
            </div>
            <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider mt-0.5">
              From your upload analysis — adjust anytime
            </div>
          </div>
        </div>

        {summary && (
          <div className="flex flex-wrap items-center gap-3 text-[10px] font-mono uppercase tracking-wider">
            <span className="text-zinc-500">Input</span>
            <span className="text-cyan-400">{summary.inputLufs.toFixed(1)} LUFS</span>
            <span className="text-zinc-700">•</span>
            <span className="text-zinc-500">Detected</span>
            <span className="text-purple-400">{summary.suggestedGenre}</span>
            <span
              className="px-2 py-0.5 rounded font-bold"
              style={{
                background: `${accent}22`,
                color: accent,
                border: `1px solid ${accent}55`,
              }}
            >
              {summary.confidence}% match
            </span>
          </div>
        )}
      </div>

      {summary && (
        <div
          className="p-4 rounded-lg mb-5"
          style={{
            background: 'rgba(0,0,0,0.35)',
            border: '1px solid rgba(255,255,255,0.05)',
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <Radio className="w-3.5 h-3.5 text-cyan-400" />
            <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">
              Why these settings
            </div>
          </div>
          <p className="text-xs font-mono text-zinc-300 leading-relaxed">{summary.reasoning}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <GearSelector
          selectedProfile={gearProfile}
          onChange={onGearChange}
          variant="compact"
        />

        <div className="flex flex-col gap-3">
          <div className="text-xs font-mono text-zinc-500 tracking-[0.3em] uppercase">
            Delivery Target
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {exportPresets.map((preset) => {
              const selected = exportPreset === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => onExportPresetChange(preset.id)}
                  className="relative border rounded-lg px-3 py-3 text-left transition-all"
                  style={{
                    background: selected
                      ? `linear-gradient(180deg, ${preset.color}22, ${preset.color}08)`
                      : 'rgba(0,0,0,0.25)',
                    borderColor: selected ? `${preset.color}66` : '#2a2a2a',
                    boxShadow: selected ? `0 0 12px ${preset.color}22` : 'none',
                  }}
                >
                  <div
                    className="text-[10px] font-mono uppercase tracking-wider mb-1"
                    style={{ color: selected ? preset.color : '#888' }}
                  >
                    {preset.name}
                  </div>
                  <div className="text-[10px] font-mono text-zinc-500">
                    {preset.lufs} LUFS
                  </div>
                </button>
              );
            })}
          </div>
          <p className="text-[10px] font-mono text-zinc-600 leading-relaxed">
            Streaming (-14) preserves dynamics. Club/festival targets are louder — use Pressure mode
            if you need more punch.
          </p>
        </div>
      </div>
    </motion.div>
  );
}
