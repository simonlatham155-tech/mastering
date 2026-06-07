/**
 * Compact creator credibility — shared by main suite and A/B demo.
 */

export function CreatorAboutStrip({ variant = 'full' }: { variant?: 'full' | 'compact' }) {
  if (variant === 'compact') {
    return (
      <p className="text-[11px] font-mono text-zinc-500 leading-relaxed border-l-2 border-cyan-500/40 pl-3">
        By{' '}
        <span className="text-zinc-300">Simon Latham</span>
        {' — '}
        30 years in dance music (Soundsation, Airport Route). Supported by Pete Tong, Sasha,
        Digweed, Armin and more. This chain encodes that room, not a black box.
      </p>
    );
  }

  return (
    <div
      className="rounded-lg border border-zinc-800/80 px-4 py-3 mb-8"
      style={{
        background: 'linear-gradient(90deg, rgba(8,145,178,0.06) 0%, rgba(0,0,0,0) 55%)',
      }}
    >
      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-baseline sm:justify-between">
        <div>
          <div className="text-[10px] font-mono text-cyan-500/80 uppercase tracking-[0.25em] mb-1">
            Built by a producer, not a startup
          </div>
          <div className="text-sm text-zinc-200 font-medium tracking-tight">
            Simon Latham
            <span className="text-zinc-500 font-normal">
              {' '}
              · Soundsation · Airport Route Recordings
            </span>
          </div>
        </div>
        <div className="text-[10px] font-mono text-zinc-600 uppercase tracking-wider shrink-0">
          30 years in dance music
        </div>
      </div>
      <p className="mt-2 text-xs text-zinc-400 leading-relaxed max-w-4xl">
        From early progressive house through trance and club — records supported by{' '}
        <span className="text-zinc-300">
          Pete Tong, Sasha, John Digweed, Dave Seaman, Armin van Buuren, Paul Oakenfold
        </span>{' '}
        and the DJs who defined the scene. Latham Audio is the mastering chain built from that
        experience: genre-aware, meter-verified, and transparent — not anonymous automated
        processing.
      </p>
    </div>
  );
}
