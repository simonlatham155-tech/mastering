import { motion } from 'motion/react';
import { AlertTriangle, Info, TrendingUp } from 'lucide-react';

interface InterSamplePeakMeterProps {
  digitalPeakDB?: number;    // Standard digital peak (dBFS)
  truePeakDBTP?: number;     // True peak after 4x oversampling (dBTP)
  ispDifference?: number;    // Inter-sample peak delta (dB)
  hqMode?: boolean;          // Is oversampling enabled?
}

/**
 * INTER-SAMPLE PEAK METER
 * "The Aha! Moment"
 * 
 * Shows the difference between digital peak and true peak.
 * This is THE visual proof that oversampling catches peaks that
 * standard limiters miss.
 * 
 * EXAMPLE:
 * Digital Peak: -0.1 dBFS (looks safe, green LED)
 * True Peak: +0.5 dBTP (CLIPPING!, red LED)
 * ISP Difference: +0.6 dB (the hidden peak!)
 * 
 * This proves your tool is better than LANDR!
 */
export function InterSamplePeakMeter({
  digitalPeakDB = -1.0,
  truePeakDBTP = -1.0,
  ispDifference = 0,
  hqMode = true
}: InterSamplePeakMeterProps) {
  
  // Determine if there's a significant ISP
  const hasSignificantISP = ispDifference > 0.1; // More than 0.1dB difference
  const isCriticalISP = ispDifference > 0.5; // More than 0.5dB difference
  
  // Colors
  const digitalColor = digitalPeakDB > -0.3 ? 'text-orange-400' : 'text-green-400';
  const truePeakColor = truePeakDBTP > 0 ? 'text-red-400' : 
                        truePeakDBTP > -0.3 ? 'text-orange-400' : 'text-green-400';
  
  if (!hqMode) {
    return (
      <div className="border-2 border-zinc-800 rounded-lg p-4 bg-zinc-950">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-3 h-3 rounded-full bg-zinc-700" />
          <span className="text-xs font-mono text-zinc-600 font-semibold">
            Inter-Sample Peak Detection (Disabled)
          </span>
        </div>
        <div className="text-[9px] font-mono text-zinc-700 leading-relaxed">
          Enable HQ Mode (4x oversampling) to detect inter-sample peaks.
        </div>
      </div>
    );
  }
  
  return (
    <div className={`border-2 rounded-lg p-4 ${
      isCriticalISP ? 'border-red-500/30 bg-red-500/5' :
      hasSignificantISP ? 'border-orange-500/30 bg-orange-500/5' :
      'border-green-500/30 bg-green-500/5'
    }`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <TrendingUp className={`w-4 h-4 ${
            isCriticalISP ? 'text-red-400' :
            hasSignificantISP ? 'text-orange-400' : 'text-green-400'
          }`} />
          <div>
            <div className={`text-xs font-mono font-bold uppercase ${
              isCriticalISP ? 'text-red-400' :
              hasSignificantISP ? 'text-orange-400' : 'text-green-400'
            }`}>
              Inter-Sample Peak
            </div>
            <div className="text-[8px] font-mono text-zinc-600">
              True Peak vs Digital Peak
            </div>
          </div>
        </div>
        
        <div className="group relative">
          <Info className="w-3 h-3 text-zinc-600 cursor-help" />
          <div className="absolute right-0 top-full mt-2 w-72 p-3 bg-zinc-900 border border-zinc-700 rounded-lg text-[8px] font-mono text-zinc-400 leading-relaxed opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
            <div className="text-purple-400 font-semibold mb-1">What is ISP?</div>
            <div>
              Digital samples might look safe (all under 0dBFS), but the reconstructed 
              analog waveform can exceed 0dBFS between samples. 4x oversampling lets 
              us "see" and measure these hidden peaks.
            </div>
          </div>
        </div>
      </div>
      
      {/* Comparison bars */}
      <div className="space-y-4">
        {/* Digital Peak */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="text-[8px] font-mono text-zinc-500 uppercase">
              Digital Peak (Standard):
            </div>
            <div className={`text-sm font-mono font-bold ${digitalColor}`}>
              {digitalPeakDB.toFixed(2)} dBFS
            </div>
          </div>
          <div className="relative h-8 bg-zinc-900 rounded-lg overflow-hidden border border-zinc-800">
            {/* Background zones */}
            <div className="absolute inset-0 flex">
              <div className="flex-[70] bg-green-500/10" />
              <div className="flex-[20] bg-orange-500/10" />
              <div className="flex-[10] bg-red-500/10" />
            </div>
            
            {/* Meter bar */}
            <motion.div
              className="absolute inset-y-0 left-0 bg-green-500"
              style={{
                width: `${Math.min(100, ((digitalPeakDB + 20) / 20) * 100)}%`
              }}
              initial={{ width: 0 }}
              animate={{
                width: `${Math.min(100, ((digitalPeakDB + 20) / 20) * 100)}%`
              }}
            />
            
            {/* 0dBFS marker */}
            <div className="absolute right-[10%] inset-y-0 w-0.5 bg-red-500/50" />
            <div className="absolute right-[10%] top-1 text-[7px] font-mono text-red-500 translate-x-1/2">
              0dB
            </div>
          </div>
        </div>
        
        {/* True Peak */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="text-[8px] font-mono text-zinc-500 uppercase">
              True Peak (4x Oversampled):
            </div>
            <div className={`text-sm font-mono font-bold ${truePeakColor}`}>
              {truePeakDBTP > 0 ? '+' : ''}{truePeakDBTP.toFixed(2)} dBTP
            </div>
          </div>
          <div className="relative h-8 bg-zinc-900 rounded-lg overflow-hidden border border-zinc-800">
            {/* Background zones */}
            <div className="absolute inset-0 flex">
              <div className="flex-[70] bg-green-500/10" />
              <div className="flex-[20] bg-orange-500/10" />
              <div className="flex-[10] bg-red-500/10" />
            </div>
            
            {/* Meter bar */}
            <motion.div
              className={`absolute inset-y-0 left-0 ${
                truePeakDBTP > 0 ? 'bg-red-500' : 'bg-green-500'
              }`}
              style={{
                width: `${Math.min(100, ((truePeakDBTP + 20) / 20) * 100)}%`
              }}
              initial={{ width: 0 }}
              animate={{
                width: `${Math.min(100, ((truePeakDBTP + 20) / 20) * 100)}%`,
                opacity: truePeakDBTP > 0 ? [0.8, 1, 0.8] : 1
              }}
              transition={truePeakDBTP > 0 ? {
                repeat: Infinity,
                duration: 0.8
              } : {}}
            />
            
            {/* 0dBTP marker */}
            <div className="absolute right-[10%] inset-y-0 w-0.5 bg-red-500/50" />
            <div className="absolute right-[10%] top-1 text-[7px] font-mono text-red-500 translate-x-1/2">
              0dB
            </div>
          </div>
        </div>
        
        {/* ISP Difference */}
        <div className={`border-t pt-3 ${
          isCriticalISP ? 'border-red-500/30' :
          hasSignificantISP ? 'border-orange-500/30' :
          'border-green-500/30'
        }`}>
          <div className="flex items-center justify-between">
            <div className="text-[8px] font-mono text-zinc-500 uppercase">
              Inter-Sample Peak Delta:
            </div>
            <div className={`text-lg font-mono font-bold ${
              isCriticalISP ? 'text-red-400' :
              hasSignificantISP ? 'text-orange-400' : 'text-green-400'
            }`}>
              +{ispDifference.toFixed(2)} dB
            </div>
          </div>
        </div>
      </div>
      
      {/* Visual comparison */}
      <div className="mt-4 p-3 bg-zinc-900 rounded border border-zinc-800">
        <div className="text-[8px] font-mono text-zinc-500 uppercase mb-2">
          Waveform Reconstruction:
        </div>
        
        <div className="space-y-2">
          {/* Digital samples */}
          <div>
            <div className="text-[8px] font-mono text-white mb-1">Digital samples (44.1kHz):</div>
            <div className="font-mono text-xs text-green-400 text-center">
              |▁▁▁█▇▆▁▁▁| ← Looks safe ({digitalPeakDB.toFixed(2)} dBFS)
            </div>
          </div>
          
          {/* Reconstructed analog */}
          <div>
            <div className="text-[8px] font-mono text-white mb-1">Reconstructed analog (176.4kHz):</div>
            {hasSignificantISP ? (
              <div className="font-mono text-xs text-center relative">
                <span className={isCriticalISP ? 'text-red-400' : 'text-orange-400'}>
                  |▁▁▁█<span className="bg-red-500/20 px-1">█</span>▆▁▁▁| ← Peak between samples! ({truePeakDBTP.toFixed(2)} dBTP)
                </span>
                <motion.div
                  className={`absolute -top-1 left-1/2 -translate-x-1/2 ${
                    isCriticalISP ? 'text-red-400' : 'text-orange-400'
                  }`}
                  animate={{ y: [0, -3, 0] }}
                  transition={{ repeat: Infinity, duration: 1 }}
                >
                  ↑ +{ispDifference.toFixed(2)}dB
                </motion.div>
              </div>
            ) : (
              <div className="font-mono text-xs text-green-400 text-center">
                |▁▁▁█▇▆▁▁▁| ← Safe! ({truePeakDBTP.toFixed(2)} dBTP)
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Status message */}
      <div className="mt-4 pt-4 border-t border-zinc-800">
        {isCriticalISP && (
          <motion.div 
            className="flex items-start gap-2 text-[9px] font-mono text-red-400 leading-relaxed"
            animate={{ opacity: [1, 0.7, 1] }}
            transition={{ repeat: Infinity, duration: 1.5 }}
          >
            <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold mb-1">⚠️ CRITICAL ISP DETECTED!</div>
              <div>
                Digital peak reads {digitalPeakDB.toFixed(2)} dBFS (safe), but true peak 
                is {truePeakDBTP.toFixed(2)} dBTP — a difference of{' '}
                <span className="font-semibold">+{ispDifference.toFixed(2)} dB</span>! 
                Without oversampling, this hidden peak would cause clipping on high-end 
                DACs and speakers.
              </div>
            </div>
          </motion.div>
        )}
        
        {!isCriticalISP && hasSignificantISP && (
          <div className="flex items-start gap-2 text-[9px] font-mono text-orange-400 leading-relaxed">
            <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold mb-1">⚠️ ISP DETECTED</div>
              <div>
                True peak exceeds digital peak by {ispDifference.toFixed(2)} dB. HQ mode 
                is catching peaks that standard limiters miss.
              </div>
            </div>
          </div>
        )}
        
        {!hasSignificantISP && (
          <div className="flex items-start gap-2 text-[9px] font-mono text-green-400 leading-relaxed">
            <div className="w-3 h-3 flex-shrink-0 mt-0.5 rounded-full bg-green-500" />
            <div>
              <div className="font-semibold mb-1">✓ NO SIGNIFICANT ISP</div>
              <div className="text-zinc-400">
                True peak and digital peak are aligned (Δ = {ispDifference.toFixed(2)} dB). 
                Both standard and oversampled limiting would produce similar results for 
                this signal.
              </div>
            </div>
          </div>
        )}
      </div>
      
      {/* "Aha!" callout */}
      {isCriticalISP && (
        <div className="mt-4 p-3 border-2 border-red-500/50 rounded-lg bg-red-500/10">
          <div className="text-[8px] font-mono text-red-400 font-semibold mb-1 uppercase">
            💡 This is why LANDR sounds harsh!
          </div>
          <div className="text-[9px] font-mono text-zinc-400 leading-relaxed">
            Most online mastering services (LANDR, eMastered, CloudBounce) don't use 
            oversampling. They would miss this {ispDifference.toFixed(2)} dB peak, 
            resulting in digital clipping and harsh, unpleasant sound. Your HQ mode 
            catches this peak before it becomes a problem.
          </div>
        </div>
      )}
      
      {/* Technical note */}
      <div className="mt-4 pt-4 border-t border-zinc-800">
        <div className="text-[8px] font-mono text-zinc-600 leading-relaxed">
          <span className="text-purple-400 font-semibold">HOW IT WORKS:</span> 4x oversampling 
          (44.1kHz → 176.4kHz) using polyphase FIR filters allows us to reconstruct the 
          analog waveform and measure peaks that occur between digital samples. This is 
          required by EBU R128 and ITU-R BS.1770-4 standards for professional mastering.
        </div>
      </div>
    </div>
  );
}
