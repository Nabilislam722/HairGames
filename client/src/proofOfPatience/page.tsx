import { useCallback, useEffect, useRef, useState } from "react";
import { ethers } from "ethers";
import { useAccount } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";

import "./globals.css";
import {
  CARD_HALF_HEIGHT,
  DESK_X,
  DESK_Y,
  FIRE_COOLDOWN,
  GAME_HEIGHT,
  GAME_WIDTH,
  LETTERS,
  MAX_BACKLOG,
  MUZZLE_OFFSET,
  QUESTION_SPECS,
  REVIEW_INTERVAL_SECONDS,
  ROUND_SECONDS,
  SHOT_SPEED,
  SIM_STEP,
  SPAWN_Y,
  STAGE_Y,
  answersTo,
  assistedAimAngle,
  backlogAfterReview,
  difficultyAt,
  expectedLetter,
  insideStrikeBox,
  nextAmmoIndex,
  patienceTier,
  perfectChainBonus,
  pickSpawnX,
  predictedTarget,
  questionPool,
  questionsOverlap,
  scoreForAnswer,
  separateQuestions,
  shouldBurnBacklog,
} from "./lib/pop";
import { createScene } from "./lib/render/scene";
import { proofOfPatienceAbi, HEMI_EXPLORER_URL } from "./lib/chain";
import { AudioPanel } from "./components/AudioPanel";
import {
  DEFAULT_AUDIO_SETTINGS,
  applyAudioPatch,
  readAudioSettings,
  writeAudioSettings,
} from "./components/audioSettings";
import { GalleryStrap } from "./components/GalleryStrap";
import { HowToModal } from "./components/HowToModal";
import { ProducerRack } from "./components/ProducerRack";
import { ShowHeader } from "./components/ShowHeader";
import { AttractOverlay, ResultOverlay } from "./components/StageOverlays";
import { ThumbBar } from "./components/ThumbBar";

const CONTRACT_ADDRESS = "0x760d91401Afb3499cf1BD0256b30485BDa40728C";
const GAME_COST_ETH = "0.000008";
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3000";

const STEP = SIM_STEP;
const KEYBOARD_AIM_SPEED = 3.2;
const MAX_STEPS_PER_FRAME = 5;

function pickInitialQuality() {
  if (typeof navigator === "undefined") return "high";
  const touch =
    typeof window !== "undefined" &&
    (("ontouchstart" in window) || navigator.maxTouchPoints > 0);
  if (!touch) return "high";
  const cores = navigator.hardwareConcurrency ?? 8;
  const memory = navigator.deviceMemory;
  if (cores <= 4 || (memory !== undefined && memory <= 4)) return "low";
  return "medium";
}

function isActiveRunError(err) {
  const text = `${err?.reason ?? ""} ${err?.shortMessage ?? ""} ${err?.message ?? ""}`.toLowerCase();
  return text.includes("run already in progress");
}

function createGame(phase = "idle") {
  return {
    phase,
    elapsed: 0,
    score: 0,
    backlog: 0,
    combo: 0,
    bestCombo: 0,
    answered: 0,
    shots: 0,
    hits: 0,
    popMeter: 0,
    ammoIndex: 0,
    aim: -Math.PI / 2,
    questions: [],
    projectiles: [],
    spawnTimer: 2.8,
    cooldown: 0,
    slowTimer: 0,
    announcement: "MWM COMMUNITY TAKEOVER BEGINS IN 3…",
    announcementTimer: 3.2,
    announcementAge: 0,
    chainClean: true,
    perfectChains: 0,
    flash: 0,
    randomState: 0x50_4f_50,
    entityId: 1,
    nextReviewAt: REVIEW_INTERVAL_SECONDS,
    lastStrike: null,
  };
}

function initialHud() {
  return {
    score: 0,
    time: ROUND_SECONDS,
    backlog: 0,
    combo: 0,
    bestCombo: 0,
    answered: 0,
    shots: 0,
    hits: 0,
    popMeter: 0,
    ammoIndex: 0,
    slowTimer: 0,
    announcement: "MWM COMMUNITY TAKEOVER BEGINS IN 3…",
    activeQuestions: 0,
    difficulty: "OPENING CHAT",
  };
}

