import { BRAND } from '@/branding/branding';
import { StatusPill } from '@/components/common/StatusPill';

export function AppBar() {
  return (
    <header
      className="flex items-center gap-3 border-b border-surface-2 bg-surface-1 px-4"
      style={{ height: BRAND.appBarHeight }}
    >
      <img src={BRAND.logoPath} alt="" className="h-7 w-7" />
      <span className="text-base font-semibold tracking-tight">
        {BRAND.appName}
      </span>

      {/* Health pills are stubbed in Phase 1 — wired to live data in Phase 2.4. */}
      <div className="ml-6 flex items-center gap-2">
        <StatusPill state="idle" label="MQTT" title="Awaiting Phase 2 wiring" />
        <StatusPill state="idle" label="DB"   title="Awaiting Phase 2 wiring" />
        <StatusPill state="idle" label="ROS"  title="Awaiting Phase 2 wiring" />
      </div>

      <div className="ml-auto text-xs text-slate-400">
        {/* Reserved for fleet selector + user menu. */}
      </div>
    </header>
  );
}
