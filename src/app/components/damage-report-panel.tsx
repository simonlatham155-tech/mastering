import { AlertTriangle, CheckCircle, Shield, TrendingUp, Zap } from 'lucide-react';
import { Card } from './ui/card';
import { Badge } from './ui/badge';

interface DamageReportPanelProps {
  damageReport?: {
    peakBeforeLimiter: number;
    makeupGainApplied: number;
    estimatedLimiterGR: number;
    estimatedLimiterPeakGR: number;
    safetyCeilingEngaged: boolean;
    safetyCeilingDB: number;
    finalPeakDBTP: number;
    qualityVerdict: 'safe' | 'warning' | 'danger';
    recommendations?: string[];
  };
}

/**
 * DAMAGE REPORT PANEL
 * Displays quality guardrails and processing metrics
 * Shows when limiter is being pushed too hard (brickwall territory)
 * 
 * Added: 2026-02-16
 * Purpose: Make "brickwall-ish" results visible and preventable
 */
export function DamageReportPanel({ damageReport }: DamageReportPanelProps) {
  if (!damageReport) {
    return null;
  }

  const {
    peakBeforeLimiter,
    makeupGainApplied,
    estimatedLimiterGR,
    estimatedLimiterPeakGR,
    safetyCeilingEngaged,
    safetyCeilingDB,
    finalPeakDBTP,
    qualityVerdict,
    recommendations
  } = damageReport;

  // Determine status colors and icons
  const getStatusColor = () => {
    switch (qualityVerdict) {
      case 'safe':
        return 'text-green-500 bg-green-500/10 border-green-500/20';
      case 'warning':
        return 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20';
      case 'danger':
        return 'text-red-500 bg-red-500/10 border-red-500/20';
    }
  };

  const getStatusIcon = () => {
    switch (qualityVerdict) {
      case 'safe':
        return <CheckCircle className="w-5 h-5" />;
      case 'warning':
        return <AlertTriangle className="w-5 h-5" />;
      case 'danger':
        return <AlertTriangle className="w-5 h-5" />;
    }
  };

  const getStatusText = () => {
    switch (qualityVerdict) {
      case 'safe':
        return 'Healthy Processing';
      case 'warning':
        return 'Pushing Limits';
      case 'danger':
        return 'Quality At Risk';
    }
  };

  return (
    <Card className={`p-4 border ${getStatusColor()}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {getStatusIcon()}
          <h3 className="font-semibold">Quality Guardrails</h3>
        </div>
        <Badge variant={qualityVerdict === 'safe' ? 'default' : 'destructive'}>
          {getStatusText()}
        </Badge>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        {/* Peak Before Limiter */}
        <div className="bg-zinc-900/50 rounded p-3">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-purple-400" />
            <span className="text-xs text-zinc-400">Peak Before Limiter</span>
          </div>
          <div className="text-lg font-mono">
            {peakBeforeLimiter.toFixed(1)} <span className="text-xs text-zinc-500">dBFS</span>
          </div>
        </div>

        {/* Makeup Gain */}
        <div className="bg-zinc-900/50 rounded p-3">
          <div className="flex items-center gap-2 mb-1">
            <Zap className="w-4 h-4 text-cyan-400" />
            <span className="text-xs text-zinc-400">Makeup Gain</span>
          </div>
          <div className="text-lg font-mono">
            {makeupGainApplied >= 0 ? '+' : ''}{makeupGainApplied.toFixed(1)}{' '}
            <span className="text-xs text-zinc-500">dB</span>
          </div>
          {Math.abs(makeupGainApplied) > 8 && (
            <div className="text-[10px] text-yellow-400 mt-1">⚠️ High</div>
          )}
        </div>

        {/* Limiter GR */}
        <div className="bg-zinc-900/50 rounded p-3">
          <div className="flex items-center gap-2 mb-1">
            <Zap className="w-4 h-4 text-orange-400" />
            <span className="text-xs text-zinc-400">Limiter GR</span>
          </div>
          <div className="text-lg font-mono">
            ~{estimatedLimiterGR.toFixed(1)} <span className="text-xs text-zinc-500">dB avg</span>
          </div>
          <div className="text-[10px] text-zinc-500 mt-1">
            Peak: ~{estimatedLimiterPeakGR.toFixed(1)} dB
          </div>
        </div>

        {/* Safety Ceiling */}
        <div className="bg-zinc-900/50 rounded p-3">
          <div className="flex items-center gap-2 mb-1">
            <Shield className="w-4 h-4 text-blue-400" />
            <span className="text-xs text-zinc-400">Safety Ceiling</span>
          </div>
          <div className="text-lg font-mono">
            {safetyCeilingDB.toFixed(1)} <span className="text-xs text-zinc-500">dBTP</span>
          </div>
          {safetyCeilingEngaged ? (
            <div className="text-[10px] text-red-400 mt-1">🚨 Engaged!</div>
          ) : (
            <div className="text-[10px] text-green-400 mt-1">
              ✅ {Math.abs(finalPeakDBTP - safetyCeilingDB).toFixed(1)}dB headroom
            </div>
          )}
        </div>
      </div>

      {/* Recommendations */}
      {recommendations && recommendations.length > 0 && (
        <div className="bg-zinc-900/30 rounded p-3">
          <div className="text-xs font-semibold text-zinc-300 mb-2">
            💡 Recommendations:
          </div>
          <ul className="text-xs text-zinc-400 space-y-1">
            {recommendations.map((rec, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-zinc-600 mt-0.5">→</span>
                <span>{rec}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Technical Details (Collapsible) */}
      <details className="mt-3">
        <summary className="text-xs text-zinc-500 cursor-pointer hover:text-zinc-300">
          Technical Details
        </summary>
        <div className="mt-2 text-[10px] font-mono text-zinc-600 space-y-1 pl-4">
          <div>Input Peak + Makeup: {peakBeforeLimiter.toFixed(2)} dBFS</div>
          <div>Final Peak: {finalPeakDBTP.toFixed(2)} dBTP</div>
          <div>Estimated Avg GR: {estimatedLimiterGR.toFixed(2)} dB</div>
          <div>Estimated Peak GR: {estimatedLimiterPeakGR.toFixed(2)} dB</div>
          <div>Safety Engaged: {safetyCeilingEngaged ? 'YES ⚠️' : 'NO ✅'}</div>
        </div>
      </details>

      {/* Info */}
      <div className="mt-3 pt-3 border-t border-zinc-800">
        <div className="text-[9px] text-zinc-600 leading-relaxed">
          <span className="font-semibold text-purple-400">QUALITY GUARDRAILS:</span> The limiter
          should act as a safety net (&lt;1dB GR). If GR exceeds 6dB, you're entering
          "brickwall territory" with audible distortion. Use Safe Export Mode or reduce
          target LUFS for transparent results.
        </div>
      </div>
    </Card>
  );
}
