import { Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import Dashboard from '@/pages/Dashboard';
import RobotDetail from '@/pages/RobotDetail';
import Dispatch from '@/pages/Dispatch';
import Orders from '@/pages/Orders';
import OEE from '@/pages/OEE';
import Teleop from '@/pages/Teleop';
import Health from '@/pages/Health';
import AdminMaps from '@/pages/admin/Maps';
import AdminLocations from '@/pages/admin/Locations';
import AdminRobots from '@/pages/admin/Robots';
import AdminFleetConfig from '@/pages/admin/FleetConfig';
import NotFound from '@/pages/NotFound';

// Fleet list lives at /robots, single robot at /robots/:serial — same as the
// REST shape. Teleop accepts the same :serial param so deep-linking works.
export function Router() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Dashboard />} />
        <Route path="robots" element={<Dashboard />} />
        <Route path="robots/:serial" element={<RobotDetail />} />
        <Route path="dispatch" element={<Dispatch />} />
        <Route path="orders" element={<Orders />} />
        <Route path="oee" element={<OEE />} />
        <Route path="teleop" element={<Teleop />} />
        <Route path="teleop/:serial" element={<Teleop />} />
        <Route path="health" element={<Health />} />
        <Route path="admin">
          <Route path="maps"      element={<AdminMaps />} />
          <Route path="locations" element={<AdminLocations />} />
          <Route path="robots"    element={<AdminRobots />} />
          <Route path="fleet"     element={<AdminFleetConfig />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
