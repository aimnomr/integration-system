import { useEffect, useMemo, useRef, useState } from 'react';
import { useRosTopic } from '@/hooks/useRosTopic';
import { quaternionToEuler } from '@/helper/angleHelper';
import type {
  OccupancyGrid,
  Path,
  PoseWithCovarianceStamped,
} from '@/types/ros';

/**
 * Live SLAM-aware map.
 *
 * Subscribes (per `rosbridgeUrl`) to:
 *   /reference/map                                    OccupancyGrid
 *   /amcl_pose                                        PoseWithCovarianceStamped
 *   /robot_pose_ekf_node/odom_combined                PoseWithCovarianceStamped  (fallback)
 *   /move_base_node/DWAPlannerROS/global_plan         Path
 *   /move_base_node/DWAPlannerROS/local_plan          Path
 *
 * The OccupancyGrid is rasterised onto an offscreen canvas at native cell
 * resolution (one ImageData write per map update), then scaled onto the
 * visible canvas. Overlays (paths, robot arrow) are computed in world
 * coordinates and transformed to pixels via the map metadata.
 *
 * Pose source: AMCL primary, EKF fallback. If AMCL has been silent for >
 * AMCL_STALE_MS, fall back to EKF. The arrow gets a softer fill when it's
 * running on the fallback so the operator notices.
 */

const AMCL_STALE_MS = 2_000;

const COLOR_GLOBAL_PATH = 'rgba(56, 189, 248, 0.85)'; // sky-400
const COLOR_LOCAL_PATH  = 'rgba(248, 113, 113, 0.95)'; // red-400
const COLOR_ARROW_PRIMARY  = '#60a5fa'; // blue-400
const COLOR_ARROW_FALLBACK = '#fbbf24'; // amber-400

export interface MapCanvasProps {
  rosbridgeUrl: string | null | undefined;
  /** Optional click handler in world coordinates. */
  onClickWorld?: (x: number, y: number) => void;
  /** Optional overlay items (named locations etc.). */
  pins?: Array<{ x: number; y: number; label?: string; color?: string }>;
}

