import { motion } from 'motion/react';
import { AlertTriangle, Shield, CheckCircle } from 'lucide-react';

interface TruePeakIndicatorProps {
  truePeakDBTP?: number;     // True peak level in dBTP
  ceiling?: number;           // Target ceiling (e.g., -0.3 dBTP)
  enabled?: boolean;         // Is oversampling enabled?
}

/**
 * TRUE PEAK INDICATOR
 * Shows inter-sample peak detection status
 * 
 * WHY THIS MATTERS:
 * Digital samples might look safe (all under 0dBFS), but the reconstructed
 * analog waveform can exceed 0dBFS between samples, causing clipping on
 * high-end DACs and speakers.
 * 
 * COLORS:
 * - Green: Safe (below ceiling)
 * - Orange: Warning (close to ceiling)
 * - Red: Critical (inter-sample peak detected!)
 */
export function TruePeakIndicator({
  truePeakDBTP = -1.0,
  ceiling = -0.3,
  enabled = true
}: TruePeakIndicatorProps) {
  
  // Calculate headroom
  const headroom = ceiling - truePeakDBTP;
  
  // Determine status
  const isCritical = truePeakDBTP > 0; // Above 0dBTP = clipping!
  const isWarning = truePeakDBTP > ceiling;
  const isSafe = truePeakDBTP <= ceiling;
  
  // Visual states
  const statusColor = isCritical ? 'red' : isWarning ? 'orange' : 'green';
  const statusIcon = isCritical ? AlertTriangle : isWarning ? Shield : CheckCircle;
  const StatusIcon = statusIcon;
  
  if (!enabled) {
    return (
      <div className="border-2 border-zinc-800 rounded-lg p-3 bg-zinc-950">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-3 h-3 rounded-full bg-zinc-700" />
          <span className="text-xs font-mono text-zinc-600">
            True Peak Detection (Disabled)
          </span>
        </div>
        <div className="text-[9px] font-mono text-zinc-700">
          Enable 4x oversampling to detect inter-sample peaks
        </div>
      </div>
    );
  }
  
  return (
    <div className={`border-2 rounded-lg p-3 ${
      isCritical ? 'border-red-500/30 bg-red-500/5' :
      isWarning ? 'border-orange-500/30 bg-orange-500/5' :
      'border-green-500/30 bg-green-500/5'
    }`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {/* Status light */}
          <motion.div
            className={`w-3 h-3 rounded-full ${
              statusColor === 'red' ? 'bg-red-500' :
              statusColor === 'orange' ? 'bg-orange-500' : 'bg-green-500'
            }`}
            animate={isCritical ? { 
              opacity: [1, 0.3, 1],
              scale: [1, 1.2, 1]
            } : {}}
            transition={{ repeat: Infinity, duration: 0.6 }}
          />
          
          <span className={`text-xs font-mono uppercase tracking-wider ${
            statusColor === 'red' ? 'text-red-400' :
            statusColor === 'orange' ? 'text-orange-400' : 'text-green-400'
          }`}>
            True Peak Detection
          </span>
        </div>
        
        {/* Icon */}
        <StatusIcon className={`w-4 h-4 ${
          statusColor === 'red' ? 'text-red-400' :
          statusColor === 'orange' ? 'text-orange-400' : 'text-green-400'
        }`} />
      </div>
      
      {/* Meter */}
      <div className="space-y-2">
        {/* Current level */}
        <div className="flex items-baseline justify-between">
          <span className="text-[8px] font-mono text-zinc-500">Current:</span>
          <span className={`text-lg font-mono font-bold ${
            statusColor === 'red' ? 'text-red-400' :
            statusColor === 'orange' ? 'text-orange-400' : 'text-green-400'
          }`}>
            {truePeakDBTP > 0 ? '+' : ''}{truePeakDBTP.toFixed(2)} dBTP
          </span>
        </div>
        
        {/* Ceiling */}
        <div className="flex items-baseline justify-between">
          <span className="text-[8px] font-mono text-zinc-500">Ceiling:</span>
          <span className="text-sm font-mono text-white">
            {ceiling.toFixed(2)} dBTP
          </span>
        </div>
        
        {/* Headroom */}
        <div className="flex items-baseline justify-between">
          <span className="text-[8px] font-mono text-zinc-500">Headroom:</span>
          <span className={`text-sm font-mono font-semibold ${
            headroom < 0 ? 'text-red-400' :
            headroom < 0.3 ? 'text-orange-400' : 'text-green-400'
          }`}>
            {headroom > 0 ? '+' : ''}{headroom.toFixed(2)} dB
          </span>
        </div>
      </div>
      
      {/* Visual meter bar */}
      <div className="mt-3 relative h-2 bg-zinc-900 rounded-full overflow-hidden">
        {/* Safe zone (green) */}
        <div 
          className="absolute inset-y-0 left-0 bg-green-500/30"
          style={{ width: `${Math.min(100, ((ceiling + 10) / 10) * 100)}%` }}
        />
        
        {/* Warning zone (orange) */}
        <div 
          className="absolute inset-y-0 bg-orange-500/30"
          style={{ 
            left: `${((ceiling + 10) / 10) * 100}%`,
            width: `${Math.min(100 - ((ceiling + 10) / 10) * 100, 10)}%`
          }}
        />
        
        {/* Critical zone (red) */}
        <div 
          className="absolute inset-y-0 right-0 bg-red-500/30"
          style={{ width: '10%' }}
        />
        
        {/* Current level indicator */}
        <motion.div
          className={`absolute inset-y-0 ${
            statusColor === 'red' ? 'bg-red-500' :
            statusColor === 'orange' ? 'bg-orange-500' : 'bg-green-500'
          }`}
          style={{ 
            left: 0,
            width: `${Math.min(100, ((truePeakDBTP + 10) / 10) * 100)}%`
          }}
          animate={isCritical ? {
            opacity: [0.8, 1, 0.8]
          } : {}}
          transition={{ repeat: Infinity, duration: 0.8 }}
        />
      </div>
      
      {/* Status messages */}
      <div className="mt-3">
        {isCritical && (
          <motion.div 
            className="flex items-start gap-2 text-[9px] font-mono text-red-400 leading-relaxed"
            animate={{ opacity: [1, 0.7, 1] }}
            transition={{ repeat: Infinity, duration: 1 }}
          >
            <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5" />
            <span>
              <span className="font-semibold">INTER-SAMPLE PEAK DETECTED!</span> The reconstructed 
              analog waveform exceeds 0dBFS. This will cause clipping on high-end DACs and speakers. 
              Reduce output gain or increase ceiling.
            </span>
          </motion.div>
        )}
        
        {!isCritical && isWarning && (
          <div className="flex items-start gap-2 text-[9px] font-mono text-orange-400 leading-relaxed">
            <Shield className="w-3 h-3 flex-shrink-0 mt-0.5" />
            <span>
              Peak exceeds ceiling by {Math.abs(headroom).toFixed(2)} dB. Still safe, but consider 
              reducing gain for more headroom.
            </span>
          </div>
        )}
        
        {isSafe && (
          <div className="flex items-start gap-2 text-[9px] font-mono text-green-400 leading-relaxed">
            <CheckCircle className="w-3 h-3 flex-shrink-0 mt-0.5" />
            <span>
              Perfect! True peak is below ceiling with {headroom.toFixed(2)} dB headroom. Safe for 
              all playback systems including high-end DACs.
            </span>
          </div>
        )}
      </div>
      
      {/* Technical note */}
      <div className="mt-3 pt-3 border-t border-zinc-800">
        <div className="text-[8px] font-mono text-zinc-600 leading-relaxed">
          <span className="text-cyan-400 font-semibold">TRUE PEAK (dBTP):</span> Measures the 
          reconstructed analog waveform using 4x oversampling. This catches inter-sample peaks 
          that occur <span className="text-purple-400">between digital samples</span>. Essential 
          for professional mastering.
        </div>
      </div>
    </div>
  );
}

/**
 * Compact version for inline display
 */
export function TruePeakIndicatorCompact({
  truePeakDBTP = -1.0,
  ceiling = -0.3
}: {
  truePeakDBTP?: number;
  ceiling?: number;
}) {
  const isCritical = truePeakDBTP > 0;
  const isWarning = truePeakDBTP > ceiling;
  
  return (
    <div className="flex items-center gap-2">
      {/* Light */}
      <motion.div
        className={`w-2 h-2 rounded-full ${
          isCritical ? 'bg-red-500' :
          isWarning ? 'bg-orange-500' : 'bg-green-500'
        }`}
        animate={isCritical ? { opacity: [1, 0.5, 1] } : {}}
        transition={{ repeat: Infinity, duration: 0.5 }}
      />
      
      {/* Value */}
      <div className="flex items-baseline gap-1">
        <span className="text-[8px] font-mono text-zinc-500">TP:</span>
        <span className={`text-xs font-mono font-bold ${
          isCritical ? 'text-red-400' :
          isWarning ? 'text-orange-400' : 'text-green-400'
        }`}>
          {truePeakDBTP > 0 ? '+' : ''}{truePeakDBTP.toFixed(2)}
        </span>
      </div>
    </div>
  );
}