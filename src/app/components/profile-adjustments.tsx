import { Sliders } from 'lucide-react';

export interface ProfileAdjustments {
  lowShelfBoost: number;      // -6 to +6 dB
  midRangeAdjust: number;      // -6 to +6 dB
  highShelfBoost: number;      // -6 to +6 dB
  stereoWidth: number;         // 0 to 100%
  saturationAmount: number;    // 0 to 100%
  // REMOVED: compressionRatio (derived from loudnessStyle)
  // REMOVED: targetLUFS (comes from export preset)
}

interface ProfileAdjustmentsProps {
  adjustments: ProfileAdjustments;
  onChange: (adjustments: ProfileAdjustments) => void;
}

export function ProfileAdjustmentsPanel({ adjustments, onChange }: ProfileAdjustmentsProps) {
  const updateValue = (key: keyof ProfileAdjustments, value: number) => {
    onChange({ ...adjustments, [key]: value });
  };

  return (
    <div 
      className="border rounded-lg p-4"
      style={{
        background: 'linear-gradient(180deg, #0f0f0f, #0a0a0a)',
        borderColor: '#2a2a2a',
        boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5)'
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <Sliders className="w-4 h-4 text-amber-500" />
        <div className="text-sm font-mono text-zinc-500 uppercase tracking-[0.2em]">
          Profile Adjustments
        </div>
      </div>

      <div className="space-y-4">
        {/* EQ SHAPING */}
        <div>
          <div className="text-xs font-mono text-amber-500/60 uppercase tracking-wider mb-2">
            EQ Shaping
          </div>
          <div className="space-y-3">
            {/* Low Shelf */}
            <div>
              <div className="flex justify-between items-baseline mb-1">
                <span className="text-xs font-mono text-zinc-600">Low Shelf (80Hz)</span>
                <span className="text-sm font-mono text-cyan-400">
                  {adjustments.lowShelfBoost > 0 ? '+' : ''}{adjustments.lowShelfBoost.toFixed(1)}dB
                </span>
              </div>
              <input
                type="range"
                min="-6"
                max="6"
                step="0.5"
                value={adjustments.lowShelfBoost}
                onChange={(e) => updateValue('lowShelfBoost', parseFloat(e.target.value))}
                className="w-full h-2 rounded-full appearance-none cursor-pointer"
                style={{
                  background: `linear-gradient(to right, 
                    #0a0a0a 0%, 
                    #0ea5e9 ${((adjustments.lowShelfBoost + 6) / 12) * 100}%, 
                    #27272a ${((adjustments.lowShelfBoost + 6) / 12) * 100}%, 
                    #27272a 100%)`
                }}
              />
            </div>

            {/* Mid Range */}
            <div>
              <div className="flex justify-between items-baseline mb-1">
                <span className="text-xs font-mono text-zinc-600">Mud Cut (250Hz)</span>
                <span className="text-sm font-mono text-emerald-400">
                  {adjustments.midRangeAdjust > 0 ? '+' : ''}{adjustments.midRangeAdjust.toFixed(1)}dB
                </span>
              </div>
              <input
                type="range"
                min="-6"
                max="6"
                step="0.5"
                value={adjustments.midRangeAdjust}
                onChange={(e) => updateValue('midRangeAdjust', parseFloat(e.target.value))}
                className="w-full h-2 rounded-full appearance-none cursor-pointer"
                style={{
                  background: `linear-gradient(to right, 
                    #0a0a0a 0%, 
                    #10b981 ${((adjustments.midRangeAdjust + 6) / 12) * 100}%, 
                    #27272a ${((adjustments.midRangeAdjust + 6) / 12) * 100}%, 
                    #27272a 100%)`
                }}
              />
            </div>

            {/* High Shelf */}
            <div>
              <div className="flex justify-between items-baseline mb-1">
                <span className="text-xs font-mono text-zinc-600">High Shelf (12kHz)</span>
                <span className="text-sm font-mono text-blue-400">
                  {adjustments.highShelfBoost > 0 ? '+' : ''}{adjustments.highShelfBoost.toFixed(1)}dB
                </span>
              </div>
              <input
                type="range"
                min="-6"
                max="6"
                step="0.5"
                value={adjustments.highShelfBoost}
                onChange={(e) => updateValue('highShelfBoost', parseFloat(e.target.value))}
                className="w-full h-2 rounded-full appearance-none cursor-pointer"
                style={{
                  background: `linear-gradient(to right, 
                    #0a0a0a 0%, 
                    #3b82f6 ${((adjustments.highShelfBoost + 6) / 12) * 100}%, 
                    #27272a ${((adjustments.highShelfBoost + 6) / 12) * 100}%, 
                    #27272a 100%)`
                }}
              />
            </div>
          </div>
        </div>

        {/* STEREO WIDTH */}
        <div>
          <div className="text-xs font-mono text-amber-500/60 uppercase tracking-wider mb-2">
            Stereo Width
          </div>
          <div>
            <div className="flex justify-between items-baseline mb-1">
              <span className="text-sm font-mono text-purple-400">{adjustments.stereoWidth}%</span>
              <span className="text-xs font-mono text-zinc-600">0-100%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={adjustments.stereoWidth}
              onChange={(e) => updateValue('stereoWidth', parseFloat(e.target.value))}
              className="w-full h-2 rounded-full appearance-none cursor-pointer"
              style={{
                background: `linear-gradient(to right, 
                  #0a0a0a 0%, 
                  #a855f7 ${adjustments.stereoWidth}%, 
                  #27272a ${adjustments.stereoWidth}%, 
                  #27272a 100%)`
              }}
            />
          </div>
        </div>

        {/* SATURATION */}
        <div>
          <div className="text-xs font-mono text-amber-500/60 uppercase tracking-wider mb-2">
            Saturation
          </div>
          <div>
            <div className="flex justify-between items-baseline mb-1">
              <span className="text-sm font-mono text-orange-400">{adjustments.saturationAmount}%</span>
              <span className="text-xs font-mono text-zinc-600">0-100%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={adjustments.saturationAmount}
              onChange={(e) => updateValue('saturationAmount', parseFloat(e.target.value))}
              className="w-full h-2 rounded-full appearance-none cursor-pointer"
              style={{
                background: `linear-gradient(to right, 
                  #0a0a0a 0%, 
                  #fb923c ${adjustments.saturationAmount}%, 
                  #27272a ${adjustments.saturationAmount}%, 
                  #27272a 100%)`
              }}
            />
          </div>
        </div>
      </div>

      <style>{`
        input[type="range"]::-webkit-slider-thumb {
          appearance: none;
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: linear-gradient(180deg, #ffffff, #d1d5db);
          cursor: pointer;
          border: 2px solid #0a0a0a;
          box-shadow: 0 2px 4px rgba(0,0,0,0.5);
        }
        input[type="range"]::-moz-range-thumb {
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: linear-gradient(180deg, #ffffff, #d1d5db);
          cursor: pointer;
          border: 2px solid #0a0a0a;
          box-shadow: 0 2px 4px rgba(0,0,0,0.5);
        }
      `}</style>
    </div>
  );
}