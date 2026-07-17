import { initAssets } from "./assets";
import { playCatchSound, playHurtSound, playPortalSound, playBGM, stopBGM } from "./audio";
import { ThreeRenderer, WORLD_W, WORLD_H } from "./ThreeRenderer";
import { LEVELSConfig } from "./levels";
import {
  checkCol,
  Particle,
  PowerUp,
  Player,
  Obstacle,
  FishTarget,
  GreenFish,
  Crab,
  PirateBoat,
  Shark,
  KrakenTentacle,
  KrakenBoss,
  Portal,
} from "./entities";

export class GameEngine {
  constructor(canvas, setGameUI, setStats) {
    initAssets();
    this.width = WORLD_W;
    this.height = WORLD_H;
    this.reqFrame = 0;
    this.lastTime = 0;
    this.keys = {};
    this.moveVector = { x: 0, y: 0 };
    this.level = 1;
    this.lives = 3;
    this.score = 0;
    this.fishCollected = 0;
    this.fishRequired = 20;
    this.totalFish = 0;
    this.maxLevelReached = 1;
    this.gameState = "START";
    this.obstacles = [];
    this.targets = [];
    this.enemies = [];
    this.portal = null;
    this.boss = null;
    this.particles = [];
    this.powerUps = [];
    this.powerUpSpawnTimer = 5;

    this.setGameStateUI = setGameUI;
    this.setStatsUI = setStats;
    this.player = new Player(this.width / 2 - 10, this.height / 2 + 100);

    this.renderer = new ThreeRenderer(canvas);

    this.handleKeyDown = (ev) => {
      this.keys[ev.key] = true;
    };
    this.handleKeyUp = (ev) => {
      this.keys[ev.key] = false;
    };
    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("keyup", this.handleKeyUp);

    this.loop = this.loop.bind(this);
  }

  setMoveVector(x, y) {
    this.moveVector.x = x;
    this.moveVector.y = y;
  }

  destroy() {
    window.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("keyup", this.handleKeyUp);
    this.stop();
    this.renderer.dispose();
  }

  setGameState(state) {
    if (state === "PLAYING" && this.gameState !== "PLAYING") {
      this.startNewGame();
    }
  }

  startNewGame() {
    this.level = 1;
    this.lives = 3;
    this.score = 0;
    this.totalFish = 0;
    this.maxLevelReached = 1;
    this.gameState = "PLAYING";
    this.startLevel(this.level);
    this.lastTime = performance.now();
    this.reqFrame = requestAnimationFrame(this.loop);
  }

  stop() {
    stopBGM();
    if (this.reqFrame) cancelAnimationFrame(this.reqFrame);
    this.reqFrame = 0;
  }

  updateStatsUI() {
    this.setStatsUI({
      level: this.level,
      lives: this.lives,
      score: this.score,
      fishCollected: this.fishCollected,
      fishRequired: this.fishRequired,
      totalFish: this.totalFish,
      maxLevelReached: this.maxLevelReached,
    });
  }

  startLevel(lvl) {
    playBGM(lvl);
    this.maxLevelReached = Math.max(this.maxLevelReached, lvl);
    const cfg = LEVELSConfig[lvl - 1];
    if (!cfg) return;
    this.fishRequired = cfg.fishCount;
    this.fishCollected = 0;
    this.player = new Player(this.width / 2 - 10, this.height - 80);
    this.obstacles = [];
    this.enemies = [];
    this.targets = [];
    this.portal = null;
    this.boss = null;

    const findSpawn = (w, h) => {
      for (let i = 0; i < 200; i++) {
        let x = Math.random() * (this.width - w - 80) + 40;
        let y = Math.random() * (this.height - h - 20) + 10;
        let valid = true;
        if (y > this.height - 120 && x > this.width / 2 - 60 && x < this.width / 2 + 60) valid = false;
        if (cfg.bs && y < 100 && x > this.width / 2 - 100 && x < this.width / 2 + 100) valid = false;
        let r = { x, y, w, h };
        for (let o of this.obstacles) if (checkCol(r, o.getRect())) valid = false;
        if (valid) return { x, y };
      }
      return {
        x: Math.random() * (this.width - w - 80) + 40,
        y: Math.random() * (this.height - h),
      };
    };

    for (let i = 0; i < cfg.r; i++) {
      let pt = findSpawn(48, 48);
      this.obstacles.push(new Obstacle(pt.x, pt.y, "ROCK"));
    }
    for (let i = 0; i < cfg.b; i++) {
      let pt = findSpawn(30, 36);
      this.obstacles.push(new Obstacle(pt.x, pt.y, "BARREL"));
    }
    for (let i = 0; i < cfg.cr; i++) {
      let pt = findSpawn(48, 48);
      this.obstacles.push(new Obstacle(pt.x, pt.y, "CORAL"));
    }
    for (let i = 0; i < cfg.g; i++) {
      let pt = findSpawn(36, 30);
      this.enemies.push(new GreenFish(pt.x, pt.y));
    }
    for (let i = 0; i < cfg.c; i++) {
      let pt = findSpawn(30, 24);
      this.enemies.push(new Crab(pt.x, pt.y));
    }
    for (let i = 0; i < cfg.p; i++) {
      let pt = findSpawn(46, 46);
      this.enemies.push(new PirateBoat(pt.x, pt.y));
    }
    for (let i = 0; i < cfg.s; i++) {
      let pt = findSpawn(54, 27);
      this.enemies.push(new Shark(pt.x, pt.y));
    }
    for (let i = 0; i < cfg.fishCount; i++) {
      let pt = findSpawn(32, 24);
      this.targets.push(new FishTarget(pt.x, pt.y, cfg.fishType, cfg.fishPts));
    }
    if (cfg.bs) {
      this.boss = new KrakenBoss(this.width / 2 - 120, 20);
      let bossBlocker = new Obstacle(this.width / 2 - 120, 20, "ROCK");
      bossBlocker.w = 240;
      bossBlocker.h = 90;
      bossBlocker.invisible = true;
      this.obstacles.push(bossBlocker);
    }
    this.updateStatsUI();
  }

