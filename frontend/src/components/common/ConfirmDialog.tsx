import {
  Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle,
  Fade,
} from '@mui/material';
import { forwardRef, type ReactElement, type Ref } from 'react';
import type { TransitionProps } from '@mui/material/transitions';

interface Props {
  open: boolean;
  title: string;
  body?: React.ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

// MUI's default dialog grows from scale(0) — Emil's rule: nothing in the real
// world appears from nothing. Start from scale(0.96) + opacity 0 and fade in.
const ScaleFade = forwardRef(function ScaleFade(
  props: TransitionProps & { children: ReactElement },
  ref: Ref<unknown>,
) {
  return (
    <Fade
      ref={ref}
      {...props}
      timeout={{ enter: 200, exit: 140 }}
      easing={{
        enter: 'cubic-bezier(0.23, 1, 0.32, 1)',
        exit: 'cubic-bezier(0.4, 0, 1, 1)',
      }}
    />
  );
});

export function ConfirmDialog({
  open, title, body, confirmLabel = 'Confirm',
  destructive = false, onConfirm, onClose,
}: Props) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xs"
      fullWidth
      TransitionComponent={ScaleFade}
      slotProps={{
        paper: {
          sx: {
            transformOrigin: 'center',
            '@starting-style': {
              transform: 'scale(0.96)',
              opacity: 0,
            },
            transition:
              'transform 200ms cubic-bezier(0.23, 1, 0.32, 1),' +
              'opacity 200ms cubic-bezier(0.23, 1, 0.32, 1)',
          },
        },
      }}
    >
      <DialogTitle>{title}</DialogTitle>
      {body && <DialogContent><DialogContentText>{body}</DialogContentText></DialogContent>}
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          color={destructive ? 'error' : 'primary'}
          variant="contained"
          onClick={() => { onConfirm(); onClose(); }}
        >
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
