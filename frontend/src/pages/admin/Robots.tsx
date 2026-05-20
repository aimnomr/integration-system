import { useState } from 'react';
import { Alert, Button, MenuItem, TextField } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createRobot, deleteRobot, getRobots, updateRobot,
  type RobotIn,
} from '@/api/robots';
import { listMaps } from '@/api/maps';
import { ApiError } from '@/api/client';
import { EditDrawer } from '@/components/common/EditDrawer';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { useToast } from '@/components/common/Snackbar';
import { dataGridSx } from './Maps';
import type { Robot } from '@/types/api';

type EditState =
  | { mode: 'closed' }
  | { mode: 'create' }
  | { mode: 'edit'; row: Robot };

export default function AdminRobots() {
  const qc = useQueryClient();
  const toast = useToast();
  const list = useQuery({ queryKey: ['admin-robots'], queryFn: getRobots });
  const maps = useQuery({ queryKey: ['maps'], queryFn: listMaps });

  const [edit, setEdit] = useState<EditState>({ mode: 'closed' });
  const [delTarget, setDelTarget] = useState<Robot | null>(null);

  const create = useMutation({
    mutationFn: createRobot,
    onSuccess: () => {
      toast.success('Robot created — restart the ROS Bridge to pick it up');
      qc.invalidateQueries({ queryKey: ['admin-robots'] });
      qc.invalidateQueries({ queryKey: ['fleet'] });
      setEdit({ mode: 'closed' });
    },
    onError: (e: ApiError) => toast.error(e.message),
  });
  const update = useMutation({
    mutationFn: ({ serial, body }: { serial: string; body: Partial<RobotIn> }) =>
      updateRobot(serial, body),
    onSuccess: () => {
      toast.success('Robot updated');
      qc.invalidateQueries({ queryKey: ['admin-robots'] });
      qc.invalidateQueries({ queryKey: ['fleet'] });
      setEdit({ mode: 'closed' });
    },
    onError: (e: ApiError) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: deleteRobot,
    onSuccess: () => {
      toast.success('Robot deleted');
      qc.invalidateQueries({ queryKey: ['admin-robots'] });
      qc.invalidateQueries({ queryKey: ['fleet'] });
    },
    onError: (e: ApiError) => {
      if (e.status === 409) {
        toast.error(`Cannot delete: telemetry rows still reference this robot (${e.message})`);
      } else toast.error(e.message);
    },
  });

  const cols: GridColDef<Robot>[] = [
    { field: 'serialNumber', headerName: 'Serial',  width: 140,
      renderCell: (p) => <span className="font-mono">{p.value}</span> },
    { field: 'mapId',        headerName: 'Map',     width: 120,
      renderCell: (p) => <span className="font-mono">{p.value}</span> },
    { field: 'rosbridgeUrl', headerName: 'rosbridge URL', flex: 1,
      renderCell: (p) => <span className="font-mono text-xs">{p.value}</span> },
    {
      field: '_actions', headerName: '', width: 110, sortable: false, filterable: false,
      renderCell: (p) => (
        <>
          <Button size="small" onClick={() => setEdit({ mode: 'edit', row: p.row })}>
            <EditIcon fontSize="small" />
          </Button>
          <Button size="small" color="error" onClick={() => setDelTarget(p.row)}>
            <DeleteIcon fontSize="small" />
          </Button>
        </>
      ),
    },
  ];

  return (
    <div className="flex h-full flex-col gap-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-white">Admin — Robots</h1>
        <Button
          variant="contained" startIcon={<AddIcon />}
          onClick={() => setEdit({ mode: 'create' })}
          disabled={(maps.data?.maps ?? []).length === 0}
        >
          Add
        </Button>
      </header>

      <Alert severity="info" variant="outlined" className="text-slate-300">
        FastAPI&apos;s in-memory <code>RobotRegistry</code> reloads automatically on save.
        The <b>ROS Bridge Service still needs a restart</b> to instantiate a new robot
        (it builds per-robot connections at boot).
      </Alert>

      <div className="min-h-[20rem] flex-1">
        <DataGrid
          rows={list.data?.robots ?? []}
          columns={cols}
          getRowId={(r) => r.serialNumber}
          loading={list.isLoading}
          density="compact"
          disableRowSelectionOnClick
          sx={dataGridSx}
        />
      </div>

      <RobotEditDrawer
        state={edit}
        maps={maps.data?.maps ?? []}
        onClose={() => setEdit({ mode: 'closed' })}
        onCreate={(row) => create.mutate(row)}
        onUpdate={(row) => update.mutate({
          serial: row.serial_number,
          body: { rosbridge_url: row.rosbridge_url, map_id: row.map_id },
        })}
        saving={create.isPending || update.isPending}
      />

      <ConfirmDialog
        open={delTarget !== null}
        title={`Delete robot ${delTarget?.serialNumber}?`}
        body="Telemetry history is kept (FKs aren't cascaded). Delete will be rejected with 409 if any state/order rows still reference this robot."
        confirmLabel="Delete"
        destructive
        onClose={() => setDelTarget(null)}
        onConfirm={() => delTarget && remove.mutate(delTarget.serialNumber)}
      />
    </div>
  );
}

