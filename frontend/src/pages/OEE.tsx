import { useEffect, useState } from 'react';
import { MenuItem, TextField } from '@mui/material';
import { BarChart } from '@mui/x-charts/BarChart';
import { useQueries } from '@tanstack/react-query';
import { useFleet } from '@/hooks/useFleet';
import { getOeeAvailability, getOeeCycles, getOeeSummary } from '@/api/oee';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import type { OeeCycle } from '@/types/api';

const CYCLE_COLS: GridColDef<OeeCycle>[] = [
  { field: 'ts',         headerName: 'Time',     flex: 1.2,
    valueFormatter: (v) => new Date(v as string).toLocaleString() },
  { field: 'order_id',   headerName: 'Order',    flex: 1.2,
    renderCell: (p) => <span className="font-mono text-xs">{p.value}</span> },
  { field: 'duration_s', headerName: 'Duration (s)', width: 130, type: 'number',
    valueFormatter: (_v, row) => (typeof row.duration_s === 'number' ? row.duration_s.toFixed(1) : '—') },
  { field: 'result',     headerName: 'Result',   width: 120,
    renderCell: (p) => (
      <span className={p.value === 'SUCCEEDED' ? 'text-green-400' : 'text-red-400'}>
        {String(p.value)}
      </span>
    ) },
];

function MetricCard({ label, value, hint }: {
  label: string; value: string; hint?: string;
}) {
  return (
    <div className="rounded-lg border border-surface-2 bg-surface-1 p-4">
      <div className="text-[10px] uppercase tracking-widest text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-white">{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-400">{hint}</div>}
    </div>
  );
}

export default function OEE() {
  const fleet = useFleet();
  const robots = fleet.data?.robots ?? [];
  const [serial, setSerial] = useState<string>('');

  // Pre-select the first robot once the fleet loads.
  useEffect(() => {
    if (!serial && robots.length > 0) setSerial(robots[0]!.serialNumber);
  }, [robots, serial]);

  const [summary, availability, cycles] = useQueries({
    queries: [
      {
        queryKey: ['oee', 'summary', serial],
        queryFn: () => getOeeSummary(serial),
        enabled: Boolean(serial),
      },
      {
        queryKey: ['oee', 'availability', serial],
        queryFn: () => getOeeAvailability(serial),
        enabled: Boolean(serial),
      },
      {
        queryKey: ['oee', 'cycles', serial],
        queryFn: () => getOeeCycles(serial, 100),
        enabled: Boolean(serial),
      },
    ],
  });

  const successRate = (() => {
    const s = summary.data;
    if (!s) return null;
    const total = s.total_cycles;
    if (!total) return null;
    return (s.succeeded / total) * 100;
  })();

  // Bar chart of recent cycle durations, oldest → newest, coloured by result.
  const chartCycles = [...(cycles.data?.cycles ?? [])].reverse();
  const chartData = chartCycles.map((c, idx) => ({
    idx,
    duration: c.duration_s,
    color: c.result === 'SUCCEEDED' ? '#22c55e' : '#ef4444',
  }));

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold text-white">OEE</h1>
        <TextField
          select size="small" label="Robot" sx={{ minWidth: 180 }}
          value={serial} onChange={(e) => setSerial(e.target.value)}
        >
          {robots.length === 0 && <MenuItem value="">No Robots</MenuItem>}
          {robots.map((r) => (
            <MenuItem key={r.serialNumber} value={r.serialNumber}>
              {r.serialNumber}
            </MenuItem>
          ))}
        </TextField>
      </header>

      {!serial ? (
        <p className="text-sm text-slate-500">Pick a robot to view OEE.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <MetricCard
              label="Total Cycles"
              value={summary.data?.total_cycles?.toString() ?? '—'}
            />
            <MetricCard
              label="Succeeded"
              value={summary.data?.succeeded?.toString() ?? '—'}
              hint={successRate !== null ? `${successRate.toFixed(1)}% success` : undefined}
            />
            <MetricCard
              label="Failed"
              value={summary.data?.failed?.toString() ?? '—'}
            />
            <MetricCard
              label="Avg Duration"
              value={
                summary.data?.avg_duration_s !== undefined
                  ? `${Number(summary.data.avg_duration_s).toFixed(1)} s`
                  : '—'
              }
            />
          </div>

          <div className="rounded-lg border border-surface-2 bg-surface-1 p-4">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400">
                Availability
              </h2>
              {availability.data && (
                <span className="text-xs text-slate-500">
                  {availability.data.driving_samples} / {availability.data.total_samples} driving samples
                </span>
              )}
            </div>
            <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full bg-brand-primary transition-all"
                style={{ width: `${(availability.data?.availability ?? 0) * 100}%` }}
              />
            </div>
            <div className="mt-2 text-right text-2xl font-semibold text-white">
              {availability.data
                ? `${(availability.data.availability * 100).toFixed(1)}%`
                : '—'}
            </div>
          </div>

          <div className="rounded-lg border border-surface-2 bg-surface-1 p-4">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400">
              Recent Cycle Durations (Oldest → Newest)
            </h2>
            <div className="mt-3 h-64">
              {chartData.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-slate-500">
                  No cycles yet for this robot.
                </div>
              ) : (
                <BarChart
                  height={250}
                  xAxis={[{ scaleType: 'band', data: chartData.map((d) => d.idx) }]}
                  yAxis={[{ label: 'seconds' }]}
                  series={[{
                    data: chartData.map((d) => d.duration),
                    // MUI X v7 lacks per-bar colors out-of-box; surfacing success
                    // vs aborted in the dedicated grid below is the workaround.
                  }]}
                  colors={['#6366f1']}
                  sx={{
                    '& .MuiChartsAxis-tickLabel': { fill: '#94a3b8' },
                    '& .MuiChartsAxis-label':     { fill: '#cbd5e1' },
                    '& .MuiChartsAxis-line':      { stroke: '#475569' },
                    '& .MuiChartsAxis-tick':      { stroke: '#475569' },
                  }}
                />
              )}
            </div>
          </div>

          <div className="min-h-[20rem] rounded-lg border border-surface-2 bg-surface-1">
            <div className="border-b border-surface-2 px-4 py-3 text-sm font-semibold uppercase tracking-widest text-slate-400">
              Cycles Log
            </div>
            <DataGrid
              rows={cycles.data?.cycles ?? []}
              columns={CYCLE_COLS}
              getRowId={(r) => r.id}
              density="compact"
              loading={cycles.isLoading}
              disableRowSelectionOnClick
              autoHeight
              pageSizeOptions={[10, 25, 50]}
              initialState={{ pagination: { paginationModel: { pageSize: 10 } } }}
              sx={{
                backgroundColor: 'transparent',
                color: 'inherit',
                border: 'none',
                '& .MuiDataGrid-columnHeaders': { backgroundColor: 'rgba(255,255,255,0.04)' },
                '& .MuiDataGrid-cell':         { borderColor: 'rgba(255,255,255,0.06)' },
                '& .MuiDataGrid-row:hover':    { backgroundColor: 'rgba(99,102,241,0.08)' },
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}
