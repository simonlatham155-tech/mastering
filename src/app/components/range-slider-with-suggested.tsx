import type { CSSProperties, ReactNode } from 'react';

function valueToPercent(value: number, min: number, max: number): number {
  if (max <= min) return 0;
  return Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
}

interface RangeSliderWithSuggestedProps {
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
  /** Genre / analysis suggested position on the track */
  suggestedValue?: number | null;
  suggestedLabel?: string;
  className?: string;
  style?: CSSProperties;
  accentClassName?: string;
}

export function RangeSliderWithSuggested({
  min,
  max,
  step,
  value,
  onChange,
  suggestedValue = null,
  suggestedLabel,
  className = '',
  style,
  accentClassName = 'accent-cyan-500',
}: RangeSliderWithSuggestedProps) {
  const showMarker = suggestedValue != null && Number.isFinite(suggestedValue);
  const markerPercent = showMarker ? valueToPercent(suggestedValue, min, max) : 0;
  const differsFromSuggested =
    showMarker && Math.abs(value - suggestedValue!) >= step * 0.5;

  return (
    <div className="relative">
      <div className="relative h-2 flex items-center">
        {showMarker && (
          <div
            className="absolute inset-y-0 w-px pointer-events-none z-10"
            style={{ left: `${markerPercent}%` }}
            aria-hidden
          >
            <div
              className="absolute -top-0.5 bottom-0 left-1/2 w-0.5 -translate-x-1/2 rounded-full bg-cyan-400"
              style={{
                boxShadow: '0 0 5px rgba(34, 211, 238, 0.85), 0 0 10px rgba(34, 211, 238, 0.35)',
              }}
              title={
                suggestedLabel ??
                `Suggested: ${typeof suggestedValue === 'number' ? suggestedValue.toFixed(1) : suggestedValue}`
              }
            />
          </div>
        )}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className={`relative z-20 w-full h-2 rounded-full appearance-none cursor-pointer ${accentClassName} ${className}`}
          style={style}
        />
      </div>
      {showMarker && differsFromSuggested && (
        <div className="mt-0.5 text-[9px] font-mono text-cyan-500/70">
          Suggested{' '}
          {suggestedLabel ??
            (typeof suggestedValue === 'number' ? suggestedValue.toFixed(1) : suggestedValue)}
        </div>
      )}
    </div>
  );
}

interface SuggestedButtonGroupProps<T extends string> {
  options: T[];
  value: T;
  suggestedValue?: T | null;
  onChange: (value: T) => void;
  renderLabel?: (option: T) => ReactNode;
  activeClassName?: string;
  inactiveClassName?: string;
}

export function SuggestedButtonGroup<T extends string>({
  options,
  value,
  suggestedValue = null,
  onChange,
  renderLabel = (option) => option,
  activeClassName = 'border-purple-500/60 bg-purple-950/40 text-purple-300',
  inactiveClassName = 'border-zinc-800 bg-zinc-950/50 text-zinc-500 hover:border-zinc-600',
}: SuggestedButtonGroupProps<T>) {
  return (
    <div className="flex gap-2">
      {options.map((option) => {
        const isActive = value === option;
        const isSuggested = suggestedValue === option;
        return (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            className={`relative flex-1 py-2 rounded border text-[10px] font-mono uppercase tracking-wider transition-colors ${
              isActive ? activeClassName : inactiveClassName
            }`}
          >
            {renderLabel(option)}
            {isSuggested && (
              <span
                className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-4 h-0.5 rounded-full bg-cyan-400"
                style={{ boxShadow: '0 0 4px rgba(34, 211, 238, 0.8)' }}
                aria-hidden
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
