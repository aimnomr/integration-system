import { useMemo, useState } from 'react';
import { Button, MenuItem, TextField } from '@mui/material';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useFleet } from '@/hooks/useFleet';
import { listOrders } from '@/api/orders';
import type { OrderHistoryRow } from '@/types/api';

const COLS: GridColDef<OrderHistoryRow>[] = [
  { field: 'ts',              headerName: 'Time',           flex: 1.4,
    valueFormatter: (v) => new Date(v as string).toLocaleString() },
  { field: 'serial_number',   headerName: 'Robot',          flex: 0.8 },
  { field: 'order_id',        headerName: 'Order',          flex: 1.6,
    renderCell: (p) => <span className="font-mono text-xs">{p.value}</span> },
  { field: 'order_update_id', headerName: 'Update',         width: 90, type: 'number' },
  { field: 'node_count',      headerName: 'Nodes',          width: 80, type: 'number' },
  { field: 'header_id',       headerName: 'Hdr',            width: 80, type: 'number' },
];

const LIMITS = [25, 50, 100, 200];

export default function Orders() {
  const fleet = useFleet();
  const [serial, setSerial] = useState<string>('');
  const [pageSize, setPageSize] = useState<number>(50);

  const q = useInfiniteQuery({
    queryKey: ['orders', serial, pageSize],
    queryFn: ({ pageParam }) =>
      listOrders({
        serial: serial || undefined,
        limit: pageSize,
        before: pageParam as string | undefined,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => {
      // The cursor is the ts of the last row; null when we've exhausted the table.
      if (last.orders.length < pageSize) return undefined;
      return last.orders[last.orders.length - 1]?.ts;
    },
  });

  const rows = useMemo(
    () => q.data?.pages.flatMap((p) => p.orders) ?? [],
    [q.data],
  );

  return (
    <div className="flex h-full flex-col gap-4">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold text-white">Order History</h1>
        <span className="text-xs text-slate-400">{rows.length} loaded</span>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <TextField
          select size="small" label="Robot" sx={{ minWidth: 180 }}
          value={serial} onChange={(e) => setSerial(e.target.value)}
        >
          <MenuItem value="">All robots</MenuItem>
          {(fleet.data?.robots ?? []).map((r) => (
            <MenuItem key={r.serialNumber} value={r.serialNumber}>
              {r.serialNumber}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select size="small" label="Page size" sx={{ minWidth: 120 }}
          value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}
        >
          {LIMITS.map((n) => <MenuItem key={n} value={n}>{n}</MenuItem>)}
        </TextField>
        <Button
          variant="outlined" size="small"
          onClick={() => q.refetch()}
          disabled={q.isFetching}
        >
          {q.isFetching ? 'Loading…' : 'Refresh'}
        </Button>
      </div>

      <div className="min-h-0 flex-1">
        <DataGrid
          rows={rows}
          columns={COLS}
          getRowId={(r) => r.id}
          density="compact"
          loading={q.isLoading}
          disableRowSelectionOnClick
          hideFooterPagination
          sx={{
            backgroundColor: 'transparent',
            color: 'inherit',
            border: '1px solid',
            borderColor: 'rgba(255,255,255,0.1)',
            '& .MuiDataGrid-columnHeaders': { backgroundColor: 'rgba(255,255,255,0.04)' },
            '& .MuiDataGrid-cell':         { borderColor: 'rgba(255,255,255,0.06)' },
            '& .MuiDataGrid-row:hover':    { backgroundColor: 'rgba(99,102,241,0.08)' },
          }}
        />
      </div>

      <div className="flex justify-center">
        <Button
          variant="outlined"
          onClick={() => q.fetchNextPage()}
          disabled={!q.hasNextPage || q.isFetchingNextPage}
        >
          {q.isFetchingNextPage
            ? 'Loading…'
            : q.hasNextPage
              ? 'Load older'
              : 'End of history'}
        </Button>
      </div>

      {q.isError && (
        <p className="text-sm text-red-400">
          Failed to load orders — {(q.error as Error).message}
        </p>
      )}
    </div>
  );
}
