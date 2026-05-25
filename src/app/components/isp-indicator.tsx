import { motion } from 'motion/react';
import { AlertTriangle, Zap } from 'lucide-react';

interface ISPIndicatorProps {
  truePeakDBTP?: number;     // True peak in dBTP
  digitalPeakDB?: number;    // Standard digital peak in dBFS
  enabled?: boolean;        // Is oversampling enabled?
}

/**
 * ISP (INTER-SAMPLE PEAK) INDICATOR
 * 
 * THE PROBLEM:
 * Digital samples might all be under 0dBFS (safe), but the reconstructed
 * analog waveform can exceed 0dBFS between samples, causing clipping on
 * high-end DACs, speakers, and analog equipment.
 * 
 * EXAMPLE:
 * Digital samples: [0.95, 0.98, 0.93] ← All safe (under 1.0)
 * Reconstructed analog: 0.95 → [1.03] → 0.93 ← CLIPPING! (inter-sample peak)
 *                                 ↑
 *                        Peak occurs BETWEEN samples
 * 
 * THE SOLUTION:
 * 4x oversampling allows us to "see" the analog waveform and detect these
 * inter-sample peaks before they cause problems.
 * 
 * VISUAL:
 * - Green: No ISP detected (safe)
 * - Red: ISP detected! (digital safe, but analog clipping)
 */
