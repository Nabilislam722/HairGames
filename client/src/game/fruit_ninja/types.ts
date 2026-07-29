export type Vec2 = { x: number; y: number };

export type FruitKind = {
  id: string;
  name: string;
  color: string;
  rim: string;
  inner: string;
  seed: string;
  radius: number;
  points: number;
};

export type AbilityType = "frenzy" | "glitch" | "golden" | "multiplier" | "hair" | "hemi";

export interface AbilityKind extends FruitKind {
  ability: AbilityType;
  glow: string;
  // Optional raster icon (e.g. brand logo) drawn as the fruit face instead
  // of the default vector icon. See drawAbilityFruit in the renderer.
  iconSrc?: string;
}

export type BombKind = {
  id: "bomb";
  radius: number;
};

export type SpawnKind = FruitKind | BombKind | AbilityKind;

export interface FlyingObject {
  id: number;
  kind: SpawnKind;
  isBomb: boolean;
  isAbility: boolean;
  pos: Vec2;
  vel: Vec2;
  angle: number;
  spin: number;
  radius: number;
  sliced: boolean;
  frenzy?: boolean;
  halves?: {
    a: { pos: Vec2; vel: Vec2; angle: number; spin: number };
    b: { pos: Vec2; vel: Vec2; angle: number; spin: number };
  };
}

export interface Particle {
  id: number;
  pos: Vec2;
  vel: Vec2;
  life: number;
  maxLife: number;
  color: string;
  size: number;
  kind: "juice" | "spark" | "smoke";
}

export interface SliceSegment {
  a: Vec2;
  b: Vec2;
  life: number;
  maxLife: number;
}

export interface FloatScore {
  id: number;
  pos: Vec2;
  text: string;
  life: number;
  maxLife: number;
  color: string;
  big: boolean;
}

export type GamePhase = "menu" | "playing" | "levelup" | "over";

export interface LevelConfig {
  level: number;
  label: string;
  targetScore: number;
  spawnIntervalStart: number;
  maxDifficulty: number;
  bombChanceMax: number;
  abilityChance: number;
  allowFrenzy: boolean;
  allowGlitch: boolean;
}

export interface ActiveAbility {
  type: AbilityType;
  timeLeft: number;
  duration: number;
}

export interface GameState {
  phase: GamePhase;
  score: number;
  best: number;
  lives: number;
  combo: number;
  comboTimer: number;
  objects: FlyingObject[];
  particles: Particle[];
  segments: SliceSegment[];
  floats: FloatScore[];
  spawnTimer: number;
  spawnInterval: number;
  elapsed: number;
  difficulty: number;
  shake: number;
  level: number;
  levelScore: number;
  frenzyTimer: number;
  frenzySpawner: number;
  pointLockTimer: number;
  multiplier: number;
  multiplierTimer: number;
  activeAbilities: ActiveAbility[];
  glitchFlash: number;
  fruitsSliced: number;
  frenzyGraceTimer: number;
}