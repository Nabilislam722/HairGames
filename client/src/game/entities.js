// Pure simulation classes — no rendering code. update() logic is ported
// verbatim from the original canvas GameEngine so gameplay feel/balance is
// unchanged. Rendering reads these fields (x, y, angle, dirRight, type, ...)
// every frame in ThreeRenderer.

export function checkCol(r1, r2) {
  return (
    r1.x < r2.x + r2.w &&
    r1.x + r1.w > r2.x &&
    r1.y < r2.y + r2.h &&
    r1.y + r1.h > r2.y
  );
}

export class Entity {
  constructor(x, y, w, h) {
    this.dead = false;
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
  }
  getRect() {
    return { x: this.x, y: this.y, w: this.w, h: this.h };
  }
}

export class Particle {
  constructor(x, y, vx, vy, life, color, size) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.life = life;
    this.maxLife = life;
    this.color = color;
    this.size = size;
  }
  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.life -= dt;
  }
}

export class PowerUp extends Entity {
  constructor(x, y, type) {
    super(x, y, 24, 24);
    this.timer = 0;
    this.pulseTimer = 0;
    this.type = type;
  }
  update(dt) {
    this.timer += dt;
    this.pulseTimer += dt * 5;
  }
}

export class Player extends Entity {
  constructor(x, y) {
    super(x, y, 36, 36);
    this.speed = 280;
    this.invulnTimer = 0;
    this.dirRight = true;
    this.activePowerUps = {
      speed: 0,
      magnet: 0,
      shield: 0,
    };
  }
  update(dt, e) {
    if (this.invulnTimer > 0) this.invulnTimer -= dt;
    this.activePowerUps.speed = Math.max(0, this.activePowerUps.speed - dt);
    this.activePowerUps.magnet = Math.max(0, this.activePowerUps.magnet - dt);
    this.activePowerUps.shield = Math.max(0, this.activePowerUps.shield - dt);
    let currentSpeed = this.speed;
    if (this.activePowerUps.speed > 0) currentSpeed *= 1.8;
    let dx = 0;
    let dy = 0;
    if (e.keys["w"] || e.keys["W"] || e.keys["ArrowUp"]) dy -= 1;
    if (e.keys["s"] || e.keys["S"] || e.keys["ArrowDown"]) dy += 1;
    if (e.keys["a"] || e.keys["A"] || e.keys["ArrowLeft"]) dx -= 1;
    if (e.keys["d"] || e.keys["D"] || e.keys["ArrowRight"]) dx += 1;

    // Touch/virtual joystick input — merges with keyboard so both can be
    // used interchangeably (or together) without forking the movement code.
    if (e.moveVector) {
      dx += e.moveVector.x;
      dy += e.moveVector.y;
    }

    if (dx !== 0 && dy !== 0) {
      const len = Math.sqrt(dx * dx + dy * dy);
      dx /= len;
      dy /= len;
    } else if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
      // joystick can produce magnitude up to 1 already, but keyboard+touch
      // combined could exceed 1 on a single axis; clamp defensively.
      const len = Math.max(Math.abs(dx), Math.abs(dy));
      dx /= len;
      dy /= len;
    }

    if (dx > 0) this.dirRight = true;
    else if (dx < 0) this.dirRight = false;
    const blockCheck = (rect) => {
      for (let obs of e.obstacles) {
        if (obs.solid && checkCol(rect, obs.getRect())) return obs.getRect();
      }
      for (let en of e.enemies) {
        // Active tentacles act as obstacles
        if (en.solid && checkCol(rect, en.getRect())) return en.getRect();
      }
      return null;
    };
    let moveX = dx * currentSpeed * dt;
    this.x += moveX;
    if (this.x < 40) this.x = 40;
    if (this.x + this.w > e.width - 40) this.x = e.width - 40 - this.w;
    let bX = blockCheck(this.getRect());
    if (bX) {
      if (moveX > 0) this.x = bX.x - this.w;
      else if (moveX < 0) this.x = bX.x + bX.w;
    }
    let moveY = dy * currentSpeed * dt;
    this.y += moveY;
    if (this.y < 0) this.y = 0;
    if (this.y + this.h > e.height) this.y = e.height - this.h;
    let bY = blockCheck(this.getRect());
    if (bY) {
      if (moveY > 0) this.y = bY.y - this.h;
      else if (moveY < 0) this.y = bY.y + bY.h;
    }
    if ((dx !== 0 || dy !== 0) && Math.random() < 0.3) {
      e.particles.push(
        new Particle(
          this.x + this.w / 2 + (this.dirRight ? -10 : 10),
          this.y + this.h - 5,
          (Math.random() - 0.5) * 20,
          (Math.random() - 0.5) * 20,
          0.5 + Math.random() * 0.5,
          "rgba(255, 255, 255, 0.6)",
          2 + Math.random() * 2
        )
      );
    }
  }
}

