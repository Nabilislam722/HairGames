import type { Bullet, Player, WeaponConfig, WeaponType } from './types';
import { WEAPONS } from './constants';

export const MAX_WEAPON_LEVEL = 5;

export function createBullets(player: Player): Bullet[] {
  const bullets: Bullet[] = [];
  const { weapon } = player;
  const cx = player.x + player.width / 2;
  const cy = player.y;

  switch (weapon.type) {
    case 'laser': {
      const lvl = weapon.level;
      if (lvl === 1) {
        bullets.push(makeBullet(cx, cy, 0, -14, weapon.damage, '#00ffff', 'laser', '#00ffff'));
      } else if (lvl === 2) {
        bullets.push(makeBullet(cx - 10, cy, 0, -14, weapon.damage, '#00ffff', 'laser', '#00ffff'));
        bullets.push(makeBullet(cx + 10, cy, 0, -14, weapon.damage, '#00ffff', 'laser', '#00ffff'));
      } else if (lvl === 3) {
        bullets.push(makeBullet(cx - 15, cy, 0, -14, weapon.damage, '#00ffff', 'laser', '#00ffff'));
        bullets.push(makeBullet(cx, cy, 0, -16, weapon.damage * 1.2, '#44ffff', 'laser', '#44ffff'));
        bullets.push(makeBullet(cx + 15, cy, 0, -14, weapon.damage, '#00ffff', 'laser', '#00ffff'));
      } else if (lvl === 4) {
        bullets.push(makeBullet(cx - 22, cy, 0, -14, weapon.damage * 0.9, '#00ffff', 'laser', '#00ffff'));
        bullets.push(makeBullet(cx - 8, cy, 0, -15, weapon.damage, '#22ffff', 'laser', '#22ffff'));
        bullets.push(makeBullet(cx + 8, cy, 0, -15, weapon.damage, '#22ffff', 'laser', '#22ffff'));
        bullets.push(makeBullet(cx + 22, cy, 0, -14, weapon.damage * 0.9, '#00ffff', 'laser', '#00ffff'));
      } else {
        bullets.push(makeBullet(cx - 28, cy, 0, -14, weapon.damage * 0.85, '#00ffff', 'laser', '#00ffff'));
        bullets.push(makeBullet(cx - 12, cy, 0, -15, weapon.damage * 0.95, '#22ffff', 'laser', '#22ffff'));
        bullets.push(makeBullet(cx, cy, 0, -17, weapon.damage * 1.35, '#66ffff', 'laser', '#66ffff'));
        bullets.push(makeBullet(cx + 12, cy, 0, -15, weapon.damage * 0.95, '#22ffff', 'laser', '#22ffff'));
        bullets.push(makeBullet(cx + 28, cy, 0, -14, weapon.damage * 0.85, '#00ffff', 'laser', '#00ffff'));
      }
      break;
    }
    case 'spread': {
      const lvl = weapon.level;
      const angleSets: Record<number, number[]> = {
        1: [-0.3, 0, 0.3],
        2: [-0.4, -0.15, 0, 0.15, 0.4],
        3: [-0.5, -0.3, -0.1, 0.1, 0.3, 0.5],
        4: [-0.55, -0.35, -0.18, 0, 0.18, 0.35, 0.55],
        5: [-0.65, -0.45, -0.3, -0.15, 0, 0.15, 0.3, 0.45, 0.65],
      };
      const angles = angleSets[lvl] ?? angleSets[MAX_WEAPON_LEVEL];
      for (const angle of angles) {
        bullets.push(makeBullet(cx, cy, Math.sin(angle) * 12, -Math.cos(angle) * 12, weapon.damage, '#ff8800', 'spread', '#ffaa00', 5));
      }
      break;
    }
    case 'plasma': {
      const lvl = weapon.level;
      const size = 8 + lvl * 3;
      bullets.push(makeBullet(cx, cy, 0, -10, weapon.damage, '#ff00ff', 'plasma', '#ff88ff', size));
      if (lvl >= 2) {
        bullets.push(makeBullet(cx - 20, cy, -0.5, -10, weapon.damage * 0.7, '#cc00ff', 'plasma', '#dd88ff', size - 2));
        bullets.push(makeBullet(cx + 20, cy, 0.5, -10, weapon.damage * 0.7, '#cc00ff', 'plasma', '#dd88ff', size - 2));
      }
      if (lvl >= 3) {
        bullets.push(makeBullet(cx, cy - 15, 0, -8, weapon.damage * 0.5, '#ff44ff', 'plasma', '#ff88ff', size - 4));
      }
      if (lvl >= 4) {
        bullets.push(makeBullet(cx - 36, cy, -0.9, -9, weapon.damage * 0.55, '#bb00ee', 'plasma', '#cc77ff', size - 3));
        bullets.push(makeBullet(cx + 36, cy, 0.9, -9, weapon.damage * 0.55, '#bb00ee', 'plasma', '#cc77ff', size - 3));
      }
      if (lvl >= 5) {
        bullets.push(makeBullet(cx - 15, cy - 10, -0.2, -11, weapon.damage * 0.65, '#ff22ff', 'plasma', '#ffaaff', size - 1));
        bullets.push(makeBullet(cx + 15, cy - 10, 0.2, -11, weapon.damage * 0.65, '#ff22ff', 'plasma', '#ffaaff', size - 1));
      }
      break;
    }
    case 'missile': {
      const lvl = weapon.level;
      if (lvl === 1) {
        bullets.push(makeBullet(cx, cy, 0, -9, weapon.damage, '#ffff00', 'missile', '#ffaa00', 7));
      } else if (lvl === 2) {
        bullets.push(makeBullet(cx - 15, cy, -0.2, -9, weapon.damage, '#ffff00', 'missile', '#ffaa00', 7));
        bullets.push(makeBullet(cx + 15, cy, 0.2, -9, weapon.damage, '#ffff00', 'missile', '#ffaa00', 7));
      } else if (lvl === 3) {
        bullets.push(makeBullet(cx - 20, cy, -0.3, -9, weapon.damage, '#ffff00', 'missile', '#ffaa00', 7));
        bullets.push(makeBullet(cx, cy, 0, -10, weapon.damage * 1.3, '#ffffff', 'missile', '#ffff88', 9));
        bullets.push(makeBullet(cx + 20, cy, 0.3, -9, weapon.damage, '#ffff00', 'missile', '#ffaa00', 7));
      } else if (lvl === 4) {
        bullets.push(makeBullet(cx - 28, cy, -0.4, -9, weapon.damage * 0.9, '#ffff00', 'missile', '#ffaa00', 7));
        bullets.push(makeBullet(cx - 12, cy, -0.15, -9.5, weapon.damage, '#ffff00', 'missile', '#ffaa00', 7));
        bullets.push(makeBullet(cx, cy, 0, -10, weapon.damage * 1.3, '#ffffff', 'missile', '#ffff88', 9));
        bullets.push(makeBullet(cx + 12, cy, 0.15, -9.5, weapon.damage, '#ffff00', 'missile', '#ffaa00', 7));
        bullets.push(makeBullet(cx + 28, cy, 0.4, -9, weapon.damage * 0.9, '#ffff00', 'missile', '#ffaa00', 7));
      } else {
        bullets.push(makeBullet(cx - 34, cy, -0.5, -8.5, weapon.damage * 0.85, '#ffdd00', 'missile', '#ffaa00', 7));
        bullets.push(makeBullet(cx - 20, cy, -0.3, -9, weapon.damage * 0.95, '#ffff00', 'missile', '#ffaa00', 7));
        bullets.push(makeBullet(cx - 8, cy, -0.1, -9.5, weapon.damage, '#ffff00', 'missile', '#ffaa00', 7));
        bullets.push(makeBullet(cx, cy, 0, -10.5, weapon.damage * 1.4, '#ffffff', 'missile', '#ffff88', 10));
        bullets.push(makeBullet(cx + 8, cy, 0.1, -9.5, weapon.damage, '#ffff00', 'missile', '#ffaa00', 7));
        bullets.push(makeBullet(cx + 20, cy, 0.3, -9, weapon.damage * 0.95, '#ffff00', 'missile', '#ffaa00', 7));
        bullets.push(makeBullet(cx + 34, cy, 0.5, -8.5, weapon.damage * 0.85, '#ffdd00', 'missile', '#ffaa00', 7));
      }
      break;
    }
    case 'lightning': {
      const lvl = weapon.level;
      // Lightning uses special bolt markers; actual bolt drawn by renderer
      bullets.push(makeBullet(cx, cy, 0, -18, weapon.damage, '#aaddff', 'lightning', '#ffffff', 6));
      if (lvl >= 2) {
        bullets.push(makeBullet(cx - 22, cy, -0.4, -17, weapon.damage * 0.75, '#88ccff', 'lightning', '#ccffff', 5));
        bullets.push(makeBullet(cx + 22, cy, 0.4, -17, weapon.damage * 0.75, '#88ccff', 'lightning', '#ccffff', 5));
      }
      if (lvl >= 3) {
        bullets.push(makeBullet(cx - 40, cy, -0.8, -15, weapon.damage * 0.5, '#66aaff', 'lightning', '#aaddff', 4));
        bullets.push(makeBullet(cx + 40, cy, 0.8, -15, weapon.damage * 0.5, '#66aaff', 'lightning', '#aaddff', 4));
      }
      if (lvl >= 4) {
        bullets.push(makeBullet(cx - 12, cy, -0.15, -18, weapon.damage * 0.6, '#bbe6ff', 'lightning', '#ffffff', 5));
        bullets.push(makeBullet(cx + 12, cy, 0.15, -18, weapon.damage * 0.6, '#bbe6ff', 'lightning', '#ffffff', 5));
      }
      if (lvl >= 5) {
        bullets.push(makeBullet(cx - 55, cy, -1.1, -13, weapon.damage * 0.4, '#4488ee', 'lightning', '#88bbff', 4));
        bullets.push(makeBullet(cx + 55, cy, 1.1, -13, weapon.damage * 0.4, '#4488ee', 'lightning', '#88bbff', 4));
      }
      break;
    }
  }

  return bullets;
}

