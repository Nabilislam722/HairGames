import { useEffect, useRef, useCallback } from "react";

const BASE = import.meta.env.BASE_URL;
const sp = (name: string) => `${BASE}sprites/${name}.png`;

// Virtual MS screen: 400 × 200, center = (0,0), y-up
const MS_W = 400;
const MS_H = 200;

// Track data
const TRACK_DATA = "===l===r===LR===RR==R=L=L=L======RR=RLR===";
const TRACK_DIC: Record<string, number> = {
  l: -150,
  L: -300,
  r: 150,
  R: 300,
  "=": 0,
};

const DECOR = [
  { sprite: "palm_tree", size: 2.5, ratio: 1, offset: 0 },
  { sprite: "bush", size: 0.5, ratio: 1, offset: 2 },
  { sprite: "rock_sml", size: 0.5, ratio: 0.5, offset: 0.2 },
  { sprite: "rock_sml", size: 1, ratio: 0.5, offset: 0.2 },
  { sprite: "tree", size: 2, ratio: 1.2, offset: 2 },
  { sprite: "rock_sml", size: 1, ratio: 0.5, offset: 2 },
  { sprite: "dead_bushes", size: 1, ratio: 0.25, offset: 2 },
  { sprite: "rock_med1", size: 1, ratio: 1, offset: 1 },
];

const AI_COLORS = ["green", "blue", "yellow", "white", "black", "red"];

// seeded pseudo-random for deterministic objects
let seed = 12345; 
function seededRand() {
  seed = (seed * 1664525 + 1013904223) & 0xffffffff;
  return (seed >>> 0) / 0xffffffff;
}

function buildTrackValues() {
  const tv: number[] = [];
  for (let i = 0; i < TRACK_DATA.length; i++) {
    tv[i] = TRACK_DIC[TRACK_DATA[i]] ?? 0;
  }
  return tv;
}

function readTrack(x: number, trackValue: number[]) {
  const i1 = Math.floor(x);
  const a = x - i1;
  const i2 = i1 + 1;
  const v1 =
    trackValue[
      ((i1 % trackValue.length) + trackValue.length) % trackValue.length
    ];
  const v2 =
    trackValue[
      ((i2 % trackValue.length) + trackValue.length) % trackValue.length
    ];
  const s = a * a * (3 - 2 * a);
  return v1 * (1 - s) + v2 * s;
}

function lineToDistance(line: number) {
  return 10 / (100 - line + 1);
}

function distanceToLine(distance: number) {
  return 101 - 10 / distance;
}

function fmod(x: number, y: number) {
  const i = Math.floor(x / y);
  return x - i * y;
}

interface SideObj {
  sprite: string;
  size: number;
  ratio: number;
  offset: number;
}

interface AiCar {
  x: number;
  position: number;
  speed: number;
  color: string;
}

interface Cloud {
  name: string;
  x: number;
  y: number;
  v: number;
  size: number;
}

