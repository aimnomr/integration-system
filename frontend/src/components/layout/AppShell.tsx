import { Outlet } from 'react-router-dom';
import { AppBar } from './AppBar';
import { LeftNav } from './LeftNav';

export function AppShell() {
  return (
    <div className="flex h-full flex-col bg-surface-0 text-slate-100">
      <AppBar />
      <div className="flex flex-1 overflow-hidden">
        <LeftNav />
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
