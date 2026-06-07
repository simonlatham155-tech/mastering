import type { ExportPresetId } from '../data/export-presets';
import type { AppProcessingContext } from './app-processing-context';
import {
  buildAppProcessingSettings,
} from './app-processing-context';
import { audioProcessor } from './audio-processor';
import {
  computeAutoInputTrimDB,
  masterExportFilename,
} from '../utils/master-export-utils';
import {
  runMasterExport,
  type MasterExportResult,
} from './master-export-pipeline';

export interface BatchExportItemResult {
  filename: string;
  sourceName: string;
  result: MasterExportResult;
  ok: true;
}

export interface BatchExportItemError {
  sourceName: string;
  error: string;
  ok: false;
}

export type BatchExportRow = BatchExportItemResult | BatchExportItemError;

export interface BatchExportProgress {
  index: number;
  total: number;
  currentName: string;
}

export interface BatchExportSummary {
  rows: BatchExportRow[];
  presetId: ExportPresetId;
}

/**
 * Album/batch export — same mastering pipeline as single export, per file:
 * load → analyze (per-track headroom) → export-quality render → auto-stage → WAV.
 */
export async function runBatchAlbumExport(
  files: File[],
  presetId: ExportPresetId,
  context: AppProcessingContext,
  onProgress?: (progress: BatchExportProgress) => void
): Promise<BatchExportSummary> {
  const rows: BatchExportRow[] = [];
  const settingsBase = buildAppProcessingSettings({
    ...context,
    exportPreset: presetId,
  });

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    onProgress?.({
      index: i + 1,
      total: files.length,
      currentName: file.name,
    });

    try {
      await audioProcessor.loadAudioFile(file);
      const analysis = await audioProcessor.analyzeAudio();
      const autoInputTrimDB = computeAutoInputTrimDB(analysis.peakLevel);

      const result = await runMasterExport({
        settings: settingsBase,
        exportPresetId: presetId,
        proDynamics: context.proDynamics,
        autoInputTrimDB,
      });

      rows.push({
        ok: true,
        sourceName: file.name,
        filename: masterExportFilename(file.name, presetId),
        result,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      rows.push({
        ok: false,
        sourceName: file.name,
        error: message,
      });
    }
  }

  return { rows, presetId };
}

/** Build ZIP blob from successful batch rows (callers trigger download). */
export async function batchResultsToZip(
  rows: BatchExportRow[],
  zipName: string
): Promise<Blob> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();

  for (const row of rows) {
    if (row.ok) {
      zip.file(row.filename, row.result.wavBlob);
    }
  }

  const manifest = rows.map((row) => {
    if (!row.ok) {
      return { file: row.sourceName, status: 'failed', error: row.error };
    }
    return {
      file: row.sourceName,
      output: row.filename,
      status: 'ok',
      integratedLUFS: row.result.report.integratedLUFS,
      truePeakDBTP: row.result.report.truePeakDBTP,
      outputTrimDB: row.result.outputTrimDB,
      inputTrimDB: row.result.inputTrimDB,
    };
  });

  zip.file(
    'export-manifest.json',
    JSON.stringify({ exportedAt: new Date().toISOString(), tracks: manifest }, null, 2)
  );

  return zip.generateAsync({ type: 'blob' });
}