function makeBullet(
  x: number, y: number,
  vx: number, vy: number,
  damage: number,
  color: string,
  weaponType: WeaponType,
  glowColor: string,
  size = 4
): Bullet {
  return {
    x: x - size / 2,
    y: y - size / 2,
    width: size,
    height: size * 2.5,
    vx,
    vy,
    damage,
    color,
    weaponType,
    glowColor,
    size,
    isEnemy: false,
    active: true,
  };
}

export function upgradeWeapon(weapon: WeaponConfig): WeaponConfig {
  if (weapon.level >= MAX_WEAPON_LEVEL) return weapon;
  const upgraded = { ...weapon, level: weapon.level + 1 };
  // Taper the multiplier past level 3 so power doesn't compound out of control.
  const dmgMult = weapon.level < 3 ? 1.4 : 1.25;
  const rateMult = weapon.level < 3 ? 0.85 : 0.92;
  upgraded.damage = Math.round(weapon.damage * dmgMult);
  upgraded.fireRate = Math.round(weapon.fireRate * rateMult);
  return upgraded;
}

export function switchWeapon(currentType: WeaponType, newType: WeaponType): WeaponConfig {
  return { ...WEAPONS[newType] };
}

export const WEAPON_CYCLE: WeaponType[] = ['laser', 'spread', 'plasma', 'missile'];