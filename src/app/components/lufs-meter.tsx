import { motion } from 'motion/react';
import { Activity, Gauge } from 'lucide-react';

interface LUFSMeterProps {
  integratedLUFS: number;
  momentaryMaxLUFS: number;
  truePeakDBTP: number;
  isProcessing: boolean;
}

export function LUFSMeter({ 
  integratedLUFS, 
  momentaryMaxLUFS, 
  truePeakDBTP,
  isProcessing 
}: LUFSMeterProps) {
  // Calculate meter bar positions (-40 to 0 LUFS scale)
  const integratedPosition = Math.max(0, Math.min(100, ((integratedLUFS + 40) / 40) * 100));
  const momentaryPosition = Math.max(0, Math.min(100, ((momentaryMaxLUFS + 40) / 40) * 100));

  // Determine color based on LUFS value
  const getColorForLUFS = (lufs: number) => {
    if (lufs >= -6) return { bar: 'bg-red-500', glow: 'rgba(239, 68, 68, 0.8)', text: 'text-red-400' };
    if (lufs >= -10) return { bar: 'bg-amber-500', glow: 'rgba(245, 158, 11, 0.8)', text: 'text-amber-400' };
    if (lufs >= -16) return { bar: 'bg-green-500', glow: 'rgba(34, 197, 94, 0.8)', text: 'text-green-400' };
    return { bar: 'bg-blue-500', glow: 'rgba(59, 130, 246, 0.8)', text: 'text-blue-400' };
  };

  const integratedColor = getColorForLUFS(integratedLUFS);
  const momentaryColor = getColorForLUFS(momentaryMaxLUFS);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
            <Activity className="w-4 h-4 text-cyan-400" />
            ITU-R BS.1770-4 LUFS
          </h3>
          <p className="text-xs text-zinc-400 mt-0.5">Broadcast-compliant loudness metering</p>
        </div>
        {isProcessing && (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30">
            <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            <span className="text-xs text-cyan-400 font-medium">Analyzing</span>
          </div>
        )}
      </div>

      {/* Main Meter Housing */}
      <div 
        className="relative bg-black rounded-lg p-6 border-2"
        style={{
          borderColor: '#2a2a2a',
          boxShadow: `
            inset 0 2px 4px rgba(0,0,0,0.8),
            inset 0 -1px 2px rgba(255,255,255,0.05),
            0 4px 8px rgba(0,0,0,0.4)
          `
        }}
      >
        {/* Integrated LUFS */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-mono text-zinc-400 tracking-[0.15em] uppercase">
              Integrated LUFS
            </div>
            <div className={`text-sm font-mono ${integratedColor.text} font-semibold tabular-nums`}
              style={{
                textShadow: `0 0 6px ${integratedColor.glow}`
              }}
            >
              {integratedLUFS.toFixed(1)} LUFS
            </div>
          </div>

          {/* Meter Bar */}
          <div className="relative h-8 bg-zinc-950 rounded border border-zinc-800/50 overflow-hidden"
            style={{
              boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.9)'
            }}
          >
            <motion.div
              className={`absolute left-0 top-0 h-full ${integratedColor.bar} rounded-r`}
              initial={{ width: 0 }}
              animate={{ width: `${integratedPosition}%` }}
              transition={{ type: 'spring', stiffness: 100, damping: 20 }}
              style={{
                boxShadow: `0 0 8px ${integratedColor.glow}, inset 0 1px 1px rgba(255,255,255,0.3)`
              }}
            />
            {/* Reference Lines */}
            <div className="absolute inset-0 flex">
              <div className="absolute left-[50%] top-0 h-full w-[1px] bg-zinc-700/50" />
              <div className="absolute left-[75%] top-0 h-full w-[1px] bg-zinc-700/50" />
              <div className="absolute left-[87.5%] top-0 h-full w-[1px] bg-zinc-700/50" />
            </div>
          </div>

          {/* Scale Markings */}
          <div className="flex justify-between text-[8px] text-zinc-500 font-mono mt-1.5 px-0.5 uppercase tracking-wider">
            <span>-40</span>
            <span>-30</span>
            <span>-20</span>
            <span className="text-green-500">-14</span>
            <span>-10</span>
            <span className="text-red-500">0</span>
          </div>
        </div>

        {/* Momentary Max LUFS */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-mono text-zinc-400 tracking-[0.15em] uppercase">
              Momentary Max
            </div>
            <div className={`text-sm font-mono ${momentaryColor.text} font-semibold tabular-nums`}
              style={{
                textShadow: `0 0 6px ${momentaryColor.glow}`
              }}
            >
              {momentaryMaxLUFS.toFixed(1)} LUFS
            </div>
          </div>

          {/* Meter Bar */}
          <div className="relative h-6 bg-zinc-950 rounded border border-zinc-800/50 overflow-hidden"
            style={{
              boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.9)'
            }}
          >
            <motion.div
              className={`absolute left-0 top-0 h-full ${momentaryColor.bar} rounded-r`}
              initial={{ width: 0 }}
              animate={{ width: `${momentaryPosition}%` }}
              transition={{ type: 'spring', stiffness: 120, damping: 25 }}
              style={{
                boxShadow: `0 0 8px ${momentaryColor.glow}, inset 0 1px 1px rgba(255,255,255,0.3)`
              }}
            />
          </div>
        </div>

        {/* True Peak (dBTP) */}
        <div className="pt-4 border-t border-zinc-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Gauge className="w-4 h-4 text-purple-400" />
              <div className="text-xs font-mono text-zinc-400 tracking-[0.15em] uppercase">
                True Peak
              </div>
            </div>
            <div className={`text-sm font-mono font-semibold tabular-nums ${
              truePeakDBTP > -0.5 ? 'text-red-400' : truePeakDBTP > -1.0 ? 'text-amber-400' : 'text-green-400'
            }`}
              style={{
                textShadow: `0 0 6px ${
                  truePeakDBTP > -0.5 
                    ? 'rgba(239, 68, 68, 0.8)' 
                    : truePeakDBTP > -1.0 
                      ? 'rgba(245, 158, 11, 0.8)' 
                      : 'rgba(34, 197, 94, 0.8)'
                }`
              }}
            >
              {truePeakDBTP.toFixed(2)} dBTP
            </div>
          </div>
        </div>
      </div>

      {/* Reference Guide */}
      <div className="grid grid-cols-2 gap-2">
        <div 
          className="p-3 rounded-lg border"
          style={{
            background: 'rgba(0,0,0,0.3)',
            borderColor: '#1DB95420',
            boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.5)'
          }}
        >
          <div className="text-xs font-medium text-green-400 mb-1">Spotify Standard</div>
          <div className="text-xs text-zinc-400">-14 LUFS • -1.0 dBTP</div>
        </div>
        <div 
          className="p-3 rounded-lg border"
          style={{
            background: 'rgba(0,0,0,0.3)',
            borderColor: '#FFAF7A20',
            boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.5)'
          }}
        >
          <div className="text-xs font-medium text-amber-400 mb-1">Club/Festival</div>
          <div className="text-xs text-zinc-400">-8 LUFS • -0.1 dBTP</div>
        </div>
      </div>

      {/* K-Weighting Info */}
      <div className="p-3 rounded-lg bg-blue-500/5 border border-blue-500/20">
        <div className="flex items-start gap-2">
          <div className="text-xs text-blue-300 leading-relaxed">
            <span className="font-semibold">K-Weighted</span> • Dual-gating (-70 LUFS absolute, -10 LU relative) • 400ms momentary integration
          </div>
        </div>
      </div>
    </div>
  );
}