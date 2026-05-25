import { AlertTriangle, Info, Sparkles, Gauge, Music } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export type HeritageAlertType = 
  | 'high-dynamic-range'      // DR > 13dB
  | 'transient-heavy'         // Crest Factor > 15dB
  | 'brickwall-tape-conflict' // Pressure + 70s Tape
  | 'brickwall-dr-conflict'   // Pressure + High DR
  | 'info';

interface HeritageAlertProps {
  show: boolean;
  alertType: HeritageAlertType;
  dynamicRange?: number;
  crestFactor?: number;
  onSwitchToDynamics: () => void;
}

const ALERT_CONFIG: Record<HeritageAlertType, {
  title: string;
  getMessage: (dr?: number, cf?: number) => string;
  icon: typeof AlertTriangle;
  severity: 'warning' | 'info' | 'critical';
  buttonText?: string;
}> = {
  'high-dynamic-range': {
    title: 'Heritage Content Detected',
    getMessage: (dr) => `Dynamic Range is ${dr?.toFixed(1)}dB. This indicates high-fidelity cinematic or acoustic content. Heritage mastering standard is 10dB+ for preserving emotional depth.`,
    icon: Music,
    severity: 'info',
    buttonText: 'Keep Flow Mode',
  },
  'transient-heavy': {
    title: 'Transient-Heavy Material',
    getMessage: (dr, cf) => `Peak-to-RMS ratio is ${cf?.toFixed(1)}dB. This track has significant transient energy (drums, percussion). Consider Flow mode to preserve the "snap" and impact.`,
    icon: Gauge,
    severity: 'warning',
    buttonText: 'Switch to Flow',
  },
  'brickwall-tape-conflict': {
    title: 'Heritage Alert: Processing Conflict',
    getMessage: () => `70s Tape saturation requires 12dB+ headroom for harmonic depth. Pressure mode's aggressive limiting may prevent the tape emulation from reaching its vintage "sweet spot."`,
    icon: AlertTriangle,
    severity: 'critical',
    buttonText: 'Switch to Flow',
  },
  'brickwall-dr-conflict': {
    title: 'Dynamics Warning',
    getMessage: (dr) => `Dynamic Range is ${dr?.toFixed(1)}dB. Pressure mode may crush the natural dynamics of this high-fidelity content. Heritage artists expect 10dB+ DR for emotional storytelling.`,
    icon: AlertTriangle,
    severity: 'critical',
    buttonText: 'Auto-Adjust to Flow',
  },
  'info': {
    title: 'Smart Suggestion',
    getMessage: () => 'Latham Audio AI is analyzing your track for optimal processing.',
    icon: Info,
    severity: 'info',
  },
};

export function HeritageAlert({ 
  show, 
  alertType, 
  dynamicRange,
  crestFactor,
  onSwitchToDynamics,
}: HeritageAlertProps) {
  // Fallback to 'info' if alertType is invalid or undefined
  const config = ALERT_CONFIG[alertType] || ALERT_CONFIG['info'];
  const Icon = config.icon;

  // Color scheme based on severity
  const colorClasses = {
    info: {
      bg: 'bg-blue-500/10',
      border: 'border-blue-500/50',
      icon: 'text-blue-400',
      title: 'text-blue-300',
      button: 'bg-blue-500/20 text-blue-300 hover:bg-blue-500/30',
    },
    warning: {
      bg: 'bg-amber-500/10',
      border: 'border-amber-500/50',
      icon: 'text-amber-400',
      title: 'text-amber-300',
      button: 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30',
    },
    critical: {
      bg: 'bg-yellow-500/10',
      border: 'border-yellow-500/50',
      icon: 'text-yellow-400',
      title: 'text-yellow-300',
      button: 'bg-yellow-500/20 text-yellow-300 hover:bg-yellow-500/30',
    },
  };

  const colors = colorClasses[config.severity];

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className={`border rounded-lg p-4 backdrop-blur-sm ${colors.bg} ${colors.border}`}
        >
          <div className="flex items-start gap-3">
            {/* Icon */}
            <div className={`mt-0.5 ${colors.icon}`}>
              <Icon className="w-5 h-5" />
            </div>

            {/* Content */}
            <div className="flex-1">
              {/* Title with Badge */}
              <div className="flex items-center gap-2 mb-1">
                <div className={`text-sm font-semibold ${colors.title}`}>
                  {config.title}
                </div>
                {config.severity === 'info' && (
                  <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 text-xs font-medium">
                    <Sparkles className="w-3 h-3" />
                    <span>AI</span>
                  </div>
                )}
              </div>
              
              {/* Message */}
              <p className="text-sm text-zinc-300 mb-3 leading-relaxed">
                {config.getMessage(dynamicRange, crestFactor)}
              </p>

              {/* Action Buttons */}
              <div className="flex items-center gap-2">
                {onSwitchToDynamics && config.buttonText && (
                  <button
                    onClick={onSwitchToDynamics}
                    className={`text-xs px-4 py-2 rounded-md font-medium transition-all hover:scale-105 ${colors.button}`}
                  >
                    {config.buttonText}
                  </button>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}