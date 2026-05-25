import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FormControlLabel, MenuItem, Switch, TextField } from '@mui/material';
import { useFleet } from '@/hooks/useFleet';
import { useRosStatus } from '@/hooks/useRosStatus';
import { Loading } from '@/components/common/Loading';
import { CameraStream } from '@/components/teleop/CameraStream';
import { KeyboardPad } from '@/components/teleop/KeyboardPad';
import { StatusPill, type PillState } from '@/components/common/StatusPill';

function rosToPill(s: string): PillState {
  if (s === 'connected') return 'ok';
  if (s === 'connecting' || s === 'reconnecting') return 'warn';
  return 'error';
}

export default function Teleop() {
  const params = useParams<{ serial?: string }>();
  const nav = useNavigate();
  const fleet = useFleet();
  const robots = fleet.data?.robots ?? [];
  const [serial, setSerial] = useState<string>(params.serial ?? '');
  const [engaged, setEngaged] = useState(false);

  // Keep the URL in sync so /teleop/:serial deep-links work.
  useEffect(() => {
    if (params.serial && params.serial !== serial) setSerial(params.serial);
  }, [params.serial, serial]);

  const selected = useMemo(
    () => robots.find((r) => r.serialNumber === serial) ?? null,
    [robots, serial],
  );
  const ros = useRosStatus(selected?.rosbridgeUrl);

  // Disengage automatically if the robot changes or rosbridge drops.
  useEffect(() => { setEngaged(false); }, [serial]);
  useEffect(() => { if (ros !== 'connected') setEngaged(false); }, [ros]);

  if (fleet.isLoading) return <Loading label="Loading Fleet" />;

  return (
    <div className="flex h-full flex-col gap-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-white">Teleop</h1>
        {selected && (
          <StatusPill state={rosToPill(ros)} label={`rosbridge ${ros}`} />
        )}
      </header>

      <div className="flex flex-wrap items-center gap-4">
        <TextField
          select size="small" label="Robot" sx={{ minWidth: 200 }}
          value={serial}
          onChange={(e) => {
            const v = e.target.value;
            setSerial(v);
            nav(v ? `/teleop/${v}` : '/teleop', { replace: true });
          }}
        >
          <MenuItem value="">— pick one —</MenuItem>
          {robots.map((r) => (
            <MenuItem key={r.serialNumber} value={r.serialNumber}>
              {r.serialNumber}
            </MenuItem>
          ))}
        </TextField>
        <FormControlLabel
          control={
            <Switch
              checked={engaged}
              onChange={(_, v) => setEngaged(v)}
              disabled={!selected || ros !== 'connected'}
              color="warning"
            />
          }
          label={engaged ? 'ENGAGED — robot will move' : 'Disengaged'}
        />
      </div>

      {!selected ? (
        <p className="text-sm text-slate-500">Pick a robot to start teleop.</p>
      ) : (
        <div className="grid flex-1 grid-cols-1 gap-4 lg:grid-cols-[1fr_auto]">
          <div className="h-[55vh] lg:h-auto">
            <CameraStream rosbridgeUrl={selected.rosbridgeUrl} />
          </div>
          <div className="flex flex-col gap-3">
            <KeyboardPad rosbridgeUrl={selected.rosbridgeUrl} engaged={engaged} />
            <p className="max-w-[14rem] text-[11px] leading-relaxed text-slate-500">
              Hold to drive, release to stop. <b>S</b> halts immediately.
              0.3 m/s linear, 0.5 rad/s angular.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
