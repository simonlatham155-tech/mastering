import { Sliders } from 'lucide-react';
import { RangeSliderWithSuggested } from './range-slider-with-suggested';
import { getSuggestedProfileAdjustments } from '../utils/suggested-settings';
import type { GearProfileId } from './gear-selector';

export interface ProfileAdjustments {
  lowShelfBoost: number;      // -6 to +6 dB
  midRangeAdjust: number;      // -6 to +6 dB
  highShelfBoost: number;      // -6 to +6 dB
  stereoWidth: number;         // 0 to 100%
}

interface ProfileAdjustmentsProps {
  adjustments: ProfileAdjustments;
  onChange: (adjustments: ProfileAdjustments) => void;
  gearProfile: GearProfileId;
}

function eqTrackGradient(value: number, color: string): string {
  const pct = ((value + 6) / 12) * 100;
  return `linear-gradient(to right, #0a0a0a 0%, ${color} ${pct}%, #27272a ${pct}%, #27272a 100%)`;
}

export function ProfileAdjustmentsPanel({
  adjustments,
  onChange,
  gearProfile,
}: ProfileAdjustmentsProps) {
  const suggested = getSuggestedProfileAdjustments(gearProfile);

  const updateValue = (key: keyof ProfileAdjustments, value: number) => {
    onChange({ ...adjustments, [key]: value });
  };

  return (
    <div className="space-y-4 pt-5 border-t border-zinc-800/80">
      <div className="flex items-center gap-2 mb-4">
        <Sliders className="w-4 h-4 text-amber-500" />
        <div className="text-sm font-mono text-zinc-500 uppercase tracking-[0.2em]">
          Profile Adjustments
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <div className="text-xs font-mono text-amber-500/60 uppercase tracking-wider mb-2">
            EQ Shaping
          </div>
          <div className="space-y-3">
            <div>
              <div className="flex justify-between items-baseline mb-1">
                <span className="text-xs font-mono text-zinc-600">Low Shelf (80Hz) ±</span>
                <span className="text-sm font-mono text-cyan-400">
                  {adjustments.lowShelfBoost > 0 ? '+' : ''}{adjustments.lowShelfBoost.toFixed(1)}dB
                </span>
              </div>
              <RangeSliderWithSuggested
                min={-6}
                max={6}
                step={0.5}
                value={adjustments.lowShelfBoost}
                suggestedValue={suggested?.lowShelfBoost}
                suggestedLabel={
                  suggested != null
                    ? `${suggested.lowShelfBoost > 0 ? '+' : ''}${suggested.lowShelfBoost.toFixed(1)} dB`
                    : undefined
                }
                style={{ background: eqTrackGradient(adjustments.lowShelfBoost, '#0ea5e9') }}
                onChange={(v) => updateValue('lowShelfBoost', v)}
              />
            </div>

            <div>
              <div className="flex justify-between items-baseline mb-1">
                <span className="text-xs font-mono text-zinc-600">Mud Cut (250Hz) ±</span>
                <span className="text-sm font-mono text-emerald-400">
                  {adjustments.midRangeAdjust > 0 ? '+' : ''}{adjustments.midRangeAdjust.toFixed(1)}dB
                </span>
              </div>
              <RangeSliderWithSuggested
                min={-6}
                max={6}
                step={0.5}
                value={adjustments.midRangeAdjust}
                suggestedValue={suggested?.midRangeAdjust}
                suggestedLabel={
                  suggested != null
                    ? `${suggested.midRangeAdjust > 0 ? '+' : ''}${suggested.midRangeAdjust.toFixed(1)} dB`
                    : undefined
                }
                style={{ background: eqTrackGradient(adjustments.midRangeAdjust, '#10b981') }}
                onChange={(v) => updateValue('midRangeAdjust', v)}
              />
            </div>

            <div>
              <div className="flex justify-between items-baseline mb-1">
                <span className="text-xs font-mono text-zinc-600">High Shelf (12kHz) ±</span>
                <span className="text-sm font-mono text-blue-400">
                  {adjustments.highShelfBoost > 0 ? '+' : ''}{adjustments.highShelfBoost.toFixed(1)}dB
                </span>
              </div>
              <RangeSliderWithSuggested
                min={-6}
                max={6}
                step={0.5}
                value={adjustments.highShelfBoost}
                suggestedValue={suggested?.highShelfBoost}
                suggestedLabel={
                  suggested != null
                    ? `${suggested.highShelfBoost > 0 ? '+' : ''}${suggested.highShelfBoost.toFixed(1)} dB`
                    : undefined
                }
                style={{ background: eqTrackGradient(adjustments.highShelfBoost, '#3b82f6') }}
                onChange={(v) => updateValue('highShelfBoost', v)}
              />
            </div>
          </div>
        </div>

        <div>
          <div className="text-xs font-mono text-amber-500/60 uppercase tracking-wider mb-2">
            Stereo Width
          </div>
          <div>
            <div className="flex justify-between items-baseline mb-1">
              <span className="text-sm font-mono text-purple-400">{adjustments.stereoWidth}%</span>
              <span className="text-xs font-mono text-zinc-600">0-100%</span>
            </div>
            <RangeSliderWithSuggested
              min={0}
              max={100}
              step={5}
              value={adjustments.stereoWidth}
              suggestedValue={suggested?.stereoWidth}
              suggestedLabel={suggested != null ? `${suggested.stereoWidth}%` : undefined}
              accentClassName="accent-purple-500"
              style={{
                background: `linear-gradient(to right, #0a0a0a 0%, #a855f7 ${adjustments.stereoWidth}%, #27272a ${adjustments.stereoWidth}%, #27272a 100%)`,
              }}
              onChange={(v) => updateValue('stereoWidth', v)}
            />
          </div>
        </div>
      </div>

      <p className="text-[10px] font-mono text-zinc-600 mt-3 leading-relaxed">
        <span className="inline-block w-0.5 h-2.5 bg-cyan-400 rounded-full align-middle mr-1.5" />
        Tonal match writes here — manual tweaks stack on top · 0 dB = genre default · Harmonic
        color is on the <span className="text-amber-400">THD knob</span>
      </p>

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
