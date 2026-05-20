import { useMemo, useState } from 'react';
import { Button, MenuItem, TextField } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createLocation, deleteLocation, listLocations, updateLocation,
} from '@/api/locations';
import { listMaps } from '@/api/maps';
import { ApiError } from '@/api/client';
import { useFleet } from '@/hooks/useFleet';
import { EditDrawer } from '@/components/common/EditDrawer';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { MapCanvas } from '@/components/map/MapCanvas';
import { useToast } from '@/components/common/Snackbar';
import { dataGridSx } from './Maps';
import type { NamedLocation } from '@/types/api';

type EditState =
  | { mode: 'closed' }
  | { mode: 'create' }
  | { mode: 'edit'; row: NamedLocation };

export default function AdminLocations() {
  const qc = useQueryClient();
  const toast = useToast();
  const list = useQuery({ queryKey: ['locations'], queryFn: listLocations });
  const maps = useQuery({ queryKey: ['maps'], queryFn: listMaps });

  const [edit, setEdit] = useState<EditState>({ mode: 'closed' });
  const [delTarget, setDelTarget] = useState<NamedLocation | null>(null);

  const create = useMutation({
    mutationFn: createLocation,
    onSuccess: () => {
      toast.success('Location created');
      qc.invalidateQueries({ queryKey: ['locations'] });
      setEdit({ mode: 'closed' });
    },
    onError: (e: ApiError) => toast.error(e.message),
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Omit<NamedLocation, 'id'> }) =>
      updateLocation(id, body),
    onSuccess: () => {
      toast.success('Location updated');
      qc.invalidateQueries({ queryKey: ['locations'] });
      setEdit({ mode: 'closed' });
    },
    onError: (e: ApiError) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: deleteLocation,
    onSuccess: () => {
      toast.success('Location deleted');
      qc.invalidateQueries({ queryKey: ['locations'] });
    },
    onError: (e: ApiError) => toast.error(e.message),
  });

  const cols: GridColDef<NamedLocation>[] = [
    { field: 'id',     headerName: 'ID',    width: 70, type: 'number' },
    { field: 'map_id', headerName: 'Map',   width: 110,
      renderCell: (p) => <span className="font-mono">{p.value}</span> },
    { field: 'label',  headerName: 'Label', flex: 1 },
    { field: 'x',      headerName: 'x',     width: 90, type: 'number',
      valueFormatter: (v) => typeof v === 'number' ? v.toFixed(3) : '—' },
    { field: 'y',      headerName: 'y',     width: 90, type: 'number',
      valueFormatter: (v) => typeof v === 'number' ? v.toFixed(3) : '—' },
    { field: 'theta',  headerName: 'θ',     width: 90, type: 'number',
      valueFormatter: (v) => typeof v === 'number' ? v.toFixed(3) : '—' },
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
        <h1 className="text-2xl font-semibold text-white">Admin — Named Locations</h1>
        <Button
          variant="contained" startIcon={<AddIcon />}
          onClick={() => setEdit({ mode: 'create' })}
          disabled={(maps.data?.maps ?? []).length === 0}
        >
          Add
        </Button>
      </header>

      <div className="min-h-[20rem] flex-1">
        <DataGrid
          rows={list.data?.locations ?? []}
          columns={cols}
          getRowId={(r) => r.id}
          loading={list.isLoading}
          density="compact"
          disableRowSelectionOnClick
          sx={dataGridSx}
        />
      </div>

      <LocationEditDrawer
        state={edit}
        availableMaps={maps.data?.maps ?? []}
        onClose={() => setEdit({ mode: 'closed' })}
        onCreate={(row) => create.mutate(row)}
        onUpdate={(row) => update.mutate({
          id: row.id,
          body: { map_id: row.map_id, label: row.label, x: row.x, y: row.y, theta: row.theta },
        })}
        saving={create.isPending || update.isPending}
      />

      <ConfirmDialog
        open={delTarget !== null}
        title={`Delete location #${delTarget?.id}?`}
        body={delTarget?.label}
        confirmLabel="Delete"
        destructive
        onClose={() => setDelTarget(null)}
        onConfirm={() => delTarget && remove.mutate(delTarget.id)}
      />
    </div>
  );
}

