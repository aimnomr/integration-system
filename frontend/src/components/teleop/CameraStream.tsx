import { useRosTopic } from '@/hooks/useRosTopic';
import type { CompressedImage } from '@/types/ros';

const TOPIC = '/camera/front/image_raw/compressed';

export function CameraStream({ rosbridgeUrl }: { rosbridgeUrl: string | null }) {
  const frame = useRosTopic<CompressedImage>(
    rosbridgeUrl, TOPIC, 'sensor_msgs/CompressedImage',
  );

  if (!rosbridgeUrl) {
    return <Box>No robot selected.</Box>;
  }
  if (!frame) {
    return <Box>Waiting for {TOPIC}…</Box>;
  }

  // rosbridge delivers `data` as base64 already; the message's `format` field
  // is usually "jpeg" but we treat it as JPEG by default for compatibility.
  const src = `data:image/${frame.format || 'jpeg'};base64,${frame.data}`;
  return (
    <div className="relative h-full w-full overflow-hidden rounded-lg border border-surface-2 bg-black">
      <img src={src} alt="camera" className="h-full w-full object-contain" />
      <div className="absolute right-2 top-2 rounded bg-surface-1/80 px-2 py-1 text-[11px] text-slate-300">
        {TOPIC}
      </div>
    </div>
  );
}

function Box({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full w-full items-center justify-center rounded-lg border border-surface-2 bg-black text-sm text-slate-500">
      {children}
    </div>
  );
}