function random(game) {
  game.randomState = (Math.imul(game.randomState, 1_664_525) + 1_013_904_223) >>> 0;
  return game.randomState / 4_294_967_296;
}

function say(game, text, seconds = 2) {
  game.announcement = text;
  game.announcementTimer = seconds;
  game.announcementAge = 0;
}

function assistedAim(game) {
  return assistedAimAngle(game.aim, LETTERS[game.ammoIndex], game.questions);
}

function fireShot(game, scene) {
  if (game.phase !== "playing" || game.cooldown > 0 || game.projectiles.length > 0) return;
  const aim = assistedAim(game);
  const letter = LETTERS[game.ammoIndex];
  game.aim = aim;
  const x = DESK_X + Math.cos(aim) * MUZZLE_OFFSET;
  const y = DESK_Y + Math.sin(aim) * MUZZLE_OFFSET;
  game.projectiles.push({
    id: game.entityId++,
    x,
    y,
    vx: Math.cos(aim) * SHOT_SPEED,
    vy: Math.sin(aim) * SHOT_SPEED,
    letter,
    age: 0,
  });
  game.shots += 1;
  game.cooldown = FIRE_COOLDOWN;
  scene?.onFire(x, y, aim, letter);
}

function spawnQuestion(game) {
  const pool = questionPool(game.elapsed);
  const isOpeningQuestion = game.elapsed < 8 && game.answered === 0 && game.backlog === 0;
  const spec = isOpeningQuestion ? QUESTION_SPECS[0] : pool[Math.floor(random(game) * pool.length)];
  const difficulty = difficultyAt(game.elapsed);
  const x = isOpeningQuestion
    ? DESK_X
    : pickSpawnX(spec.width, game.questions, () => random(game));
  game.questions.push({
    id: game.entityId++,
    kind: spec.kind,
    label: spec.label,
    x,
    baseX: x,
    y: SPAWN_Y,
    speed: spec.speed * difficulty.speedScale,
    progress: 0,
    total: spec.words * LETTERS.length,
    words: spec.words,
    value: spec.value,
    width: spec.width,
    color: spec.color,
    motion: spec.motion,
    phase: random(game) * Math.PI * 2,
    age: 0,
    sinceHit: 99,
  });
  if (isOpeningQuestion) {
    say(game, "FIRST CALLER — HOLD FIRE TO ANSWER S · O · O · N", 2.7);
  }
}

function syncHud(game) {
  return {
    score: game.score,
    time: Math.max(0, ROUND_SECONDS - game.elapsed),
    backlog: game.backlog,
    combo: game.combo,
    bestCombo: game.bestCombo,
    answered: game.answered,
    shots: game.shots,
    hits: game.hits,
    popMeter: game.popMeter,
    ammoIndex: game.ammoIndex,
    slowTimer: game.slowTimer,
    announcement: game.announcement,
    activeQuestions: game.questions.length,
    difficulty: difficultyAt(game.elapsed).label,
  };
}

function reloadRack(game) {
  const letter = LETTERS[game.ammoIndex];
  if (game.questions.some((question) => answersTo(question, letter))) return;
  game.ammoIndex = 0;
}

function landQuestion(game, question, scene) {
  game.backlog += 1;
  game.combo = 0;
  game.chainClean = true;
  game.questions = game.questions.filter((candidate) => candidate.id !== question.id);
  reloadRack(game);
  say(game, `${question.label} TOOK OVER THE SHOW`, 1.9);
  scene?.onLand(question.x, STAGE_Y - 6, question.label);
}

function popOff(game, scene) {
  const cleared = game.questions.length;
  scene?.onPopOff(cleared, game.questions);
  game.questions = [];
  game.score += cleared * 35;
  game.answered += cleared;
  game.popMeter = 0;
  game.flash = 1;
  reloadRack(game);
  say(game, `POP OFF — ${cleared} QUESTIONS MOVED TO NEXT WEEK`, 2.5);
}

