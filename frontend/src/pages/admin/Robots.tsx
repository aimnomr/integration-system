import { PagePlaceholder } from '../_PagePlaceholder';

export default function AdminRobots() {
  return (
    <PagePlaceholder
      title="Admin — Robots"
      phase="Phase 4 — coming soon"
      description="CRUD on the robots table via /robots/{serial}. Editing a robot triggers a registry reload on the backend; the ROS Bridge still needs a restart to pick up a newly added robot."
    />
  );
}
