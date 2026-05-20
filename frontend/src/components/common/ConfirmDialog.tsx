import {
  Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle,
} from '@mui/material';

interface Props {
  open: boolean;
  title: string;
  body?: React.ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmDialog({
  open, title, body, confirmLabel = 'Confirm',
  destructive = false, onConfirm, onClose,
}: Props) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
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
