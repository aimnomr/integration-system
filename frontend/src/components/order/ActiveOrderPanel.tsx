import { useState } from 'react';
import { Button, CircularProgress } from '@mui/material';
import { postInstantAction, type InstantAction } from '@/api/robots';
import type { ApiError } from '@/api/client';
import type { VdaState } from '@/types/api';
import { useToast } from '@/components/common/Snackbar';

interface Props {
  serial: string;
  state: VdaState | null;
}

const ACTION_LABEL: Record<InstantAction, string> = {
  cancel: 'Cancel',
  retry:  'Retry',
  skip:   'Skip',
};

export function ActiveOrderPanel({ serial, state }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const toast = useToast();

  const orderId = state?.orderId;
  const nodeStates = state?.nodeStates ?? [];
  const done = nodeStates.length === 0;

  const send = (action: InstantAction) => async () => {
    setBusy(action); setErr(null);
    try {
      await postInstantAction(serial, action);
      // G34 — explicit success toast using the friendly label, not the
      // raw API response body (which the old code dropped on the floor
      // and the local error path then stringified into `[object Object]`).
      toast.success(`${ACTION_LABEL[action]} sent`);
    } catch (e) {
      const message = (e as ApiError).message;
      setErr(message);
      toast.error(`${ACTION_LABEL[action]} failed — ${message}`);
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

  const actions: InstantAction[] = ['cancel', 'retry', 'skip'];

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-surface-2 bg-surface-1 p-4">
      <div>
        <div className="text-[10px] uppercase tracking-widest text-slate-500">Active Order</div>
        <div className="mt-1 font-mono text-sm text-white">{orderId}</div>
        <div className="text-xs text-slate-400">
          {nodeStates.length} node{nodeStates.length === 1 ? '' : 's'} remaining
        </div>
      </div>

      {nodeStates.length > 0 && (
        <ol className="node-list flex flex-col gap-1 font-mono text-xs">
          {nodeStates.map((n) => (
            <li
              key={n.sequenceId}
              className="node-row flex justify-between rounded bg-surface-2/40 px-2 py-1"
            >
              <span className="text-slate-300">seq {n.sequenceId} — {n.nodeId}</span>
              <span className="text-slate-500">{n.released ? 'released' : 'pending'}</span>
            </li>
          ))}
        </ol>
      )}

      {err && <p className="text-xs text-red-400">{err}</p>}

      {/*
        G37 — once the order finishes (no nodes remaining), the robot has
        no order to act on; firing cancel/retry/skip would be a stray
        instant action. Gate the buttons on `done` so a completed-but-
        still-visible orderId doesn't let an action slip through.
      */}
      <div className="flex gap-2">
        {actions.map((a) => {
          const color = a === 'cancel' ? 'error' : a === 'retry' ? 'warning' : undefined;
          const isBusy = busy === a;
          return (
            <Button
              key={a}
              size="small"
              variant="outlined"
              color={color}
              disabled={busy !== null || done}
              onClick={send(a)}
              startIcon={
                isBusy ? (
                  <CircularProgress size={12} color="inherit" />
                ) : undefined
              }
            >
              {ACTION_LABEL[a]}
            </Button>
          );
        })}
      </div>
      {done && (
        <p className="done-banner text-[11px] text-slate-500">
          Order complete — instant actions disabled. Submit a new order to re-enable.
        </p>
      )}

      <style>{`
        .node-row {
          opacity: 1;
          transform: translateX(0);
          transition:
            opacity 180ms var(--ease-out),
            transform 180ms var(--ease-out);
        }
        @starting-style {
          .node-list .node-row {
            opacity: 0;
            transform: translateX(-6px);
          }
        }
        .done-banner {
          opacity: 1;
          transform: translateY(0);
          transition:
            opacity 200ms var(--ease-out),
            transform 200ms var(--ease-out);
        }
        @starting-style {
          .done-banner {
            opacity: 0;
            transform: translateY(-4px);
          }
        }
      `}</style>
    </div>
  );
}
