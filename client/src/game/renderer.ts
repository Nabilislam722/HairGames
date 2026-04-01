import type { GameState, Enemy, Bullet, EnemyBullet, Player, Particle, PowerUp } from './types';
import { getPowerUpColor, getPowerUpLabel } from './powerups';
import { drawAsteroid } from './asteroids';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from './constants';

interface Assets {
  player: HTMLImageElement;
  playerLeft?: HTMLImageElement;
  playerRight?: HTMLImageElement;
  enemy1: HTMLImageElement;
  enemy2: HTMLImageElement;
  boss: HTMLImageElement;
  boss2?: HTMLImageElement;
  bullet: HTMLImageElement;
  bg: HTMLImageElement;
  bg2: HTMLImageElement;
  bomb?: HTMLImageElement;
}

let bgOffset  = 0;
let bg2Offset = 0;

export function updateBgScroll(dt: number) {
  bgOffset  += dt * 0.055;
  bg2Offset += dt * 0.022;
}

function tileImage(ctx: CanvasRenderingContext2D, img: HTMLImageElement, offset: number, alpha = 1) {
  if (!img || !img.complete || img.naturalWidth === 0) return;
  const ratio = CANVAS_WIDTH / img.naturalWidth;
  const tileH = img.naturalHeight * ratio;
  if (tileH <= 0) return;
  const wrapped = ((offset % tileH) + tileH) % tileH;
  const startY  = wrapped - tileH;
  const tilesNeeded = Math.ceil((CANVAS_HEIGHT - startY) / tileH) + 1;
  ctx.save();
  ctx.globalAlpha = alpha;
  for (let i = 0; i < tilesNeeded; i++) {
    const y = startY + i * tileH;
    if (y > CANVAS_HEIGHT) break;
    ctx.drawImage(img, 0, y, CANVAS_WIDTH, tileH);
  }
  ctx.restore();
}

export function drawBackground(ctx: CanvasRenderingContext2D, assets: Assets) {
  ctx.fillStyle = '#00000f';
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  tileImage(ctx, assets.bg2, bg2Offset, 1.0);
  tileImage(ctx, assets.bg,  bgOffset,  0.55);
}

