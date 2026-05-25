import { useMemo, useState } from 'react';
import { Alert, Button, IconButton, MenuItem, TextField, Tooltip } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import ArchiveIcon from '@mui/icons-material/Archive';
import UnarchiveIcon from '@mui/icons-material/Unarchive';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  archiveRobot, createRobot, getRobots, restoreRobot, updateRobot,
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
  | { mode: 'create'; prefillSerial?: string }
  | { mode: 'edit'; row: Robot };

interface ArchivedErrorBody {
  detail?: {
    code?: string;
    message?: string;
    serialNumber?: string;
    archivedAt?: string;
  };
}

export default function AdminRobots() {
  const qc = useQueryClient();
  const toast = useToast();
  // Always include archived rows here — the admin page is the canonical
  // place to see and act on the full roster. Operator surfaces still use
  // the default (active-only) shape via the `fleet` query.
  const list = useQuery({
    queryKey: ['admin-robots', { includeArchived: true }],
    queryFn: () => getRobots({ includeArchived: true }),
  });
  const maps = useQuery({ queryKey: ['maps'], queryFn: listMaps });

  const [edit, setEdit] = useState<EditState>({ mode: 'closed' });
  const [archiveTarget, setArchiveTarget] = useState<Robot | null>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['admin-robots'] });
    qc.invalidateQueries({ queryKey: ['fleet'] });
  };

  const create = useMutation({
    mutationFn: createRobot,
    onSuccess: () => {
      toast.success('Robot created — restart the ROS Bridge to pick it up');
      invalidate();
      setEdit({ mode: 'closed' });
    },
    onError: (e: ApiError) => {
      const body = e.body as ArchivedErrorBody | undefined;
      const archivedSerial = body?.detail?.code === 'archived_serial'
        ? body.detail.serialNumber
        : null;
      if (archivedSerial) {
        // G40 — when a serial collides with an archived row, surface the
        // restore action inline rather than just "already exists". The user
        // can either restore the existing row (preserving its history) or
        // pick a new serial. The toast spells out both paths.
        toast.error(
          `${e.message} Use the Restore button on the Archived row.`,
        );
      } else {
        toast.error(e.message);
      }
    },
  });
  const update = useMutation({
    mutationFn: ({ serial, body }: { serial: string; body: Partial<RobotIn> }) =>
      updateRobot(serial, body),
    onSuccess: () => {
      toast.success('Robot updated');
      invalidate();
      setEdit({ mode: 'closed' });
    },
    onError: (e: ApiError) => toast.error(e.message),
  });
  const archive = useMutation({
    mutationFn: archiveRobot,
    onSuccess: (_data, serial) => {
      toast.success(`Robot ${serial} archived`);
      invalidate();
      setArchiveTarget(null);
    },
    onError: (e: ApiError) => {
      toast.error(e.message);
      setArchiveTarget(null);
    },
  });
  const restore = useMutation({
    mutationFn: restoreRobot,
    onSuccess: (_data, serial) => {
      toast.success(`Robot ${serial} restored`);
      invalidate();
    },
    onError: (e: ApiError) => toast.error(e.message),
  });

  const { active, archived } = useMemo(() => {
    const rows = list.data?.robots ?? [];
    return {
      active:   rows.filter((r) => !r.archivedAt),
      archived: rows.filter((r) =>  r.archivedAt),
    };
  }, [list.data]);

  const activeCols: GridColDef<Robot>[] = [
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
          <Tooltip title="Edit">
            <IconButton size="small" onClick={() => setEdit({ mode: 'edit', row: p.row })}>
              <EditIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Archive — hide from operators, keep history">
            <IconButton
              size="small" color="warning"
              onClick={() => setArchiveTarget(p.row)}
            >
              <ArchiveIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </>
      ),
    },
  ];

  const archivedCols: GridColDef<Robot>[] = [
    { field: 'serialNumber', headerName: 'Serial',  width: 140,
      renderCell: (p) => <span className="font-mono text-slate-400">{p.value}</span> },
    { field: 'mapId',        headerName: 'Map',     width: 120,
      renderCell: (p) => <span className="font-mono text-slate-500">{p.value}</span> },
    {
      field: 'archivedAt', headerName: 'Archived',  width: 180,
      renderCell: (p) => (
        <span className="text-xs text-slate-500">
          {p.value ? new Date(p.value as string).toLocaleString() : '—'}
        </span>
      ),
    },
    { field: 'rosbridgeUrl', headerName: 'rosbridge URL', flex: 1,
      renderCell: (p) => <span className="font-mono text-xs text-slate-500">{p.value}</span> },
    {
      field: '_actions', headerName: '', width: 110, sortable: false, filterable: false,
      renderCell: (p) => (
        <Tooltip title="Restore — make this robot active again">
          <IconButton
            size="small" color="primary"
            disabled={restore.isPending}
            onClick={() => restore.mutate(p.row.serialNumber)}
          >
            <UnarchiveIcon fontSize="small" />
          </IconButton>
        </Tooltip>
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
        FastAPI&apos;s in-memory <code>RobotRegistry</code> reloads automatically on
        save / archive / restore. The <b>ROS Bridge Service still needs a restart</b>
        to instantiate a new robot (it builds per-robot connections at boot).
      </Alert>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400">
          Active ({active.length})
        </h2>
        <div className="min-h-[16rem]">
          <DataGrid
            rows={active}
            columns={activeCols}
            getRowId={(r) => r.serialNumber}
            loading={list.isLoading}
            density="compact"
            disableRowSelectionOnClick
            sx={dataGridSx}
          />
        </div>
      </section>

      {archived.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-500">
            Archived ({archived.length})
          </h2>
          <p className="text-xs text-slate-500">
            Hidden from operator surfaces. History and order records are
            preserved. Restore to make a robot active again.
          </p>
          <div className="min-h-[10rem]">
            <DataGrid
              rows={archived}
              columns={archivedCols}
              getRowId={(r) => r.serialNumber}
              density="compact"
              disableRowSelectionOnClick
              sx={dataGridSx}
            />
          </div>
        </section>
      )}

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
        open={archiveTarget !== null}
        title={`Archive Robot ${archiveTarget?.serialNumber}?`}
        body={
          <>
            The robot is hidden from operator surfaces (Dashboard, Dispatch,
            Teleop, OEE) and the backend rejects any further telemetry from it.
            All historical orders, state snapshots and OEE cycles are kept and
            can be inspected via the Orders / OEE pages.
            <br /><br />
            You can restore the robot from this page at any time.
          </>
        }
        confirmLabel="Archive"
        destructive
        onClose={() => setArchiveTarget(null)}
        onConfirm={() => archiveTarget && archive.mutate(archiveTarget.serialNumber)}
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
      title={isCreate ? 'New Robot' : `Edit ${initial.serial_number}`}
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
        label="Serial Number" size="small" required
        value={row.serial_number}
        disabled={!idEditable}
        onChange={(e) => set('serial_number', e.target.value)}
        helperText="e.g. amr002"
      />
      <TextField
        label="rosbridge URL" size="small" required
        value={row.rosbridge_url}
        onChange={(e) => set('rosbridge_url', e.target.value)}
        helperText="ws://host:9090 — must be reachable from both this browser and the ROS Bridge container"
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
