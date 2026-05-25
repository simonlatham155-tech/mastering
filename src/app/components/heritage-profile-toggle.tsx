import { motion } from 'motion/react';
import { Zap, Disc, Radio } from 'lucide-react';

export type HeritageProfile = 'ssl' | 'tape' | 'neve';

interface HeritageProfileToggleProps {
  value: HeritageProfile;
  onChange: (profile: HeritageProfile) => void;
  disabled?: boolean;
}

const PROFILES: Record<HeritageProfile, {
  label: string;
  description: string;
  icon: typeof Zap;
  color: string;
  gradient: string;
}> = {
  ssl: {
    label: 'Modern Clean',
    description: 'VCA Bus Glue • Transparent • Precise',
    icon: Zap,
    color: 'from-blue-500 to-cyan-500',
    gradient: 'bg-gradient-to-br from-blue-500/20 to-cyan-500/20',
  },
  tape: {
    label: '70s Tape',
    description: 'Magnetic Saturation • Vintage • Warmth',
    icon: Disc,
    color: 'from-amber-500 to-orange-500',
    gradient: 'bg-gradient-to-br from-amber-500/20 to-orange-500/20',
  },
  neve: {
    label: 'Transformer Weight',
    description: 'Harmonic Thickness • Classic • Punch',
    icon: Radio,
    color: 'from-purple-500 to-pink-500',
    gradient: 'bg-gradient-to-br from-purple-500/20 to-pink-500/20',
  },
};

export function HeritageProfileToggle({ value, onChange, disabled }: HeritageProfileToggleProps) {
  return (
    <div className="space-y-3">
      {/* Label */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-zinc-100">Heritage Profile</h3>
          <p className="text-xs text-zinc-400 mt-0.5">Choose your processing era</p>
        </div>
      </div>

      {/* Toggle Buttons */}
      <div className="grid grid-cols-3 gap-2">
        {(Object.keys(PROFILES) as HeritageProfile[]).map((profile) => {
          const config = PROFILES[profile];
          const Icon = config.icon;
          const isActive = value === profile;

          return (
            <motion.button
              key={profile}
              onClick={() => !disabled && onChange(profile)}
              disabled={disabled}
              whileHover={!disabled ? { scale: 1.02 } : {}}
              whileTap={!disabled ? { scale: 0.98 } : {}}
              className={`relative p-4 rounded-xl border-2 transition-all ${
                isActive
                  ? `border-transparent ${config.gradient}`
                  : 'border-zinc-700 bg-zinc-800/50 hover:border-zinc-600'
              } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              {/* Gradient Border Effect */}
              {isActive && (
                <motion.div
                  layoutId="heritage-profile-highlight"
                  className={`absolute inset-0 rounded-xl bg-gradient-to-br ${config.color} opacity-20`}
                  transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                />
              )}

              {/* Content */}
              <div className="relative z-10 flex flex-col items-center gap-2">
                {/* Icon */}
                <div
                  className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    isActive
                      ? `bg-gradient-to-br ${config.color}`
                      : 'bg-zinc-700/50'
                  }`}
                >
                  <Icon
                    className={`w-5 h-5 ${
                      isActive ? 'text-white' : 'text-zinc-400'
                    }`}
                  />
                </div>

                {/* Label */}
                <div className="text-center">
                  <div
                    className={`text-sm font-semibold ${
                      isActive ? 'text-white' : 'text-zinc-300'
                    }`}
                  >
                    {config.label}
                  </div>
                  <div
                    className={`text-xs mt-0.5 leading-tight ${
                      isActive ? 'text-zinc-300' : 'text-zinc-500'
                    }`}
                  >
                    {config.description}
                  </div>
                </div>

                {/* Active Indicator */}
                {isActive && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className={`w-2 h-2 rounded-full bg-gradient-to-br ${config.color}`}
                  />
                )}
              </div>
            </motion.button>
          );
        })}
      </div>

      {/* Processing Info */}
      <div className="p-3 rounded-lg bg-zinc-800/50 border border-zinc-700">
        <div className="flex items-start gap-2">
          <div className="text-xs text-zinc-400 leading-relaxed">
            <span className="font-medium text-zinc-300">
              {PROFILES[value].label}
            </span>
            {' • '}
            {value === 'ssl' && 'Focuses on pristine VCA compression and surgical EQ. Ideal for modern EDM, pop, and festival tracks.'}
            {value === 'tape' && 'Emphasizes 3rd-order harmonic saturation and vintage compression. Perfect for organic, emotional productions.'}
            {value === 'neve' && 'Highlights transformer warmth and 2nd-order harmonics. Classic choice for punchy, weighted mixes.'}
          </div>
        </div>
      </div>
    </div>
  );
}