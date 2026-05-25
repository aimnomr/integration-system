import { useState } from 'react';
import { Button, IconButton, TextField, Tooltip } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createMap, deleteMap, listMaps, updateMap } from '@/api/maps';
import { ApiError } from '@/api/client';
import { EditDrawer } from '@/components/common/EditDrawer';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { useToast } from '@/components/common/Snackbar';
import type { MapRow } from '@/types/api';

type EditState =
  | { mode: 'closed' }
  | { mode: 'create' }
  | { mode: 'edit'; row: MapRow };

export default function AdminMaps() {
  const qc = useQueryClient();
  const toast = useToast();
  const list = useQuery({ queryKey: ['maps'], queryFn: listMaps });

  const [edit, setEdit] = useState<EditState>({ mode: 'closed' });
  const [delTarget, setDelTarget] = useState<MapRow | null>(null);

  const create = useMutation({
    mutationFn: createMap,
    onSuccess: () => {
      toast.success('Map created');
      qc.invalidateQueries({ queryKey: ['maps'] });
      setEdit({ mode: 'closed' });
    },
    onError: (e: ApiError) => toast.error(e.message),
  });
  const update = useMutation({
    mutationFn: ({ id, label }: { id: string; label: string }) =>
      updateMap(id, { label }),
    onSuccess: () => {
      toast.success('Map updated');
      qc.invalidateQueries({ queryKey: ['maps'] });
      setEdit({ mode: 'closed' });
    },
    onError: (e: ApiError) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: deleteMap,
    onSuccess: () => {
      toast.success('Map deleted');
      qc.invalidateQueries({ queryKey: ['maps'] });
    },
    onError: (e: ApiError) => {
      if (e.status === 409) toast.error(`Cannot delete: still in use (${e.message})`);
      else toast.error(e.message);
    },
  });

  const cols: GridColDef<MapRow>[] = [
    { field: 'map_id', headerName: 'ID',     width: 160,
      renderCell: (p) => <span className="font-mono">{p.value}</span> },
    { field: 'label',  headerName: 'Label',  flex: 1 },
    {
      // G35 — was `Button` (minWidth 64px each → 128px > 110px column,
      // Delete clipped). `IconButton` sizes to the icon (~32px) and
      // both fit comfortably with room for tooltip targets.
      field: '_actions', headerName: '', width: 110, sortable: false, filterable: false,
      renderCell: (p) => (
        <>
          <Tooltip title="Edit">
            <IconButton size="small" onClick={() => setEdit({ mode: 'edit', row: p.row })}>
              <EditIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Delete">
            <IconButton size="small" color="error" onClick={() => setDelTarget(p.row)}>
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </>
      ),
    },
  ];

  return (
    <div className="flex h-full flex-col gap-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-white">Admin — Maps</h1>
        <Button
          variant="contained" startIcon={<AddIcon />}
          onClick={() => setEdit({ mode: 'create' })}
        >
          Add
        </Button>
      </header>

      <div className="min-h-[20rem] flex-1">
        <DataGrid
          rows={list.data?.maps ?? []}
          columns={cols}
          getRowId={(r) => r.map_id}
          loading={list.isLoading}
          density="compact"
          disableRowSelectionOnClick
          sx={dataGridSx}
        />
      </div>

      <MapEditDrawer
        state={edit}
        onClose={() => setEdit({ mode: 'closed' })}
        onCreate={(row) => create.mutate(row)}
        onUpdate={(row) => update.mutate({ id: row.map_id, label: row.label })}
        saving={create.isPending || update.isPending}
      />

      <ConfirmDialog
        open={delTarget !== null}
        title={`Delete Map ${delTarget?.map_id}?`}
        body="The backend will refuse with 409 if any robot or location still references it."
        confirmLabel="Delete"
        destructive
        onClose={() => setDelTarget(null)}
        onConfirm={() => delTarget && remove.mutate(delTarget.map_id)}
      />
    </div>
  );
}

function MapEditDrawer({
  state, onClose, onCreate, onUpdate, saving,
}: {
  state: EditState;
  onClose: () => void;
  onCreate: (row: MapRow) => void;
  onUpdate: (row: MapRow) => void;
  saving: boolean;
}) {
  const isCreate = state.mode === 'create';
  const initialId = state.mode === 'edit' ? state.row.map_id : '';
  const initialLabel = state.mode === 'edit' ? state.row.label : '';

  // Local form state, reset on open by keying the drawer on mode+id.
  const key = state.mode === 'closed' ? 'closed'
    : state.mode === 'create' ? 'create'
      : `edit-${state.row.map_id}`;

  return (
    <EditDrawer
      key={key}
      open={state.mode !== 'closed'}
      title={isCreate ? 'New Map' : `Edit ${initialId}`}
      onClose={onClose}
      onSave={() => { /* handled in inner form */ }}
      saving={saving}
      saveDisabled // outer footer button is hidden by the inner form's submit
    >
      <MapForm
        initialId={initialId}
        initialLabel={initialLabel}
        idEditable={isCreate}
        onSubmit={(row) => (isCreate ? onCreate(row) : onUpdate(row))}
        saving={saving}
      />
    </EditDrawer>
  );
}

function MapForm({
  initialId, initialLabel, idEditable, onSubmit, saving,
}: {
  initialId: string;
  initialLabel: string;
  idEditable: boolean;
  onSubmit: (row: MapRow) => void;
  saving: boolean;
}) {
  const [mapId, setMapId] = useState(initialId);
  const [label, setLabel] = useState(initialLabel);
  const valid = mapId.trim().length > 0 && label.trim().length > 0;

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => { e.preventDefault(); if (valid) onSubmit({ map_id: mapId, label }); }}
    >
      <TextField
        label="Map ID" size="small" required
        value={mapId}
        disabled={!idEditable}
        onChange={(e) => setMapId(e.target.value)}
        helperText="Convention: map-NNN (zero-padded)"
      />
      <TextField
        label="Label" size="small" required
        value={label}
        onChange={(e) => setLabel(e.target.value)}
      />
      <Button type="submit" variant="contained" disabled={!valid || saving}>
        {saving ? 'Saving…' : 'Save'}
      </Button>
    </form>
  );
}

export const dataGridSx = {
  backgroundColor: 'transparent',
  color: 'inherit',
  border: '1px solid',
  borderColor: 'rgba(255,255,255,0.1)',
  '& .MuiDataGrid-columnHeaders': { backgroundColor: 'rgba(255,255,255,0.04)' },
  '& .MuiDataGrid-cell':         { borderColor: 'rgba(255,255,255,0.06)' },
  '& .MuiDataGrid-row:hover':    { backgroundColor: 'rgba(99,102,241,0.08)' },
} as const;
