export type WeaponType = 'laser' | 'spread' | 'plasma' | 'missile' | 'lightning';

export interface WeaponConfig {
  type: WeaponType;
  name: string;
  level: number;
  fireRate: number;
  damage: number;
  color: string;
  description: string;
}

export interface Vector2 {
  x: number;
  y: number;
}

export interface Entity {
  x: number;
  y: number;
  width: number;
  height: number;
  active: boolean;
}

export interface Bullet extends Entity {
  vx: number;
  vy: number;
  damage: number;
  color: string;
  weaponType: WeaponType;
  isEnemy: boolean;
  glowColor?: string;
  size?: number;
}

export interface Particle extends Entity {
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
  alpha: number;
}

export type EnemyBullet = {
  x: number;
  y: number;
  width: number;
  height: number;
  vx: number;
  vy: number;
  damage: number;
  color: string;
  active: boolean;

  // existing
  isLaser?: boolean;
  laserAngle?: number;
  laserLength?: number;
  laserWidth?: number;
  lifetime?: number;
  maxLifetime?: number;

  // ✅ NEW (for charging system)
  chargeTime?: number;
  isCharging?: boolean;

  // existing homing
  isHoming?: boolean;
  homingStrength?: number;
};

export type EnemyType = 'drone' | 'fighter' | 'boss';

export interface Enemy extends Entity {
  type: EnemyType;
  hp: number;
  maxHp: number;
  speed: number;
  scoreValue: number;
  movePattern: 'formation' | 'dive' | 'zigzag' | 'boss';
  shootTimer: number;
  shootInterval: number;
  phase?: number;
  angle?: number;
  baseX?: number;
  baseY?: number;
  tick?: number;
  diveTarget?: Vector2;
  isDiving?: boolean;
  shieldActive?: boolean;
  enrageMode?: boolean;
  formationIndex?: number;
  row?: number;
  col?: number;
  bossLevel?: number;          // ← NEW: which level this boss belongs to
  spiralAngle?: number;        // ← NEW: persistent spiral angle for bosses
  // Entry fly-in animation
  entering: boolean;
  entryProgress: number;
  entryDelay: number;
  entryStartX: number;
  entryStartY: number;
  entryCtrlX: number;
  entryCtrlY: number;
  
}

export type PowerUpType = 'weaponUpgrade' | 'weaponSwitch' | 'health' | 'shield' | 'bomb';

export interface PowerUp extends Entity {
  type: PowerUpType;
  vy: number;
  angle: number;
  weaponType?: WeaponType;
  glowTimer: number;
}

export interface Player extends Entity {
  hp: number;
  maxHp: number;
  shield: number;
  maxShield: number;
  speed: number;
  invincible: boolean;
  invincibleTimer: number;
  weapon: WeaponConfig;
  fireTimer: number;
  bombCount: number;
}

export interface Asteroid {
  x: number;
  y: number;
  width: number;
  height: number;
  active: boolean;
  vx: number;
  vy: number;
  angle: number;
  spin: number;
  hp: number;
  maxHp: number;
  size: number;
  color: string;
}

export type GamePhase =
  | 'menu'
  | 'wave'
  | 'boss'
  | 'bossWarning'
  | 'waveClear'
  | 'asteroids'
  | 'asteroidWarning'
  | 'levelWarp'
  | 'levelComplete'    // boss killed → show celebration overlay
  | 'gameOver'
  | 'victory';

export interface GameState {
  phase: GamePhase;
  score: number;
  wave: number;
  level: number;
  highScore: number;
  player: Player;
  enemies: Enemy[];
  bullets: Bullet[];
  enemyBullets: EnemyBullet[];
  particles: Particle[];
  powerUps: PowerUp[];
  asteroids: Asteroid[];
  screenShake: number;
  bossWarningTimer: number;
  waveClearTimer: number;
  asteroidTimer: number;
  asteroidWarningTimer: number;
  asteroidSpawnTimer: number;
  warpTimer: number;
  warpNextLevel: number;
  levelCompleteTimer: number;   // ← NEW
}