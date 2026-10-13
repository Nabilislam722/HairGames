import type { PowerUp, PowerUpType, WeaponType } from './types';
import { CANVAS_WIDTH } from './constants';

const WEAPON_TYPES: WeaponType[] = ['laser', 'spread', 'plasma', 'missile', 'lightning'];

export function maybeDropPowerUp(x: number, y: number, isBoss: boolean, score: number): PowerUp | null {
  const roll = Math.random();
  const dropChance = isBoss ? 1.0 : 0.25;

  if (roll > dropChance) return null;

  let type: PowerUpType;
  if (isBoss) {
    type = Math.random() < 0.5 ? 'weaponSwitch' : 'weaponUpgrade';
  } else {
    const r = Math.random();
    if (r < 0.30) type = 'weaponUpgrade';
    else if (r < 0.55) type = 'weaponSwitch';
    else if (r < 0.75) type = 'health';
    else if (r < 0.90) type = 'shield';
    else type = 'bomb';
  }

  const randomWeapon = WEAPON_TYPES[Math.floor(Math.random() * WEAPON_TYPES.length)];

  return {
    x: x - 16,
    y: y,
    width: 32,
    height: 32,
    type,
    vy: 1.2,
    angle: 0,
    weaponType: type === 'weaponSwitch' ? randomWeapon : undefined,
    glowTimer: 0,
    active: true,
  };
}

export function getPowerUpColor(type: PowerUpType): string {
  switch (type) {
    case 'weaponUpgrade': return '#ffdd00';
    case 'weaponSwitch': return '#00ccff';
    case 'health': return '#44ff44';
    case 'shield': return '#4488ff';
    case 'bomb': return '#ff4400';
    default: return '#ffffff';
  }
}

export function getPowerUpLabel(type: PowerUpType, weaponType?: WeaponType): string {
  switch (type) {
    case 'weaponUpgrade': return 'UPGRADE';
    case 'weaponSwitch': return weaponType?.toUpperCase() ?? 'WEAPON';
    case 'health': return 'HP';
    case 'shield': return 'SHIELD';
    case 'bomb': return 'BOMB';
    default: return '?';
  }
}
