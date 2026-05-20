import { PagePlaceholder } from './_PagePlaceholder';

export default function Health() {
  return (
    <PagePlaceholder
      title="System Health"
      phase="Phase 3 — coming soon"
      description="Service pills (MQTT / DB / roslib / Node-RED) with last-checked timestamps, polled every 5 s from GET /system/status. Mirrors the small pills shown in the top bar but with more detail."
    />
  );
}
