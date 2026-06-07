/**
 * Latham Audio product line — factual credits for Simon Latham.
 */

export function CreatorAboutStrip({ variant = 'full' }: { variant?: 'full' | 'compact' }) {
  if (variant === 'compact') {
    return (
      <p className="text-[11px] font-mono text-zinc-500 leading-relaxed border-l-2 border-zinc-700 pl-3">
        <span className="text-zinc-400">Latham Audio</span> — Simon Latham (Soundsation with Pete
        Lunn, Airport Route Recordings). Dance music since the 1990s. Documented DJ support includes
        Pete Tong, Sasha, John Digweed, Dave Seaman, Armin van Buuren and Paul Oakenfold.
      </p>
    );
  }

  return (
    <div className="rounded-lg border border-zinc-800/80 px-4 py-3 mb-8 bg-zinc-950/40">
      <div className="text-[10px] font-mono text-zinc-600 uppercase tracking-[0.2em] mb-1">
        Latham Audio
      </div>
      <div className="text-sm text-zinc-200 font-medium tracking-tight">
        Simon Latham
        <span className="text-zinc-500 font-normal">
          {' '}
          · Soundsation · Airport Route Recordings
        </span>
      </div>
      <p className="mt-2 text-xs text-zinc-500 leading-relaxed max-w-4xl font-mono">
        Latham Audio is Simon Latham&apos;s mastering product line. Producer and vocalist;
        co-founded Soundsation with Pete Lunn in the 1990s progressive house era. Soundsation —{' '}
        <span className="text-zinc-400">Do You Feel It?</span> (1996) — received support from John
        Digweed, Sasha, Pete Tong and Dave Seaman; later reissued on Airport Route Recordings. Solo
        releases include <span className="text-zinc-400">iBreathe</span> (2012). Subsequent work has
        been supported by Armin van Buuren, Paul Oakenfold and others (Beatport artist profile).
      </p>
    </div>
  );
}
