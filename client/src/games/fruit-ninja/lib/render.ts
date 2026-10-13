import type { FlyingObject, Particle, SliceSegment, FloatScore, FruitKind, AbilityKind } from "./types";

function rad(deg: number) {
  return (deg * Math.PI) / 180;
}

function isAbility(k: FlyingObject["kind"]): k is AbilityKind {
  return (k as AbilityKind).ability !== undefined;
}

// Raster icons (e.g. brand logos) are loaded once and cached by src, then
// reused every frame. drawImage on an unloaded Image is a silent no-op, so
// the fruit body still renders (as a plain disc) before the logo pops in.
const abilityImageCache = new Map<string, HTMLImageElement>();
function getAbilityImage(src: string): HTMLImageElement {
  let img = abilityImageCache.get(src);
  if (!img) {
    img = new Image();
    img.src = src;
    abilityImageCache.set(src, img);
  }
  return img;
}

export function drawAbilityFruit(
  ctx: CanvasRenderingContext2D,
  f: FlyingObject,
  t: number,
) {
  const k = f.kind as AbilityKind;
  const r = f.radius;
  ctx.save();
  ctx.translate(f.pos.x, f.pos.y);

  // pulsing glow aura
  const pulse = 0.6 + Math.abs(Math.sin(t * 0.008)) * 0.4;
  const ag = ctx.createRadialGradient(0, 0, r * 0.8, 0, 0, r * 1.7);
  ag.addColorStop(0, k.glow + "cc");
  ag.addColorStop(0.5, k.glow + "55");
  ag.addColorStop(1, k.glow + "00");
  ctx.fillStyle = ag;
  ctx.globalAlpha = pulse;
  ctx.beginPath();
  ctx.arc(0, 0, r * 1.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.rotate(f.angle);

  if (k.iconSrc) {
    drawLogoAbilityFruit(ctx, k, r);
  } else {
    ctx.shadowColor = k.glow;
    ctx.shadowBlur = 20;

    const grad = ctx.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.1, 0, 0, r);
    grad.addColorStop(0, k.rim);
    grad.addColorStop(1, k.color);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowColor = "transparent";

    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.beginPath();
    ctx.ellipse(-r * 0.32, -r * 0.38, r * 0.34, r * 0.2, -0.5, 0, Math.PI * 2);
    ctx.fill();

    // ability icon overlay
    drawAbilityIcon(ctx, k.ability, r, t);
  }

  ctx.restore();
}

// Logo-faced ability fruits (hair/hemi): the brand mark IS the fruit face,
// clipped to a circle, on a plain backing disc — no vector icon overlay.
function drawLogoAbilityFruit(
  ctx: CanvasRenderingContext2D,
  k: AbilityKind,
  r: number,
) {
  ctx.shadowColor = k.glow;
  ctx.shadowBlur = 20;

  const grad = ctx.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.1, 0, 0, r);
  grad.addColorStop(0, "#ffffff");
  grad.addColorStop(1, "#f0f0f0");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.shadowColor = "transparent";

  const img = getAbilityImage(k.iconSrc!);
  if (img.complete && img.naturalWidth > 0) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.92, 0, Math.PI * 2);
    ctx.clip();
    const size = r * 1.7;
    ctx.drawImage(img, -size / 2, -size / 2, size, size);
    ctx.restore();
  }

  ctx.fillStyle = "rgba(255,255,255,0.28)";
  ctx.beginPath();
  ctx.ellipse(-r * 0.32, -r * 0.38, r * 0.34, r * 0.2, -0.5, 0, Math.PI * 2);
  ctx.fill();
}