export function MapCanvas({ rosbridgeUrl, onClickWorld, pins = [] }: MapCanvasProps) {
  const grid = useRosTopic<OccupancyGrid>(
    rosbridgeUrl, '/reference/map', 'nav_msgs/OccupancyGrid',
  );
  const amcl = useRosTopic<PoseWithCovarianceStamped>(
    rosbridgeUrl, '/amcl_pose', 'geometry_msgs/PoseWithCovarianceStamped',
  );
  const ekf = useRosTopic<PoseWithCovarianceStamped>(
    rosbridgeUrl, '/robot_pose_ekf_node/odom_combined',
    'geometry_msgs/PoseWithCovarianceStamped',
  );
  const globalPlan = useRosTopic<Path>(
    rosbridgeUrl, '/move_base_node/DWAPlannerROS/global_plan', 'nav_msgs/Path',
  );
  const localPlan = useRosTopic<Path>(
    rosbridgeUrl, '/move_base_node/DWAPlannerROS/local_plan', 'nav_msgs/Path',
  );

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const offscreenRef = useRef<HTMLCanvasElement | null>(null);
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });

  // Note when AMCL last spoke, so the arrow can fall back to EKF if it goes silent.
  const [amclLastMs, setAmclLastMs] = useState<number | null>(null);
  useEffect(() => { if (amcl) setAmclLastMs(Date.now()); }, [amcl]);

  // Choose pose source.
  const usingFallback =
    !amcl || (amclLastMs !== null && Date.now() - amclLastMs > AMCL_STALE_MS);
  const pose = (usingFallback ? ekf : amcl)?.pose.pose ?? null;

  // Observe container resize so the canvas can fill its slot responsively.
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) setContainerSize({ w: rect.width, h: rect.height });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Rasterise the grid to the offscreen canvas whenever it changes.
  useEffect(() => {
    if (!grid) return;
    const { width, height, } = grid.info;
    let off = offscreenRef.current;
    if (!off || off.width !== width || off.height !== height) {
      off = document.createElement('canvas');
      off.width = width;
      off.height = height;
      offscreenRef.current = off;
    }
    const ctx = off.getContext('2d');
    if (!ctx) return;
    const img = ctx.createImageData(width, height);
    const data = grid.data;
    // ROS occupancy grids put (0,0) at the bottom-left. Canvas (0,0) is at
    // the top-left, so we flip the Y row index on copy.
    for (let row = 0; row < height; row++) {
      const rosRow = height - 1 - row;
      for (let col = 0; col < width; col++) {
        const rosIdx = rosRow * width + col;
        const canvasIdx = (row * width + col) * 4;
        const cell = data[rosIdx];
        let v: number;
        if (cell === undefined || cell === -1) v = 80;                       // unknown
        else if (cell === 0) v = 255;                                        // free
        else v = Math.max(0, 255 - Math.round(cell * 2.55));                 // occupied scale
        img.data[canvasIdx]     = v;
        img.data[canvasIdx + 1] = v;
        img.data[canvasIdx + 2] = v;
        img.data[canvasIdx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }, [grid]);

  // Compute draw geometry: scale & offset that keep the map's aspect ratio
  // within the visible canvas.
  const geometry = useMemo(() => {
    if (!grid || containerSize.w === 0 || containerSize.h === 0) return null;
    const { width, height, resolution, origin } = grid.info;
    const aspect = width / height;
    const containerAspect = containerSize.w / containerSize.h;
    const drawW = aspect > containerAspect ? containerSize.w : containerSize.h * aspect;
    const drawH = aspect > containerAspect ? containerSize.w / aspect : containerSize.h;
    const offsetX = (containerSize.w - drawW) / 2;
    const offsetY = (containerSize.h - drawH) / 2;
    const scale = drawW / width;
    // World (x, y) → canvas pixel.
    const worldToPx = (x: number, y: number) => {
      const cellX = (x - origin.position.x) / resolution;
      const cellY = (y - origin.position.y) / resolution;
      return {
        px: offsetX + cellX * scale,
        py: offsetY + drawH - cellY * scale, // Y-flip
      };
    };
    // Inverse — needed for click-to-world.
    const pxToWorld = (px: number, py: number) => ({
      x: ((px - offsetX) / scale) * resolution + origin.position.x,
      y: ((offsetY + drawH - py) / scale) * resolution + origin.position.y,
    });
    return { drawW, drawH, offsetX, offsetY, scale, worldToPx, pxToWorld };
  }, [grid, containerSize]);

  // Render — runs every time anything observable changes.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !geometry) return;
    canvas.width = containerSize.w;
    canvas.height = containerSize.h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const off = offscreenRef.current;
    if (off) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(
        off,
        geometry.offsetX, geometry.offsetY,
        geometry.drawW, geometry.drawH,
      );
    }

    const drawPath = (path: Path | null, color: string, width = 2) => {
      if (!path || path.poses.length === 0) return;
      ctx.beginPath();
      ctx.lineWidth = width;
      ctx.strokeStyle = color;
      let first = true;
      for (const p of path.poses) {
        const { px, py } = geometry.worldToPx(p.pose.position.x, p.pose.position.y);
        if (first) { ctx.moveTo(px, py); first = false; }
        else        { ctx.lineTo(px, py); }
      }
      ctx.stroke();
    };
    drawPath(globalPlan, COLOR_GLOBAL_PATH);
    drawPath(localPlan, COLOR_LOCAL_PATH);

    // Pins
    for (const pin of pins) {
      const { px, py } = geometry.worldToPx(pin.x, pin.y);
      ctx.beginPath();
      ctx.arc(px, py, 5, 0, 2 * Math.PI);
      ctx.fillStyle = pin.color ?? '#a78bfa'; // violet-400
      ctx.fill();
      if (pin.label) {
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.font = '11px system-ui';
        ctx.fillText(pin.label, px + 8, py + 4);
      }
    }

    // Robot arrow (pose).
    if (pose) {
      const { px, py } = geometry.worldToPx(pose.position.x, pose.position.y);
      const yawDeg = quaternionToEuler(pose.orientation).z;
      // ROS yaw is CCW from +x; canvas Y is flipped, so rotate by -yaw to
      // match what the operator sees on screen.
      const yawRad = -yawDeg * Math.PI / 180;
      const size = 10;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(yawRad);
      ctx.beginPath();
      ctx.moveTo(size, 0);
      ctx.lineTo(-size * 0.6, size * 0.6);
      ctx.lineTo(-size * 0.6, -size * 0.6);
      ctx.closePath();
      ctx.fillStyle = usingFallback ? COLOR_ARROW_FALLBACK : COLOR_ARROW_PRIMARY;
      ctx.fill();
      ctx.strokeStyle = 'rgba(15,23,42,0.85)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
    }
  }, [geometry, containerSize, globalPlan, localPlan, pose, usingFallback, pins]);

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden rounded-lg border border-surface-2 bg-black"
      onClick={(e) => {
        if (!onClickWorld || !geometry) return;
        const rect = (e.target as HTMLElement).getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const world = geometry.pxToWorld(x, y);
        onClickWorld(world.x, world.y);
      }}
    >
      <canvas ref={canvasRef} className="block h-full w-full cursor-crosshair" />
      {!grid && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-500">
          {rosbridgeUrl ? 'Waiting for /reference/map…' : 'No robot selected'}
        </div>
      )}
      {pose && (
        <div className="absolute right-2 top-2 rounded bg-surface-1/80 px-2 py-1 text-[11px] text-slate-300">
          pose: {usingFallback ? 'EKF (fallback)' : 'AMCL'}
        </div>
      )}
    </div>
  );
}
