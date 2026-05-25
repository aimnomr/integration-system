import { useFleet } from '@/hooks/useFleet';
import { Loading } from '@/components/common/Loading';
import { RobotTile } from '@/components/robot/RobotTile';

export default function Dashboard() {
  const fleet = useFleet();

  if (fleet.isLoading) return <Loading label="Loading Fleet" />;
  if (fleet.isError) {
    return (
      <div className="text-sm text-red-400">
        Failed to load fleet — {fleet.error.message}
      </div>
    );
  }
  const data = fleet.data;
  if (!data) return null;

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold text-white">Dashboard</h1>
        <span className="text-xs text-slate-400">
          {data.robots.length} robot{data.robots.length === 1 ? '' : 's'}
        </span>
      </div>

      {data.robots.length === 0 ? (
        <p className="mt-6 text-sm text-slate-400">
          No robots in the fleet. Add one in Admin → Robots.
        </p>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {data.robots.map((r) => (
            <RobotTile key={r.serialNumber} fleet={data} robot={r} />
          ))}
        </div>
      )}
    </div>
  );
}