export function ISPIndicator({
  truePeakDBTP = -1.0,
  digitalPeakDB = -1.5,
  enabled = true
}: ISPIndicatorProps) {
  
  // ISP occurs when true peak exceeds 0dBTP but digital peak is below 0dBFS
  const hasISP = truePeakDBTP > 0 && digitalPeakDB < 0;
  
  // Calculate ISP amount (how much over 0dBTP)
  const ispAmount = Math.max(0, truePeakDBTP);
  
  // Critical if over +0.3 dBTP (guaranteed clipping on most systems)
  const isCritical = truePeakDBTP > 0.3;
  
  if (!enabled) {
    return (
      <div className="border-2 border-zinc-800 rounded-lg p-3 bg-zinc-950">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-zinc-700" />
          <div>
            <div className="text-xs font-mono text-zinc-600 font-semibold">
              ISP Detection (Disabled)
            </div>
            <div className="text-[8px] font-mono text-zinc-700">
              Enable 4x oversampling to detect inter-sample peaks
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div className={`border-2 rounded-lg p-3 transition-all ${
      hasISP
        ? isCritical
          ? 'border-red-500 bg-red-500/10'
          : 'border-orange-500 bg-orange-500/10'
        : 'border-green-500/30 bg-green-500/5'
    }`}>
      {/* Header with LED */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {/* LED Indicator */}
          <motion.div
            className={`w-4 h-4 rounded-full border-2 relative ${
              hasISP
                ? 'border-red-500 bg-red-500'
                : 'border-green-500/30 bg-green-500/10'
            }`}
            animate={hasISP ? {
              boxShadow: [
                '0 0 0 0 rgba(239, 68, 68, 0.7)',
                '0 0 0 8px rgba(239, 68, 68, 0)',
              ]
            } : {}}
            transition={hasISP ? {
              repeat: Infinity,
              duration: 1
            } : {}}
          >
            {/* Inner glow */}
            {hasISP && (
              <motion.div
                className="absolute inset-0 rounded-full bg-red-400"
                animate={{
                  opacity: [1, 0.5, 1]
                }}
                transition={{
                  repeat: Infinity,
                  duration: 0.8
                }}
              />
            )}
          </motion.div>
          
          {/* Label */}
          <div>
            <div className={`text-xs font-mono font-bold uppercase tracking-wider ${
              hasISP ? 'text-red-400' : 'text-green-400'
            }`}>
              ISP
            </div>
            <div className="text-[8px] font-mono text-zinc-600">
              Inter-Sample Peak
            </div>
          </div>
        </div>
        
        {/* Status icon */}
        {hasISP ? (
          <AlertTriangle className={`w-5 h-5 ${
            isCritical ? 'text-red-400' : 'text-orange-400'
          }`} />
        ) : (
          <Zap className="w-5 h-5 text-green-400" />
        )}
      </div>
      
      {/* Comparison: Digital vs True Peak */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[8px] font-mono text-zinc-500">Digital Peak:</span>
          <span className="text-sm font-mono font-bold text-white">
            {digitalPeakDB.toFixed(2)} dBFS
          </span>
        </div>
        
        <div className="flex items-center justify-between">
          <span className="text-[8px] font-mono text-zinc-500">True Peak:</span>
          <span className={`text-sm font-mono font-bold ${
            hasISP ? 'text-red-400' : 'text-green-400'
          }`}>
            {truePeakDBTP > 0 ? '+' : ''}{truePeakDBTP.toFixed(2)} dBTP
          </span>
        </div>
        
        {hasISP && (
          <div className="flex items-center justify-between pt-2 border-t border-red-500/30">
            <span className="text-[8px] font-mono text-red-400 font-semibold">ISP Amount:</span>
            <span className="text-lg font-mono font-bold text-red-400">
              +{ispAmount.toFixed(2)} dB
            </span>
          </div>
        )}
      </div>
      
      {/* Visual comparison */}
      <div className="mt-3 p-2 bg-zinc-900 rounded border border-zinc-800">
        <div className="text-[8px] font-mono text-zinc-500 mb-2 uppercase">
          Waveform Analysis:
        </div>
        
        {hasISP ? (
          <div className="space-y-2">
            <div>
              <div className="text-[8px] font-mono text-white mb-1">Digital samples:</div>
              <div className="font-mono text-xs text-green-400 text-center">
                |▁▁▁█▇▆▁▁▁| ← Looks safe (all under 0dBFS)
              </div>
            </div>
            <div>
              <div className="text-[8px] font-mono text-white mb-1">Reconstructed analog:</div>
              <div className="font-mono text-xs text-red-400 text-center relative">
                |▁▁▁█<span className="bg-red-500/20 px-1">█</span>▆▁▁▁| ← CLIPPING between samples!
                <motion.div
                  className="absolute -top-1 left-1/2 -translate-x-1/2 text-red-400"
                  animate={{ y: [0, -3, 0] }}
                  transition={{ repeat: Infinity, duration: 1 }}
                >
                  ↑
                </motion.div>
              </div>
            </div>
          </div>
        ) : (
          <div>
            <div className="text-[8px] font-mono text-white mb-1">Reconstructed analog:</div>
            <div className="font-mono text-xs text-green-400 text-center">
              |▁▁▁█▇▆▁▁▁| ← Safe! No inter-sample peaks
            </div>
          </div>
        )}
      </div>
      
      {/* Status message */}
      <div className="mt-3 pt-3 border-t border-zinc-800">
        {hasISP ? (
          <div className="space-y-2">
            <motion.div 
              className="flex items-start gap-2 text-[9px] font-mono leading-relaxed"
              animate={{ opacity: [1, 0.7, 1] }}
              transition={{ repeat: Infinity, duration: 1.5 }}
            >
              <AlertTriangle className={`w-3 h-3 flex-shrink-0 mt-0.5 ${
                isCritical ? 'text-red-400' : 'text-orange-400'
              }`} />
              <div className={isCritical ? 'text-red-400' : 'text-orange-400'}>
                <div className="font-semibold mb-1">
                  {isCritical ? '⚠️ CRITICAL ISP DETECTED!' : '⚠️ ISP DETECTED'}
                </div>
                <div>
                  Digital peak reads {digitalPeakDB.toFixed(2)} dBFS (safe), but the 
                  reconstructed analog waveform exceeds 0dBTP by{' '}
                  <span className="font-semibold">+{ispAmount.toFixed(2)} dB</span>.
                  This will cause clipping on:
                </div>
              </div>
            </motion.div>
            
            <div className="ml-5 text-[8px] font-mono text-zinc-400 space-y-1">
              <div>• High-end DACs (96kHz/192kHz converters)</div>
              <div>• Professional monitors and PA systems</div>
              <div>• Analog mastering equipment</div>
              <div>• Vinyl cutting lathes</div>
            </div>
            
            <div className="ml-5 mt-2 p-2 bg-red-500/10 border border-red-500/30 rounded">
              <div className="text-[8px] font-mono text-red-400 font-semibold">
                FIX: Reduce output ceiling to -{Math.abs(truePeakDBTP + 0.1).toFixed(1)} dBTP
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-2 text-[9px] font-mono text-green-400 leading-relaxed">
            <Zap className="w-3 h-3 flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold mb-1">✓ NO INTER-SAMPLE PEAKS</div>
              <div className="text-zinc-400">
                Both digital samples and reconstructed analog waveform are below ceiling. 
                Safe for all playback systems including high-end DACs and analog equipment.
              </div>
            </div>
          </div>
        )}
      </div>
      
      {/* Technical explanation */}
      <div className="mt-3 pt-3 border-t border-zinc-800">
        <div className="text-[8px] font-mono text-zinc-600 leading-relaxed">
          <span className="text-cyan-400 font-semibold">HOW IT WORKS:</span> 4x oversampling 
          (48kHz → 192kHz) allows us to "see" the analog waveform between digital samples. 
          Standard meters only see digital samples and can miss peaks that occur during 
          reconstruction. True peak detection is required by streaming platforms (EBU R128, 
          ITU-R BS.1770-4).
        </div>
      </div>
    </div>
  );
}

/**
 * Compact LED-only version
 */
export function ISPIndicatorCompact({
  truePeakDBTP = -1.0,
  digitalPeakDB = -1.5
}: {
  truePeakDBTP?: number;
  digitalPeakDB?: number;
}) {
  const hasISP = truePeakDBTP > 0 && digitalPeakDB < 0;
  
  return (
    <div className="flex items-center gap-2">
      <motion.div
        className={`w-2 h-2 rounded-full ${
          hasISP ? 'bg-red-500' : 'bg-green-500'
        }`}
        animate={hasISP ? {
          opacity: [1, 0.5, 1]
        } : {}}
        transition={hasISP ? {
          repeat: Infinity,
          duration: 0.8
        } : {}}
      />
      <span className="text-[8px] font-mono text-zinc-500">ISP</span>
      {hasISP && (
        <span className="text-[8px] font-mono text-red-400 font-semibold">
          +{truePeakDBTP.toFixed(2)} dB
        </span>
      )}
    </div>
  );
}