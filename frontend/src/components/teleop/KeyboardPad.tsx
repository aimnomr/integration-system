import { useCallback, useEffect, useRef } from 'react';
import { useRosPublisher } from '@/hooks/useRosPublisher';
import type { Twist } from '@/types/ros';

/**
 * Keyboard + button teleop pad. Inherits the velocity table from the v1
 * interface (LINEAR_SPEED 0.3 m/s, ANGULAR_SPEED 0.5 rad/s, 100 ms repeat
 * while held). Publishes geometry_msgs/Twist on /web_teleop/cmd_vel.
 *
 * Layout:
 *   Q W E      +x+ω  +x  +x-ω
 *   A S D       +ω  stop  -ω
 *   Z X C      -x-ω  -x  -x+ω
 *
 * `engaged=false` blocks all publishes — used so the operator can't drive
 * by accident while a tab has focus.
 */

const LINEAR_SPEED = 0.3;   // m/s
const ANGULAR_SPEED = 0.5;  // rad/s
const REPEAT_MS = 100;

type CmdMap = Record<string, { x: number; z: number }>;
const CMDS: CmdMap = {
  q: { x: +LINEAR_SPEED, z: +ANGULAR_SPEED },
  w: { x: +LINEAR_SPEED, z: 0 },
  e: { x: +LINEAR_SPEED, z: -ANGULAR_SPEED },
  a: { x: 0,             z: +ANGULAR_SPEED },
  s: { x: 0,             z: 0 },
  d: { x: 0,             z: -ANGULAR_SPEED },
  z: { x: -LINEAR_SPEED, z: -ANGULAR_SPEED },
  x: { x: -LINEAR_SPEED, z: 0 },
  c: { x: -LINEAR_SPEED, z: +ANGULAR_SPEED },
};

const STOP: Twist = {
  linear: { x: 0, y: 0, z: 0 },
  angular: { x: 0, y: 0, z: 0 },
};

interface Props {
  rosbridgeUrl: string | null;
  engaged: boolean;
}

export function KeyboardPad({ rosbridgeUrl, engaged }: Props) {
  const publish = useRosPublisher<Twist>(
    rosbridgeUrl, '/web_teleop/cmd_vel', 'geometry_msgs/Twist',
  );
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeKeyRef = useRef<string | null>(null);

  const sendCmd = useCallback((cmd: { x: number; z: number }) => {
    if (!engaged) return;
    publish({
      linear: { x: cmd.x, y: 0, z: 0 },
      angular: { x: 0, y: 0, z: cmd.z },
    });
  }, [engaged, publish]);

  const start = useCallback((key: string) => {
    const cmd = CMDS[key];
    if (!cmd) return;
    if (activeKeyRef.current === key) return; // already holding
    stop();
    activeKeyRef.current = key;
    sendCmd(cmd);
    intervalRef.current = setInterval(() => sendCmd(cmd), REPEAT_MS);
  }, [sendCmd]);

  const stop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (activeKeyRef.current !== null) {
      activeKeyRef.current = null;
      if (engaged) publish(STOP);
    }
  }, [engaged, publish]);

  useEffect(() => {
    if (!engaged) {
      stop();
      return;
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return; // ignore OS-level autorepeat — interval handles it
      const k = e.key.toLowerCase();
      if (k in CMDS) {
        e.preventDefault();
        start(k);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k in CMDS && activeKeyRef.current === k) stop();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      stop();
    };
  }, [engaged, start, stop]);

  // Stop publishing if disengaged.
  useEffect(() => { if (!engaged) stop(); }, [engaged, stop]);

  const keys = [['q', 'w', 'e'], ['a', 's', 'd'], ['z', 'x', 'c']];
  return (
    <div className="grid w-fit grid-cols-3 gap-2 rounded-lg border border-surface-2 bg-surface-1 p-3">
      {keys.flat().map((k) => (
        <button
          key={k}
          disabled={!engaged}
          onMouseDown={() => start(k)}
          onMouseUp={stop}
          onMouseLeave={stop}
          onTouchStart={(e) => { e.preventDefault(); start(k); }}
          onTouchEnd={stop}
          className={`h-14 w-14 select-none rounded font-mono text-lg font-semibold uppercase ${
            engaged
              ? 'bg-surface-2 text-white hover:bg-brand-primary/30 active:bg-brand-primary/50'
              : 'cursor-not-allowed bg-surface-2/40 text-slate-500'
          }`}
        >
          {k}
        </button>
      ))}
    </div>
  );
}
