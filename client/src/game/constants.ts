import type { WeaponConfig } from './types';

export const CANVAS_WIDTH = 900;
export const CANVAS_HEIGHT = 650;

export const PLAYER_SPEED = 5;
export const PLAYER_MAX_HP = 100;
export const PLAYER_MAX_SHIELD = 50;

export const WEAPONS: Record<string, WeaponConfig> = {
  laser: {
    type: 'laser',
    name: 'Laser',
    level: 1,
    fireRate: 320,
    damage: 15,
    color: '#00ffff',
    description: 'Fast single beam',
  },
  spread: {
    type: 'spread',
    name: 'Spread Gun',
    level: 1,
    fireRate: 420,
    damage: 10,
    color: '#ff8800',
    description: '3-way spread shot',
  },
  plasma: {
    type: 'plasma',
    name: 'Plasma Cannon',
    level: 1,
    fireRate: 560,
    damage: 35,
    color: '#ff00ff',
    description: 'High damage plasma',
  },
  missile: {
    type: 'missile',
    name: 'Missile',
    level: 1,
    fireRate: 750,
    damage: 50,
    color: '#ffff00',
    description: 'Explosive missiles',
  },
  lightning: {
    type: 'lightning',
    name: 'Lightning',
    level: 1,
    fireRate: 380,
    damage: 20,
    color: '#aaddff',
    description: 'Chain lightning bolt',
  },
};

export const ENEMY_CONFIGS = {
  drone: {
    width: 50,
    height: 50,
    maxHp: 30,
    speed: 1,
    scoreValue: 10,
    shootInterval: 5000,
  },
  fighter: {
    width: 60,
    height: 60,
    maxHp: 60,
    speed: 2,
    scoreValue: 20,
    shootInterval: 4000,
  },
  boss: {
    width: 300,
    height: 200,
    maxHp: 2000,
    speed: 1,
    scoreValue: 500,
    shootInterval: 1200,
  },
};

export const TOTAL_LEVELS = 5;
export const WAVES_PER_LEVEL = 3; 
