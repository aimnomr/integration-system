import { PagePlaceholder } from './_PagePlaceholder';

export default function Teleop() {
  return (
    <PagePlaceholder
      title="Teleop"
      phase="Phase 3 — coming soon"
      description="Live camera (/camera/front/image_raw/compressed) plus a 3×3 keyboard pad publishing to /web_teleop/cmd_vel — inheriting the old interface's LINEAR_SPEED 0.3 / ANGULAR_SPEED 0.5 / 100 ms repeat. Touch-friendly this time."
    />
  );
}