function buildSideObjects(trackValue: number[]) {
  const len = trackValue.length;
  const leftObjects: (SideObj | null)[] = new Array(len * 10).fill(null);
  const rightObjects: (SideObj | null)[] = new Array(len * 10).fill(null);

  const RIGHT_TURN_SIGN: SideObj = {
    sprite: "right_turn",
    size: 0.75,
    ratio: 1,
    offset: 0,
  };
  const RIGHT_ARROW_SIGN: SideObj = {
    sprite: "sharp_right",
    size: 0.5,
    ratio: 0.67,
    offset: 0,
  };
  const LEFT_TURN_SIGN: SideObj = {
    sprite: "left_turn",
    size: 0.75,
    ratio: 1,
    offset: 0,
  };
  const LEFT_ARROW_SIGN: SideObj = {
    sprite: "sharp_left",
    size: 0.5,
    ratio: 0.67,
    offset: 0,
  };

  for (let i = 0; i < len * 10; i++) {
    if (seededRand() < 0.2) {
      const tv = readTrack(i / 10, trackValue);
      const tvNext = readTrack(i / 10 + 1, trackValue);
      if (tv > 200) {
        leftObjects[i] = RIGHT_ARROW_SIGN;
        rightObjects[i] = RIGHT_ARROW_SIGN;
        continue;
      } else if (tv < -200) {
        leftObjects[i] = LEFT_ARROW_SIGN;
        rightObjects[i] = LEFT_ARROW_SIGN;
        continue;
      } else if (tvNext > 200) {
        leftObjects[i] = RIGHT_TURN_SIGN;
        rightObjects[i] = RIGHT_TURN_SIGN;
        continue;
      } else if (tvNext < -200) {
        leftObjects[i] = LEFT_TURN_SIGN;
        rightObjects[i] = LEFT_TURN_SIGN;
        continue;
      }
    }

    if (seededRand() < 0.5) {
      const o = DECOR[Math.floor(Math.pow(seededRand(), 2) * DECOR.length)];
      leftObjects[i] = {
        sprite: o.sprite,
        size: o.size,
        offset: o.offset * seededRand(),
        ratio: o.ratio,
      };
    }
    if (seededRand() < 0.5) {
      const o = DECOR[Math.floor(Math.pow(seededRand(), 2) * DECOR.length)];
      rightObjects[i] = {
        sprite: o.sprite,
        size: o.size,
        offset: o.offset * seededRand(),
        ratio: o.ratio,
      };
    }
  }

  return { leftObjects, rightObjects };
}

interface RacingGameProps {
  onStart?: () => void;
  onFinish?: () => void;
  status?: string;
}

