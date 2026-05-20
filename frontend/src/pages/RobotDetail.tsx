import { useParams } from 'react-router-dom';
import { PagePlaceholder } from './_PagePlaceholder';

export default function RobotDetail() {
  const { serial } = useParams<{ serial: string }>();
  return (
    <PagePlaceholder
      title={`Robot — ${serial ?? '(none)'}`}
      phase="Phase 3 — coming soon"
      description="Big 2D map (/reference/map via rosbridge) with pose arrow (AMCL primary, EKF fallback), planned/active order path, named-location pins. Tabs underneath for raw state, errors, and the action log."
    />
  );
}
