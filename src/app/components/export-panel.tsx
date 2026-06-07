import { Download } from 'lucide-react';
import { EXPORT_PRESETS, ExportPresetId } from '../data/export-presets';

interface ExportPanelProps {
  onExport: (preset: ExportPresetId) => void;
  disabled: boolean;
  currentTarget?: number;
  selectedPreset?: ExportPresetId;
}

export function ExportPanel({ onExport, disabled, currentTarget, selectedPreset }: ExportPanelProps) {
  const exportPresets = Object.values(EXPORT_PRESETS);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs font-mono text-zinc-500 tracking-[0.3em] uppercase">Export Optimization</div>
          <div className="text-[10px] font-mono text-zinc-600 mt-1 max-w-xl leading-relaxed">
            {currentTarget != null ? (
              <>
                Live preview follows Mix Setup ({currentTarget} LUFS). Each button renders a
                one-off master at that preset — independent of the live target.
              </>
            ) : (
              'One-off render per preset — live chain uses Mix Setup delivery target.'
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {exportPresets.map((preset) => {
          const isSelected = selectedPreset === preset.id;
          return (
          <button
            key={preset.id}
            onClick={() => onExport(preset.id)}
            disabled={disabled}
            className="relative border rounded-lg px-4 py-3 text-left hover:border-opacity-80 transition-all disabled:opacity-40 disabled:cursor-not-allowed group"
            style={{
              background: disabled 
                ? 'linear-gradient(180deg, #1a1a1a, #0f0f0f)' 
                : isSelected
                  ? `linear-gradient(180deg, ${preset.color}28, ${preset.color}10)`
                  : `linear-gradient(180deg, ${preset.color}15, ${preset.color}05)`,
              borderColor: disabled ? '#2a2a2a' : isSelected ? preset.color : `${preset.color}40`,
              boxShadow: disabled 
                ? 'inset 0 1px 0 rgba(255,255,255,0.03)' 
                : isSelected
                  ? `inset 0 1px 0 ${preset.color}40, 0 0 12px ${preset.color}33`
                  : `inset 0 1px 0 ${preset.color}20, 0 2px 8px ${preset.color}15`
            }}
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="text-xs font-mono tracking-wider uppercase" style={{ color: disabled ? '#666' : preset.color }}>
                  {preset.name}
                </div>
                {preset.id === 'spotify' && (
                  <div className="px-1.5 py-0.5 rounded text-[9px] font-mono tracking-wider uppercase bg-[#1DB954] bg-opacity-20 text-[#1DB954] border border-[#1DB954] border-opacity-30">
                    RECOMMENDED
                  </div>
                )}
              </div>
              <Download className="w-3 h-3 opacity-50 group-hover:opacity-100 transition-opacity" style={{ color: preset.color }} />
            </div>
            <div className="text-xs text-zinc-500 font-mono mb-2">
              {preset.description}
            </div>
            <div className="text-xs font-mono" style={{ color: disabled ? '#444' : preset.color }}>
              {preset.lufs} LUFS • {preset.ceiling} dBTP
            </div>
          </button>
          );
        })}
      </div>

      {/* Help text */}
      <div className="text-xs text-zinc-600 font-mono leading-relaxed">
        <div className="mb-1">
          Export presets automatically adjust processing to hit target loudness while preserving genre characteristics.
        </div>
        <div className="text-zinc-700">
          <span className="text-[#1DB954]">💡 New to mastering?</span> Start with <span className="text-[#1DB954]">Spotify Standard (-14 LUFS)</span> — it's the industry standard and preserves dynamics.
        </div>
      </div>
    </div>
  );
}

// Re-export types for convenience
export type { ExportPresetId } from '../data/export-presets';