function drawAbilityIcon(
  ctx: CanvasRenderingContext2D,
  ability: string,
  r: number,
  t: number,
) {
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.strokeStyle = "rgba(255,255,255,0.95)";
  ctx.lineWidth = r * 0.08;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const s = r * 0.4;
  switch (ability) {
    case "frenzy": {
      // starburst
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + t * 0.003;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * s * 0.3, Math.sin(a) * s * 0.3);
        ctx.lineTo(Math.cos(a) * s, Math.sin(a) * s);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.25, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "glitch": {
      // glitch bars
      const off = Math.sin(t * 0.02) * 3;
      ctx.fillRect(-s + off, -s * 0.7, s * 2, s * 0.3);
      ctx.fillRect(-s - off, -s * 0.1, s * 2, s * 0.25);
      ctx.fillRect(-s + off, s * 0.4, s * 2, s * 0.3);
      break;
    }
    case "golden": {
      // crown / star
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
        const px = Math.cos(a) * s;
        const py = Math.sin(a) * s;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "multiplier": {
      // "x2"
      ctx.font = `bold ${r * 0.6}px ui-sans-serif, system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("x2", 0, 0);
      break;
    }
  }
}

export function drawFruit(
  ctx: CanvasRenderingContext2D,
  f: FlyingObject,
  t: number,
) {
  const k = f.kind as FruitKind;
  ctx.save();
  ctx.translate(f.pos.x, f.pos.y);
  ctx.rotate(f.angle);

  // soft shadow under fruit
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 6;

  // body
  const r = f.radius;
  const grad = ctx.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.1, 0, 0, r);
  grad.addColorStop(0, k.rim);
  grad.addColorStop(1, k.color);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.shadowColor = "transparent";

  // glossy highlight
  ctx.fillStyle = "rgba(255,255,255,0.28)";
  ctx.beginPath();
  ctx.ellipse(-r * 0.32, -r * 0.38, r * 0.34, r * 0.2, -0.5, 0, Math.PI * 2);
  ctx.fill();

  // per-fruit detail
  drawDetail(ctx, k, r, t);

  ctx.restore();
}

function drawDetail(
  ctx: CanvasRenderingContext2D,
  k: FruitKind,
  r: number,
  t: number,
) {
  switch (k.id) {
    case "watermelon": {
      // stripes
      ctx.strokeStyle = "rgba(20,60,20,0.55)";
      ctx.lineWidth = r * 0.12;
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(i * r * 0.4, -r);
        ctx.quadraticCurveTo(i * r * 0.5, 0, i * r * 0.4, r);
        ctx.stroke();
      }
      break;
    }
    case "orange": {
      ctx.strokeStyle = "rgba(150,70,0,0.35)";
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.7, a, a + 0.4);
        ctx.stroke();
      }
      break;
    }
    case "apple": {
      // stem + leaf
      ctx.strokeStyle = "#5d4037";
      ctx.lineWidth = r * 0.08;
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.92);
      ctx.quadraticCurveTo(r * 0.1, -r * 1.15, r * 0.25, -r * 1.1);
      ctx.stroke();
      ctx.fillStyle = "#66bb6a";
      ctx.beginPath();
      ctx.ellipse(r * 0.32, -r * 1.0, r * 0.22, r * 0.1, 0.4, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "lemon": {
      // little nub
      ctx.fillStyle = k.color;
      ctx.beginPath();
      ctx.ellipse(0, -r * 0.95, r * 0.14, r * 0.1, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "kiwi": {
      // texture dots
      ctx.fillStyle = "rgba(40,80,20,0.25)";
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * Math.PI * 2;
        const rr = r * (0.4 + (i % 3) * 0.18);
        ctx.beginPath();
        ctx.arc(Math.cos(a) * rr, Math.sin(a) * rr, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case "strawberry": {
      // seeds
      ctx.fillStyle = k.seed;
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        const rr = r * 0.55;
        ctx.save();
        ctx.rotate(a);
        ctx.beginPath();
        ctx.ellipse(0, rr, 2.2, 4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      // leafy crown
      ctx.fillStyle = "#43a047";
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
        ctx.save();
        ctx.rotate(a);
        ctx.beginPath();
        ctx.moveTo(0, -r * 0.85);
        ctx.lineTo(-r * 0.16, -r * 1.15);
        ctx.lineTo(r * 0.16, -r * 1.15);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      break;
    }
    case "dragonfruit": {
      // scale-like bracts
      ctx.fillStyle = "#8bc34a";
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        ctx.save();
        ctx.rotate(a);
        ctx.beginPath();
        ctx.moveTo(0, -r * 0.7);
        ctx.quadraticCurveTo(r * 0.18, -r * 0.95, 0, -r * 1.05);
        ctx.quadraticCurveTo(-r * 0.18, -r * 0.95, 0, -r * 0.7);
        ctx.fill();
        ctx.restore();
      }
      break;
    }
    case "blueberry": {
      // star calyx
      ctx.fillStyle = "rgba(20,30,80,0.5)";
      ctx.beginPath();
      ctx.arc(0, -r * 0.4, r * 0.18, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.4)";
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(0, -r * 0.4);
        ctx.lineTo(Math.cos(a) * r * 0.16, -r * 0.4 + Math.sin(a) * r * 0.16);
        ctx.stroke();
      }
      break;
    }
  }
}

export function drawBomb(ctx: CanvasRenderingContext2D, f: FlyingObject, t: number) {
  const r = f.radius;
  ctx.save();
  ctx.translate(f.pos.x, f.pos.y);
  ctx.rotate(f.angle);

  ctx.shadowColor = "rgba(0,0,0,0.4)";
  ctx.shadowBlur = 16;
  ctx.shadowOffsetY = 5;

  // body
  const g = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
  g.addColorStop(0, "#424242");
  g.addColorStop(1, "#1a1a1a");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.shadowColor = "transparent";

  // highlight
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.beginPath();
  ctx.ellipse(-r * 0.32, -r * 0.38, r * 0.3, r * 0.18, -0.5, 0, Math.PI * 2);
  ctx.fill();

  // fuse cap
  ctx.fillStyle = "#5d4037";
  ctx.fillRect(-r * 0.12, -r * 1.08, r * 0.24, r * 0.18);

  // fuse
  ctx.strokeStyle = "#a1887f";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, -r * 1.05);
  const wig = Math.sin(t * 0.02) * r * 0.12;
  ctx.quadraticCurveTo(r * 0.25 + wig, -r * 1.3, r * 0.15, -r * 1.45);
  ctx.stroke();

  // spark
  const sx = r * 0.15;
  const sy = -r * 1.45;
  const sp = 0.6 + Math.abs(Math.sin(t * 0.03)) * 0.6;
  const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 0.25 * sp);
  sg.addColorStop(0, "#fffde7");
  sg.addColorStop(0.4, "#ffd54f");
  sg.addColorStop(1, "rgba(255,140,0,0)");
  ctx.fillStyle = sg;
  ctx.beginPath();
  ctx.arc(sx, sy, r * 0.25 * sp, 0, Math.PI * 2);
  ctx.fill();

  // warning ring
  ctx.strokeStyle = `rgba(255,60,60,${0.3 + Math.abs(Math.sin(t * 0.01)) * 0.4})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, r * 1.12, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}

export function drawHalf(
  ctx: CanvasRenderingContext2D,
  f: FlyingObject,
  which: "a" | "b",
) {
  const k = f.kind as FruitKind;
  const h = f.halves![which];
  const r = f.radius;
  ctx.save();
  ctx.translate(h.pos.x, h.pos.y);
  ctx.rotate(h.angle);

  // outer skin (half disc)
  const grad = ctx.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.1, 0, 0, r);
  grad.addColorStop(0, k.rim);
  grad.addColorStop(1, k.color);
  ctx.fillStyle = grad;
  ctx.beginPath();
  if (which === "a") {
    ctx.arc(0, 0, r, Math.PI, Math.PI * 2);
  } else {
    ctx.arc(0, 0, r, 0, Math.PI);
  }
  ctx.closePath();
  ctx.fill();

  // inner flesh
  ctx.fillStyle = k.inner;
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.82, r * 0.82, 0, which === "a" ? Math.PI : 0, which === "a" ? Math.PI * 2 : Math.PI);
  ctx.closePath();
  ctx.fill();

  // seeds / detail on flesh
  ctx.fillStyle = k.seed;
  const seedCount = 6;
  for (let i = 0; i < seedCount; i++) {
    const a = (i / seedCount) * Math.PI + (which === "a" ? Math.PI : 0);
    const rr = r * 0.45;
    ctx.beginPath();
    ctx.ellipse(Math.cos(a) * rr, Math.sin(a) * rr, 2.4, 4, a, 0, Math.PI * 2);
    ctx.fill();
  }

  // rim line
  ctx.strokeStyle = "rgba(0,0,0,0.15)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-r, 0);
  ctx.lineTo(r, 0);
  ctx.stroke();

  ctx.restore();
}

export function drawParticle(ctx: CanvasRenderingContext2D, p: Particle) {
  const alpha = Math.max(0, p.life / p.maxLife);
  ctx.save();
  if (p.kind === "juice") {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.pos.x, p.pos.y, p.size * (0.4 + alpha * 0.6), 0, Math.PI * 2);
    ctx.fill();
  } else if (p.kind === "spark") {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.pos.x, p.pos.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.globalAlpha = alpha * 0.5;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.pos.x, p.pos.y, p.size * (1.4 - alpha), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function drawSliceTrail(
  ctx: CanvasRenderingContext2D,
  segments: SliceSegment[],
) {
  if (segments.length === 0) return;
  ctx.save();
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    const a = s.life / s.maxLife;
    ctx.strokeStyle = `rgba(255,255,255,${a * 0.9})`;
    ctx.lineWidth = 2 + a * 8;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(s.a.x, s.a.y);
    ctx.lineTo(s.b.x, s.b.y);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawFloat(ctx: CanvasRenderingContext2D, f: FloatScore) {
  const a = Math.max(0, f.life / f.maxLife);
  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = f.color;
  ctx.font = `bold ${f.big ? 34 : 22}px ui-sans-serif, system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.shadowColor = "rgba(0,0,0,0.4)";
  ctx.shadowBlur = 6;
  ctx.fillText(f.text, f.pos.x, f.pos.y);
  ctx.restore();
}