export class Obstacle extends Entity {
  constructor(x, y, type) {
    super(x, y, type === "BARREL" ? 32 : 48, type === "BARREL" ? 40 : 48);
    this.solid = true;
    this.invisible = false;
    this.type = type;
  }
  update() {}
}

function wanderUpdate(self, dt, e) {
  self.timer += dt;
  if (self.timer > Math.random() * 2 + 1) {
    self.timer = 0;
    let angleDiff = (Math.random() - 0.5) * Math.PI * 0.8;
    self.targetAngle += angleDiff;
  }
  let mx = self.dx * self.speed * dt;
  let my = self.dy * self.speed * dt;
  let nextX = self.x + mx;
  let nextY = self.y + my;
  let colX = false;
  let colY = false;
  if (nextX < 40) {
    nextX = 40;
    colX = true;
  }
  if (nextX + self.w > e.width - 40) {
    nextX = e.width - 40 - self.w;
    colX = true;
  }
  for (let obs of e.obstacles) {
    if (
      obs.solid &&
      checkCol({ x: nextX, y: self.y, w: self.w, h: self.h }, obs.getRect()) &&
      !checkCol({ x: self.x, y: self.y, w: self.w, h: self.h }, obs.getRect())
    ) {
      colX = true;
      nextX = self.x;
      break;
    }
  }
  if (nextY < 0) {
    nextY = 0;
    colY = true;
  }
  if (nextY + self.h > e.height) {
    nextY = e.height - self.h;
    colY = true;
  }
  for (let obs of e.obstacles) {
    if (
      obs.solid &&
      checkCol({ x: self.x, y: nextY, w: self.w, h: self.h }, obs.getRect()) &&
      !checkCol({ x: self.x, y: self.y, w: self.w, h: self.h }, obs.getRect())
    ) {
      colY = true;
      nextY = self.y;
      break;
    }
  }
  if (colX) self.dx = -self.dx;
  if (colY) self.dy = -self.dy;
  if (colX || colY) {
    self.angle = Math.atan2(self.dy, self.dx);
    self.targetAngle = self.angle;
  }
  const turnSpeed = 2.0;
  let diff = self.targetAngle - self.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  self.angle += Math.sign(diff) * Math.min(Math.abs(diff), turnSpeed * dt);
  while (self.angle > Math.PI) self.angle -= Math.PI * 2;
  while (self.angle < -Math.PI) self.angle += Math.PI * 2;
  self.dx = Math.cos(self.angle);
  self.dy = Math.sin(self.angle);
  self.dirRight = self.dx > 0;
  self.x = nextX;
  self.y = nextY;
}

export class FishTarget extends Entity {
  constructor(x, y, type, pts) {
    let w = 48;
    let h = 36;
    super(x, y, w, h);
    this.timer = 0;
    this.speed = 70;
    this.type = type;
    this.points = pts;
    this.angle = Math.random() * Math.PI * 2;
    this.targetAngle = this.angle;
    this.dx = Math.cos(this.angle);
    this.dy = Math.sin(this.angle);
    this.dirRight = this.dx > 0;
  }
  update(dt, e) {
    wanderUpdate(this, dt, e);
  }
}

export class Enemy extends Entity {
  constructor(...args) {
    super(...args);
    this.damage = 1;
  }
}

export class GreenFish extends Enemy {
  constructor(x, y) {
    super(x, y, 36, 30);
    this.speed = 75;
    this.timer = 0;
    this.angle = Math.random() * Math.PI * 2;
    this.targetAngle = this.angle;
    this.dx = Math.cos(this.angle);
    this.dy = Math.sin(this.angle);
    this.dirRight = this.dx > 0;
  }
  update(dt, e) {
    wanderUpdate(this, dt, e);
  }
}