function updateGame(game, dt, scene) {
  game.announcementAge += dt;
  game.announcementTimer = Math.max(0, game.announcementTimer - dt);
  if (game.phase !== "playing") return;

  game.elapsed += dt;
  game.cooldown = Math.max(0, game.cooldown - dt);
  game.slowTimer = Math.max(0, game.slowTimer - dt);
  game.flash = Math.max(0, game.flash - dt * 2.5);

  if (game.elapsed >= game.nextReviewAt && game.nextReviewAt < ROUND_SECONDS) {
    const minute = Math.round(game.nextReviewAt / REVIEW_INTERVAL_SECONDS);
    game.slowTimer = Math.max(game.slowTimer, 8);
    game.score += 30;
    game.backlog = backlogAfterReview(game.backlog);
    say(game, `MWM BREAK ${minute} — CHAT SLOWED, ONE QUESTION ARCHIVED`, 3);
    game.nextReviewAt += REVIEW_INTERVAL_SECONDS;
  }

  const difficulty = difficultyAt(game.elapsed);
  game.spawnTimer = Math.max(0, game.spawnTimer - dt);
  if (game.spawnTimer <= 0 && game.questions.length < difficulty.maxActive) {
    spawnQuestion(game);
    game.spawnTimer = difficulty.spawnDelay * (0.85 + random(game) * 0.3);
  }

  for (const shot of game.projectiles) {
    shot.x += shot.vx * dt;
    shot.y += shot.vy * dt;
    shot.age += dt;
  }

  const fallScale = game.slowTimer > 0 ? 0.48 : 1;
  for (const question of game.questions) {
    question.age += dt;
    question.sinceHit += dt;
    question.y += question.speed * fallScale * dt;
    const sway =
      question.motion === "sway"
        ? Math.sin(game.elapsed * 1.7 + question.phase) * 38
        : question.motion === "zigzag"
          ? Math.sin(game.elapsed * 3.1 + question.phase) * 58
          : 0;
    question.x = question.baseX + sway;
  }
  separateQuestions(game.questions);

  const spentShots = new Set();
  const answeredQuestions = new Set();
  for (const shot of game.projectiles) {
    if (spentShots.has(shot.id)) continue;
    for (const question of game.questions) {
      if (answeredQuestions.has(question.id)) continue;
      if (!insideStrikeBox(question, shot.x, shot.y, difficulty.hitPadding)) continue;
      spentShots.add(shot.id);
      const required = expectedLetter(question.progress);
      const liveAmmo = LETTERS[game.ammoIndex];
      const length = Math.hypot(shot.vx, shot.vy) || 1;
      game.lastStrike = {
        shotId: shot.id,
        cardId: question.id,
        correct: shot.letter === required && shot.letter === liveAmmo,
      };

      if (shot.letter === required && shot.letter === liveAmmo) {
        question.progress += 1;
        question.sinceHit = 0;
        game.hits += 1;
        game.score += 4 + Math.floor(game.combo * 0.4);
        game.ammoIndex = nextAmmoIndex(game.ammoIndex);

        const cardComplete = question.progress >= question.total;
        const wordComplete = question.progress % LETTERS.length === 0;
        const wordsLeft = Math.max(0, question.words - Math.floor(question.progress / LETTERS.length));
        scene?.onHit({
          x: shot.x,
          y: shot.y,
          color: question.color,
          letter: shot.letter,
          cardId: question.id,
          dirX: shot.vx / length,
          dirY: shot.vy / length,
          wordComplete,
          cardComplete,
          wordsLeft,
          words: question.words,
        });

        if (cardComplete) {
          answeredQuestions.add(question.id);
          game.answered += 1;
          game.combo += 1;
          game.bestCombo = Math.max(game.bestCombo, game.combo);
          const spec =
            QUESTION_SPECS.find((candidate) => candidate.kind === question.kind) ?? QUESTION_SPECS[0];
          const value = Math.floor(scoreForAnswer(spec, game.combo) * 0.2);
          game.score += value;
          game.popMeter = Math.min(100, game.popMeter + (question.words > 1 ? 8 : 6));

          let bonus = 0;
          if (game.chainClean) {
            bonus = Math.floor(perfectChainBonus(game.combo) * 0.2);
            if (bonus > 0) {
              game.score += bonus;
              game.perfectChains += 1;
            }
          }

          say(game, `${patienceTier(game.combo)} — ${question.label} PARKED`, 1.7);
          scene?.onAnswer({
            x: question.x,
            y: question.y,
            color: question.color,
            value,
            combo: game.combo,
            cardId: question.id,
            words: question.words,
            perfect: game.chainClean,
            perfectBonus: bonus,
          });

          if (game.combo % 3 === 0) {
            game.slowTimer = Math.max(game.slowTimer, 4.5);
            say(game, "PROOF OF PATIENCE — CHAT SLOW MODE ACTIVE", 2);
          }
          if (shouldBurnBacklog(game.answered, game.backlog)) {
            game.backlog -= 1;
            game.score += 20;
            say(game, "MOD ACTION — ONE BACKLOG QUESTION ARCHIVED", 2.1);
          }
        }
      } else {
        game.chainClean = false;
        say(game, `MIC CHECK — NEXT RESPONSE NEEDS ${required}`, 1.1);
        scene?.onReject(shot.x, shot.y, required, question.id);
      }
      break;
    }
  }

  game.projectiles = game.projectiles.filter(
    (shot) =>
      !spentShots.has(shot.id) &&
      shot.x > -40 &&
      shot.x < GAME_WIDTH + 40 &&
      shot.y > -50 &&
      shot.y < GAME_HEIGHT + 30,
  );
  game.questions = game.questions.filter((question) => !answeredQuestions.has(question.id));

  const landed = game.questions.filter((question) => question.y + CARD_HALF_HEIGHT >= STAGE_Y);
  for (const question of landed) landQuestion(game, question, scene);

  if (game.backlog >= MAX_BACKLOG) {
    game.phase = "lost";
    say(game, "THE COMMUNITY TOOK OVER MWM", 4);
  } else if (game.elapsed >= ROUND_SECONDS) {
    game.phase = "won";
    game.score += Math.max(0, MAX_BACKLOG - game.backlog) * 30;
    game.score += Math.round(game.popMeter) * 2;
    say(game, "MAX SURVIVED THE COMMUNITY Q&A", 4);
  }
}

