import { AppProviders } from '@/components/providers/AppProviders';
import { Router } from '@/router';

export default function App() {
  return (
    <AppProviders>
      <Router />
    </AppProviders>
  );
}