export function drawPlayer(ctx: CanvasRenderingContext2D, player: Player, assets: Assets, tick: number) {
  if (player.invincible && Math.floor(tick / 5) % 2 === 0) return;

  ctx.save();
  const cx = player.x + player.width  / 2;
  const cy = player.y + player.height / 2;

  // Engine glow
  const grad = ctx.createRadialGradient(cx, player.y + player.height, 0, cx, player.y + player.height, 30);
  grad.addColorStop(0, 'rgba(0,200,255,0.8)');
  grad.addColorStop(1, 'rgba(0,200,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(cx - 30, player.y + player.height - 10, 60, 40);

  if (assets.player && assets.player.complete && assets.player.naturalWidth > 0) {
    ctx.drawImage(assets.player, player.x, player.y, player.width, player.height);
  } else {
    drawFallbackPlayer(ctx, player);
  }

  if (player.shield > 0) {
    ctx.strokeStyle = `rgba(100,180,255,${0.3 + Math.sin(tick * 0.15) * 0.2})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(cx, cy, player.width * 0.7, player.height * 0.7, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawFallbackPlayer(ctx: CanvasRenderingContext2D, player: Player) {
  const cx = player.x + player.width / 2;
  ctx.fillStyle = '#88aaff';
  ctx.beginPath();
  ctx.moveTo(cx, player.y);
  ctx.lineTo(player.x, player.y + player.height);
  ctx.lineTo(cx, player.y + player.height - 10);
  ctx.lineTo(player.x + player.width, player.y + player.height);
  ctx.closePath();
  ctx.fill();
}

export function drawEnemy(ctx: CanvasRenderingContext2D, enemy: Enemy, assets: Assets, tick: number) {
  if (enemy.entering && enemy.entryDelay > 0) return;

  ctx.save();

  if (enemy.entering && enemy.entryProgress < 1) {
    ctx.shadowColor  = enemy.type === 'drone' ? '#44ffaa' : '#ffaa44';
    ctx.shadowBlur   = 18 + Math.sin(tick * 0.3) * 6;
    ctx.globalAlpha  = 0.7 + Math.sin(tick * 0.2) * 0.3;
  }

  const hpRatio = enemy.hp / enemy.maxHp;
  if (hpRatio < 0.3 && !enemy.entering) {
    ctx.shadowColor = '#ff2200';
    ctx.shadowBlur  = 15;
  }

  if (enemy.type === 'boss') {
    if (enemy.enrageMode) {
      ctx.shadowColor = '#ff0000';
      ctx.shadowBlur  = 25 + Math.sin(tick * 0.2) * 10;
    }
    // Level 2+ use boss2 sprite
    const bossImg = (enemy.bossLevel && enemy.bossLevel >= 2 && assets.boss2 && assets.boss2.complete && assets.boss2.naturalWidth > 0)
      ? assets.boss2
      : assets.boss;
    if (bossImg && bossImg.complete && bossImg.naturalWidth > 0) {
      ctx.drawImage(bossImg, enemy.x, enemy.y, enemy.width, enemy.height);
    } else {
      drawFallbackBoss(ctx, enemy);
    }
    drawEnemyHealthBar(ctx, enemy, true);
  } else {
    const img = enemy.type === 'drone' ? assets.enemy1 : assets.enemy2;
    if (img && img.complete && img.naturalWidth > 0) {
      ctx.drawImage(img, enemy.x, enemy.y, enemy.width, enemy.height);
    } else {
      drawFallbackEnemy(ctx, enemy);
    }
    drawEnemyHealthBar(ctx, enemy, false);
  }

  ctx.restore();
}

function drawFallbackBoss(ctx: CanvasRenderingContext2D, enemy: Enemy) {
  const cx = enemy.x + enemy.width  / 2;
  const cy = enemy.y + enemy.height / 2;
  ctx.fillStyle   = '#aa0022';
  ctx.beginPath();
  ctx.arc(cx, cy, enemy.width * 0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#ff4444';
  ctx.lineWidth   = 3;
  ctx.stroke();
}

function drawFallbackEnemy(ctx: CanvasRenderingContext2D, enemy: Enemy) {
  const cx = enemy.x + enemy.width  / 2;
  const cy = enemy.y + enemy.height / 2;
  ctx.fillStyle = enemy.type === 'drone' ? '#44cc44' : '#cc4400';
  ctx.beginPath();
  ctx.arc(cx, cy, enemy.width * 0.35, 0, Math.PI * 2);
  ctx.fill();
}

function drawEnemyHealthBar(ctx: CanvasRenderingContext2D, enemy: Enemy, isBoss: boolean) {
  const ratio = enemy.hp / enemy.maxHp;
  if (ratio >= 1) return;

  if (isBoss) {
    const barW = enemy.width, barH = 8;
    const bx = enemy.x, by = enemy.y + enemy.height + 6;
    ctx.fillStyle = '#330000';
    ctx.fillRect(bx, by, barW, barH);
    ctx.fillStyle = ratio > 0.5 ? '#00ff44' : ratio > 0.25 ? '#ffaa00' : '#ff2200';
    ctx.fillRect(bx, by, barW * ratio, barH);
    ctx.strokeStyle = '#ffffff44';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx, by, barW, barH);
  } else {
    const barW = enemy.width, barH = 4;
    const bx = enemy.x, by = enemy.y - 7;
    ctx.fillStyle = '#330000';
    ctx.fillRect(bx, by, barW, barH);
    ctx.fillStyle = ratio > 0.5 ? '#44ff44' : ratio > 0.25 ? '#ffaa00' : '#ff2222';
    ctx.fillRect(bx, by, barW * ratio, barH);
  }
}

export function drawBullet(ctx: CanvasRenderingContext2D, bullet: Bullet, tick: number) {
  ctx.save();
  const cx = bullet.x + bullet.width  / 2;
  const cy = bullet.y + bullet.height / 2;

  if (bullet.glowColor) { ctx.shadowColor = bullet.glowColor; ctx.shadowBlur = 12; }

  switch (bullet.weaponType) {
    case 'laser': {
      const grad = ctx.createLinearGradient(cx, bullet.y, cx, bullet.y + bullet.height);
      grad.addColorStop(0,   '#ffffff');
      grad.addColorStop(0.3, bullet.color);
      grad.addColorStop(1,   'rgba(0,200,255,0)');
      ctx.fillStyle = grad;
      const w = bullet.size ?? 4;
      ctx.fillRect(cx - w / 2, bullet.y, w, bullet.height);
      break;
    }
    case 'spread': {
      ctx.fillStyle = bullet.color;
      ctx.beginPath();
      ctx.arc(cx, cy, (bullet.size ?? 5) / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff88';
      ctx.beginPath();
      ctx.arc(cx, cy, (bullet.size ?? 5) / 4, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'plasma': {
      const r     = (bullet.size ?? 8) / 2;
      const pulse = 1 + Math.sin(tick * 0.3) * 0.2;
      const grd   = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * pulse);
      grd.addColorStop(0,   '#ffffff');
      grd.addColorStop(0.4, bullet.color);
      grd.addColorStop(1,   'rgba(255,0,255,0)');
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(cx, cy, r * pulse, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'missile': {
      const r = (bullet.size ?? 7) / 2;
      ctx.fillStyle = bullet.color;
      ctx.fillRect(cx - r * 0.4, bullet.y, r * 0.8, bullet.height);
      ctx.fillStyle = '#ff4400';
      ctx.beginPath();
      ctx.arc(cx, cy + bullet.height / 2, r, 0, Math.PI * 2);
      ctx.fill();
      const flameGrad = ctx.createRadialGradient(cx, bullet.y + bullet.height, 0, cx, bullet.y + bullet.height, r * 2);
      flameGrad.addColorStop(0, 'rgba(255,200,0,0.9)');
      flameGrad.addColorStop(1, 'rgba(255,50,0,0)');
      ctx.fillStyle = flameGrad;
      ctx.beginPath();
      ctx.arc(cx, bullet.y + bullet.height + r, r * 1.5, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'lightning': {
      const boltLen = bullet.height * 2.2;
      const boltX   = cx;
      const boltY   = bullet.y + bullet.height;
      const segments = 7;
      const segH    = boltLen / segments;
      const jitter  = 6 + (bullet.size ?? 5) * 0.6;

      ctx.shadowColor = '#ffffff'; ctx.shadowBlur = 14;
      ctx.strokeStyle = '#aaddff'; ctx.lineWidth  = 3;
      ctx.beginPath(); ctx.moveTo(boltX, boltY);
      for (let i = 1; i <= segments; i++) {
        ctx.lineTo(boltX + (i < segments ? (Math.random() - 0.5) * jitter * 2 : 0), boltY - i * segH);
      }
      ctx.stroke();

      ctx.shadowBlur  = 6;
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(boltX, boltY);
      for (let i = 1; i <= segments; i++) {
        ctx.lineTo(boltX + (i < segments ? (Math.random() - 0.5) * jitter : 0), boltY - i * segH);
      }
      ctx.stroke();

      ctx.shadowColor = '#ffffff'; ctx.shadowBlur = 20;
      ctx.fillStyle   = '#ffffff';
      ctx.beginPath();
      ctx.arc(boltX, boltY - boltLen, 3, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
  }
  ctx.restore();
}

export function drawEnemyBullet(ctx: CanvasRenderingContext2D, bullet: EnemyBullet) {
  ctx.save();

  // ── LASER BEAM ────────────────────────────────────────────────────────────
  if (bullet.isLaser) {
    const angle  = bullet.laserAngle  ?? 0;
    const length = bullet.laserLength ?? 400;
    const bw     = bullet.laserWidth  ?? 10;
    const ox = bullet.x, oy = bullet.y;
    const ex = ox + Math.cos(angle) * length;
    const ey = oy + Math.sin(angle) * length;

    const lifeRatio = (bullet.lifetime ?? 1) / (bullet.maxLifetime ?? 420);
    const alpha     = Math.min(1, lifeRatio * 3);

    // Outer glow
    ctx.strokeStyle  = bullet.color;
    ctx.lineWidth    = bw * 3;
    ctx.shadowColor  = bullet.color;
    ctx.shadowBlur   = 28;
    ctx.globalAlpha  = alpha * 0.25;
    ctx.lineCap      = 'round';
    ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ex, ey); ctx.stroke();

    // Mid glow
    ctx.globalAlpha = alpha * 0.6;
    ctx.lineWidth   = bw * 1.5;
    ctx.shadowBlur  = 14;
    ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ex, ey); ctx.stroke();

    // Core white beam
    ctx.globalAlpha  = alpha;
    ctx.strokeStyle  = '#ffffff';
    ctx.lineWidth    = Math.max(1.5, bw * 0.35);
    ctx.shadowColor  = '#ffffff';
    ctx.shadowBlur   = 8;
    ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ex, ey); ctx.stroke();

    // Origin flare
    const flareGrad = ctx.createRadialGradient(ox, oy, 0, ox, oy, bw * 2.5);
    flareGrad.addColorStop(0,   '#ffffff');
    flareGrad.addColorStop(0.4, bullet.color);
    flareGrad.addColorStop(1,   'rgba(0,0,0,0)');
    ctx.globalAlpha = alpha * 0.9;
    ctx.fillStyle   = flareGrad;
    ctx.beginPath();
    ctx.arc(ox, oy, bw * 2.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
    return;
  }

  // ── HOMING MISSILE ────────────────────────────────────────────────────────
  if (bullet.isHoming) {
    const cx  = bullet.x + bullet.width  / 2;
    const cy  = bullet.y + bullet.height / 2;
    const spd = Math.sqrt(bullet.vx * bullet.vx + bullet.vy * bullet.vy);
    const ang = Math.atan2(bullet.vy, bullet.vx);

    ctx.shadowColor = bullet.color;
    ctx.shadowBlur  = 16;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(ang + Math.PI / 2);

    // Body
    ctx.fillStyle = bullet.color;
    ctx.fillRect(-bullet.width / 2, -bullet.height / 2, bullet.width, bullet.height);

    // Nose cone
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -bullet.height / 2 - 4);
    ctx.lineTo(-bullet.width / 2,  -bullet.height / 2);
    ctx.lineTo( bullet.width / 2,  -bullet.height / 2);
    ctx.closePath();
    ctx.fill();

    // Engine flame
    const flameLen  = 8 + spd * 2;
    const flameGrad = ctx.createLinearGradient(0, bullet.height / 2, 0, bullet.height / 2 + flameLen);
    flameGrad.addColorStop(0, 'rgba(255,200,0,0.9)');
    flameGrad.addColorStop(1, 'rgba(255,50,0,0)');
    ctx.fillStyle = flameGrad;
    ctx.beginPath();
    ctx.moveTo(-bullet.width / 2 + 2,  bullet.height / 2);
    ctx.lineTo( bullet.width / 2 - 2,  bullet.height / 2);
    ctx.lineTo(0,                       bullet.height / 2 + flameLen);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.restore();
    return;
  }

  // ── NORMAL ENEMY BULLET ───────────────────────────────────────────────────
  ctx.shadowColor = bullet.color;
  ctx.shadowBlur  = 10;
  const cx   = bullet.x + bullet.width / 2;
  const grad = ctx.createLinearGradient(cx, bullet.y, cx, bullet.y + bullet.height);
  grad.addColorStop(0,   '#ffffff');
  grad.addColorStop(0.4, bullet.color);
  grad.addColorStop(1,   'rgba(255,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(bullet.x, bullet.y, bullet.width, bullet.height);

  ctx.restore();
}

export function drawParticle(ctx: CanvasRenderingContext2D, p: Particle) {
  const alpha = p.alpha * (1 - p.life / p.maxLife);
  ctx.save();
  ctx.globalAlpha = Math.max(0, alpha);
  ctx.shadowColor = p.color;
  ctx.shadowBlur  = p.size;
  ctx.fillStyle   = p.color;
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.size * (1 - p.life / p.maxLife * 0.5), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawPowerUp(ctx: CanvasRenderingContext2D, pu: PowerUp, tick: number) {
  ctx.save();
  const cx    = pu.x + pu.width  / 2;
  const cy    = pu.y + pu.height / 2;
  const pulse = 0.88 + Math.sin(tick * 0.12) * 0.12;

  if (pu.type === 'weaponUpgrade') {
    const hue = (tick * 3) % 360;
    const r   = 15 * pulse;

    for (let i = 0; i < 12; i++) {
      const h     = (hue + i * 30) % 360;
      const angle = (Math.PI * 2 * i) / 12 + tick * 0.05;
      ctx.shadowColor = `hsl(${h},100%,60%)`;
      ctx.shadowBlur  = 10;
      ctx.fillStyle   = `hsl(${h},100%,60%)`;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    const grad = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, 0, cx, cy, r);
    grad.addColorStop(0,    '#ffffff');
    grad.addColorStop(0.35, `hsl(${hue},100%,75%)`);
    grad.addColorStop(0.7,  `hsl(${(hue + 120) % 360},100%,55%)`);
    grad.addColorStop(1,    `hsl(${(hue + 240) % 360},100%,35%)`);
    ctx.shadowColor = `hsl(${hue},100%,70%)`; ctx.shadowBlur = 18;
    ctx.fillStyle   = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.82, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 4; ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 8px Arial, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('UP', cx, cy);

  } else if (pu.type === 'weaponSwitch') {
    const weaponColors: Record<string, string> = {
      laser: '#00ffff', spread: '#ff8800', plasma: '#ff00ff',
      missile: '#ffff00', lightning: '#aaddff',
    };
    const boxColor = pu.weaponType ? (weaponColors[pu.weaponType] ?? '#ffffff') : '#ffffff';
    const s = 14 * pulse;

    ctx.shadowColor = boxColor; ctx.shadowBlur = 16;
    ctx.fillStyle   = boxColor + '88';
    ctx.strokeStyle = boxColor; ctx.lineWidth = 2;
    ctx.fillRect(cx - s, cy - s * 0.7, s * 2, s * 1.7);
    ctx.strokeRect(cx - s, cy - s * 0.7, s * 2, s * 1.7);

    ctx.fillStyle = boxColor + 'bb';
    ctx.fillRect(cx - s * 1.1, cy - s * 0.7 - s * 0.4, s * 2.2, s * 0.4);
    ctx.strokeRect(cx - s * 1.1, cy - s * 0.7 - s * 0.4, s * 2.2, s * 0.4);

    ctx.fillStyle = '#ffffffcc';
    ctx.fillRect(cx - 2, cy - s * 0.7 - s * 0.4, 4, s * 2.1);
    ctx.fillRect(cx - s * 1.1, cy - s * 0.7 + s * 0.3, s * 2.2, 4);

    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5; ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.ellipse(cx - s * 0.5, cy - s * 0.7 - s * 0.2, s * 0.55, s * 0.35, -0.4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(cx + s * 0.5, cy - s * 0.7 - s * 0.2, s * 0.55, s * 0.35,  0.4, 0, Math.PI * 2);
    ctx.stroke();

    ctx.shadowBlur = 0; ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 7px Arial, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(pu.weaponType ? pu.weaponType.slice(0, 3).toUpperCase() : '???', cx, cy + s * 0.5);

  } else {
    const color = getPowerUpColor(pu.type);
    const label = getPowerUpLabel(pu.type, pu.weaponType);
    const r     = 15 * pulse;

    ctx.shadowColor = color; ctx.shadowBlur = 20;
    ctx.strokeStyle = color; ctx.lineWidth  = 2;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();

    const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    grd.addColorStop(0, color + 'cc');
    grd.addColorStop(1, color + '22');
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();

    ctx.shadowBlur = 0; ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${label.length > 4 ? 7 : 9}px Arial, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, cx, cy);
  }

  ctx.restore();
}

export function drawHUD(ctx: CanvasRenderingContext2D, state: GameState, tick: number, assets: Assets) {
  const { player, score, wave, level } = state;
  ctx.save();

  ctx.fillStyle = 'rgba(0,0,20,0.75)';
  ctx.fillRect(0, 0, CANVAS_WIDTH, 50);

  ctx.font = 'bold 13px Arial, sans-serif';
  ctx.fillStyle = '#aaddff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('HP', 14, 16);
  drawBar(ctx, 42, 8,  160, 14, player.hp     / player.maxHp,     '#44ff44', '#002200');
  ctx.fillText('SH', 14, 34);
  drawBar(ctx, 42, 26, 160, 10, player.shield / player.maxShield, '#4488ff', '#000033');

  const wx = CANVAS_WIDTH / 2;
  ctx.fillStyle = '#ffdd00'; ctx.textAlign = 'center';
  ctx.font = 'bold 14px Arial, sans-serif';
  ctx.fillText(`⚡ ${player.weapon.name.toUpperCase()} LVL ${player.weapon.level}`, wx, 16);
  ctx.fillStyle = '#7799bb'; ctx.font = '10px Arial, sans-serif';
  ctx.fillText('[SPACE] Fire  [B] Bomb', wx, 33);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#ffffff'; ctx.font = 'bold 16px Arial, sans-serif';
  ctx.fillText(`${score.toLocaleString()}`, CANVAS_WIDTH - 14, 16);
  ctx.fillStyle = '#7799bb'; ctx.font = '11px Arial, sans-serif';
  ctx.fillText(`LVL ${level ?? 1} – W${wave ?? 1}`, CANVAS_WIDTH - 14, 33);

  if (player.bombCount > 0) {
    ctx.textAlign = 'left'; ctx.fillStyle = '#ff6600';
    ctx.font = 'bold 13px Arial, sans-serif';
    if (assets.bomb && assets.bomb.complete && assets.bomb.naturalWidth > 0) {
      // Draw bomb image
      ctx.drawImage(assets.bomb, 27, CANVAS_HEIGHT - 35, 20, 20);
      ctx.fillText(`x${player.bombCount}`, 34, CANVAS_HEIGHT - 14);
    } else {
      // Fallback to emoji if image not loaded
      ctx.fillText(`x${player.bombCount}`, 14, CANVAS_HEIGHT - 14);
    }
  }

  const boss = state.enemies.find(e => e.type === 'boss' && e.active);
  if (boss) {
    const barH = 18;
    const by   = CANVAS_HEIGHT - barH - 6;
    ctx.fillStyle = 'rgba(0,0,20,0.85)';
    ctx.fillRect(0, by - 4, CANVAS_WIDTH, barH + 8);
    ctx.fillStyle = '#220000';
    ctx.fillRect(10, by, CANVAS_WIDTH - 20, barH);
    const ratio    = boss.hp / boss.maxHp;
    ctx.fillStyle  = ratio > 0.5 ? '#ff4444' : ratio > 0.25 ? '#ff8800' : '#ff0000';
    ctx.fillRect(10, by, (CANVAS_WIDTH - 20) * ratio, barH);
    ctx.strokeStyle = '#ff000066'; ctx.lineWidth = 1;
    ctx.strokeRect(10, by, CANVAS_WIDTH - 20, barH);
    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 12px Arial, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(`⚠ BOSS  ${boss.hp.toLocaleString()} / ${boss.maxHp.toLocaleString()}`, CANVAS_WIDTH / 2, by + barH / 2);
  }

  ctx.restore();
}

function drawBar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, ratio: number, fillColor: string, bgColor: string) {
  ctx.fillStyle = bgColor;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = fillColor;
  ctx.fillRect(x, y, w * Math.max(0, ratio), h);
  ctx.strokeStyle = '#ffffff22'; ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);
}

export function drawAsteroidWarning(ctx: CanvasRenderingContext2D, timer: number) {
  const alpha = Math.min(1, timer / 500) * Math.abs(Math.sin(timer * 0.01));
  ctx.save();
  ctx.fillStyle = `rgba(100,60,0,${alpha * 0.3})`;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  ctx.font = 'bold 64px Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = `rgba(255,160,40,${alpha})`; ctx.shadowColor = '#ff8800'; ctx.shadowBlur = 30;
  ctx.fillText('☄ ASTEROID FIELD ☄', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 20);
  ctx.font = 'bold 24px Arial, sans-serif';
  ctx.fillStyle = `rgba(255,220,100,${alpha})`; ctx.shadowBlur = 12;
  ctx.fillText('Survive the meteor storm!', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 48);
  ctx.restore();
}

export function drawAsteroidHUD(ctx: CanvasRenderingContext2D, timer: number) {
  const secs = Math.ceil(timer / 1000);
  ctx.save();
  ctx.font = 'bold 14px Arial, sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  ctx.fillStyle   = secs <= 5 ? '#ff4400' : '#ffaa44';
  ctx.shadowColor = secs <= 5 ? '#ff2200' : '#ff8800'; ctx.shadowBlur = 8;
  ctx.fillText(`☄ ${secs}s`, CANVAS_WIDTH - 14, 33);
  ctx.restore();
}

export function drawBossWarning(ctx: CanvasRenderingContext2D, timer: number) {
  const alpha = Math.min(1, timer / 500) * Math.abs(Math.sin(timer * 0.01));
  ctx.save();
  ctx.fillStyle = `rgba(180,0,0,${alpha * 0.25})`;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  ctx.font = 'bold 72px Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = `rgba(255,40,40,${alpha})`; ctx.shadowColor = '#ff0000'; ctx.shadowBlur = 30;
  ctx.fillText('⚠ WARNING ⚠', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 20);
  ctx.font = 'bold 28px Arial, sans-serif';
  ctx.fillStyle = `rgba(255,160,40,${alpha})`; ctx.shadowBlur = 15;
  ctx.fillText('BOSS INCOMING', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 48);
  ctx.restore();
}

export function drawWaveClear(ctx: CanvasRenderingContext2D, wave: number, timer: number) {
  const alpha = Math.min(1, timer / 300);
  ctx.save();
  ctx.fillStyle = `rgba(0,20,60,${alpha * 0.5})`;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  ctx.font = 'bold 52px Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = `rgba(100,220,255,${alpha})`; ctx.shadowColor = '#00aaff'; ctx.shadowBlur = 20;
  ctx.fillText(`WAVE ${wave} CLEAR!`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 16);
  ctx.font = '22px Arial, sans-serif';
  ctx.fillStyle = `rgba(200,240,255,${alpha})`; ctx.shadowBlur = 8;
  ctx.fillText('Incoming formation...', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 38);
  ctx.restore();
}

export function drawMenu(ctx: CanvasRenderingContext2D, highScore: number, tick: number) {
  ctx.save();
  ctx.font = 'bold 64px Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#00ccff'; ctx.shadowColor = '#0088ff'; ctx.shadowBlur = 30;
  ctx.fillText('VOID STRIKER', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 140);
  ctx.font = '18px Arial, sans-serif'; ctx.fillStyle = '#aaddff'; ctx.shadowBlur = 10;
  ctx.fillText('Space Shooter', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 85);

  ctx.shadowBlur = 0; ctx.font = '15px Arial, sans-serif'; ctx.fillStyle = '#88aacc';
  ['WASD / Arrow Keys — Move', 'SPACE — Fire', 'B — Bomb (massive area damage)', 'Collect drops to switch weapons']
    .forEach((line, i) => ctx.fillText(line, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 30 + i * 26));

  const blinkAlpha = (Math.sin(tick * 0.08) + 1) / 2;
  ctx.globalAlpha = 0.5 + blinkAlpha * 0.5;
  ctx.font = 'bold 26px Arial, sans-serif'; ctx.fillStyle = '#ffdd00';
  ctx.shadowColor = '#ffaa00'; ctx.shadowBlur = 18;
  ctx.fillText('PRESS ENTER OR CLICK TO START', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 105);

  ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  if (highScore > 0) {
    ctx.font = '14px Arial, sans-serif'; ctx.fillStyle = '#aaaacc';
    ctx.fillText(`High Score: ${highScore.toLocaleString()}`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 145);
  }
  ctx.restore();
}

export function drawLevelWarp(
  ctx: CanvasRenderingContext2D,
  player: Player,
  assets: { player: HTMLImageElement },
  warpTimer: number,
  warpNextLevel: number,
  tick: number
) {
  const WARP_DURATION = 2400;
  const progress = 1 - warpTimer / WARP_DURATION;
  const cx = CANVAS_WIDTH / 2;

  ctx.save();
  const overlayAlpha = Math.min(0.85, progress * 1.4);
  ctx.fillStyle = `rgba(0,5,20,${overlayAlpha})`;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  const lineAlpha = Math.min(1, progress * 2);
  ctx.save();
  ctx.translate(cx, CANVAS_HEIGHT / 2);
  for (let i = 0; i < 60; i++) {
    const angle  = (Math.PI * 2 * i) / 60;
    const innerR = 40 + progress * 80;
    const outerR = 200 + progress * 600;
    const hue    = 200 + i * 3;
    ctx.strokeStyle = `hsla(${hue},100%,70%,${lineAlpha * (0.4 + Math.sin(tick * 0.2 + i) * 0.2)})`;
    ctx.lineWidth   = 1 + progress * 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(angle) * innerR, Math.sin(angle) * innerR);
    ctx.lineTo(Math.cos(angle) * outerR, Math.sin(angle) * outerR);
    ctx.stroke();
  }
  ctx.restore();

  const eased    = progress < 0.4 ? progress * 0.3 : 0.12 + (progress - 0.4) * 2.3;
  const shipY    = player.y - eased * (player.y + player.height + 40);
  const shipX    = cx - player.width / 2;
  const stretchY = 1 + Math.max(0, progress - 0.35) * 5;
  const stretchX = 1 / Math.sqrt(stretchY);
  const trailLen = 30 + progress * 180;

  const trailGrad = ctx.createLinearGradient(0, shipY + player.height, 0, shipY + player.height + trailLen);
  trailGrad.addColorStop(0,   `rgba(100,200,255,${lineAlpha * 0.9})`);
  trailGrad.addColorStop(0.5, `rgba(60,120,255,${lineAlpha * 0.5})`);
  trailGrad.addColorStop(1,   'rgba(0,0,100,0)');
  ctx.fillStyle = trailGrad;
  ctx.fillRect(shipX + player.width * 0.2, shipY + player.height, player.width * 0.6, trailLen);

  ctx.save();
  ctx.translate(shipX + player.width / 2, shipY + player.height / 2);
  ctx.scale(stretchX, stretchY);
  if (assets.player.complete && assets.player.naturalWidth > 0) {
    ctx.drawImage(assets.player, -player.width / 2, -player.height / 2, player.width, player.height);
  } else {
    ctx.fillStyle = '#00ccff';
    ctx.fillRect(-player.width / 2, -player.height / 2, player.width, player.height);
  }
  ctx.restore();

  const textAlpha = progress < 0.15 ? progress / 0.15 : progress > 0.75 ? (1 - progress) / 0.25 : 1;
  ctx.save();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.shadowColor = '#00aaff'; ctx.shadowBlur = 25; ctx.globalAlpha = textAlpha;
  ctx.font = 'bold 58px Arial, sans-serif'; ctx.fillStyle = '#ffffff';
  ctx.fillText('LEVEL CLEAR!', cx, CANVAS_HEIGHT / 2 - 60);
  ctx.font = 'bold 28px Arial, sans-serif'; ctx.fillStyle = '#88ddff'; ctx.shadowBlur = 12;
  ctx.fillText(`Entering Level ${warpNextLevel}...`, cx, CANVAS_HEIGHT / 2);
  ctx.restore();

  if (progress > 0.82) {
    const flashAlpha = (progress - 0.82) / 0.18;
    ctx.fillStyle = `rgba(180,220,255,${flashAlpha * 0.85})`;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  }
  ctx.restore();
}

export function drawGameOver(ctx: CanvasRenderingContext2D, score: number, highScore: number, wave: number, tick: number) {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  ctx.font = 'bold 72px Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ff2244'; ctx.shadowColor = '#ff0000'; ctx.shadowBlur = 35;
  ctx.fillText('GAME OVER', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 90);
  ctx.shadowBlur = 0; ctx.font = '22px Arial, sans-serif'; ctx.fillStyle = '#ffffff';
  ctx.fillText(`Score: ${score.toLocaleString()}`,  CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 20);
  ctx.fillText(`Wave Reached: ${wave}`,              CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 16);
  if (score >= highScore && score > 0) {
    ctx.fillStyle = '#ffdd00';
    ctx.fillText('🏆 NEW HIGH SCORE!', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 52);
  } else {
    ctx.fillStyle = '#aaaacc';
    ctx.fillText(`High Score: ${highScore.toLocaleString()}`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 52);
  }
  const blinkAlpha = (Math.sin(tick * 0.08) + 1) / 2;
  ctx.globalAlpha = 0.5 + blinkAlpha * 0.5;
  ctx.font = 'bold 22px Arial, sans-serif'; ctx.fillStyle = '#ffdd00';
  ctx.fillText('PRESS ENTER OR CLICK TO RETRY', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 100);
  ctx.restore();
}

export function drawVictory(ctx: CanvasRenderingContext2D, score: number, highScore: number, tick: number) {
  ctx.save();
  ctx.fillStyle = 'rgba(0,10,30,0.75)';
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  ctx.font = 'bold 60px Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffdd00'; ctx.shadowColor = '#ffaa00'; ctx.shadowBlur = 35;
  ctx.fillText('VICTORY!', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 90);
  ctx.shadowBlur = 0; ctx.font = '22px Arial, sans-serif';
  ctx.fillStyle = '#aaffaa';
  ctx.fillText('All waves defeated!', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 30);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(`Final Score: ${score.toLocaleString()}`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 14);
  if (score >= highScore && score > 0) {
    ctx.fillStyle = '#ffdd00';
    ctx.fillText('🏆 NEW HIGH SCORE!', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 50);
  }
  const blinkAlpha = (Math.sin(tick * 0.08) + 1) / 2;
  ctx.globalAlpha = 0.5 + blinkAlpha * 0.5;
  ctx.font = 'bold 22px Arial, sans-serif'; ctx.fillStyle = '#00ccff';
  ctx.fillText('PRESS ENTER OR CLICK TO PLAY AGAIN', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 100);
  ctx.restore();
}