export class Crab extends Enemy {
  constructor(x, y) {
    super(x, y, 30, 24);
    this.speed = 160;
    this.dx = Math.random() > 0.5 ? 1 : -1;
    this.dy = 0;
    this.timer = 0;
  }
  update(dt, e) {
    this.timer += dt;
    if (this.timer > 1.5) {
      this.timer = 0;
      if (Math.random() > 0.3) {
        this.dx = Math.random() > 0.5 ? 1 : -1;
        this.dy = 0;
      } else {
        this.dy = Math.random() > 0.5 ? 1 : -1;
        this.dx = 0;
      }
    }
    let targetX = this.x + this.dx * this.speed * dt;
    let targetY = this.y + this.dy * this.speed * dt;
    let col = false;
    for (let obs of e.obstacles) {
      if (
        obs.solid &&
        checkCol({ x: targetX, y: targetY, w: this.w, h: this.h }, obs.getRect())
      ) {
        col = true;
        break;
      }
    }
    if (targetX < 40) {
      targetX = 40;
      col = true;
    }
    if (targetX + this.w > e.width - 40) {
      targetX = e.width - 40 - this.w;
      col = true;
    }
    if (targetY < 0) {
      targetY = 0;
      col = true;
    }
    if (targetY + this.h > e.height) {
      targetY = e.height - this.h;
      col = true;
    }
    if (col) {
      this.dx *= -1;
      this.dy *= -1;
    } else {
      this.x = targetX;
      this.y = targetY;
    }
  }
}

function chaseUpdate(self, dt, e, speed) {
  let mx = self.dx * speed * dt;
  let my = self.dy * speed * dt;
  let nextX = self.x + mx;
  let nextY = self.y + my;
  let colX = false;
  let colY = false;
  if (nextX < 40) {
    nextX = 40;
    colX = true;
  }
  if (nextX + self.w > e.width - 40) {
    nextX = e.width - 40 - self.w;
    colX = true;
  }
  for (let obs of e.obstacles) {
    if (
      obs.solid &&
      checkCol({ x: nextX, y: self.y, w: self.w, h: self.h }, obs.getRect()) &&
      !checkCol({ x: self.x, y: self.y, w: self.w, h: self.h }, obs.getRect())
    ) {
      colX = true;
      nextX = self.x;
      break;
    }
  }
  if (nextY < 0) {
    nextY = 0;
    colY = true;
  }
  if (nextY + self.h > e.height) {
    nextY = e.height - self.h;
    colY = true;
  }
  for (let obs of e.obstacles) {
    if (
      obs.solid &&
      checkCol({ x: self.x, y: nextY, w: self.w, h: self.h }, obs.getRect()) &&
      !checkCol({ x: self.x, y: self.y, w: self.w, h: self.h }, obs.getRect())
    ) {
      colY = true;
      nextY = self.y;
      break;
    }
  }
  if (colX) self.dx = -self.dx;
  if (colY) self.dy = -self.dy;
  if (colX || colY) {
    self.angle = Math.atan2(self.dy, self.dx);
    self.targetAngle = self.angle;
  }
  self.x = nextX;
  self.y = nextY;
  return colX || colY;
}

export class PirateBoat extends Enemy {
  constructor(x, y) {
    super(x, y, 46, 46);
    this.speed = 120;
    this.timer = 0;
    this.angle = Math.random() * Math.PI * 2;
    this.targetAngle = this.angle;
    this.dx = Math.cos(this.angle);
    this.dy = Math.sin(this.angle);
    this.dirRight = this.dx > 0;
  }
  update(dt, e) {
    let pdx = e.player.x - this.x;
    let pdy = e.player.y - this.y;
    let dist = Math.sqrt(pdx * pdx + pdy * pdy);
    if (dist < 150) {
      this.targetAngle = Math.atan2(pdy, pdx);
    } else {
      this.timer += dt;
      if (this.timer > 3) {
        this.timer = 0;
        this.targetAngle += (Math.random() - 0.5) * Math.PI;
      }
    }
    let diff = this.targetAngle - this.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const turnSpeed = 2.0;
    this.angle += Math.sign(diff) * Math.min(Math.abs(diff), turnSpeed * dt);
    while (this.angle > Math.PI) this.angle -= Math.PI * 2;
    while (this.angle < -Math.PI) this.angle += Math.PI * 2;
    this.dx = Math.cos(this.angle);
    this.dy = Math.sin(this.angle);
    this.dirRight = this.dx > 0;
    chaseUpdate(this, dt, e, this.speed);
  }
}

