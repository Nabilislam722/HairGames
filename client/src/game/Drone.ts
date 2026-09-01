import type { Bullet, Enemy } from './types';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from './constants';

/**
 * A helper drone earned at weapon level 4 (first drone) and level 5 (second
 * drone). Orbits the player and auto-fires homing missiles at the nearest
 * active enemy — no player input required.
 */
export interface Drone {
  angle: number;
  fireTimer: number;
  fireRate: number;
  damage: number;
  active: boolean;
}

const ORBIT_RADIUS = 55;
const DRONE_MISSILE_SPEED = 8;
const DRONE_MISSILE_TURN_RATE = 0.12;

export function createDrone(angle: number, damage: number, fireRate: number): Drone {
  return { angle, fireTimer: fireRate * 0.5, fireRate, damage, active: true };
}

/**
 * Grants a drone the first time the weapon reaches level 4, and a second
 * the first time it reaches level 5. Call after upgradeWeapon() with the
 * player's new weapon level.
 */
export function grantDroneIfMissing(drones: Drone[], newLevel: number, droneDamage: number): Drone[] {
  const slot = newLevel - 4; // level 4 -> slot 0, level 5 -> slot 1
  if (slot < 0 || slot > 1 || drones.length > slot) return drones;
  const angle = slot === 0 ? Math.PI / 2 : -Math.PI / 2; // opposite sides of the ship
  return [...drones, createDrone(angle, droneDamage, 700)];
}

/**
 * Advances each drone's orbit position and fire timer, returning any new
 * missiles fired this tick. Call once per tick alongside the player's own
 * fire handling.
 */
export function tickDrones(drones: Drone[], dt: number, playerCx: number, playerCy: number): Bullet[] {
  const newBullets: Bullet[] = [];
  for (const d of drones) {
    if (!d.active) continue;
    d.angle += dt * 0.0022;
    d.fireTimer -= dt;
    if (d.fireTimer <= 0) {
      d.fireTimer = d.fireRate;
      const x = playerCx + Math.cos(d.angle) * ORBIT_RADIUS;
      const y = playerCy + Math.sin(d.angle) * ORBIT_RADIUS;
      newBullets.push(fireDroneMissile(x, y, d.damage));
    }
  }
  return newBullets;
}

/** Current screen position of each active drone, for rendering. */
export function droneRenderPositions(drones: Drone[], playerCx: number, playerCy: number) {
  return drones
    .filter(d => d.active)
    .map(d => ({
      x: playerCx + Math.cos(d.angle) * ORBIT_RADIUS,
      y: playerCy + Math.sin(d.angle) * ORBIT_RADIUS,
    }));
}

function fireDroneMissile(x: number, y: number, damage: number): Bullet {
  const size = 6;
  return {
    x: x - size / 2,
    y: y - size / 2,
    width: size,
    height: size * 2,
    vx: 0,
    vy: -DRONE_MISSILE_SPEED,
    damage,
    color: '#66ffcc',
    weaponType: 'missile',
    glowColor: '#aaffee',
    size,
    isEnemy: false,
    active: true,
  };
}

/**
 * Steers drone missiles toward the nearest active enemy each tick (true
 * tracking, not just a straight shot) and despawns ones that drift
 * off-screen. Mutates the bullets in place, same convention as the rest of
 * this codebase's update*() helpers.
 */
export function updateDroneMissiles(bullets: Bullet[], enemies: Enemy[], dt: number): void {
  for (const b of bullets) {
    if (!b.active) continue;

    let target: Enemy | null = null;
    let bestDistSq = Infinity;
    for (const e of enemies) {
      if (!e.active) continue;
      const dx = (e.x + e.width / 2) - b.x;
      const dy = (e.y + e.height / 2) - b.y;
      const distSq = dx * dx + dy * dy;
      if (distSq < bestDistSq) { bestDistSq = distSq; target = e; }
    }

    if (target) {
      const tx = target.x + target.width / 2, ty = target.y + target.height / 2;
      const dx = tx - b.x, dy = ty - b.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const desiredVx = (dx / len) * DRONE_MISSILE_SPEED;
      const desiredVy = (dy / len) * DRONE_MISSILE_SPEED;
      b.vx += (desiredVx - b.vx) * DRONE_MISSILE_TURN_RATE;
      b.vy += (desiredVy - b.vy) * DRONE_MISSILE_TURN_RATE;
    }

    b.x += b.vx * (dt / 16);
    b.y += b.vy * (dt / 16);

    if (b.y < -40 || b.y > CANVAS_HEIGHT + 40 || b.x < -50 || b.x > CANVAS_WIDTH + 50) {
      b.active = false;
    }
  }
}