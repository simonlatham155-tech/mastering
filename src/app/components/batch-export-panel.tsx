import { useRef } from 'react';
import { FolderDown, Loader2 } from 'lucide-react';
import { Button } from './ui/button';
import type { ExportPresetId } from '../data/export-presets';

interface BatchExportPanelProps {
  disabled: boolean;
  isExporting: boolean;
  progress: { index: number; total: number; name: string } | null;
  selectedPreset: ExportPresetId;
  onBatchExport: (files: File[]) => void;
}

export function BatchExportPanel({
  disabled,
  isExporting,
  progress,
  selectedPreset,
  onBatchExport,
}: BatchExportPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="mt-4 pt-4 border-t border-zinc-800">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div>
          <div className="text-xs font-mono text-zinc-500 tracking-[0.2em] uppercase">
            Album / batch export
          </div>
          <p className="text-[10px] font-mono text-zinc-600 mt-1 max-w-lg">
            Same genre, EQ, and dynamics as above. Each track gets its own analysis,
            headroom trim, and auto-staging — then one ZIP download.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || isExporting}
          className="border-emerald-500/40 text-emerald-300 shrink-0"
          onClick={() => inputRef.current?.click()}
        >
          {isExporting ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <FolderDown className="w-4 h-4 mr-2" />
          )}
          {isExporting ? 'Rendering…' : 'Select tracks'}
        </Button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="audio/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const list = e.target.files;
          if (list && list.length > 0) {
            onBatchExport(Array.from(list));
          }
          e.target.value = '';
        }}
      />

      {progress && (
        <div className="text-[10px] font-mono text-cyan-400/90 mt-2">
          Track {progress.index}/{progress.total}: {progress.name}
          {' · '}
          {selectedPreset.toUpperCase()} preset
        </div>
      )}
    </div>
  );
}