/**
 * Syncs the verified on-chain score with the database via /api/points/add
 */
async function syncPointsToBackend(wallet, txHash, score) {
  const res = await fetch(`${API_BASE}/api/points/add`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      wallet,
      txHash,
      score,
      gameId: "proof_of_patience",
    }),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || "Failed to record points on server.");
  }
  return await res.json();
}

export default function ProofOfPatience() {
  const canvasRef = useRef(null);
  const sceneRef = useRef(null);
  const gameRef = useRef(createGame());
  const frameRef = useRef({
    phase: "idle",
    elapsed: 0,
    score: 0,
    combo: 0,
    backlog: 0,
    answered: 0,
    popMeter: 0,
    slowSeconds: 0,
    aim: -Math.PI / 2,
    ammoLetter: LETTERS[0],
    cooldown: 0,
    questions: [],
    shots: [],
    announcement: "",
    announcementAge: 0,
    difficultyLabel: "OPENING CHAT",
  });

  const audioRef = useRef(DEFAULT_AUDIO_SETTINGS);
  const controlsRef = useRef({ left: false, right: false, fire: false });
  const lastSubmissionRef = useRef(null);
  const dragRef = useRef(null);
  const [phase, setPhase] = useState("idle");
  const [audio, setAudio] = useState(DEFAULT_AUDIO_SETTINGS);
  const [showHow, setShowHow] = useState(false);
  const [showMix, setShowMix] = useState(false);
  const [hud, setHud] = useState(() => initialHud());

  const [chainStatus, setChainStatus] = useState("idle");
  const [chainError, setChainError] = useState(null);
  const [txHash, setTxHash] = useState(null);

  const { isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();

  const closeMix = useCallback(() => setShowMix(false), []);
  const closeBrief = useCallback(() => setShowHow(false), []);

  const changeAudio = useCallback((patch) => {
    const next = { ...audioRef.current, ...patch };
    audioRef.current = next;
    const scene = sceneRef.current;
    if (scene) {
      if (!next.muted) scene.unlockAudio();
      applyAudioPatch(scene.audio, patch);
    }
    setAudio(next);
    writeAudioSettings(next);
  }, []);

  const startGame = useCallback(() => {
    const next = createGame("playing");
    controlsRef.current = { left: false, right: false, fire: false };
    gameRef.current = next;
    sceneRef.current?.unlockAudio();
    setHud(syncHud(next));
    setPhase("playing");
  }, []);

  /**
   * Signs, sends on-chain, and registers points on backend
   */
  const submitResult = useCallback(async (result) => {
    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    const player = await signer.getAddress();

    // 1. Get server signature
    const res = await fetch(`${API_BASE}/api/proof-of-patience/signature`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ player, ...result }),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || "Score could not be verified.");
    }
    const { nonce, signature } = await res.json();
    lastSubmissionRef.current = { result, nonce, signature, txHash: null };

    // 2. Submit score on-chain
    const contract = new ethers.Contract(CONTRACT_ADDRESS, proofOfPatienceAbi, signer);
    const tx = await contract.submitScore(
      result.score,
      result.survivalSeconds,
      result.answered,
      result.shots,
      result.hits,
      nonce,
      signature,
      { value: ethers.parseEther(GAME_COST_ETH) },
    );
    setTxHash(tx.hash);
    lastSubmissionRef.current.txHash = tx.hash;
    await tx.wait();

    // 3. Sync points with backend DB
    await syncPointsToBackend(player, tx.hash, result.score);
  }, []);

  /** TX1 — GO LIVE. Free, opens the on-chain run session. */
  const requestStart = useCallback(async () => {
    setChainError(null);
    setTxHash(null);
    lastSubmissionRef.current = null;
    setChainStatus("starting");
    try {
      if (!window.ethereum) throw new Error("No crypto wallet found. Please install Rabby or MetaMask.");
      if (!isConnected) {
        openConnectModal?.();
        setChainStatus("idle");
        return;
      }

      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(CONTRACT_ADDRESS, proofOfPatienceAbi, signer);

      try {
        const tx = await contract.startRun();
        await tx.wait();
      } catch (err) {
        if (!isActiveRunError(err)) throw err;
        setChainStatus("clearing");
        await submitResult({ score: 0, survivalSeconds: 0, answered: 0, shots: 0, hits: 0 });
        lastSubmissionRef.current = null;
        setTxHash(null);
        const retryTx = await contract.startRun();
        await retryTx.wait();
      }

      setChainStatus("playing");
      startGame();
    } catch (err) {
      console.error("Start run failed:", err);
      setChainError(err.reason || err.message || "Could not start the run.");
      setChainStatus("error");
    }
  }, [isConnected, openConnectModal, startGame, submitResult]);

  /** TX2 — round end. Attests, submits on-chain, and adds points. */
  const finishRun = useCallback(async (result) => {
    setChainStatus("submitting");
    setChainError(null);
    try {
      await submitResult(result);
      setChainStatus("completed");
    } catch (err) {
      console.error("Submit score failed:", err);
      setChainError(err.reason || err.message || "Could not submit your score.");
      setChainStatus(lastSubmissionRef.current ? "submitFailed" : "error");
    }
  }, [submitResult]);

  /** Retries submission or points sync */
  const retrySubmit = useCallback(async () => {
    if (!lastSubmissionRef.current) {
      setChainError("Nothing to retry — please start a new run.");
      setChainStatus("error");
      return;
    }
    setChainStatus("submitting");
    setChainError(null);
    try {
      const { result, nonce, signature, txHash: existingTxHash } = lastSubmissionRef.current;
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const player = await signer.getAddress();

      let finalHash = existingTxHash;

      // If the tx never succeeded on-chain, submit it now
      if (!finalHash) {
        const contract = new ethers.Contract(CONTRACT_ADDRESS, proofOfPatienceAbi, signer);
        const tx = await contract.submitScore(
          result.score,
          result.survivalSeconds,
          result.answered,
          result.shots,
          result.hits,
          nonce,
          signature,
          { value: ethers.parseEther(GAME_COST_ETH) },
        );
        setTxHash(tx.hash);
        lastSubmissionRef.current.txHash = tx.hash;
        await tx.wait();
        finalHash = tx.hash;
      }

      // Sync points to database
      await syncPointsToBackend(player, finalHash, result.score);

      setChainStatus("completed");
    } catch (err) {
      console.error("Retry submit failed:", err);
      setChainError(err.reason || err.message || "Submission failed again.");
      setChainStatus("submitFailed");
    }
  }, []);

  const finishRunRef = useRef(finishRun);
  useEffect(() => {
    finishRunRef.current = finishRun;
  }, [finishRun]);

  const shoot = useCallback(() => {
    sceneRef.current?.unlockAudio();
    fireShot(gameRef.current, sceneRef.current);
  }, []);

  const activatePop = useCallback(() => {
    const game = gameRef.current;
    if (game.phase !== "playing" || game.popMeter < 100) return;
    popOff(game, sceneRef.current);
    setHud(syncHud(game));
  }, []);

  const setAimFromPointer = useCallback((event) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    if (event.pointerType === "touch") {
      const drag = dragRef.current;
      if (!drag) return;
      const dx = ((event.clientX - drag.originX) / rect.width) * Math.PI * 1.15;
      gameRef.current.aim = Math.max(-Math.PI + 0.12, Math.min(-0.12, drag.originAim + dx));
      return;
    }

    const x = ((event.clientX - rect.left) / rect.width) * GAME_WIDTH;
    const y = ((event.clientY - rect.top) / rect.height) * GAME_HEIGHT;
    const angle = Math.atan2(y - DESK_Y, x - DESK_X);
    gameRef.current.aim = Math.max(-Math.PI + 0.12, Math.min(-0.12, angle));
  }, []);

  const handlePointerDown = useCallback(
    (event) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      if (event.pointerType === "touch") {
        dragRef.current = {
          originX: event.clientX,
          originY: event.clientY,
          originAim: gameRef.current.aim,
        };
      } else {
        setAimFromPointer(event);
      }
      controlsRef.current.fire = true;
      shoot();
    },
    [setAimFromPointer, shoot],
  );

  const handlePointerUp = useCallback((event) => {
    controlsRef.current.fire = false;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  useEffect(() => {
    const stored = readAudioSettings();
    audioRef.current = stored;
    const frame = window.requestAnimationFrame(() => setAudio(stored));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const qa = window;
    const scene = createScene({
      canvas,
      seed: 0x504f5021,
      muted: audioRef.current.muted,
      mix: audioRef.current,
      postProcessing: qa.__POP_POST__,
      quality: pickInitialQuality(),
      preserveDrawingBuffer: qa.__POP_QA__ === true,
    });
    sceneRef.current = scene;

    const sync = () => {
      const rect = canvas.getBoundingClientRect();
      const width = rect.width > 0 ? rect.width : GAME_WIDTH;
      const height = rect.height > 0 ? rect.height : (width * GAME_HEIGHT) / GAME_WIDTH;
      scene.resize(width, height, window.devicePixelRatio || 1);
    };
    sync();

    let observer = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(sync);
      observer.observe(canvas);
    }
    window.addEventListener("resize", sync);

    return () => {
      window.removeEventListener("resize", sync);
      observer?.disconnect();
      sceneRef.current = null;
      scene.dispose();
    };
  }, []);

  useEffect(() => {
    let animationFrame = 0;
    let lastTime = performance.now();
    let accumulator = 0;
    let hudTimer = 0;

    const frame = (time) => {
      const scene = sceneRef.current;
      const rawSeconds = Math.min(0.1, Math.max(0, (time - lastTime) / 1000));
      lastTime = time;

      const scaledSeconds = scene ? scene.tick(rawSeconds) : rawSeconds;
      accumulator += scaledSeconds;

      let steps = 0;
      while (accumulator >= STEP && steps < MAX_STEPS_PER_FRAME) {
        const game = gameRef.current;
        const previousPhase = game.phase;
        const direction = Number(controlsRef.current.right) - Number(controlsRef.current.left);
        if (game.phase === "playing" && direction !== 0) {
          game.aim = Math.max(
            -Math.PI + 0.12,
            Math.min(-0.12, game.aim + direction * KEYBOARD_AIM_SPEED * STEP),
          );
        }
        if (controlsRef.current.fire) fireShot(game, scene);
        updateGame(game, STEP, scene);
        accumulator -= STEP;
        steps += 1;
        if (previousPhase === "playing" && game.phase !== "playing") {
          controlsRef.current.fire = false;
          setPhase(game.phase);
          setHud(syncHud(game));
          void finishRunRef.current({
            score: game.score,
            survivalSeconds: Math.min(ROUND_SECONDS, Math.floor(game.elapsed)),
            answered: game.answered,
            shots: game.shots,
            hits: game.hits,
          });
        }
      }
      if (steps >= MAX_STEPS_PER_FRAME) accumulator = 0;

      hudTimer += rawSeconds;
      if (hudTimer >= 0.08) {
        hudTimer = 0;
        setHud(syncHud(gameRef.current));
      }

      if (scene) {
        const game = gameRef.current;
        const next = frameRef.current;
        next.phase = game.phase;
        next.elapsed = game.elapsed;
        next.score = game.score;
        next.combo = game.combo;
        next.backlog = game.backlog;
        next.answered = game.answered;
        next.popMeter = game.popMeter;
        next.slowSeconds = game.slowTimer;
        next.aim = game.aim;
        next.ammoLetter = LETTERS[game.ammoIndex];
        next.cooldown = game.cooldown;
        next.questions = game.questions;
        next.shots = game.projectiles;
        next.announcement = game.announcementTimer > 0 ? game.announcement : "";
        next.announcementAge = game.announcementAge;
        next.difficultyLabel = difficultyAt(game.elapsed).label;
        try {
          scene.render(next);
        } catch (err) {
          if (!scene.__loggedRenderError) {
            console.error("[ProofOfPatience] scene.render threw; will keep retrying:", err);
            scene.__loggedRenderError = true;
          }
        }
      }

      animationFrame = requestAnimationFrame(frame);
    };
    animationFrame = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(animationFrame);
  }, []);

  useEffect(() => {
    const onKeyDown = (event) => {
      const key = event.key.toLowerCase();
      if (event.key === "ArrowLeft" || key === "a") {
        event.preventDefault();
        controlsRef.current.left = true;
      }
      if (event.key === "ArrowRight" || key === "d") {
        event.preventDefault();
        controlsRef.current.right = true;
      }
      if (event.code === "Space") {
        event.preventDefault();
        controlsRef.current.fire = true;
        shoot();
      }
      if (key === "p") activatePop();
      if (key === "r" && gameRef.current.phase !== "playing") requestStart();
      if (event.key === "Escape") setShowHow(false);
    };
    const onKeyUp = (event) => {
      const key = event.key.toLowerCase();
      if (event.key === "ArrowLeft" || key === "a") controlsRef.current.left = false;
      if (event.key === "ArrowRight" || key === "d") controlsRef.current.right = false;
      if (event.code === "Space") controlsRef.current.fire = false;
    };
    const clearControls = () => {
      controlsRef.current = { left: false, right: false, fire: false };
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", clearControls);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", clearControls);
    };
  }, [activatePop, shoot, requestStart]);

  const accuracy = hud.shots > 0 ? Math.round((hud.hits / hud.shots) * 100) : 100;
  const nextLetter = LETTERS[hud.ammoIndex];
  const queueHasRoom = hud.backlog < MAX_BACKLOG - 2;
  const live = phase === "playing";
  const chainBusy = chainStatus === "starting" || chainStatus === "clearing" || chainStatus === "submitting";
  const holdAnswer = () => {
    controlsRef.current.fire = true;
    shoot();
  };
  const releaseAnswer = () => {
    controlsRef.current.fire = false;
  };

  return (
    <main className="proof-of-patience pop-shell">
      <div className="shell-grain" aria-hidden="true" />
      <div className="shell-vignette" aria-hidden="true" />

      <ShowHeader
        muted={audio.muted}
        mixOpen={showMix}
        onOpenBrief={() => setShowHow(true)}
        onOpenMix={() => {
          if (!audio.muted) sceneRef.current?.unlockAudio();
          setShowMix(true);
        }}
        onToggleSound={() => changeAudio({ muted: !audioRef.current.muted })}
      />

      <GalleryStrap backlog={hud.backlog} maxBacklog={MAX_BACKLOG} queueHasRoom={queueHasRoom} />

      <section className="play-grid">
        <div className="studio-stage">
          <canvas
            ref={canvasRef}
            width={GAME_WIDTH}
            height={GAME_HEIGHT}
            aria-label="Proof of Patience play field. Drag toward a community question and hold to answer with S O O N."
            onPointerMove={setAimFromPointer}
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onLostPointerCapture={() => { controlsRef.current.fire = false; }}
          />

          {phase === "idle" && (chainStatus === "idle" || chainStatus === "submitFailed") && (
            <AttractOverlay onStart={requestStart} />
          )}

          {phase === "idle" && chainStatus === "error" && (
            <div className="stage-overlay is-chain-error" role="alert">
              <p className="overlay-eyebrow">TRANSACTION FAILED</p>
              <p className="overlay-lede" style={{ overflowWrap: "anywhere" }}>{chainError}</p>
              <div className="result-actions">
                <button
                  type="button"
                  className="primary-control cta"
                  onClick={() => {
                    setChainError(null);
                    setChainStatus("idle");
                  }}
                >
                  DISMISS
                </button>
              </div>
            </div>
          )}

          {chainStatus === "starting" && (
            <div className="stage-overlay is-chain-pending" role="status" aria-live="polite">
              <p className="overlay-eyebrow">OPENING SESSION ON-CHAIN…</p>
              <h2 className="overlay-title">Confirm the transaction<em>in your wallet.</em></h2>
            </div>
          )}

          {chainStatus === "clearing" && (
            <div className="stage-overlay is-chain-pending" role="status" aria-live="polite">
              <p className="overlay-eyebrow">CLEARING AN UNFINISHED SESSION…</p>
              <h2 className="overlay-title">One extra confirmation<em>then you're back in.</em></h2>
            </div>
          )}

          {(phase === "won" || phase === "lost") && (
            <>
              <ResultOverlay
                won={phase === "won"}
                stats={{
                  score: hud.score,
                  answered: hud.answered,
                  accuracy,
                  bestCombo: hud.bestCombo,
                }}
                onRestart={requestStart}
              />

              {chainStatus === "submitting" && (
                <div className="stage-overlay is-chain-pending" role="status" aria-live="polite">
                  <p className="overlay-eyebrow">SUBMITTING RESULT & SYNCING POINTS…</p>
                </div>
              )}

              {(chainStatus === "error" || chainStatus === "submitFailed") && (
                <div className="stage-overlay is-chain-error" role="alert">
                  <p className="overlay-eyebrow">TRANSACTION FAILED</p>
                  <p className="overlay-lede">{chainError}</p>
                  <div className="result-actions">
                    <button type="button" className="ghost-button" onClick={() => setChainStatus("completed")}>
                      CONTINUE WITHOUT SUBMITTING
                    </button>
                    <button
                      type="button"
                      className="primary-control cta"
                      onClick={chainStatus === "submitFailed" ? retrySubmit : requestStart}
                    >
                      RETRY
                    </button>
                  </div>
                </div>
              )}

              {chainStatus === "completed" && txHash && (
                <p className="overlay-meta">
                  <a href={`${HEMI_EXPLORER_URL}/tx/${txHash}`} target="_blank" rel="noreferrer">
                    TX: {txHash.slice(0, 10)}…{txHash.slice(-8)}
                  </a>
                </p>
              )}
            </>
          )}
        </div>

        <ProducerRack
          live={live && !chainBusy}
          ammoIndex={hud.ammoIndex}
          nextLetter={nextLetter}
          popMeter={hud.popMeter}
          onAnswerDown={holdAnswer}
          onAnswerUp={releaseAnswer}
          onPopOff={activatePop}
        />
      </section>

      <footer className="show-footer">
        <p>Proof of Patience™ is Created by Our Community.</p>
        <div className="control-legend">
          <span>
            AIM
            <b className="keycap">A</b>
            <b className="keycap">D</b>
          </span>
          <span>
            ANSWER
            <b className="keycap">SPACE</b>
          </span>
          <span>
            POP OFF
            <b className="keycap">P</b>
          </span>
        </div>
      </footer>

      <ThumbBar
        live={live && !chainBusy}
        nextLetter={nextLetter}
        charged={hud.popMeter >= 100}
        onAnswerDown={holdAnswer}
        onAnswerUp={releaseAnswer}
        onPopOff={activatePop}
      />

      <p className="sr-only" role="status" aria-live="polite">
        {hud.announcement}
      </p>

      {showHow && <HowToModal onClose={closeBrief} />}
      {showMix && <AudioPanel settings={audio} onChange={changeAudio} onClose={closeMix} />}
    </main>
  );
}