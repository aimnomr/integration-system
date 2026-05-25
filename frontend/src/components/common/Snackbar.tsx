import {
  createContext, useCallback, useContext, useMemo, useState,
  type ReactNode,
} from 'react';
import { Alert, Slide, Snackbar as MuiSnackbar } from '@mui/material';
import type { SlideProps } from '@mui/material/Slide';

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

// Errors deserve attention; success is acknowledgment; info is between.
const DURATION: Record<Severity, number | null> = {
  success: 3000,
  info:    2800,
  warning: 5000,
  error:   null, // persistent — operator must dismiss
};

function SlideUp(props: SlideProps) {
  return <Slide {...props} direction="up" />;
}

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
  const dismiss = () => setQueue((q) => q.slice(1));

  return (
    <Ctx.Provider value={value}>
      {children}
      <MuiSnackbar
        key={current?.id ?? 'none'}
        open={current !== null}
        autoHideDuration={current ? DURATION[current.severity] : null}
        onClose={(_, reason) => {
          if (reason === 'clickaway') return;
          dismiss();
        }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        TransitionComponent={SlideUp}
        transitionDuration={{ enter: 320, exit: 220 }}
      >
        {current ? (
          <Alert
            severity={current.severity}
            onClose={dismiss}
            variant="filled"
            sx={{
              width: '100%',
              transition: 'transform 320ms cubic-bezier(0.32, 0.72, 0, 1)',
            }}
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
