export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center text-sm text-slate-400">
      {label}
    </div>
  );
}
