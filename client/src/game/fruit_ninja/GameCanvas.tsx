import { useEffect, useRef } from "react";
import type { GameState, Vec2 } from "./types";
import {
  addSlicePoint,
  endStroke,
  updateGame,
} from "./engine";
import {
  drawAbilityFruit,
  drawBomb,
  drawFloat,
  drawFruit,
  drawHalf,
  drawParticle,
  drawSliceTrail,
} from "./render";

interface Props {
  stateRef: React.MutableRefObject<GameState>;
  onFrame: () => void;
  onReady?: (w: number, h: number) => void;
}

export default function GameCanvas({ stateRef, onFrame, onReady }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sizeRef = useRef({ w: 0, h: 0 });
  const onFrameRef = useRef(onFrame);
  onFrameRef.current = onFrame;
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    let raf = 0;
    let last = performance.now();
    let dpr = Math.min(2, window.devicePixelRatio || 1);

    function resize() {
      const parent = canvas.parentElement!;
      const w = parent.clientWidth;
      const h = parent.clientHeight;
      sizeRef.current = { w, h };
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      onReadyRef.current?.(w, h);
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement!);

    function loop(now: number) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const s = stateRef.current;
      const { w, h } = sizeRef.current;

      updateGame(s, dt, w, h);
      onFrameRef.current();
      render(s, w, h, now);
      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);

    function render(s: GameState, w: number, h: number, t: number) {
      ctx.clearRect(0, 0, w, h);

      let sx = 0;
      let sy = 0;
      if (s.shake > 0) {
        const mag = s.shake * 14;
        sx = (Math.random() - 0.5) * mag;
        sy = (Math.random() - 0.5) * mag;
      }
      ctx.save();
      ctx.translate(sx, sy);

      // objects
      for (const o of s.objects) {
        if (o.sliced && o.halves) {
          drawHalf(ctx, o, "a");
          drawHalf(ctx, o, "b");
        } else if (o.isBomb) {
          drawBomb(ctx, o, t);
        } else if (o.isAbility) {
          drawAbilityFruit(ctx, o, t);
        } else if (!o.sliced) {
          drawFruit(ctx, o, t);
        }
      }

      // particles
      for (const p of s.particles) drawParticle(ctx, p);

      // slice trail
      drawSliceTrail(ctx, s.segments);

      // floats
      for (const f of s.floats) drawFloat(ctx, f);

      ctx.restore();

      // glitch flash overlay
      if (s.glitchFlash > 0) {
        ctx.save();
        ctx.globalAlpha = s.glitchFlash * 0.25;
        const bars = 6;
        for (let i = 0; i < bars; i++) {
          const y = (h / bars) * i + (Math.random() - 0.5) * 20;
          ctx.fillStyle = i % 2 === 0 ? "#7c4dff" : "#ff80ab";
          ctx.fillRect(0, y, w, h / bars);
        }
        ctx.restore();
      }
    }

    // input
    function pos(e: PointerEvent): Vec2 {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }
    function down(e: PointerEvent) {
      if (stateRef.current.phase !== "playing") return;
      canvas.setPointerCapture(e.pointerId);
      addSlicePoint(stateRef.current, pos(e));
    }
    function move(e: PointerEvent) {
      if (stateRef.current.phase !== "playing") return;
      if (e.buttons === 0 && e.pointerType === "mouse") return;
      addSlicePoint(stateRef.current, pos(e));
    }
    function up() {
      endStroke(stateRef.current);
    }
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    canvas.addEventListener("pointerleave", up);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
      canvas.removeEventListener("pointerleave", up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 touch-none" />;
}
