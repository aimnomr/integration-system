import { useMemo, type ReactNode } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { CssBaseline, ThemeProvider, createTheme } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BRAND } from '@/branding/branding';
import { SnackbarProvider } from '@/components/common/Snackbar';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Most reference data (fleet, maps, locations) changes rarely; live
      // data flows over MQTT/rosbridge, not REST polling.
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

export function AppProviders({ children }: { children: ReactNode }) {
  const theme = useMemo(
    () =>
      createTheme({
        palette: {
          mode: 'dark',
          primary: { main: BRAND.primary },
          secondary: { main: BRAND.secondary },
          background: {
            default: BRAND.surface[0],
            paper: BRAND.surface[1],
          },
          success: { main: BRAND.status.ok },
          warning: { main: BRAND.status.warn },
          error: { main: BRAND.status.error },
        },
        typography: { fontFamily: 'system-ui, -apple-system, sans-serif' },
        shape: { borderRadius: 8 },
      }),
    [],
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <SnackbarProvider>
          <BrowserRouter>{children}</BrowserRouter>
        </SnackbarProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