  enterPortal() {
    this.score += this.level * 100;
    this.score += this.lives * 50;
    if (this.level >= 5) {
      this.gameState = "VICTORY";
      this.setGameStateUI("VICTORY");
      this.updateStatsUI();
      this.stop();
    } else {
      this.level++;
      this.startLevel(this.level);
    }
  }

  loop(time) {
    if (this.gameState !== "PLAYING") return;
    this.reqFrame = requestAnimationFrame(this.loop);
    let dt = (time - this.lastTime) / 1000;
    this.lastTime = time;
    if (dt > 0.1) dt = 0.1;

    this.player.update(dt, this);
    for (let o of this.obstacles) o.update();
    if (this.boss) this.boss.update(dt, this);

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      let en = this.enemies[i];
      en.update(dt, this);
      if (en.dead) {
        this.enemies.splice(i, 1);
        continue;
      }
      if (
        en.damage > 0 &&
        this.player.invulnTimer <= 0 &&
        this.player.activePowerUps.shield <= 0 &&
        checkCol(en.getRect(), this.player.getRect())
      ) {
        if (en instanceof KrakenTentacle && !en.solid) continue; // safety for tentacle warning state
        this.player.invulnTimer = 2.0;
        this.lives -= en.damage;
        playHurtSound();
        this.updateStatsUI();
        if (this.lives <= 0) {
          this.gameState = "GAME_OVER";
          this.setGameStateUI("GAME_OVER");
          this.stop();
          return;
        }
      }
    }

    for (let i = this.targets.length - 1; i >= 0; i--) {
      let t = this.targets[i];
      if (this.player.activePowerUps.magnet > 0) {
        let dx = this.player.x + this.player.w / 2 - (t.x + t.w / 2);
        let dy = this.player.y + this.player.h / 2 - (t.y + t.h / 2);
        let dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 200) {
          t.x += (dx / dist) * 250 * dt;
          t.y += (dy / dist) * 250 * dt;
        }
      }
      t.update(dt, this);
      if (checkCol(t.getRect(), this.player.getRect())) {
        this.score += t.points;
        this.fishCollected++;
        this.totalFish++;
        this.targets.splice(i, 1);
        playCatchSound();
        for (let p = 0; p < 15; p++) {
          this.particles.push(
            new Particle(
              t.x + t.w / 2,
              t.y + t.h / 2,
              (Math.random() - 0.5) * 150,
              (Math.random() - 0.5) * 150 - 50,
              0.3 + Math.random() * 0.4,
              Math.random() > 0.5 ? "#ffffff" : "#0CA4FF",
              2 + Math.random() * 3
            )
          );
        }
        this.updateStatsUI();
        if (this.fishCollected >= this.fishRequired && !this.portal) {
          this.portal = new Portal(this.width / 2 - 32, this.height / 2 - 32);
          playPortalSound();
        }
      }
    }

    if (this.portal) {
      this.portal.update(dt);
      if (checkCol(this.portal.getRect(), this.player.getRect())) {
        playPortalSound();
        this.enterPortal();
        return;
      }
    }

    this.powerUpSpawnTimer -= dt;
    if (this.powerUpSpawnTimer <= 0) {
      this.powerUpSpawnTimer = 10 + Math.random() * 15;
      const types = ["SPEED", "MAGNET", "SHIELD"];
      let type = types[Math.floor(Math.random() * types.length)];
      let px = Math.random() * (this.width - 200) + 100;
      let py = Math.random() * (this.height - 200) + 100;
      this.powerUps.push(new PowerUp(px, py, type));
    }
    for (let i = this.powerUps.length - 1; i >= 0; i--) {
      this.powerUps[i].update(dt);
      if (checkCol(this.powerUps[i].getRect(), this.player.getRect())) {
        let p = this.powerUps[i];
        if (p.type === "SPEED") this.player.activePowerUps.speed = 8;
        if (p.type === "MAGNET") this.player.activePowerUps.magnet = 10;
        if (p.type === "SHIELD") this.player.activePowerUps.shield = 8;
        playCatchSound();
        this.powerUps.splice(i, 1);
      }
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      this.particles[i].update(dt);
      if (this.particles[i].life <= 0) this.particles.splice(i, 1);
    }

    this.renderer.render(this, dt, time);
  }
}