import { Sparkles, TrendingUp, Zap, CheckCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { AIMasteringRecommendation } from '../services/ai-mastering-engine';

interface AIRecommendationPanelProps {
  recommendation: AIMasteringRecommendation | null;
  onApply: () => void;
  onDismiss: () => void;
  isApplying?: boolean;
}

export function AIRecommendationPanel({
  recommendation,
  onApply,
  onDismiss,
  isApplying = false
}: AIRecommendationPanelProps) {
  if (!recommendation) return null;

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 85) return '#10b981'; // emerald
    if (confidence >= 70) return '#f59e0b'; // amber
    return '#ef4444'; // red
  };

  const confidenceColor = getConfidenceColor(recommendation.confidence);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20, height: 0 }}
        animate={{ opacity: 1, y: 0, height: 'auto' }}
        exit={{ opacity: 0, y: -20, height: 0 }}
        className="border-2 rounded-lg p-6 mb-6"
        style={{
          borderColor: confidenceColor,
          background: 'linear-gradient(180deg, #1a1a1a, #0f0f0f)',
          boxShadow: `
            inset 0 2px 4px rgba(0,0,0,0.6),
            0 0 20px ${confidenceColor}33
          `
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div 
              className="w-10 h-10 rounded-full flex items-center justify-center"
              style={{
                background: `linear-gradient(135deg, ${confidenceColor}, ${confidenceColor}dd)`,
                boxShadow: `0 0 16px ${confidenceColor}66`
              }}
            >
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="text-sm font-mono text-zinc-200 uppercase tracking-wider mb-1">
                AI Mastering Recommendation
              </div>
              <div className="flex items-center gap-2">
                <div className="text-[9px] font-mono text-zinc-500 uppercase tracking-wider">
                  Confidence Score
                </div>
                <div 
                  className="px-2 py-0.5 rounded font-mono text-[10px] font-bold"
                  style={{
                    background: `${confidenceColor}22`,
                    color: confidenceColor,
                    border: `1px solid ${confidenceColor}66`
                  }}
                >
                  {recommendation.confidence}%
                </div>
              </div>
            </div>
          </div>

          <button
            onClick={onDismiss}
            className="text-zinc-600 hover:text-zinc-400 transition-colors text-xs font-mono"
          >
            Dismiss
          </button>
        </div>

        {/* AI Reasoning */}
        <div 
          className="p-4 rounded-lg mb-4"
          style={{
            background: 'rgba(0,0,0,0.4)',
            border: '1px solid rgba(255,255,255,0.05)'
          }}
        >
          <div className="flex items-start gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-purple-400 mt-0.5 flex-shrink-0" />
            <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">
              AI Analysis
            </div>
          </div>
          <div className="text-xs font-mono text-zinc-300 leading-relaxed">
            {recommendation.reasoning}
          </div>
        </div>

        {/* Recommended Settings */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          {/* Circuit Drive */}
          <div 
            className="p-3 rounded-lg"
            style={{
              background: 'rgba(0,0,0,0.3)',
              border: '1px solid rgba(255,255,255,0.05)'
            }}
          >
            <div className="text-[9px] font-mono text-zinc-600 uppercase tracking-wider mb-1">
              THD Circuit Drive
            </div>
            <div className="text-lg font-mono text-amber-400">
              {recommendation.circuitDrive}%
            </div>
          </div>

          {/* Logic Mode */}
          <div 
            className="p-3 rounded-lg"
            style={{
              background: 'rgba(0,0,0,0.3)',
              border: '1px solid rgba(255,255,255,0.05)'
            }}
          >
            <div className="text-[9px] font-mono text-zinc-600 uppercase tracking-wider mb-1">
              Logic Mode
            </div>
            <div className="text-lg font-mono text-cyan-400 capitalize">
              {recommendation.logicMode === 'brickwall' ? 'Pressure' : 'Flow'}
            </div>
          </div>

          {/* Gear Profile */}
          <div 
            className="p-3 rounded-lg"
            style={{
              background: 'rgba(0,0,0,0.3)',
              border: '1px solid rgba(255,255,255,0.05)'
            }}
          >
            <div className="text-[9px] font-mono text-zinc-600 uppercase tracking-wider mb-1">
              Gear Profile
            </div>
            <div className="text-xs font-mono text-purple-400 uppercase">
              {recommendation.gearProfile}
            </div>
          </div>

          {/* Target LUFS */}
          <div 
            className="p-3 rounded-lg"
            style={{
              background: 'rgba(0,0,0,0.3)',
              border: '1px solid rgba(255,255,255,0.05)'
            }}
          >
            <div className="text-[9px] font-mono text-zinc-600 uppercase tracking-wider mb-1">
              Target LUFS
            </div>
            <div className="text-lg font-mono text-emerald-400">
              {recommendation.targetLUFS} dB
            </div>
          </div>
        </div>

        {/* Apply Button */}
        <button
          onClick={onApply}
          disabled={isApplying}
          className="w-full py-3 rounded-lg font-mono text-sm uppercase tracking-wider transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
          style={{
            background: isApplying 
              ? 'linear-gradient(180deg, #3f3f46, #27272a)'
              : `linear-gradient(180deg, ${confidenceColor}, ${confidenceColor}dd)`,
            boxShadow: isApplying
              ? 'none'
              : `0 4px 12px ${confidenceColor}44, inset 0 1px 0 rgba(255,255,255,0.2)`,
            color: '#fff'
          }}
        >
          {isApplying ? (
            <span className="flex items-center justify-center gap-2">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              >
                <Zap className="w-4 h-4" />
              </motion.div>
              Applying AI Settings...
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              <Sparkles className="w-4 h-4 group-hover:scale-110 transition-transform" />
              Apply AI Mastering Settings
            </span>
          )}
        </button>
      </motion.div>
    </AnimatePresence>
  );
}