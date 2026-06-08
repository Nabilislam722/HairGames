import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useWeb3 } from "@/lib/web3";
import { ArrowRight, Play, ChevronDown, Zap, Shield, Coins, Trophy } from "lucide-react";
import { motion, useInView, useScroll, useTransform, AnimatePresence } from "framer-motion";
import BackgroundImg from "../assets/bg.jpg";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import "../index.css";

/* ─── Particle Canvas ────────────────────────────────────────────────────── */
function ParticleField() {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let animId, W, H, pts;
    const rand = (a, b) => Math.random() * (b - a) + a;
    const resize = () => {
      W = canvas.width = canvas.offsetWidth;
      H = canvas.height = canvas.offsetHeight;
      pts = Array.from({ length: Math.floor((W * H) / 11000) }, () => ({
        x: rand(0, W), y: rand(0, H),
        vx: rand(-0.2, 0.2), vy: rand(-0.2, 0.2),
        r: rand(1, 2.5),
        c: Math.random() > 0.5 ? "234,88,12" : "251,191,36",
        a: rand(0.2, 0.7),
      }));
    };
    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      for (let i = 0; i < pts.length; i++)
        for (let j = i + 1; j < pts.length; j++) {
          const dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < 130) { ctx.beginPath(); ctx.strokeStyle = `rgba(${pts[i].c},${(1 - d / 130) * .13})`; ctx.lineWidth = .6; ctx.moveTo(pts[i].x, pts[i].y); ctx.lineTo(pts[j].x, pts[j].y); ctx.stroke(); }
        }
      pts.forEach(p => {
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${p.c},${p.a})`; ctx.fill();
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > W) p.vx *= -1; if (p.y < 0 || p.y > H) p.vy *= -1;
      });
      animId = requestAnimationFrame(draw);
    };
    resize(); draw();
    const ro = new ResizeObserver(resize); ro.observe(canvas);
    return () => { cancelAnimationFrame(animId); ro.disconnect(); };
  }, []);
  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />;
}

/* ─── Count-up ───────────────────────────────────────────────────────────── */
function Counter({ to, suffix = "" }) {
  const [val, setVal] = useState(0);
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });
  useEffect(() => {
    if (!inView) return;
    const num = parseFloat(to), isFloat = String(to).includes(".");
    const start = performance.now();
    const tick = now => {
      const t = Math.min((now - start) / 1500, 1), e = 1 - Math.pow(1 - t, 3);
      setVal(isFloat ? (num * e).toFixed(2) : Math.floor(num * e));
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [inView, to]);
  return <span ref={ref}>{val}{suffix}</span>;
}

/* ─── Reveal ─────────────────────────────────────────────────────────────── */
function Reveal({ children, delay = 0, className = "", from = "bottom" }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-50px" });
  const variants = {
    bottom: { hidden: { opacity: 0, y: 30 }, show: { opacity: 1, y: 0 } },
    left: { hidden: { opacity: 0, x: -30 }, show: { opacity: 1, x: 0 } },
    right: { hidden: { opacity: 0, x: 30 }, show: { opacity: 1, x: 0 } },
    fade: { hidden: { opacity: 0 }, show: { opacity: 1 } },
  };
  const v = variants[from];
  return (
    <motion.div ref={ref} className={className}
      initial="hidden" animate={inView ? "show" : "hidden"}
      variants={v}
      transition={{ duration: 0.65, delay, ease: [0.22, 1, 0.36, 1] }}>
      {children}
    </motion.div>
  );
}

/* ─── SVG: Circuit Board graphic ─────────────────────────────────────────── */
function CircuitGraphic() {
  return (
    <svg viewBox="0 0 400 300" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      {/* grid dots */}
      {Array.from({ length: 8 }, (_, row) => Array.from({ length: 10 }, (_, col) => (
        <motion.circle key={`${row}-${col}`}
          cx={col * 44 + 20} cy={row * 38 + 18} r={1.5}
          fill="rgba(234,88,12,0.25)"
          initial={{ opacity: 0 }} animate={{ opacity: [0.15, 0.5, 0.15] }}
          transition={{ duration: 2.5 + Math.random() * 2, repeat: Infinity, delay: Math.random() * 2 }}
        />
      )))}
      {/* horizontal traces */}
      {[[20, 80, 180, 80], [60, 120, 320, 120], [100, 200, 360, 200], [20, 240, 280, 240]].map(([x1, y1, x2, y2], i) => (
        <motion.line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
          stroke="rgba(234,88,12,0.18)" strokeWidth="1"
          initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
          transition={{ duration: 1.5, delay: i * 0.3, ease: "easeInOut" }}
        />
      ))}
      {/* vertical traces */}
      {[[180, 80, 180, 200], [320, 120, 320, 240], [60, 120, 60, 240]].map(([x1, y1, x2, y2], i) => (
        <motion.line key={`v${i}`} x1={x1} y1={y1} x2={x2} y2={y2}
          stroke="rgba(251,191,36,0.15)" strokeWidth="1"
          initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
          transition={{ duration: 1.2, delay: 0.8 + i * 0.25, ease: "easeInOut" }}
        />
      ))}
      {/* nodes / chips */}
      {[[180, 80], [320, 120], [60, 120], [180, 200], [320, 240]].map(([cx, cy], i) => (
        <motion.g key={`n${i}`}>
          <motion.rect x={cx - 10} y={cy - 10} width={20} height={20} rx={3}
            fill="rgba(234,88,12,0.08)" stroke="rgba(234,88,12,0.35)" strokeWidth="1"
            initial={{ scale: 0 }} animate={{ scale: 1 }}
            transition={{ duration: 0.4, delay: 1 + i * 0.15, ease: "backOut" }}
            style={{ transformOrigin: `${cx}px ${cy}px` }}
          />
          <motion.circle cx={cx} cy={cy} r={3}
            fill="rgba(234,88,12,0.8)"
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 1.8 + i * 0.3, repeat: Infinity }}
          />
        </motion.g>
      ))}
      {/* traveling pulse */}
      <motion.circle r={3} fill="#ea580c"
        animate={{ offsetDistance: ["0%", "100%"] }}
        style={{ offsetPath: "path('M 20 80 H 180 V 200 H 360')", offsetRotate: "0deg" }}
        transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
      />
    </svg>
  );
}

/* ─── SVG: HP Orb graphic ────────────────────────────────────────────────── */
function HpGraphic() {
  return (
    <svg viewBox="0 0 280 280" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full max-w-[240px]">
      {/* rings */}
      {[100, 75, 52].map((r, i) => (
        <motion.circle key={i} cx={140} cy={140} r={r}
          stroke={i === 0 ? "rgba(234,88,12,0.12)" : i === 1 ? "rgba(234,88,12,0.2)" : "rgba(234,88,12,0.3)"}
          strokeWidth={i === 2 ? 1.5 : 1} fill="none" strokeDasharray={i === 1 ? "6 4" : "none"}
          animate={{ rotate: i === 1 ? 360 : -360 }}
          style={{ transformOrigin: "140px 140px" }}
          transition={{ duration: 12 + i * 4, repeat: Infinity, ease: "linear" }}
        />
      ))}
      {/* center orb */}
      <motion.circle cx={140} cy={140} r={36}
        fill="url(#orbGrad)" animate={{ r: [34, 38, 34] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.circle cx={140} cy={140} r={36}
        stroke="rgba(234,88,12,0.5)" strokeWidth="1.5" fill="none"
        animate={{ opacity: [0.4, 1, 0.4] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      />
      {/* HP text */}
      <text x={140} y={147} textAnchor="middle" fontFamily="'Space Mono',monospace"
        fontWeight="700" fontSize="20" fill="white" opacity="0.9">HP</text>
      {/* orbiting dots */}
      {[0, 72, 144, 216, 288].map((deg, i) => (
        <motion.g key={i} style={{ transformOrigin: "140px 140px" }}
          animate={{ rotate: [deg, deg + 360] }}
          transition={{ duration: 6 + i * 0.5, repeat: Infinity, ease: "linear" }}>
          <circle cx={140} cy={88} r={i % 2 === 0 ? 3 : 2}
            fill={i % 2 === 0 ? "rgba(234,88,12,0.8)" : "rgba(251,191,36,0.6)"} />
        </motion.g>
      ))}
      <defs>
        <radialGradient id="orbGrad" cx="40%" cy="35%" r="60%">
          <stop offset="0%" stopColor="rgba(234,88,12,0.35)" />
          <stop offset="100%" stopColor="rgba(234,88,12,0.08)" />
        </radialGradient>
      </defs>
    </svg>
  );
}

/* ─── SVG: Shield / Fair graphic ────────────────────────────────────────── */
function FairGraphic() {
  return (
    <svg viewBox="0 0 240 260" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full max-w-[200px]">
      {/* shield path */}
      <motion.path
        d="M120 18 L196 52 L196 130 C196 178 120 220 120 220 C120 220 44 178 44 130 L44 52 Z"
        stroke="rgba(234,88,12,0.4)" strokeWidth="1.5" fill="rgba(234,88,12,0.05)"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
        transition={{ duration: 1.6, ease: "easeInOut" }}
      />
      {/* inner shield */}
      <motion.path
        d="M120 44 L172 66 L172 124 C172 160 120 192 120 192 C120 192 68 160 68 124 L68 66 Z"
        stroke="rgba(251,191,36,0.2)" strokeWidth="1" fill="rgba(234,88,12,0.04)"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
        transition={{ duration: 1.4, delay: 0.4, ease: "easeInOut" }}
      />
      {/* checkmark */}
      <motion.path d="M96 120 L112 136 L148 98"
        stroke="#ea580c" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
        transition={{ duration: 0.6, delay: 1.6, ease: "easeOut" }}
      />
      {/* scan line */}
      <motion.line x1={44} y1={120} x2={196} y2={120}
        stroke="rgba(234,88,12,0.3)" strokeWidth="1" strokeDasharray="4 3"
        animate={{ y1: [80, 170, 80], y2: [80, 170, 80] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      />
      {/* glow dots at corners */}
      {[[44, 52], [196, 52], [44, 130], [196, 130]].map(([cx, cy], i) => (
        <motion.circle key={i} cx={cx} cy={cy} r={3}
          fill="rgba(234,88,12,0.6)"
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.3 }}
        />
      ))}
    </svg>
  );
}

/* Home  */
export default function Home() {
  const { isConnected } = useWeb3();
  const [, setLocation] = useLocation();
  const heroRef = useRef(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ["start start", "end start"] });
  const bgY = useTransform(scrollYProgress, [0, 1], ["0%", "18%"]);
  const heroOpac = useTransform(scrollYProgress, [0, 0.65], [1, 0]);

  return (
    <div className="flex flex-col gap-0">

      {/* HERO */}
      <section ref={heroRef} className="relative min-h-[92vh] flex flex-col items-center justify-center overflow-hidden rounded-3xl border border-white/10 mx-4 sm:mx-8 md:mx-16 lg:mx-32 xl:mx-44">
        <motion.div className="absolute inset-0 z-0 scale-110" style={{ y: bgY }}>
          <img src={BackgroundImg} alt="" className="w-full h-full object-cover opacity-20 blur-[3px]" />
          <div className="absolute inset-0 bg-gradient-to-b from-background/70 via-background/50 to-background" />
        </motion.div>
        <div className="absolute inset-0 z-0 opacity-70"><ParticleField /></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full bg-primary/8 blur-[120px] z-0 pointer-events-none" />

        <motion.div style={{ opacity: heroOpac }} className="relative z-10 flex flex-col items-center text-center gap-7 px-4 max-w-4xl mx-auto">
          <motion.div initial={{ opacity: 0, scale: .88 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: .5, ease: "backOut" }}
            className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/25 text-primary text-xs font-mono uppercase tracking-widest">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            Live on Hemi Network
          </motion.div>

          <motion.h1 initial={{ opacity: 0, y: 32 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .7, delay: .1, ease: [0.22, 1, 0.36, 1] }}
            className="font-display font-bold leading-none tracking-tight">
            <span className="block text-5xl sm:text-6xl md:text-8xl text-white text-glow">PLAY.</span>
            <span className="block text-5xl sm:text-6xl md:text-8xl text-white text-glow">WIN.</span>
            <span className="block text-5xl sm:text-6xl md:text-8xl text-transparent bg-clip-text bg-gradient-to-r from-primary via-secondary to-accent">SURPRISE.</span>
          </motion.h1>

          <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .55, delay: .26 }}
            className="text-base sm:text-lg md:text-xl text-muted-foreground max-w-lg leading-relaxed">
            The first decentralized gaming platform on Hemi Chain. Hold{" "}
            <span className="text-accent font-mono font-bold">$HAIR</span> to enter. Provably fair games.
          </motion.p>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .55, delay: .38 }}
            className="flex flex-col sm:flex-row gap-4 mt-2 w-full sm:w-auto px-4 sm:px-0">
            <ConnectButton.Custom>
              {({ openConnectModal }) => (
                <button onClick={() => isConnected ? setLocation("/dashboard") : openConnectModal()}
                  className="group relative overflow-hidden inline-flex items-center justify-center gap-2.5 px-8 py-4 rounded-xl bg-primary text-white font-display font-bold text-base tracking-wide transition-all duration-300 hover:shadow-[0_0_32px_rgba(234,88,12,0.45)] hover:-translate-y-0.5 focus:outline-none w-full sm:w-auto">
                  <span className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-500 bg-gradient-to-r from-transparent via-white/20 to-transparent skew-x-12 pointer-events-none" />
                  <Play className="w-4 h-4 fill-white stroke-none relative z-10 flex-shrink-0" />
                  <span className="relative z-10">{isConnected ? "Go to Dashboard" : "Connect & Play"}</span>
                  <ArrowRight className="w-4 h-4 relative z-10 transition-transform group-hover:translate-x-1 flex-shrink-0" />
                </button>
              )}
            </ConnectButton.Custom>
            <a href="https://hairtoken.xyz/" target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl border border-white/10 text-white/60 font-display font-bold text-base tracking-wide hover:bg-white/5 hover:text-white hover:border-white/20 transition-all duration-200 w-full sm:w-auto">
              Learn More
            </a>
          </motion.div>
        </motion.div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.4 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-1 text-white/20 pointer-events-none">
          <span className="font-mono text-[9px] uppercase tracking-widest">Scroll</span>
          <motion.div animate={{ y: [0, 7, 0] }} transition={{ repeat: Infinity, duration: 1.9, ease: "easeInOut" }}>
            <ChevronDown className="w-4 h-4" />
          </motion.div>
        </motion.div>
      </section>

      {/* STATS — editorial marquee style */}
      <section className="py-24 overflow-hidden">
        <Reveal className="container mx-auto px-4 mb-3">
          <span className="font-mono text-[9px] uppercase tracking-widest text-white/20">— Live Numbers —</span>
        </Reveal>

        {/* Big editorial stat row */}
        <div className="container mx-auto px-4">
          <div className="flex flex-col divide-y divide-white/5">
            {[
              { label: "Total Fee Collected", value: "0.01", suffix: " ETH", icon: Coins, accent: "text-accent", num: true },
              { label: "Active Players", value: "30", suffix: "", icon: Trophy, accent: "text-primary", num: true },
              { label: "Games Live", value: "3", suffix: "", icon: Zap, accent: "text-secondary", num: true },
            ].map((s, i) => (
              <Reveal key={i} delay={i * 0.1} from="left">
                <div className="group flex items-center justify-between py-7 cursor-default">
                  <div className="flex items-center gap-5">
                    {/* index */}
                    <span className="font-mono text-[11px] text-white/15 w-6 select-none">{String(i + 1).padStart(2, "0")}</span>
                    {/* icon */}
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center border border-white/8 bg-white/3 group-hover:border-white/15 transition-colors ${s.accent}`}>
                      <s.icon className="w-4 h-4" />
                    </div>
                    {/* label */}
                    <span className="font-mono text-[11px] uppercase tracking-widest text-white/30 group-hover:text-white/50 transition-colors hidden sm:block">{s.label}</span>
                  </div>

                  {/* big value */}
                  <div className={`font-display font-bold text-5xl md:text-7xl tracking-tight leading-none ${s.accent} group-hover:scale-105 transition-transform origin-right`}>
                    <Counter to={s.value} suffix={s.suffix} />
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════ WHY HEMI — split panel with circuit graphic */}
      <section className="py-10 container mx-auto px-4">
        <div className="relative rounded-3xl border border-white/8 overflow-hidden bg-card/30 min-h-[380px]">
          {/* grid bg */}
          <div className="absolute inset-0 opacity-[0.03] pointer-events-none"
            style={{ backgroundImage: "linear-gradient(rgba(234,88,12,1) 1px,transparent 1px),linear-gradient(90deg,rgba(234,88,12,1) 1px,transparent 1px)", backgroundSize: "32px 32px" }} />

          <div className="relative z-10 flex flex-col lg:flex-row items-center gap-0 h-full">
            {/* LEFT — text */}
            <div className="flex-1 p-10 md:p-14 flex flex-col gap-6">
              <Reveal from="left">
                <span className="font-mono text-[9px] uppercase tracking-widest text-primary/60 mb-1 block">— Why Hemi —</span>
                <h2 className="font-display text-4xl md:text-5xl font-bold text-white leading-tight">
                  Every move.<br />
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-amber-400">On-chain.</span>
                </h2>
              </Reveal>
              <Reveal from="left" delay={0.1}>
                <p className="text-muted-foreground leading-relaxed max-w-md">
                  Fully transparent and verifiable on-chain. A small interaction fee sustains the platform —
                  with a portion used to buy back{" "}
                  <span className="text-accent font-mono font-bold">$HAIR</span>,
                  strengthening the project over time.
                </p>
              </Reveal>
              <Reveal from="left" delay={0.2}>
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-white/6 bg-white/3 w-fit">
                  <Shield className="w-4 h-4 text-primary flex-shrink-0" />
                  <span className="font-mono text-[10px] uppercase tracking-wider text-white/40">
                    No guarantees of profit or return
                  </span>
                </div>
              </Reveal>
            </div>

            {/* RIGHT — circuit SVG */}
            <Reveal from="right" className="flex-1 w-full lg:w-auto flex items-center justify-center p-8 lg:p-10 min-h-[260px]">
              <CircuitGraphic />
            </Reveal>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════ HP SECTION — centered orb + stacked text */}
      <section className="py-10 container mx-auto px-4">
        <div className="relative rounded-3xl border border-white/8 overflow-hidden">
          {/* dark bg + radial glow */}
          <div className="absolute inset-0 bg-card/40" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-primary/6 blur-[100px] pointer-events-none" />

          <div className="relative z-10 flex flex-col lg:flex-row-reverse items-center gap-0">
            {/* RIGHT (visually) — HP orb */}
            <Reveal from="right" className="flex-1 flex items-center justify-center p-10 lg:p-16">
              <HpGraphic />
            </Reveal>

            {/* LEFT — text */}
            <div className="flex-1 p-10 md:p-14 flex flex-col gap-6">
              <Reveal from="left">
                <span className="font-mono text-[9px] uppercase tracking-widest text-secondary/60 block mb-1">— Points System —</span>
                <h2 className="font-display text-4xl md:text-5xl font-bold text-white leading-tight">
                  What is{" "}
                  <span className="text-primary">HP</span>?
                </h2>
              </Reveal>
              <Reveal from="left" delay={0.1}>
                <p className="text-muted-foreground leading-relaxed max-w-md">
                  <span className="text-white font-semibold">Hair Points</span> are a non-financial
                  participation tracking system. No monetary value. No promises.
                </p>
              </Reveal>
              <Reveal from="left" delay={0.2}>
                <p className="text-muted-foreground leading-relaxed max-w-md">
                  HP may unlock future features, events, or community rewards as the platform grows.
                </p>
              </Reveal>
              <Reveal from="left" delay={0.28}>
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-white/6 bg-white/3 w-fit">
                  <span className="w-1.5 h-1.5 rounded-full bg-secondary flex-shrink-0" />
                  <span className="font-mono text-[10px] uppercase tracking-wider text-white/40">
                    Not a gambling site
                  </span>
                </div>
              </Reveal>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════ FEATURES — vertical numbered list */}
      <section className="py-16 container mx-auto px-4">
        <Reveal className="mb-14">
          <div className="flex items-center gap-4">
            <div className="flex-1 h-px bg-white/6" />
            <span className="font-mono text-[9px] uppercase tracking-widest text-white/25">Why Play on Hemi</span>
            <div className="flex-1 h-px bg-white/6" />
          </div>
        </Reveal>

        <div className="flex flex-col gap-0 divide-y divide-white/5">
          {[
            {
              num: "01", icon: Shield, title: "Provably Fair",
              body: "Every result is verifiable on-chain. No hidden RNG, no server-side manipulation — results exist on the blockchain, forever.",
              accent: "text-secondary", delay: 0,
              graphic: <FairGraphic />,
            },
            {
              num: "02", icon: Coins, title: "$HAIR Token Utility",
              body: "A portion of all platform fees is used to buy back $HAIR, creating real demand and sustainable value for token holders.",
              accent: "text-accent", delay: 0.1,
              graphic: null,
            },
          ].map((f, i) => (
            <Reveal key={i} delay={f.delay} from="bottom">
              <div className="group flex flex-col sm:flex-row items-start gap-6 py-10 cursor-default">
                {/* left: number */}
                <span className="font-display font-bold text-7xl leading-none text-white/5 group-hover:text-white/10 transition-colors select-none w-20 flex-shrink-0 mt-1">
                  {f.num}
                </span>

                {/* middle: text */}
                <div className="flex-1 flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg bg-white/4 border border-white/8 group-hover:border-white/15 transition-colors ${f.accent}`}>
                      <f.icon className="w-4 h-4" />
                    </div>
                    <h3 className="font-display text-2xl font-bold text-white">{f.title}</h3>
                  </div>
                  <p className="text-muted-foreground leading-relaxed max-w-lg text-sm md:text-base">{f.body}</p>

                  {/* animated underline on hover */}
                  <motion.div
                    className={`h-px rounded-full ${f.accent.replace("text-", "bg-")} opacity-30`}
                    initial={{ width: "0px" }} whileHover={{ width: "120px" }}
                    transition={{ duration: .3 }}
                  />
                </div>

                {/* right: optional graphic */}
                {f.graphic && (
                  <div className="hidden lg:flex items-center justify-center w-36 h-36 flex-shrink-0 opacity-60 group-hover:opacity-90 transition-opacity">
                    {f.graphic}
                  </div>
                )}
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ═══════════════════════════════════════════ BOTTOM CTA */}
      <section className="py-28 container mx-auto px-4 text-center">
        <Reveal>
          <h2 className="font-display text-4xl md:text-6xl font-bold text-white mb-5 leading-tight">
            Ready to <span className="text-primary text-glow">Play?</span>
          </h2>
          <p className="text-muted-foreground mb-10 max-w-sm mx-auto leading-relaxed">
            Connect your wallet and enter the arena. Quests, games, and leaderboard glory await.
          </p>
          <ConnectButton.Custom>
            {({ openConnectModal }) => (
              <button onClick={() => isConnected ? setLocation("/dashboard") : openConnectModal()}
                className="group relative overflow-hidden inline-flex items-center gap-3 px-10 py-5 rounded-xl bg-primary text-white font-display font-bold text-lg tracking-wide transition-all duration-300 hover:shadow-[0_0_40px_rgba(234,88,12,0.4)] hover:-translate-y-1 focus:outline-none">
                <span className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-500 bg-gradient-to-r from-transparent via-white/15 to-transparent skew-x-12 pointer-events-none" />
                <Play className="w-5 h-5 fill-white stroke-none relative z-10 flex-shrink-0" />
                <span className="relative z-10">{isConnected ? "Enter the Arena" : "Connect Wallet"}</span>
                <ArrowRight className="w-5 h-5 relative z-10 transition-transform group-hover:translate-x-1.5 flex-shrink-0" />
              </button>
            )}
          </ConnectButton.Custom>
        </Reveal>
      </section>
    </div>
  );
}