function LocationEditDrawer({
  state, availableMaps, onClose, onCreate, onUpdate, saving,
}: {
  state: EditState;
  availableMaps: Array<{ map_id: string; label: string }>;
  onClose: () => void;
  onCreate: (row: NamedLocation) => void;
  onUpdate: (row: NamedLocation) => void;
  saving: boolean;
}) {
  const isCreate = state.mode === 'create';
  const initial: NamedLocation = state.mode === 'edit'
    ? state.row
    : { id: 0, map_id: availableMaps[0]?.map_id ?? '', label: '', x: 0, y: 0, theta: 0 };

  const key = state.mode === 'closed' ? 'closed'
    : state.mode === 'create' ? 'create'
      : `edit-${state.row.id}`;

  return (
    <EditDrawer
      key={key}
      open={state.mode !== 'closed'}
      title={isCreate ? 'New location' : `Edit #${initial.id} — ${initial.label}`}
      onClose={onClose}
      saving={saving}
      width={560}
    >
      <LocationForm
        initial={initial}
        idEditable={isCreate}
        maps={availableMaps}
        onSubmit={(row) => (isCreate ? onCreate(row) : onUpdate(row))}
        saving={saving}
      />
    </EditDrawer>
  );
}

function LocationForm({
  initial, idEditable, maps, onSubmit, saving,
}: {
  initial: NamedLocation;
  idEditable: boolean;
  maps: Array<{ map_id: string; label: string }>;
  onSubmit: (row: NamedLocation) => void;
  saving: boolean;
}) {
  const [row, setRow] = useState<NamedLocation>(initial);

  // Find a robot on this map so the embedded MapCanvas has a rosbridge to
  // subscribe through. If there's none, the canvas will show its "no robot"
  // placeholder — the form still works via the numeric fields.
  const fleet = useFleet();
  const rosbridgeUrl = useMemo(
    () => fleet.data?.robots.find((r) => r.mapId === row.map_id)?.rosbridgeUrl ?? null,
    [fleet.data, row.map_id],
  );

  const valid = row.id > 0 && row.map_id && row.label.trim().length > 0;
  const set = <K extends keyof NamedLocation>(k: K, v: NamedLocation[K]) =>
    setRow((r) => ({ ...r, [k]: v }));

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => { e.preventDefault(); if (valid) onSubmit(row); }}
    >
      <div className="grid grid-cols-2 gap-3">
        <TextField
          label="ID" size="small" required type="number"
          value={row.id || ''}
          disabled={!idEditable}
          onChange={(e) => set('id', Number(e.target.value))}
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
      </div>
      <TextField
        label="Label" size="small" required
        value={row.label}
        onChange={(e) => set('label', e.target.value)}
      />
      <div className="grid grid-cols-3 gap-3">
        <TextField
          label="x (m)" size="small" type="number" inputProps={{ step: '0.001' }}
          value={row.x}
          onChange={(e) => set('x', Number(e.target.value))}
        />
        <TextField
          label="y (m)" size="small" type="number" inputProps={{ step: '0.001' }}
          value={row.y}
          onChange={(e) => set('y', Number(e.target.value))}
        />
        <TextField
          label="θ (rad)" size="small" type="number" inputProps={{ step: '0.01' }}
          value={row.theta}
          onChange={(e) => set('theta', Number(e.target.value))}
        />
      </div>

      <div className="text-[11px] text-slate-500">
        Click on the map to set x/y. θ is set numerically.
      </div>
      <div className="h-72 w-full">
        <MapCanvas
          rosbridgeUrl={rosbridgeUrl}
          pins={row.label ? [{ x: row.x, y: row.y, label: row.label, color: '#f472b6' }] : []}
          onClickWorld={(x, y) => {
            set('x', Number(x.toFixed(3)));
            set('y', Number(y.toFixed(3)));
          }}
        />
      </div>

      <Button type="submit" variant="contained" disabled={!valid || saving}>
        {saving ? 'Saving…' : 'Save'}
      </Button>
    </form>
  );
}