function RobotEditDrawer({
  state, maps, onClose, onCreate, onUpdate, saving,
}: {
  state: EditState;
  maps: Array<{ map_id: string; label: string }>;
  onClose: () => void;
  onCreate: (row: RobotIn) => void;
  onUpdate: (row: RobotIn) => void;
  saving: boolean;
}) {
  const isCreate = state.mode === 'create';
  const initial: RobotIn = state.mode === 'edit'
    ? {
      serial_number: state.row.serialNumber,
      rosbridge_url: state.row.rosbridgeUrl,
      map_id: state.row.mapId,
    }
    : { serial_number: '', rosbridge_url: 'ws://localhost:9090', map_id: maps[0]?.map_id ?? '' };

  const key = state.mode === 'closed' ? 'closed'
    : state.mode === 'create' ? 'create'
      : `edit-${state.row.serialNumber}`;

  return (
    <EditDrawer
      key={key}
      open={state.mode !== 'closed'}
      title={isCreate ? 'New robot' : `Edit ${initial.serial_number}`}
      onClose={onClose}
      saving={saving}
    >
      <RobotForm
        initial={initial}
        idEditable={isCreate}
        maps={maps}
        onSubmit={(row) => (isCreate ? onCreate(row) : onUpdate(row))}
        saving={saving}
      />
    </EditDrawer>
  );
}

function RobotForm({
  initial, idEditable, maps, onSubmit, saving,
}: {
  initial: RobotIn;
  idEditable: boolean;
  maps: Array<{ map_id: string; label: string }>;
  onSubmit: (row: RobotIn) => void;
  saving: boolean;
}) {
  const [row, setRow] = useState<RobotIn>(initial);
  const valid =
    row.serial_number.trim().length > 0 &&
    row.rosbridge_url.trim().startsWith('ws') &&
    row.map_id.trim().length > 0;
  const set = <K extends keyof RobotIn>(k: K, v: RobotIn[K]) =>
    setRow((r) => ({ ...r, [k]: v }));

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => { e.preventDefault(); if (valid) onSubmit(row); }}
    >
      <TextField
        label="Serial number" size="small" required
        value={row.serial_number}
        disabled={!idEditable}
        onChange={(e) => set('serial_number', e.target.value)}
        helperText="e.g. amr002"
      />
      <TextField
        label="rosbridge URL" size="small" required
        value={row.rosbridge_url}
        onChange={(e) => set('rosbridge_url', e.target.value)}
        helperText="ws://host:9090 — reachable from this browser AND from the ROS Bridge"
      />
      <TextField
        select label="Map" size="small" required
        value={row.map_id}
        onChange={(e) => set('map_id', e.target.value)}
      >
        {maps.map((m) => (
          <MenuItem key={m.map_id} value={m.map_id}>
            {m.map_id} — {m.label}
          </MenuItem>
        ))}
      </TextField>
      <Button type="submit" variant="contained" disabled={!valid || saving}>
        {saving ? 'Saving…' : 'Save'}
      </Button>
    </form>
  );
}
