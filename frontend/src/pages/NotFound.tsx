import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="flex flex-col items-start gap-3">
      <h1 className="text-2xl font-semibold text-white">404 — Not found</h1>
      <p className="text-sm text-slate-400">No screen lives at this route.</p>
      <Link to="/" className="text-sm text-brand-primary hover:underline">
        ← Back to dashboard
      </Link>
    </div>
  );
}
