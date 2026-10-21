import { useEffect, useRef } from "react";
import { listen } from "../motion";

interface Star { x: number; y: number; z: number; tint: number; }
interface Bolt { x: number; y: number; ux: number; uy: number; speed: number; color: string; }

const TINTS = ["#ffffff", "#d6ebff", "#9fd4ff", "#fff1b8", "#ffc9c9"];
const JUMP_MS = 1700;
const star = (z: number): Star => ({
  x: Math.random() * 2 - 1,
  y: Math.random() * 2 - 1,
  z,
  tint: Math.floor(Math.random() ** 3 * TINTS.length),
});
// 0..1 lightspeed intensity: punch in, hold, then coast back out.
function warpAt(t: number) {
  if (t < 0 || t > JUMP_MS) return 0;
  if (t < 380) return (t / 380) ** 2;
  if (t < 760) return 1;
  const u = (t - 760) / (JUMP_MS - 760);
  return 1 - u * u * (3 - 2 * u);
}

/** Full-screen canvas: drifting stars, occasional blaster volleys, hyperspace jumps. */
export function Starfield({ motion }: { motion: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!, ctx = canvas.getContext("2d");
    if (!ctx) return;
    let w = 0, h = 0, raf = 0, last = 0, drawn = 0;
    let jump = -Infinity, volley = performance.now() + 4000;
    let stars: Star[] = [];
    const bolts: Bolt[] = [];
    const drift = { x: 0, y: 0, tx: 0, ty: 0 };

    const fire = () => {
      const color = Math.random() < 0.65 ? "#ff3348" : "#45ff86";
      const dir = Math.random() < 0.5 ? 1 : -1, angle = (Math.random() - 0.5) * 0.45;
      const y = h * (0.12 + Math.random() * 0.76), speed = 1.5 + Math.random() * 0.7;
      const shots = 2 + Math.floor(Math.random() * 3);
      for (let k = 0; k < shots; k++) bolts.push({
        x: dir > 0 ? -160 - k * 150 : w + 160 + k * 150,
        y: y + (k % 2 ? 16 : -16) * Math.ceil(k / 2),
        ux: Math.cos(angle) * dir, uy: Math.sin(angle), speed, color,
      });
    };

    const draw = (now: number, dt: number) => {
      const warp = warpAt(now - jump);
      const speed = 0.000032 + warp * warp * 0.0026;
      drift.x += (drift.tx - drift.x) * 0.04;
      drift.y += (drift.ty - drift.y) * 0.04;
      const cx = w / 2 - drift.x * w * 0.035, cy = h / 2 - drift.y * h * 0.035;
      const f = Math.max(w, h) * 0.5, tail = speed * 16 * (1 + warp * 16);
      ctx.clearRect(0, 0, w, h);
      ctx.lineCap = "round";
      for (let i = 0; i < stars.length; i++) {
        const s = stars[i];
        s.z -= speed * dt;
        const x = cx + (s.x / s.z) * f, y = cy + (s.y / s.z) * f;
        if (s.z <= 0.01 || x < -60 || x > w + 60 || y < -60 || y > h + 60) {
          stars[i] = star(1);
          continue;
        }
        const depth = 1 - s.z, size = 0.4 + depth * depth * 2.4;
        ctx.globalAlpha = Math.min(1, depth * 1.6) * (0.72 + 0.28 * Math.sin(now * 0.0017 + i * 1.7));
        if (warp > 0.02) {
          const tz = Math.min(1, s.z + tail);
          ctx.strokeStyle = s.tint < 2 ? "#cfe8ff" : TINTS[s.tint];
          ctx.lineWidth = size;
          ctx.beginPath();
          ctx.moveTo(cx + (s.x / tz) * f, cy + (s.y / tz) * f);
          ctx.lineTo(x, y);
          ctx.stroke();
        } else {
          ctx.fillStyle = TINTS[s.tint];
          ctx.fillRect(x - size / 2, y - size / 2, size, size);
        }
      }
      ctx.globalAlpha = 1;
      if (warp > 0.05) {
        const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, f);
        glow.addColorStop(0, `rgba(190, 225, 255, ${0.2 * warp})`);
        glow.addColorStop(1, "rgba(190, 225, 255, 0)");
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, w, h);
      }
      if (motion && warp === 0 && now > volley) {
        fire();
        volley = now + 7000 + Math.random() * 10000;
      }
      for (let i = bolts.length - 1; i >= 0; i--) {
        const b = bolts[i];
        b.x += b.ux * b.speed * dt;
        b.y += b.uy * b.speed * dt;
        if ((b.ux > 0 && b.x > w + 400) || (b.ux < 0 && b.x < -400)) { bolts.splice(i, 1); continue; }
        const tx = b.x - b.ux * 120, ty = b.y - b.uy * 120;
        ctx.shadowColor = b.color;
        ctx.shadowBlur = 14;
        ctx.strokeStyle = b.color;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(b.x, b.y); ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
    };

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.round(Math.min(700, (w * h) / 2600));
      stars = Array.from({ length: count }, () => star(0.05 + Math.random() * 0.95));
      if (!motion) draw(performance.now(), 0);
    };
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const busy = bolts.length > 0 || warpAt(now - jump) > 0;
      // Ambient drift only needs ~30fps; jumps and blaster fire get every frame.
      if (!busy && now - drawn < 31) return;
      draw(now, Math.min(50, now - last));
      last = drawn = now;
    };
    const start = () => {
      cancelAnimationFrame(raf);
      if (!motion || document.hidden) return;
      last = drawn = performance.now();
      raf = requestAnimationFrame(loop);
    };
    const pointer = (e: PointerEvent) => {
      drift.tx = (e.clientX / w) * 2 - 1;
      drift.ty = (e.clientY / h) * 2 - 1;
    };
    resize();
    start();
    const offJump = listen("hyperspace", () => { if (motion) jump = performance.now(); });
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", pointer, { passive: true });
    document.addEventListener("visibilitychange", start);
    return () => {
      cancelAnimationFrame(raf);
      offJump();
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", pointer);
      document.removeEventListener("visibilitychange", start);
    };
  }, [motion]);
  return <canvas className="starfield" ref={ref} aria-hidden="true" />;
}
