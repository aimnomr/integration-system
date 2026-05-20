import { PagePlaceholder } from './_PagePlaceholder';

export default function Dashboard() {
  return (
    <PagePlaceholder
      title="Dashboard"
      phase="Phase 3 — coming soon"
      description="Per-robot tiles: connection pill, mode, battery, current orderId, last-seen, mini-pose. Pulls GET /fleet on mount and subscribes amr/v2/+/+/state plus connection over MQTT-over-WebSockets."
    />
  );
}
