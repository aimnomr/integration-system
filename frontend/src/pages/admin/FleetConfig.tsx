import { useEffect, useState } from 'react';
import { Alert, Button, TextField } from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateFleet, type FleetConfigPatch } from '@/api/fleet';
import { useFleet } from '@/hooks/useFleet';
import { ApiError } from '@/api/client';
import { useToast } from '@/components/common/Snackbar';
import { Loading } from '@/components/common/Loading';

export default function AdminFleetConfig() {
  const qc = useQueryClient();
  const toast = useToast();
  const fleet = useFleet();

  const [form, setForm] = useState<FleetConfigPatch>({
    interface_name: '',
    major_version: '',
    version: '',
    manufacturer: '',
  });

  // Seed the form once the GET resolves.
  useEffect(() => {
    if (fleet.data) {
      setForm({
        interface_name: fleet.data.interfaceName,
        major_version: fleet.data.majorVersion,
        version: fleet.data.version,
        manufacturer: fleet.data.manufacturer,
      });
    }
  }, [fleet.data]);

  const save = useMutation({
    mutationFn: updateFleet,
    onSuccess: () => {
      toast.success('Fleet config updated — registry reloaded');
      qc.invalidateQueries({ queryKey: ['fleet'] });
    },
    onError: (e: ApiError) => toast.error(e.message),
  });

  if (fleet.isLoading) return <Loading label="Loading Fleet Config" />;
  if (fleet.isError) {
    return (
      <p className="text-sm text-red-400">
        Failed to load fleet config — {fleet.error.message}
      </p>
    );
  }

  const set = <K extends keyof FleetConfigPatch>(k: K, v: FleetConfigPatch[K]) =>
    setForm((f) => ({ ...f, [k]: v }));
  const valid = Object.values(form).every((v) => v.trim().length > 0);

  return (
    <form
      className="flex max-w-xl flex-col gap-4"
      onSubmit={(e) => { e.preventDefault(); if (valid) save.mutate(form); }}
    >
      <h1 className="text-2xl font-semibold text-white">Admin — Fleet Config</h1>

      <Alert severity="warning" variant="outlined" className="text-slate-300">
        Changing <b>Interface Name</b>, <b>Major Version</b>, or <b>Manufacturer</b>
        rewrites every robot&apos;s MQTT topic prefix
        (<code>{form.interface_name}/{form.major_version}/{form.manufacturer}/&lt;serial&gt;/*</code>).
        Robot firmware listening on the old prefix will go silent until restarted.
      </Alert>

      <TextField
        label="Interface Name" size="small" required
        value={form.interface_name}
        onChange={(e) => set('interface_name', e.target.value)}
        helperText="VDA5050 interfaceName — currently 'amr'"
      />
      <TextField
        label="Major Version" size="small" required
        value={form.major_version}
        onChange={(e) => set('major_version', e.target.value)}
        helperText="e.g. v2"
      />
      <TextField
        label="Version" size="small" required
        value={form.version}
        onChange={(e) => set('version', e.target.value)}
        helperText="Full VDA5050 version string — e.g. 2.0.0"
      />
      <TextField
        label="Manufacturer" size="small" required
        value={form.manufacturer}
        onChange={(e) => set('manufacturer', e.target.value)}
        helperText="Used as the third topic segment"
      />

      <div className="flex justify-end">
        <Button
          type="submit" variant="contained"
          disabled={!valid || save.isPending}
        >
          {save.isPending ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </form>
  );
}
