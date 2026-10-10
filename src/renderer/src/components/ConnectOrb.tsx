import { motion } from "framer-motion";
import { useEffect, useRef } from "react";
import type { ConnState } from "../../../shared/types";
import Icon from "./Icon";

const POINTS = 420;

/** A rotating globe of dots behind the power button. Speed and colour follow the connection state. */
export default function ConnectOrb({ state, busy, onClick }: { state: ConnState; busy: boolean; onClick: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const ctx = el.getContext("2d")!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const size = 300;
    el.width = size * dpr;
    el.height = size * dpr;
    ctx.scale(dpr, dpr);

    // Fibonacci sphere
    const pts = Array.from({ length: POINTS }, (_, i) => {
      const y = 1 - (i / (POINTS - 1)) * 2;
      const r = Math.sqrt(1 - y * y);
      const t = i * Math.PI * (3 - Math.sqrt(5));
      return { x: Math.cos(t) * r, y, z: Math.sin(t) * r };
    });

    let angle = 0;
    let speed = 0.003;
    let glow = 0;
    let frame = 0;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const draw = (time: number) => {
      const s = stateRef.current;
      const targetSpeed = s === "connecting" || s === "disconnecting" ? 0.03 : s === "connected" ? 0.006 : 0.0025;
      const targetGlow = s === "connected" ? 1 : s === "connecting" ? 0.6 : 0;
      speed += (targetSpeed - speed) * 0.05;
      glow += (targetGlow - glow) * 0.05;
      if (!reduce) angle += speed;

      ctx.clearRect(0, 0, size, size);
      const cx = size / 2;
      const cy = size / 2;
      const R = 128;
      const tilt = 0.35;
      const pulse = s === "connecting" ? 0.5 + 0.5 * Math.sin(time / 180) : 1;

      for (const p of pts) {
        const x1 = p.x * Math.cos(angle) - p.z * Math.sin(angle);
        const z1 = p.x * Math.sin(angle) + p.z * Math.cos(angle);
        const y2 = p.y * Math.cos(tilt) - z1 * Math.sin(tilt);
        const z2 = p.y * Math.sin(tilt) + z1 * Math.cos(tilt);
        const depth = (z2 + 1) / 2; // 0 back → 1 front
        const px = cx + x1 * R;
        const py = cy + y2 * R;
        const r = 0.6 + depth * 1.6;
        const a = (0.08 + depth * 0.55) * (0.55 + glow * 0.45) * pulse;
        const hue = s === "error" ? "248,113,113" : glow > 0.5 ? "90,180,255" : s === "connecting" ? "139,123,255" : "120,140,180";
        ctx.fillStyle = `rgba(${hue},${a.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fill();
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, []);

  const label =
    state === "connected" ? "Disconnect" : state === "connecting" ? "Connecting" : state === "disconnecting" ? "Stopping" : "Connect";

  return (
    <div className={`orb orb--${state}`}>
      <span className="orb-halo" />
      {state === "connected" && (
        <>
          <span className="orb-wave" />
          <span className="orb-wave orb-wave--2" />
        </>
      )}
      <canvas ref={canvas} className="orb-canvas" />
      <motion.button
        type="button"
        className="orb-btn"
        onClick={onClick}
        disabled={busy || state === "connecting" || state === "disconnecting"}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.94 }}
        aria-label={label}
      >
        <span className="orb-ring" />
        <Icon name="power" size={38} strokeWidth={2.2} />
      </motion.button>
    </div>
  );
}
