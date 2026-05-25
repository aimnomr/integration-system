import { NavLink } from 'react-router-dom';
import {
  Dashboard as DashboardIcon,
  SmartToy as RobotIcon,
  Send as DispatchIcon,
  History as OrdersIcon,
  Analytics as OeeIcon,
  Videocam as TeleopIcon,
  Map as MapIcon,
  Place as LocationIcon,
  Group as RobotsAdminIcon,
  Settings as FleetIcon,
  HealthAndSafety as HealthIcon,
} from '@mui/icons-material';
import type { ComponentType } from 'react';
import { BRAND } from '@/branding/branding';

interface NavItem {
  to: string;
  label: string;
  icon: ComponentType;
}

const PRIMARY: NavItem[] = [
  { to: '/',          label: 'Dashboard',  icon: DashboardIcon },
  { to: '/robots',    label: 'Robots',     icon: RobotIcon },
  { to: '/dispatch',  label: 'Dispatch',   icon: DispatchIcon },
  { to: '/orders',    label: 'Orders',     icon: OrdersIcon },
  { to: '/oee',       label: 'OEE',        icon: OeeIcon },
  { to: '/teleop',    label: 'Teleop',     icon: TeleopIcon },
  { to: '/health',    label: 'Health',     icon: HealthIcon },
];

const ADMIN: NavItem[] = [
  { to: '/admin/maps',       label: 'Maps',         icon: MapIcon },
  { to: '/admin/locations',  label: 'Locations',    icon: LocationIcon },
  { to: '/admin/robots',     label: 'Robots',       icon: RobotsAdminIcon },
  { to: '/admin/fleet',      label: 'Fleet Config', icon: FleetIcon },
];

function NavSection({ title, items }: { title: string; items: NavItem[] }) {
  return (
    <div className="px-2 py-2">
      <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
        {title}
      </div>
      <ul className="flex flex-col">
        {items.map(({ to, label, icon: Icon }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                [
                  'nav-link relative flex items-center gap-3 rounded-md px-3 py-2 text-sm',
                  isActive ? 'is-active text-white' : 'text-slate-300',
                ].join(' ')
              }
            >
              <Icon />
              <span>{label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function LeftNav() {
  return (
    <aside
      className="shrink-0 border-r border-surface-2 bg-surface-1"
      style={{ width: BRAND.navWidth }}
    >
      <nav className="flex h-full flex-col overflow-y-auto">
        <NavSection title="Operate" items={PRIMARY} />
        <div className="my-1 border-t border-surface-2" />
        <NavSection title="Admin" items={ADMIN} />
      </nav>
      <style>{`
        .nav-link {
          transition:
            background-color var(--dur-hover) var(--ease-out),
            color var(--dur-hover) var(--ease-out),
            transform var(--dur-press) var(--ease-out);
        }
        .nav-link::before {
          content: '';
          position: absolute;
          left: 0;
          top: 6px;
          bottom: 6px;
          width: 2px;
          border-radius: 1px;
          background: var(--brand-primary);
          transform: scaleY(0);
          transform-origin: center;
          transition: transform 180ms var(--ease-out);
        }
        .nav-link.is-active::before {
          transform: scaleY(1);
        }
        .nav-link:active {
          transform: scale(0.99);
        }
        @media (hover: hover) and (pointer: fine) {
          .nav-link:not(.is-active):hover {
            background-color: color-mix(in oklab, #334155 60%, transparent);
            color: white;
          }
        }
      `}</style>
    </aside>
  );
}