export class Shark extends Enemy {
  constructor(x, y) {
    super(x, y, 54, 27);
    this.speed = 90;
    this.state = "WANDER";
    this.dashTimer = 0;
    this.angle = Math.random() * Math.PI * 2;
    this.targetAngle = this.angle;
    this.dx = Math.cos(this.angle);
    this.dy = Math.sin(this.angle);
    this.dirRight = this.dx > 0;
  }
  update(dt, e) {
    if (this.state === "WANDER") {
      this.dashTimer -= dt;
      let pdx = e.player.x - this.x;
      let pdy = e.player.y - this.y;
      if (this.dashTimer <= 0 && Math.sqrt(pdx * pdx + pdy * pdy) < 300) {
        this.state = "DASH";
        this.dashTimer = 1.0;
        this.targetAngle = Math.atan2(pdy, pdx);
      } else if (Math.random() < 0.01) {
        this.targetAngle += (Math.random() - 0.5) * Math.PI;
      }
    } else {
      this.dashTimer -= dt;
      if (this.dashTimer <= 0) {
        this.state = "WANDER";
        this.dashTimer = 2.0;
      }
    }
    let diff = this.targetAngle - this.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const turnSpeed = this.state === "DASH" ? 5.0 : 2.0;
    this.angle += Math.sign(diff) * Math.min(Math.abs(diff), turnSpeed * dt);
    while (this.angle > Math.PI) this.angle -= Math.PI * 2;
    while (this.angle < -Math.PI) this.angle += Math.PI * 2;
    this.dx = Math.cos(this.angle);
    this.dy = Math.sin(this.angle);
    this.dirRight = this.dx > 0;
    const curSpeed = this.state === "DASH" ? 400 : this.speed;
    const collided = chaseUpdate(this, dt, e, curSpeed);
    if (collided && this.state === "DASH") this.dashTimer = 0;
  }
}

export class KrakenTentacle extends Enemy {
  constructor(x, y) {
    super(x, y, 48, 60);
    this.state = "WARN";
    this.timer = 0;
    this.solid = false;
    this.damage = 0; // warning phase deals no damage
  }
  update(dt) {
    this.timer += dt;
    if (this.state === "WARN") {
      if (this.timer > 1.5) {
        this.state = "ACTIVE";
        this.damage = 1;
        this.solid = true;
        this.timer = 0;
      }
    } else if (this.timer > 3.0) {
      this.dead = true;
    }
  }
}

export class KrakenBoss extends Entity {
  constructor(x, y) {
    super(x, y, 240, 90);
    this.tentacleTimer = 0;
    this.animTimer = 0;
    this.baseX = x;
    this.baseY = y;
  }
  update(dt, e) {
    this.tentacleTimer += dt;
    this.animTimer += dt;
    this.x = this.baseX + Math.sin(this.animTimer * 1.2) * 60;
    this.y = this.baseY + Math.cos(this.animTimer * 1.8) * 15;
    let blocker = e.obstacles.find((o) => o.w === 240 && o.h === 90);
    if (blocker) {
      blocker.x = this.x;
      blocker.y = this.y;
    }
    if (this.tentacleTimer > 2.5) {
      this.tentacleTimer = 0;
      for (let i = 0; i < 4; i++) {
        let tx = Math.max(0, Math.min(e.width - 32, e.player.x + (Math.random() - 0.5) * 250));
        let ty = Math.max(0, Math.min(e.height - 40, e.player.y + (Math.random() - 0.5) * 250));
        e.enemies.push(new KrakenTentacle(tx, ty));
      }
    }
  }
}

export class Portal extends Entity {
  constructor(x, y) {
    super(x, y, 64, 64);
    this.timer = 0;
  }
  update(dt) {
    this.timer += dt;
  }
}