export default function RacingGame({ onStart, onFinish, status }: RacingGameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Ref for parent props to avoid React dependency loop traps causing visual resets
  const propsRef = useRef({ onStart, onFinish, status });
  useEffect(() => {
    propsRef.current = { onStart, onFinish, status };
  }, [onStart, onFinish, status]);

  // Lock to prevent firing onFinish 60 times a second
  const hasFinishedRef = useRef(false);

  const stateRef = useRef<{
    speed: number;
    position: number;
    x: number;
    dx: number;
    horizon: number;
    turn: number;
    track: number[];
    aiCars: AiCar[];
    clouds: Cloud[];
    left: boolean;
    right: boolean;
    lap: number;
    lapProgress: number;
    finished: boolean;
    trackValue: number[];
    leftObjects: (SideObj | null)[];
    rightObjects: (SideObj | null)[];
  } | null>(null);
  
  const spritesRef = useRef<Record<string, HTMLImageElement>>({});
  const spritesLoadedRef = useRef(false);
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(-1);
  const keysRef = useRef({ left: false, right: false });
  const touchRef = useRef({ touching: false, x: 0 });

  const SPRITE_NAMES = [
    "background",
    "bush",
    "car_player",
    "car_player_left",
    "car_player_right",
    "car_ai_black",
    "car_ai_black_left",
    "car_ai_black_right",
    "car_ai_blue",
    "car_ai_blue_left",
    "car_ai_blue_right",
    "car_ai_green",
    "car_ai_green_left",
    "car_ai_green_right",
    "car_ai_red",
    "car_ai_red_left",
    "car_ai_red_right",
    "car_ai_white",
    "car_ai_white_left",
    "car_ai_white_right",
    "car_ai_yellow",
    "car_ai_yellow_left",
    "car_ai_yellow_right",
    "cloud_big",
    "cloud_med",
    "cloud_sml",
    "dead_bushes",
    "finishline1",
    "finishline2",
    "fog",
    "fog2",
    "left_turn",
    "left_u_turn",
    "palm_tree",
    "right_turn",
    "right_u_turn",
    "road1",
    "road2",
    "rock_big",
    "rock_med1",
    "rock_med2",
    "rock_sml",
    "sharp_left",
    "sharp_right",
    "sign_bot",
    "sign_mid",
    "startline",
    "touch_arrow",
    "tree",
  ];

  const initGame = useCallback(() => {
    const trackValue = buildTrackValues();
    const { leftObjects, rightObjects } = buildSideObjects(trackValue);
    const aiCars: AiCar[] = [];
    for (let i = 10; i >= 1; i--) {
      aiCars.push({
        x: 120 - 240 * (i % 2),
        position: trackValue.length - 1 + i * 0.1,
        speed: 30 + i,
        color: AI_COLORS[i % 6],
      });
    }
    stateRef.current = {
      speed: 20,
      position: trackValue.length - 1,
      x: 120,
      dx: 0,
      horizon: 0,
      turn: 0,
      track: new Array(101).fill(0),
      aiCars,
      clouds: [
        { name: "cloud_big", x: 120, y: 35, v: 0.02, size: 40 },
        { name: "cloud_med", x: -120, y: 50, v: 0.04, size: 40 },
        { name: "cloud_sml", x: 120, y: 70, v: 0.06, size: 40 },
      ],
      left: false,
      right: false,
      lap: 1,
      lapProgress: 0,
      finished: false,
      trackValue,
      leftObjects,
      rightObjects,
    };
  }, []);

  const loadSprites = useCallback(() => {
    return new Promise<void>((resolve) => {
      let loaded = 0;
      const total = SPRITE_NAMES.length;
      for (const name of SPRITE_NAMES) {
        const img = new Image();
        img.onload = () => {
          loaded++;
          if (loaded === total) {
            spritesLoadedRef.current = true;
            resolve();
          }
        };
        img.onerror = () => {
          loaded++;
          if (loaded === total) {
            spritesLoadedRef.current = true;
            resolve();
          }
        };
        img.src = sp(name);
        spritesRef.current[name] = img;
      }
    });
  }, []);

  const draw = useCallback((canvas: HTMLCanvasElement, dt: number) => {
    const ctx = canvas.getContext("2d")!;
    const st = stateRef.current!;
    const sprites = spritesRef.current;
    const W = canvas.width;
    const H = canvas.height;
    const SX = W / MS_W;
    const SY = H / MS_H;

    const cx = (mx: number) => W / 2 + mx * SX;
    const cy = (my: number) => H / 2 - my * SY;
    const cw = (mw: number) => mw * SX;
    const ch = (mh: number) => mh * SY;

    function fillRect(
      mx: number,
      my: number,
      mw: number,
      mh: number,
      color: string,
    ) {
      ctx.fillStyle = color;
      ctx.fillRect(cx(mx) - cw(mw) / 2, cy(my) - ch(mh) / 2, cw(mw), ch(mh));
    }

    function drawSprite(
      name: string,
      mx: number,
      my: number,
      mw: number,
      mh: number,
      flipX = false,
    ) {
      const img = sprites[name];
      if (!img || !img.complete || img.naturalWidth === 0) return;
      const pw = cw(mw);
      const ph = ch(mh);
      const px = cx(mx) - pw / 2;
      const py = cy(my) - ph / 2;
      if (flipX) {
        ctx.save();
        ctx.scale(-1, 1);
        ctx.drawImage(img, -px - pw, py, pw, ph);
        ctx.restore();
      } else {
        ctx.drawImage(img, px, py, pw, ph);
      }
    }

    // === drawBackground ===
    fillRect(0, 0, MS_W, MS_H, "rgb(255,179,28)");

    const grad = ctx.createLinearGradient(W / 2, H / 2, W / 2, 0);
    grad.addColorStop(0, "rgb(255,198,255)");
    grad.addColorStop(1, "#48C");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H / 2);

    ctx.globalAlpha = 1;
    const h = fmod(st.horizon, 200);
    for (let o = -W / 2 - 100; o <= W / 2 + 100; o += 200) {
      drawSprite("background", o / SX + h / SX, 15, 200, 30);
    }

    for (const c of st.clouds) {
      ctx.globalAlpha = 0.5 + ((c.y - 30) * 0.5) / 40;
      drawSprite(c.name, c.x, c.y, c.size, c.size);
    }
    ctx.globalAlpha = 1;

    // === drawRoad ===
    let off = 0;
    const off2 = -st.x;
    let tt = 0;
    const trackValue = st.trackValue;
    const tl = trackValue.length;

    for (let i = 0; i <= 100; i++) {
      const dist = lineToDistance(i);
      const d = st.position + dist;
      const width = 50 / dist;
      const t = readTrack(d, trackValue);

      let road = (d * 100) % 10 < 5 ? "road1" : "road2";
      const dmod = ((d % tl) + tl) % tl;
      if (dmod > tl - 0.1) {
        road = (d * 100) % 2 < 1 ? "finishline1" : "finishline2";
      } else if (dmod > tl - 1) {
        road = (d * 100) % 10 < 8 ? "road2" : "startline";
      }

      tt += t * dist * dist * 0.005;
      off += tt;
      const rx = off + (off2 * (100 - i)) / 100;
      drawSprite(road, rx, -100 + i, width, 1.0);
      st.track[i] = rx;
      if (i === 0) st.turn = t;
    }

    // === drawFog ===
    ctx.globalAlpha = 0.5;
    drawSprite("fog2", 0, 0, MS_W, MS_H / 16);
    ctx.globalAlpha = 1;

    // === drawCars (AI) ===
    for (const c of st.aiCars) {
      let dDist = c.position - st.position;
      if (dDist < -tl / 2) dDist += tl;
      if (dDist > 0) {
        const scale = 1000 / (dDist * 120);
        const line = distanceToLine(dDist);
        const hIdx = Math.max(0, Math.min(99, Math.floor(line)));
        const a = line - hIdx;
        const px =
          st.track[hIdx] * (1 - a) + (st.track[hIdx + 1] ?? st.track[hIdx]) * a;
        const carTurn = readTrack(c.position, trackValue);
        let carDir: number;
        if (carTurn + st.x - c.x > 100) carDir = 2;
        else if (carTurn + st.x - c.x < -100) carDir = 0;
        else carDir = 1;
        const carName = `car_ai_${c.color}${["_left", "", "_right"][Math.max(0, Math.min(2, carDir))]}`;
        ctx.globalAlpha = 0.25;
        ctx.fillStyle = "black";
        const sx = cx(c.x * scale * 0.012 + px);
        const sy = cy(-100 + line + scale / 4 - scale / 4);
        ctx.fillRect(sx - cw(scale) / 2, sy, cw(scale), ch(scale / 8));
        ctx.globalAlpha = 1;
        drawSprite(
          carName,
          c.x * scale * 0.012 + px,
          -100 + line + scale / 4,
          scale,
          scale / 2,
        );
      }
    }

    // === drawSideObjects ===
    for (let i = 25; i >= 1; i--) {
      const pos = st.position * 10 + i;
      const index = Math.floor(pos);
      const lo =
        st.leftObjects[
          ((index % st.leftObjects.length) + st.leftObjects.length) %
            st.leftObjects.length
        ];
      const ro =
        st.rightObjects[
          ((index % st.rightObjects.length) + st.rightObjects.length) %
            st.rightObjects.length
        ];
      const distance = index - st.position * 10;
      const line = distanceToLine(distance / 10);
      const width = 50 / (distance / 10);

      if (distance < 1) continue;

      const size = (1000 / (distance * 70)) * 4;
      const hIdx = Math.max(0, Math.min(99, Math.floor(line)));
      const a = line - hIdx;
      const xOff =
        st.track[hIdx] * (1 - a) + (st.track[hIdx + 1] ?? st.track[hIdx]) * a;

      ctx.globalAlpha =
        Math.exp(-distance * 0.01) * Math.min(1, (25 - i) * 0.2);

      if (lo) {
        const s = size * 2 * lo.size;
        drawSprite(
          lo.sprite,
          width * (0.65 + lo.offset) + xOff,
          line - 100 + (s * lo.ratio) / 2,
          s,
          s * lo.ratio,
        );
      }
      if (ro) {
        const s = size * 2 * ro.size;
        drawSprite(
          ro.sprite,
          -(width * (0.65 + ro.offset)) + xOff,
          line - 100 + (s * ro.ratio) / 2,
          s,
          s * ro.ratio,
        );
      }
    }
    ctx.globalAlpha = 1;

    // === drawPlayerCar ===
    const wobble =
      Math.sin(st.position * 80) * (Math.abs(st.x) > 230 ? 1 : 0.25);
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = "black";
    ctx.fillRect(cx(0) - cw(82) / 2, cy(-90 + wobble), cw(82), ch(20));
    ctx.globalAlpha = 1;

    let carIdx = st.turn > 100 ? 2 : st.turn < -100 ? 0 : 1;
    const leftKey =
      keysRef.current.left ||
      (touchRef.current.touching && touchRef.current.x < 0);
    const rightKey =
      keysRef.current.right ||
      (touchRef.current.touching && touchRef.current.x >= 0);
    carIdx += (rightKey ? 1 : 0) - (leftKey ? 1 : 0);
    const playerCarName = ["car_player_left", "car_player", "car_player_right"][
      Math.max(0, Math.min(2, carIdx))
    ];
    drawSprite(playerCarName, 0, -75 + wobble, 80, 40);

    // === UI ===
    const speedKmh = Math.floor(st.speed * 6.2);
    const fontSize = Math.max(14, Math.floor(SY * 7));

    ctx.globalAlpha = 1;
    ctx.fillStyle = "white";
    ctx.font = `bold ${fontSize}px monospace`;
    ctx.textAlign = "right";
    ctx.textBaseline = "top";
    ctx.fillText(`${speedKmh} km/h`, W - 10, 10);

    ctx.textAlign = "left";
    ctx.fillText(`Lap ${st.lap}/4`, 10, 10);

    ctx.textAlign = "center";

    const leftActive = touchRef.current.touching && touchRef.current.x < 0;
    const rightActive = touchRef.current.touching && touchRef.current.x >= 0;
    ctx.globalAlpha = leftActive ? 1 : 0.4;
    drawSprite("touch_arrow", -MS_W / 2 + 30, -60, 25, 25);
    ctx.save();
    ctx.globalAlpha = rightActive ? 1 : 0.4;
    ctx.scale(-1, 1);
    ctx.drawImage(
      sprites["touch_arrow"],
      -(W - 10) - cw(25) / 2 + cw(25),
      cy(-60) - ch(25) / 2,
      cw(25),
      ch(25),
    );
    ctx.restore();
    ctx.globalAlpha = 1;

    if (st.finished) {
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "white";
      ctx.font = `bold ${fontSize * 2}px monospace`;
      ctx.textAlign = "center";
      ctx.fillText("FINISH!", W / 2, H / 2 - fontSize);
    }
  }, []);

  const update = useCallback((dt: number) => {
    // PAUSE the game mechanics immediately if status isn't "playing"
    if (propsRef.current.status !== "playing") return;

    const st = stateRef.current!;
    const trackValue = st.trackValue;
    const tl = trackValue.length;
    const leftKey =
      keysRef.current.left ||
      (touchRef.current.touching && touchRef.current.x < 0);
    const rightKey =
      keysRef.current.right ||
      (touchRef.current.touching && touchRef.current.x >= 0);

    // Speed
    st.speed += (60 - st.speed) * 0.002 * dt;

    // Steering
    if (leftKey) {
      st.dx += (-7 - st.dx) * 0.1 * dt;
    } else if (rightKey) {
      st.dx += (7 - st.dx) * 0.1 * dt;
    } else {
      st.dx *= Math.pow(0.9, dt);
    }
    if (leftKey || rightKey) st.speed *= Math.pow(0.998, dt);

    st.x += st.dx * dt;
    st.horizon -= st.turn * 0.02 * (st.speed / 50) * dt;

    // Clouds
    for (const c of st.clouds) {
      c.x -= st.turn * 0.02 * (st.speed / 50) * (1 + (c.y - 30) / 300) * dt;
      c.x += c.v * dt;
      if (c.x > MS_W / 2 + c.size) c.x -= MS_W + c.size;
      else if (c.x < -MS_W / 2 - c.size) c.x += MS_W + c.size;
    }

    // Position advance
    st.position += 0.02 * (st.speed / 50) * dt;
    st.x -= ((st.turn * 0.04 * st.speed * st.speed) / 40 / 40) * dt;

    // Off-road penalty
    if (Math.abs(st.x) > 230) {
      st.speed *= Math.pow(0.98, dt);
      st.x *= Math.pow(0.99, dt);
    }

    // Lap tracking & Game Over Detect
    if (st.position >= tl) {
      st.position -= tl;
      st.lapProgress = 0;
      if (st.lap < 4) {
        st.lap++;
      } else {
        st.finished = true;
        // FIRE THE SUBMIT ACTION EXACTLY ONCE
        if (!hasFinishedRef.current) {
          hasFinishedRef.current = true;
          if (propsRef.current.onFinish) {
            propsRef.current.onFinish();
          }
        }
      }
    } else {
      st.lapProgress = st.position / tl;
    }

    // AI cars
    for (const c of st.aiCars) {
      c.position += ((c.speed * 0.02) / 50) * dt;
      if (c.position > tl) c.position -= tl;
    }
  }, []); // Empty dependency array. Loop will not recreate when status changes.

  const loop = useCallback(
    (time: number) => {
      const canvas = canvasRef.current;
      if (!canvas || !stateRef.current || !spritesLoadedRef.current) {
        rafRef.current = requestAnimationFrame(loop);
        return;
      }
      if (lastTimeRef.current < 0) {
        lastTimeRef.current = time;
        rafRef.current = requestAnimationFrame(loop);
        return;
      }
      const dt = Math.min((time - lastTimeRef.current) / 16.67, 3);
      lastTimeRef.current = time;
      
      update(dt);
      draw(canvas, dt);
      
      rafRef.current = requestAnimationFrame(loop);
    },
    [update, draw],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    initGame();
    loadSprites().then(() => {
      lastTimeRef.current = -1;
      rafRef.current = requestAnimationFrame(loop);
    });

    const onKey = (e: KeyboardEvent, down: boolean) => {
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A")
        keysRef.current.left = down;
      if (e.key === "ArrowRight" || e.key === "d" || e.key === "D")
        keysRef.current.right = down;
    };
    const onKeyDown = (e: KeyboardEvent) => {
      onKey(e, true);
      if (["ArrowLeft", "ArrowRight"].includes(e.key)) e.preventDefault();
    };
    const onKeyUp = (e: KeyboardEvent) => onKey(e, false);

    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0];
      const rect = canvas.getBoundingClientRect();
      touchRef.current = {
        touching: true,
        x: t.clientX - rect.left - rect.width / 2,
      };
    };
    const onTouchMove = (e: TouchEvent) => {
      const t = e.touches[0];
      const rect = canvas.getBoundingClientRect();
      touchRef.current.x = t.clientX - rect.left - rect.width / 2;
    };
    const onTouchEnd = () => {
      touchRef.current.touching = false;
    };

    const onMouseDown = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      touchRef.current = {
        touching: true,
        x: e.clientX - rect.left - rect.width / 2,
      };
    };
    const onMouseUp = () => {
      touchRef.current.touching = false;
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    canvas.addEventListener("touchstart", onTouchStart, { passive: true });
    canvas.addEventListener("touchmove", onTouchMove, { passive: true });
    canvas.addEventListener("touchend", onTouchEnd);
    canvas.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mouseup", onMouseUp);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("touchend", onTouchEnd);
      canvas.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [initGame, loadSprites, loop]);

  return (
    <canvas
      ref={canvasRef}
      width={800}
      height={400}
      style={{
        width: "100%",
        height: "100%",
        objectFit: "contain",
        imageRendering: "pixelated",
        cursor: "pointer",
      }}
    />
  );
}