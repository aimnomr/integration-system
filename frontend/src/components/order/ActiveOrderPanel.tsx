import { useState } from 'react';
import { Button } from '@mui/material';
import { postInstantAction } from '@/api/robots';
import type { ApiError } from '@/api/client';
import type { VdaState } from '@/types/api';

interface Props {
  serial: string;
  state: VdaState | null;
}

export function ActiveOrderPanel({ serial, state }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const orderId = state?.orderId;
  const nodeStates = state?.nodeStates ?? [];

  const send = (action: 'cancel' | 'retry' | 'skip') => async () => {
    setBusy(action); setErr(null);
    try {
      await postInstantAction(serial, action);
    } catch (e) {
      setErr((e as ApiError).message);
    } finally {
      setBusy(null);
    }
  };

  if (!orderId) {
    return (
      <div className="rounded-lg border border-surface-2 bg-surface-1 p-4 text-sm text-slate-500">
        No active order.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-surface-2 bg-surface-1 p-4">
      <div>
        <div className="text-[10px] uppercase tracking-widest text-slate-500">Active order</div>
        <div className="mt-1 font-mono text-sm text-white">{orderId}</div>
        <div className="text-xs text-slate-400">
          {nodeStates.length} node{nodeStates.length === 1 ? '' : 's'} remaining
        </div>
      </div>

      {nodeStates.length > 0 && (
        <ol className="flex flex-col gap-1 font-mono text-xs">
          {nodeStates.map((n) => (
            <li key={n.sequenceId} className="flex justify-between rounded bg-surface-2/40 px-2 py-1">
              <span className="text-slate-300">seq {n.sequenceId} — {n.nodeId}</span>
              <span className="text-slate-500">{n.released ? 'released' : 'pending'}</span>
            </li>
          ))}
        </ol>
      )}

      {err && <p className="text-xs text-red-400">{err}</p>}

      <div className="flex gap-2">
        <Button size="small" variant="outlined" color="error"   disabled={busy !== null} onClick={send('cancel')}>{busy === 'cancel' ? '…' : 'Cancel'}</Button>
        <Button size="small" variant="outlined" color="warning" disabled={busy !== null} onClick={send('retry')}>{busy === 'retry' ? '…' : 'Retry'}</Button>
        <Button size="small" variant="outlined"                 disabled={busy !== null} onClick={send('skip')}>{busy === 'skip' ? '…' : 'Skip'}</Button>
      </div>
    </div>
  );
}
