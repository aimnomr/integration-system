import { useState } from 'react';
import {
  Button, MenuItem, TextField, ToggleButton, ToggleButtonGroup,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { listLocations } from '@/api/locations';
import { postNamedOrder, postOrder } from '@/api/robots';
import type { ApiError } from '@/api/client';
import { NumberField } from '@/components/common/NumberField';

interface Props {
  serial: string;
  mapId: string;
  onSent?: (orderId: string) => void;
}

type Mode = 'named' | 'manual';

interface Node { x: number; y: number; theta: number; }

export function OrderBuilder({ serial, mapId, onSent }: Props) {
  const [mode, setMode] = useState<Mode>('named');
  const [locationIds, setLocationIds] = useState<number[]>([]);
  const [nodes, setNodes] = useState<Node[]>([{ x: 0, y: 0, theta: 0 }]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const locations = useQuery({
    queryKey: ['locations'],
    queryFn: () => listLocations(),
  });
  const onMap = (locations.data?.locations ?? []).filter((l) => l.map_id === mapId);

  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      const resp = mode === 'named'
        ? await postNamedOrder(serial, { locationIds })
        : await postOrder(serial, { nodes });
      onSent?.(resp.orderId);
    } catch (e) {
      setErr((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  const canSubmit = mode === 'named' ? locationIds.length > 0 : nodes.length > 0;

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-surface-2 bg-surface-1 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400">
          New order
        </h2>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={mode}
          onChange={(_, v) => v && setMode(v)}
        >
          <ToggleButton value="named">Named</ToggleButton>
          <ToggleButton value="manual">Manual</ToggleButton>
        </ToggleButtonGroup>
      </div>

      {mode === 'named' && (
        <div className="flex flex-col gap-2">
          <TextField
            select
            size="small"
            label="Add location"
            value=""
            onChange={(e) => {
              const id = Number(e.target.value);
              if (Number.isFinite(id)) setLocationIds([...locationIds, id]);
            }}
            disabled={onMap.length === 0}
          >
            {onMap.map((l) => (
              <MenuItem key={l.id} value={l.id}>
                #{l.id} — {l.label}
              </MenuItem>
            ))}
          </TextField>
          {locationIds.length > 0 && (
            <ol className="flex flex-col gap-1 text-xs">
              {locationIds.map((id, i) => {
                const l = onMap.find((x) => x.id === id);
                return (
                  <li key={`${id}-${i}`} className="flex items-center justify-between rounded bg-surface-2/50 px-2 py-1">
                    <span>{i + 1}. #{id} — {l?.label ?? 'unknown'}</span>
                    <button
                      className="text-slate-400 hover:text-red-400"
                      onClick={() => setLocationIds(locationIds.filter((_, j) => j !== i))}
                    >
                      remove
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      )}

      {mode === 'manual' && (
        <div className="flex flex-col gap-2">
          {nodes.map((n, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 text-xs">
              <NumberField size="small" label="x"       value={n.x}     onChange={(v) => updateNode(i, { x: v })} />
              <NumberField size="small" label="y"       value={n.y}     onChange={(v) => updateNode(i, { y: v })} />
              <NumberField size="small" label="θ (rad)" value={n.theta} onChange={(v) => updateNode(i, { theta: v })} />
              <Button
                size="small" variant="text" color="error"
                disabled={nodes.length === 1}
                onClick={() => setNodes(nodes.filter((_, j) => j !== i))}
              >
                ×
              </Button>
            </div>
          ))}
          <Button
            size="small" variant="outlined"
            onClick={() => setNodes([...nodes, { x: 0, y: 0, theta: 0 }])}
          >
            + Add node
          </Button>
        </div>
      )}

      {err && <p className="text-xs text-red-400">{err}</p>}

      <Button
        variant="contained" disabled={busy || !canSubmit}
        onClick={submit}
      >
        {busy ? 'Sending…' : 'Send order'}
      </Button>
    </div>
  );

  function updateNode(idx: number, patch: Partial<Node>) {
    setNodes(nodes.map((n, i) => (i === idx ? { ...n, ...patch } : n)));
  }
}
