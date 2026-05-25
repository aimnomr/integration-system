import { useSyncExternalStore } from 'react';

/**
 * Shared 1 Hz wall-clock subscription. Components calling `useNow()` re-render
 * once per second from a single interval, so "Xs ago" labels stay live without
 * each tile owning its own ticker.
 */
let listeners = new Set<() => void>();
let intervalId: ReturnType<typeof setInterval> | null = null;
let snapshot = Date.now();

function ensureRunning() {
  if (intervalId !== null) return;
  intervalId = setInterval(() => {
    snapshot = Date.now();
    listeners.forEach((l) => l());
  }, 1000);
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  ensureRunning();
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0 && intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
  };
}

export function useNow(): number {
  return useSyncExternalStore(subscribe, () => snapshot, () => snapshot);
}
