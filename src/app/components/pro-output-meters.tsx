import { Activity } from 'lucide-react';
import { HQModeToggle } from './hq-mode-toggle';
import { TruePeakIndicator } from './true-peak-indicator';
import { GainReductionMeter, GainReductionMeterCompact } from './gain-reduction-meter';
import { InterSamplePeakMeter } from './inter-sample-peak-meter';
import { MeterDisplay } from './meter-display';
import { DamageReportPanel } from './damage-report-panel';
import type { LufsMeterData } from '../services/lufs-meter-manager';
import type { AudioAnalysis } from '../services/audio-processor';

type LogicMode = 'brickwall' | 'dynamics';

interface ProOutputMetersProps {
  hqMode: boolean;
  onHqToggle: (enabled: boolean) => void;
  cpuUsage: number;
  truePeakDBTP: number;
  digitalPeakDB: number;
  limiterGainReductionDB: number;
  sslGainReductionDB: number;
  ispDifference: number;
  ceilingDBTP: number;
  lufs: LufsMeterData | null;
  targetLUFS: number;
  isPlaying: boolean;
  logicMode: LogicMode;
  isProcessing: boolean;
  meterValue: number;
  damageReport?: AudioAnalysis['damageReport'];
}

function fmtLufs(lufs: number): string {
  if (!Number.isFinite(lufs) || lufs === -Infinity) return '—';
  return lufs.toFixed(1);
}

export function ProOutputMeters({
  hqMode,
  onHqToggle,
  cpuUsage,
  truePeakDBTP,
  digitalPeakDB,
  limiterGainReductionDB,
  sslGainReductionDB,
  ispDifference,
  ceilingDBTP,
  lufs,
  targetLUFS,
  isPlaying,
  logicMode,
  isProcessing,
  meterValue,
  damageReport,
}: ProOutputMetersProps) {
  const integrated = lufs?.integrated ?? -Infinity;
  const onTarget =
    Number.isFinite(integrated) &&
    integrated !== -Infinity &&
    Math.abs(integrated - targetLUFS) <= 0.5;

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4 text-[10px] font-mono">
          <GainReductionMeterCompact gainReductionDB={limiterGainReductionDB} />
          {sslGainReductionDB > 0.1 && (
            <span className="text-amber-400">
              SSL {sslGainReductionDB.toFixed(1)} dB
            </span>
          )}
          <span
            className={
              truePeakDBTP > -1
                ? 'text-red-400'
                : truePeakDBTP > -3
                  ? 'text-yellow-400'
                  : 'text-green-400'
            }
          >
            TP {Number.isFinite(truePeakDBTP) ? `${truePeakDBTP.toFixed(1)} dBTP` : '—'}
          </span>
          {hqMode && ispDifference > 0.3 && (
            <span className="text-purple-400">ISP +{ispDifference.toFixed(1)} dB</span>
          )}
        </div>
        <HQModeToggle enabled={hqMode} onToggle={onHqToggle} cpuUsage={cpuUsage} />
      </div>

      <div
        className="rounded-lg border p-4"
        style={{
          background: 'linear-gradient(180deg, #0f0f0f, #0a0a0a)',
          borderColor: '#2a2a2a',
        }}
      >
        <div className="flex items-center gap-2 mb-3">
          <Activity className="w-4 h-4 text-cyan-400" />
          <div>
            <div className="text-xs font-mono text-cyan-400 uppercase tracking-wider">
              BS.1770 Loudness
            </div>
            <div className="text-[9px] font-mono text-zinc-600">
              Same measurement path as export
            </div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <div className="text-[9px] font-mono text-zinc-600 uppercase mb-1">Momentary</div>
            <div
              className={`text-lg font-mono font-bold ${isPlaying ? 'text-cyan-400' : 'text-zinc-600'}`}
            >
              {fmtLufs(lufs?.momentary ?? -Infinity)}
            </div>
          </div>
          <div>
            <div className="text-[9px] font-mono text-zinc-600 uppercase mb-1">Short-term</div>
            <div
              className={`text-lg font-mono font-bold ${isPlaying ? 'text-purple-400' : 'text-zinc-600'}`}
            >
              {fmtLufs(lufs?.shortTerm ?? -Infinity)}
            </div>
          </div>
          <div>
            <div className="text-[9px] font-mono text-zinc-600 uppercase mb-1">Integrated</div>
            <div
              className={`text-lg font-mono font-bold ${
                onTarget ? 'text-yellow-400' : isPlaying ? 'text-orange-400' : 'text-zinc-600'
              }`}
            >
              {fmtLufs(integrated)}
            </div>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between text-[10px] font-mono">
          <span className="text-zinc-500">Target {targetLUFS} LUFS</span>
          {onTarget && isPlaying ? (
            <span className="text-yellow-400">On target</span>
          ) : (
            <span className="text-zinc-600">{isPlaying ? 'Measuring…' : 'Play to measure'}</span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <TruePeakIndicator
          truePeakDBTP={truePeakDBTP}
          ceiling={ceilingDBTP}
          enabled={hqMode}
        />
        <GainReductionMeter
          gainReductionDB={limiterGainReductionDB}
          lookaheadMS={5}
          showGhost={hqMode}
        />
        <MeterDisplay
          mode={logicMode === 'brickwall' ? 'peak' : 'lra'}
          isProcessing={isProcessing}
          value={meterValue}
        />
      </div>

      {hqMode && (
        <InterSamplePeakMeter
          digitalPeakDB={digitalPeakDB}
          truePeakDBTP={truePeakDBTP}
          ispDifference={ispDifference}
          hqMode={hqMode}
        />
      )}

      {damageReport && <DamageReportPanel damageReport={damageReport} />}
    </>
  );
}
