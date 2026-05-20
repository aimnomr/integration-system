import {
  createContext, useCallback, useContext, useMemo, useState,
  type ReactNode,
} from 'react';
import { Alert, Snackbar as MuiSnackbar } from '@mui/material';

type Severity = 'success' | 'info' | 'warning' | 'error';

interface ToastEntry {
  id: number;
  message: string;
  severity: Severity;
}

interface SnackbarContextValue {
  show: (message: string, severity?: Severity) => void;
  success: (message: string) => void;
  error: (message: string) => void;
}

const Ctx = createContext<SnackbarContextValue | null>(null);

let _seq = 0;

export function SnackbarProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<ToastEntry[]>([]);

  const show = useCallback((message: string, severity: Severity = 'info') => {
    _seq += 1;
    setQueue((q) => [...q, { id: _seq, message, severity }]);
  }, []);

  const value = useMemo<SnackbarContextValue>(() => ({
    show,
    success: (m) => show(m, 'success'),
    error:   (m) => show(m, 'error'),
  }), [show]);

  const current = queue[0] ?? null;

  return (
    <Ctx.Provider value={value}>
      {children}
      <MuiSnackbar
        key={current?.id ?? 'none'}
        open={current !== null}
        autoHideDuration={4000}
        onClose={(_, reason) => {
          if (reason === 'clickaway') return;
          setQueue((q) => q.slice(1));
        }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        {current ? (
          <Alert
            severity={current.severity}
            onClose={() => setQueue((q) => q.slice(1))}
            variant="filled"
            sx={{ width: '100%' }}
          >
            {current.message}
          </Alert>
        ) : undefined}
      </MuiSnackbar>
    </Ctx.Provider>
  );
}

export function useToast(): SnackbarContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useToast must be inside <SnackbarProvider>');
  return ctx;
}
