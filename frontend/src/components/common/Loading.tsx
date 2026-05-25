export function Loading({ label = 'Loading' }: { label?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex h-full w-full items-center justify-center gap-2 text-sm text-slate-400"
    >
      <span>{label}</span>
      <span className="inline-flex gap-[3px]" aria-hidden>
        <Dot delay="0ms" />
        <Dot delay="160ms" />
        <Dot delay="320ms" />
      </span>
      <style>{`
        @keyframes loading-dot {
          0%, 80%, 100% { opacity: 0.25; transform: translateY(0); }
          40% { opacity: 1; transform: translateY(-2px); }
        }
      `}</style>
    </div>
  );
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="inline-block h-1 w-1 rounded-full bg-current"
      style={{
        animation: 'loading-dot 1100ms var(--ease-in-out) infinite',
        animationDelay: delay,
      }}
    />
  );
}
