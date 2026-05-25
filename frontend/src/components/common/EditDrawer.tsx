import { Button, Drawer, IconButton } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import type { ReactNode } from 'react';

interface Props {
  open: boolean;
  title: string;
  onClose: () => void;
  onSave?: () => void;
  saveLabel?: string;
  saveDisabled?: boolean;
  saving?: boolean;
  width?: number | string;
  children: ReactNode;
}

export function EditDrawer({
  open, title, onClose, onSave, saveLabel = 'Save',
  saveDisabled = false, saving = false, width = 480, children,
}: Props) {
  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      transitionDuration={{ enter: 320, exit: 220 }}
    >
      <div className="flex h-full flex-col bg-surface-1 text-slate-100" style={{ width }}>
        <header className="flex items-center justify-between border-b border-surface-2 px-4 py-3">
          <h2 className="text-base font-semibold">{title}</h2>
          <IconButton size="small" onClick={onClose} sx={{ color: 'inherit' }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </header>
        <div className="flex-1 overflow-auto p-4">{children}</div>
        {onSave && (
          <footer className="flex justify-end gap-2 border-t border-surface-2 px-4 py-3">
            <Button onClick={onClose}>Cancel</Button>
            <Button
              variant="contained"
              disabled={saveDisabled || saving}
              onClick={onSave}
            >
              {saving ? 'Saving…' : saveLabel}
            </Button>
          </footer>
        )}
      </div>
    </Drawer>
  );
}
