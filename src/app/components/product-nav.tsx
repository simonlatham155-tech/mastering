/**
 * Latham Audio product line navigation.
 */

const BASE = 'https://simonlatham155-tech.github.io/mastering';

export function ProductNav() {
  const links = [
    { label: 'Mastering Suite', href: `${BASE}/`, active: true },
    { label: 'A/B Demo', href: `${BASE}/#/demo`, active: false },
    { label: 'Plugins', href: `${BASE}/`, active: false, soon: true },
  ];

  return (
    <nav
      className="flex flex-wrap items-center gap-2 mb-6"
      aria-label="Latham Audio products"
    >
      {links.map((link) => (
        <a
          key={link.label}
          href={link.href}
          className={`px-3 py-1.5 rounded-md text-[10px] font-mono uppercase tracking-wider border transition-colors ${
            link.active
              ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-300'
              : link.soon
                ? 'border-zinc-800 text-zinc-600 cursor-default pointer-events-none'
                : 'border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200'
          }`}
          aria-current={link.active ? 'page' : undefined}
        >
          {link.label}
          {link.soon && (
            <span className="ml-1.5 text-[8px] text-zinc-600 normal-case">soon</span>
          )}
        </a>
      ))}
    </nav>
  );
}
