import type { ReactNode } from 'react';

interface ProRackSectionProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
}

export function ProRackSection({ title, subtitle, children }: ProRackSectionProps) {
  return (
    <section className="mb-8">
      <div className="mb-3 px-1">
        <h2 className="text-[10px] font-mono text-zinc-400 uppercase tracking-[0.25em]">
          {title}
        </h2>
        {subtitle && (
          <p className="text-[10px] font-mono text-zinc-600 mt-1 max-w-2xl leading-relaxed">
            {subtitle}
          </p>
        )}
      </div>
      <div
        className="rounded-lg border-2 p-5 space-y-5"
        style={{
          borderColor: '#2a2a2a',
          background: 'linear-gradient(180deg, #1a1a1a, #0f0f0f)',
        }}
      >
        {children}
      </div>
    </section>
  );
}
