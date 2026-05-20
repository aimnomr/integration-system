/**
 * Quaternion ↔ Euler conversion, port of the v1 interface's angleHelper.js.
 *
 * Convention pitfall (preserved from v1): the JS/UI layer trades in **degrees**
 * everywhere. `quaternionToEuler` returns degrees; `eulerToQuaternion` expects
 * degrees. Convert at the rosbridge boundary, not in the middle of the stack.
 */

export interface Quaternion { x: number; y: number; z: number; w: number; }
export interface EulerDeg   { x: number; y: number; z: number; }

const RAD2DEG = 180 / Math.PI;
const DEG2RAD = Math.PI / 180;

export function quaternionToEuler(q: Quaternion): EulerDeg {
  const { x, y, z, w } = q;
  const roll = Math.atan2(2 * (w * x + y * z), 1 - 2 * (x * x + y * y));
  const sinPitch = 2 * (w * y - z * x);
  const pitch = Math.asin(Math.max(-1, Math.min(1, sinPitch)));
  const yaw = Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z));
  return { x: roll * RAD2DEG, y: pitch * RAD2DEG, z: yaw * RAD2DEG };
}

export function eulerToQuaternion(e: EulerDeg): Quaternion {
  const rx = e.x * DEG2RAD / 2;
  const ry = e.y * DEG2RAD / 2;
  const rz = e.z * DEG2RAD / 2;
  const cr = Math.cos(rx), sr = Math.sin(rx);
  const cp = Math.cos(ry), sp = Math.sin(ry);
  const cy = Math.cos(rz), sy = Math.sin(rz);
  return {
    w: cr * cp * cy + sr * sp * sy,
    x: sr * cp * cy - cr * sp * sy,
    y: cr * sp * cy + sr * cp * sy,
    z: cr * cp * sy - sr * sp * cy,
  };
}
