import { useMemo, useState } from 'react';
import { MenuItem, TextField } from '@mui/material';
import { useFleet } from '@/hooks/useFleet';
import { useRobotState } from '@/hooks/useRobotState';
import { Loading } from '@/components/common/Loading';
import { OrderBuilder } from '@/components/order/OrderBuilder';
import { ActiveOrderPanel } from '@/components/order/ActiveOrderPanel';

export default function Dispatch() {
  const fleet = useFleet();
  const robots = fleet.data?.robots ?? [];
  const [serial, setSerial] = useState<string>('');
  const selected = useMemo(
    () => robots.find((r) => r.serialNumber === serial) ?? null,
    [robots, serial],
  );

  const { state } = useRobotState(fleet.data, selected?.serialNumber);

  if (fleet.isLoading) return <Loading label="Loading fleet…" />;
  if (fleet.isError) {
    return <div className="text-sm text-red-400">Failed to load fleet — {fleet.error.message}</div>;
  }

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <h1 className="text-2xl font-semibold text-white">Dispatch</h1>
      <p className="text-sm text-slate-400">
        Send a navigation order to a robot. Named locations come from the
        <code className="mx-1 rounded bg-surface-2 px-1">named_locations</code>
        table, filtered to the robot&apos;s current map. Manual mode lets you
        enter x / y / θ directly — angles are radians (VDA5050 convention).
      </p>

      <TextField
        select label="Robot" size="small"
        value={serial} onChange={(e) => setSerial(e.target.value)}
      >
        <MenuItem value="">— pick one —</MenuItem>
        {robots.map((r) => (
          <MenuItem key={r.serialNumber} value={r.serialNumber}>
            {r.serialNumber} — {r.mapId}
          </MenuItem>
        ))}
      </TextField>

      {selected && (
        <>
          <OrderBuilder
            serial={selected.serialNumber}
            mapId={selected.mapId}
          />
          <ActiveOrderPanel serial={selected.serialNumber} state={state} />
        </>
      )}
    </div>
  );
}
