import { ASSETS, initAssets } from "./assets";
import { playCatchSound, playHurtSound, playPortalSound, playBGM, stopBGM } from "./audio";
function checkCol(r1, r2) {
    return (r1.x < r2.x + r2.w &&
        r1.x + r1.w > r2.x &&
        r1.y < r2.y + r2.h &&
        r1.y + r1.h > r2.y);
}
class Entity {
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
class Particle {
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
    draw(ctx) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, this.life / this.maxLife);
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}
class PowerUp extends Entity {
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
    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        const pulse = Math.sin(this.pulseTimer) * 2;
        let asset = ASSETS.icon_speed;
        if (this.type === "MAGNET")
            asset = ASSETS.icon_net;
        if (this.type === "SHIELD")
            asset = ASSETS.icon_shield;
        const size = 32;
        ctx.drawImage(asset, this.w / 2 - size / 2, this.h / 2 - size / 2 + pulse, size, size);
        ctx.restore();
    }
}
class Player extends Entity {
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
        if (this.invulnTimer > 0)
            this.invulnTimer -= dt;
        this.activePowerUps.speed = Math.max(0, this.activePowerUps.speed - dt);
        this.activePowerUps.magnet = Math.max(0, this.activePowerUps.magnet - dt);
        this.activePowerUps.shield = Math.max(0, this.activePowerUps.shield - dt);
        let currentSpeed = this.speed;
        if (this.activePowerUps.speed > 0)
            currentSpeed *= 1.8;
        let dx = 0;
        let dy = 0;
        if (e.keys["w"] || e.keys["W"] || e.keys["ArrowUp"])
            dy -= 1;
        if (e.keys["s"] || e.keys["S"] || e.keys["ArrowDown"])
            dy += 1;
        if (e.keys["a"] || e.keys["A"] || e.keys["ArrowLeft"])
            dx -= 1;
        if (e.keys["d"] || e.keys["D"] || e.keys["ArrowRight"])
            dx += 1;

        if (dx !== 0 && dy !== 0) {
            const len = Math.sqrt(dx * dx + dy * dy);
            dx /= len;
            dy /= len;
        }
        if (dx > 0)
            this.dirRight = true;
        else if (dx < 0)
            this.dirRight = false;
        const blockCheck = (rect, mX, mY) => {
            for (let obs of e.obstacles) {
                if (obs.solid && checkCol(rect, obs.getRect()))
                    return obs.getRect();
            }
            for (let en of e.enemies) {
                // Active tentacles act as obstacles
                if (en.solid && checkCol(rect, en.getRect()))
                    return en.getRect();
            }
            return null;
        };
        let moveX = dx * currentSpeed * dt;
        this.x += moveX;
        if (this.x < 40)
            this.x = 40;
        if (this.x + this.w > e.width - 40)
            this.x = e.width - 40 - this.w;
        let bX = blockCheck(this.getRect(), moveX, 0);
        if (bX) {
            if (moveX > 0)
                this.x = bX.x - this.w;
            else if (moveX < 0)
                this.x = bX.x + bX.w;
        }
        let moveY = dy * currentSpeed * dt;
        this.y += moveY;
        if (this.y < 0)
            this.y = 0;
        if (this.y + this.h > e.height)
            this.y = e.height - this.h;
        let bY = blockCheck(this.getRect(), 0, moveY);
        if (bY) {
            if (moveY > 0)
                this.y = bY.y - this.h;
            else if (moveY < 0)
                this.y = bY.y + bY.h;
        }
        if ((dx !== 0 || dy !== 0) && Math.random() < 0.3) {
            e.particles.push(new Particle(this.x + this.w / 2 + (this.dirRight ? -10 : 10), this.y + this.h - 5, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20, 0.5 + Math.random() * 0.5, "rgba(255, 255, 255, 0.6)", 2 + Math.random() * 2));
        }
    }
    draw(ctx) {
        if ((this.invulnTimer > 0 || this.activePowerUps.shield > 0) &&
            Math.floor(Date.now() / 100) % 2 === 0) {
            ctx.globalAlpha = 0.5;
        }
        ctx.save();
        ctx.translate(this.x, this.y);
        if (!this.dirRight) {
            ctx.translate(this.w, 0);
            ctx.scale(-1, 1);
        }
        ctx.drawImage(ASSETS.boat, -8, -14, 52, 52);
        ctx.restore();
        if (this.activePowerUps.shield > 0) {
            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.strokeStyle = "#3498db";
            ctx.lineWidth = 4;
            ctx.globalAlpha = 0.6 + Math.sin(Date.now() / 100) * 0.4;
            ctx.beginPath();
            ctx.arc(this.w / 2, this.h / 2, this.w, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }
        if (this.activePowerUps.magnet > 0) {
            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.strokeStyle = "#e74c3c";
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.lineDashOffset = -(Date.now() / 50) % 10;
            ctx.globalAlpha = 0.5;
            ctx.beginPath();
            ctx.arc(this.w / 2, this.h / 2, 200, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }
        ctx.globalAlpha = 1.0;
    }
}
class Obstacle extends Entity {
    constructor(x, y, type) {
        super(x, y, type === "BARREL" ? 32 : 48, type === "BARREL" ? 40 : 48);
        this.solid = true;
        this.invisible = false;
        this.type = type;
    }
    update() { }
    draw(ctx) {
        if (this.invisible)
            return;
        ctx.save();
        ctx.translate(this.x, this.y);
        if (this.type === "BARREL") {
            ctx.drawImage(ASSETS.barrel, -4, -6, 40, 52);
        }
        else if (this.type === "ROCK") {
            ctx.drawImage(ASSETS.rock, -4, -4, 56, 56);
        }
        else {
            ctx.drawImage(ASSETS.coral, -4, -6, 56, 60);
        }
        ctx.restore();
    }
}
class FishTarget extends Entity {
    constructor(x, y, type, pts) {
        let w = 48;
        let h = 36;
        super(x, y, w, h);
        this.timer = 0;
        this.speed = 70;
        this.dx = 1;
        this.dy = 0;
        this.angle = Math.PI;
        this.targetAngle = Math.PI;
        this.type = type;
        this.points = pts;
        this.angle = Math.random() * Math.PI * 2;
        this.targetAngle = this.angle;
        this.dx = Math.cos(this.angle);
        this.dy = Math.sin(this.angle);
        this.dirRight = this.dx > 0;
    }
    update(dt, e) {
        this.timer += dt;
        if (this.timer > Math.random() * 2 + 1) {
            this.timer = 0;
            let angleDiff = (Math.random() - 0.5) * Math.PI * 0.8;
            this.targetAngle += angleDiff;
        }
        let mx = this.dx * this.speed * dt;
        let my = this.dy * this.speed * dt;
        let nextX = this.x + mx;
        let nextY = this.y + my;
        let colX = false;
        let colY = false;
        if (nextX < 40) {
            nextX = 40;
            colX = true;
        }
        if (nextX + this.w > e.width - 40) {
            nextX = e.width - 40 - this.w;
            colX = true;
        }
        for (let obs of e.obstacles) {
            if (obs.solid && checkCol({ x: nextX, y: this.y, w: this.w, h: this.h }, obs.getRect()) && !checkCol({ x: this.x, y: this.y, w: this.w, h: this.h }, obs.getRect())) {
                colX = true;
                nextX = this.x;
                break;
            }
        }
        if (nextY < 0) {
            nextY = 0;
            colY = true;
        }
        if (nextY + this.h > e.height) {
            nextY = e.height - this.h;
            colY = true;
        }
        for (let obs of e.obstacles) {
            if (obs.solid && checkCol({ x: this.x, y: nextY, w: this.w, h: this.h }, obs.getRect()) && !checkCol({ x: this.x, y: this.y, w: this.w, h: this.h }, obs.getRect())) {
                colY = true;
                nextY = this.y;
                break;
            }
        }
        if (colX)
            this.dx = -this.dx;
        if (colY)
            this.dy = -this.dy;
        if (colX || colY) {
            this.angle = Math.atan2(this.dy, this.dx);
            this.targetAngle = this.angle;
        }
        const turnSpeed = 2.0;
        let diff = this.targetAngle - this.angle;
        while (diff > Math.PI)
            diff -= Math.PI * 2;
        while (diff < -Math.PI)
            diff += Math.PI * 2;
        this.angle += Math.sign(diff) * Math.min(Math.abs(diff), turnSpeed * dt);
        while (this.angle > Math.PI)
            this.angle -= Math.PI * 2;
        while (this.angle < -Math.PI)
            this.angle += Math.PI * 2;
        this.dx = Math.cos(this.angle);
        this.dy = Math.sin(this.angle);
        this.dirRight = this.dx > 0;
        this.x = nextX;
        this.y = nextY;
    }
    draw(ctx) {
        ctx.save();
        ctx.translate(this.x + this.w / 2, this.y + this.h / 2);
        if (this.dirRight) {
            ctx.rotate(this.angle);
            ctx.scale(-1, 1);
        }
        else {
            ctx.rotate(this.angle - Math.PI);
        }
        let assetKey = "fish_red";
        if (this.type === "BLUE")
            assetKey = "fish_blue";
        else if (this.type === "YELLOW")
            assetKey = "fish_yellow";
        else if (this.type === "PURPLE")
            assetKey = "fish_purple";
        else if (this.type === "GOLD")
            assetKey = "fish_gold";
        const sprite = ASSETS[assetKey];
        if (sprite && sprite.width > 0 && sprite.height > 0) {
            ctx.drawImage(sprite, -this.w / 2 - 4, -this.h / 2 - 4, this.w + 8, this.h + 8);
        }
        ctx.restore();
    }
}
class Enemy extends Entity {
    constructor() {
        super(...arguments);
        this.damage = 1;
    }
}
class GreenFish extends Enemy {
    constructor(x, y) {
        super(x, y, 36, 30);
        this.dx = 1;
        this.dy = 0;
        this.speed = 75;
        this.timer = 0;
        this.dirRight = true;
        this.angle = Math.PI;
        this.targetAngle = Math.PI;
        this.angle = Math.random() * Math.PI * 2;
        this.targetAngle = this.angle;
        this.dx = Math.cos(this.angle);
        this.dy = Math.sin(this.angle);
        this.dirRight = this.dx > 0;
    }
    update(dt, e) {
        this.timer += dt;
        if (this.timer > Math.random() * 2 + 1) {
            this.timer = 0;
            let angleDiff = (Math.random() - 0.5) * Math.PI * 0.8;
            this.targetAngle += angleDiff;
        }
        let mx = this.dx * this.speed * dt;
        let my = this.dy * this.speed * dt;
        let nextX = this.x + mx;
        let nextY = this.y + my;
        let colX = false;
        let colY = false;
        if (nextX < 40) {
            nextX = 40;
            colX = true;
        }
        if (nextX + this.w > e.width - 40) {
            nextX = e.width - 40 - this.w;
            colX = true;
        }
        for (let obs of e.obstacles) {
            if (obs.solid && checkCol({ x: nextX, y: this.y, w: this.w, h: this.h }, obs.getRect()) && !checkCol({ x: this.x, y: this.y, w: this.w, h: this.h }, obs.getRect())) {
                colX = true;
                nextX = this.x;
                break;
            }
        }
        if (nextY < 0) {
            nextY = 0;
            colY = true;
        }
        if (nextY + this.h > e.height) {
            nextY = e.height - this.h;
            colY = true;
        }
        for (let obs of e.obstacles) {
            if (obs.solid && checkCol({ x: this.x, y: nextY, w: this.w, h: this.h }, obs.getRect()) && !checkCol({ x: this.x, y: this.y, w: this.w, h: this.h }, obs.getRect())) {
                colY = true;
                nextY = this.y;
                break;
            }
        }
        if (colX)
            this.dx = -this.dx;
        if (colY)
            this.dy = -this.dy;
        if (colX || colY) {
            this.angle = Math.atan2(this.dy, this.dx);
            this.targetAngle = this.angle;
        }
        const turnSpeed = 2.0;
        let diff = this.targetAngle - this.angle;
        while (diff > Math.PI)
            diff -= Math.PI * 2;
        while (diff < -Math.PI)
            diff += Math.PI * 2;
        this.angle += Math.sign(diff) * Math.min(Math.abs(diff), turnSpeed * dt);
        while (this.angle > Math.PI)
            this.angle -= Math.PI * 2;
        while (this.angle < -Math.PI)
            this.angle += Math.PI * 2;
        this.dx = Math.cos(this.angle);
        this.dy = Math.sin(this.angle);
        this.dirRight = this.dx > 0;
        this.x = nextX;
        this.y = nextY;
    }
    draw(ctx) {
        ctx.save();
        ctx.translate(this.x + this.w / 2, this.y + this.h / 2);
        ctx.rotate(this.angle);
        if (!this.dirRight) {
            ctx.scale(1, -1);
        }
        ctx.drawImage(ASSETS.green_fish, -24, -20, 48, 40);
        ctx.restore();
    }
}
class Crab extends Enemy {
    constructor(x, y) {
        super(x, y, 30, 24);
        this.speed = 160;
        this.dx = 1;
        this.dy = 0;
        this.timer = 0;
        this.dx = Math.random() > 0.5 ? 1 : -1;
    }
    update(dt, e) {
        this.timer += dt;
        if (this.timer > 1.5) {
            this.timer = 0;
            if (Math.random() > 0.3) {
                this.dx = Math.random() > 0.5 ? 1 : -1;
                this.dy = 0;
            }
            else {
                this.dy = Math.random() > 0.5 ? 1 : -1;
                this.dx = 0;
            }
        }
        let targetX = this.x + this.dx * this.speed * dt;
        let targetY = this.y + this.dy * this.speed * dt;
        let col = false;
        for (let obs of e.obstacles) {
            if (obs.solid &&
                checkCol({ x: targetX, y: targetY, w: this.w, h: this.h }, obs.getRect())) {
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
        }
        else {
            this.x = targetX;
            this.y = targetY;
        }
    }
    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        // w:30 h:24 crab sprite w:48 h:30
        ctx.drawImage(ASSETS.crab, -9, -3, 48, 30);
        ctx.restore();
    }
}
class PirateBoat extends Enemy {
    constructor(x, y) {
        super(x, y, 46, 46);
        this.speed = 120;
        this.dirRight = true;
        this.dx = 1;
        this.dy = 0;
        this.timer = 0;
        this.angle = 0;
        this.targetAngle = 0;
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
        }
        else {
            this.timer += dt;
            if (this.timer > 3) {
                this.timer = 0;
                this.targetAngle += (Math.random() - 0.5) * Math.PI;
            }
        }
        let diff = this.targetAngle - this.angle;
        while (diff > Math.PI)
            diff -= Math.PI * 2;
        while (diff < -Math.PI)
            diff += Math.PI * 2;
        const turnSpeed = 2.0;
        this.angle += Math.sign(diff) * Math.min(Math.abs(diff), turnSpeed * dt);
        while (this.angle > Math.PI)
            this.angle -= Math.PI * 2;
        while (this.angle < -Math.PI)
            this.angle += Math.PI * 2;
        this.dx = Math.cos(this.angle);
        this.dy = Math.sin(this.angle);
        this.dirRight = this.dx > 0;
        let mx = this.dx * this.speed * dt;
        let my = this.dy * this.speed * dt;
        let nextX = this.x + mx;
        let nextY = this.y + my;
        let colX = false;
        let colY = false;
        if (nextX < 40) {
            nextX = 40;
            colX = true;
        }
        if (nextX + this.w > e.width - 40) {
            nextX = e.width - 40 - this.w;
            colX = true;
        }
        for (let obs of e.obstacles) {
            if (obs.solid && checkCol({ x: nextX, y: this.y, w: this.w, h: this.h }, obs.getRect()) && !checkCol({ x: this.x, y: this.y, w: this.w, h: this.h }, obs.getRect())) {
                colX = true;
                nextX = this.x;
                break;
            }
        }
        if (nextY < 0) {
            nextY = 0;
            colY = true;
        }
        if (nextY + this.h > e.height) {
            nextY = e.height - this.h;
            colY = true;
        }
        for (let obs of e.obstacles) {
            if (obs.solid && checkCol({ x: this.x, y: nextY, w: this.w, h: this.h }, obs.getRect()) && !checkCol({ x: this.x, y: this.y, w: this.w, h: this.h }, obs.getRect())) {
                colY = true;
                nextY = this.y;
                break;
            }
        }
        if (colX)
            this.dx = -this.dx;
        if (colY)
            this.dy = -this.dy;
        if (colX || colY) {
            this.angle = Math.atan2(this.dy, this.dx);
            this.targetAngle = this.angle;
        }
        this.x = nextX;
        this.y = nextY;
    }
    draw(ctx) {
        ctx.save();
        ctx.translate(this.x + this.w / 2, this.y + this.h / 2);
        if (this.dirRight) {
            ctx.rotate(this.angle);
            ctx.scale(-1, 1);
        }
        else {
            ctx.rotate(this.angle - Math.PI);
        }
        ctx.drawImage(ASSETS.pirate, -this.w / 2 - 4, -this.h / 2 - 8, 54, 54);
        ctx.restore();
    }
}
class Shark extends Enemy {
    constructor(x, y) {
        super(x, y, 54, 27);
        this.speed = 90;
        this.dirRight = true;
        this.state = "WANDER";
        this.dashTimer = 0;
        this.dx = 1;
        this.dy = 0;
        this.angle = 0;
        this.targetAngle = 0;
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
            if (this.dashTimer <= 0 &&
                Math.sqrt(pdx * pdx + pdy * pdy) < 300) {
                this.state = "DASH";
                this.dashTimer = 1.0;
                this.targetAngle = Math.atan2(pdy, pdx); // Face dash direction
            }
            else {
                if (Math.random() < 0.01) {
                    this.targetAngle += (Math.random() - 0.5) * Math.PI;
                }
            }
        }
        else {
            this.dashTimer -= dt;
            if (this.dashTimer <= 0) {
                this.state = "WANDER";
                this.dashTimer = 2.0;
            }
        }
        let diff = this.targetAngle - this.angle;
        while (diff > Math.PI)
            diff -= Math.PI * 2;
        while (diff < -Math.PI)
            diff += Math.PI * 2;
        const turnSpeed = this.state === "DASH" ? 5.0 : 2.0;
        this.angle += Math.sign(diff) * Math.min(Math.abs(diff), turnSpeed * dt);
        while (this.angle > Math.PI)
            this.angle -= Math.PI * 2;
        while (this.angle < -Math.PI)
            this.angle += Math.PI * 2;
        this.dx = Math.cos(this.angle);
        this.dy = Math.sin(this.angle);
        this.dirRight = this.dx > 0;
        let curSpeed = this.state === "DASH" ? 400 : this.speed;
        let nextX = this.x + this.dx * curSpeed * dt;
        let nextY = this.y + this.dy * curSpeed * dt;
        let colX = false;
        let colY = false;
        if (nextX < 40) {
            nextX = 40;
            colX = true;
        }
        if (nextX + this.w > e.width - 40) {
            nextX = e.width - 40 - this.w;
            colX = true;
        }
        for (let obs of e.obstacles) {
            if (obs.solid && checkCol({ x: nextX, y: this.y, w: this.w, h: this.h }, obs.getRect()) && !checkCol({ x: this.x, y: this.y, w: this.w, h: this.h }, obs.getRect())) {
                colX = true;
                nextX = this.x;
                break;
            }
        }
        if (nextY < 0) {
            nextY = 0;
            colY = true;
        }
        if (nextY + this.h > e.height) {
            nextY = e.height - this.h;
            colY = true;
        }
        for (let obs of e.obstacles) {
            if (obs.solid && checkCol({ x: this.x, y: nextY, w: this.w, h: this.h }, obs.getRect()) && !checkCol({ x: this.x, y: this.y, w: this.w, h: this.h }, obs.getRect())) {
                colY = true;
                nextY = this.y;
                break;
            }
        }
        if (colX)
            this.dx = -this.dx;
        if (colY)
            this.dy = -this.dy;
        if (colX || colY) {
            this.angle = Math.atan2(this.dy, this.dx);
            this.targetAngle = this.angle;
        }
        if (colX || colY) {
            if (this.state === "DASH")
                this.dashTimer = 0;
        }
        this.x = nextX;
        this.y = nextY;
    }
    draw(ctx) {
        ctx.save();
        ctx.translate(this.x + this.w / 2, this.y + this.h / 2);
        ctx.rotate(this.angle);
        if (!this.dirRight) {
            ctx.scale(1, -1);
        }
        ctx.drawImage(ASSETS.shark, -this.w / 2 - 2, -this.h / 2 - 5, 60, 36);
        ctx.restore();
    }
}
class KrakenTentacle extends Enemy {
    constructor(x, y) {
        super(x, y, 48, 60);
        this.state = "WARN";
        this.timer = 0;
        this.solid = false;
        this.damage = 0; // warning no damage
    }
    update(dt, e) {
        this.timer += dt;
        if (this.state === "WARN") {
            if (this.timer > 1.5) {
                this.state = "ACTIVE";
                this.damage = 1;
                this.solid = true;
                this.timer = 0;
            }
        }
        else {
            if (this.timer > 3.0) {
                this.dead = true;
            }
        }
    }
    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        if (this.state === "WARN") {
            ctx.fillStyle = "rgba(255,255,255,0.4)";
            ctx.beginPath();
            ctx.arc(this.w / 2, this.h / 2, this.w / 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = "#fff";
            ctx.lineWidth = 2;
            ctx.strokeRect(this.w / 4, this.h / 4, this.w / 2, this.h / 2);
        }
        else {
            ctx.drawImage(ASSETS.tentacle, 0, -8, 48, 76);
        }
        ctx.restore();
    }
}
class KrakenBoss extends Entity {
    constructor(x, y) {
        super(x, y, 240, 90);
        this.tentacleTimer = 0;
        this.animTimer = 0;
        this.baseX = 0;
        this.baseY = 0;
        this.baseX = x;
        this.baseY = y;
    }
    update(dt, e) {
        this.tentacleTimer += dt;
        this.animTimer += dt;
        // Smooth hovering movement
        this.x = this.baseX + Math.sin(this.animTimer * 1.2) * 60;
        this.y = this.baseY + Math.cos(this.animTimer * 1.8) * 15;
        // Update blocker obstacle matching boss
        let blocker = e.obstacles.find((o) => o.w === 240 && o.h === 90);
        if (blocker) {
            blocker.x = this.x;
            blocker.y = this.y;
        }
        if (this.tentacleTimer > 2.5) {
            this.tentacleTimer = 0;
            // spawn 4 tentacles
            for (let i = 0; i < 4; i++) {
                let tx = Math.max(0, Math.min(e.width - 32, e.player.x + (Math.random() - 0.5) * 250));
                let ty = Math.max(0, Math.min(e.height - 40, e.player.y + (Math.random() - 0.5) * 250));
                e.enemies.push(new KrakenTentacle(tx, ty));
            }
        }
    }
    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        // slight rotation based on movement
        ctx.rotate(Math.sin(this.animTimer * 1.2) * 0.05);
        ctx.drawImage(ASSETS.kraken, -30, -90, 300, 216);
        ctx.restore();
    }
}
class Portal extends Entity {
    constructor(x, y) {
        super(x, y, 64, 64);
        this.timer = 0;
    }
    update(dt) {
        this.timer += dt;
    }
    draw(ctx) {
        ctx.save();
        ctx.translate(this.x + this.w / 2, this.y + this.h / 2);
        ctx.rotate(this.timer * 4);
        ctx.drawImage(ASSETS.portal, -32, -32, 64, 64);
        ctx.restore();
    }
}
export const LEVELSConfig = [
    {
        level: 1,
        name: "Beginner Bay",
        fishType: "RED",
        fishCount: 15,
        fishPts: 10,
        g: 5,
        c: 4,
        p: 0,
        s: 0,
        bs: false,
        r: 6,
        b: 2,
        cr: 3,
        water: "#0CA4FF",
    },
    {
        level: 2,
        name: "Rocky Waters",
        fishType: "BLUE",
        fishCount: 15,
        fishPts: 15,
        g: 7,
        c: 5,
        p: 2,
        s: 0,
        bs: false,
        r: 8,
        b: 3,
        cr: 4,
        water: "#0984e3",
    },
    {
        level: 3,
        name: "Pirate Lagoon",
        fishType: "YELLOW",
        fishCount: 15,
        fishPts: 20,
        g: 9,
        c: 6,
        p: 4,
        s: 2,
        bs: false,
        r: 10,
        b: 4,
        cr: 5,
        water: "#00cec9",
    },
    {
        level: 4,
        name: "Deep Ocean",
        fishType: "PURPLE",
        fishCount: 20,
        fishPts: 25,
        g: 6,
        c: 6,
        p: 3,
        s: 2,
        bs: false,
        r: 12,
        b: 6,
        cr: 6,
        water: "#1e3799",
    },
    {
        level: 5,
        name: "Kraken Territory",
        fishType: "GOLD",
        fishCount: 25,
        fishPts: 50,
        g: 8,
        c: 8,
        p: 5,
        s: 5,
        bs: true,
        r: 14,
        b: 10,
        cr: 8,
        water: "#0c2461",
    },
];
export class GameEngine {
    constructor(canvas, setGameUI, setStats) {
        this.width = 1280;
        this.height = 800;
        this.reqFrame = 0;
        this.lastTime = 0;
        this.keys = {};
        this.level = 1;
        this.lives = 3;
        this.score = 0;
        this.fishCollected = 0;
        this.fishRequired = 20;
        this.totalFish = 0;
        this.maxLevelReached = 1;
        this.gameState = "START";
        this.waterColor = "#0CA4FF";
        this.obstacles = [];
        this.targets = [];
        this.enemies = [];
        this.portal = null;
        this.boss = null;
        this.particles = [];
        this.powerUps = [];
        this.powerUpSpawnTimer = 5;
        this.seaFloor = [];
        this.handleKeyDown = (e) => {
            this.keys[e.key] = true;
        };
        this.handleKeyUp = (e) => {
            this.keys[e.key] = false;
        };
        this.loop = (time) => {
            if (this.gameState !== "PLAYING")
                return;
            this.reqFrame = requestAnimationFrame(this.loop);
            let dt = (time - this.lastTime) / 1000;
            this.lastTime = time;
            if (dt > 0.1)
                dt = 0.1;
            // Background and image settings
            this.ctx.imageSmoothingEnabled = false;
            this.ctx.fillStyle = this.waterColor;
            this.ctx.fillRect(0, 0, this.width, this.height);
            // Parallax sea floor elements
            const playerOffsetX = this.player.x - this.width / 2;
            const playerOffsetY = this.player.y - this.height / 2;
            const boundsX = this.width + 200;
            const boundsY = this.height + 200;
            const scrollSpeed = 40;
            for (const floor of this.seaFloor) {
                this.ctx.fillStyle = `rgba(0, 0, 0, ${0.15 * floor.depth})`;
                let drawX = floor.x - playerOffsetX * floor.depth * 0.8;
                let drawY = floor.y +
                    (this.lastTime / 1000) * scrollSpeed * floor.depth -
                    playerOffsetY * floor.depth * 0.8;
                drawX = (((drawX % boundsX) + boundsX) % boundsX) - 100;
                drawY = (((drawY % boundsY) + boundsY) % boundsY) - 100;
                drawX = Math.floor(drawX / 8) * 8;
                drawY = Math.floor(drawY / 8) * 8;
                if (floor.type === 0) {
                    this.ctx.fillRect(drawX, drawY + 8, floor.w, floor.h - 16);
                    this.ctx.fillRect(drawX + 8, drawY, floor.w - 16, floor.h);
                }
                else if (floor.type === 1) {
                    this.ctx.fillRect(drawX, drawY, floor.w, floor.h);
                }
                else {
                    this.ctx.fillRect(drawX, drawY, floor.w, Math.floor(floor.h / 16) * 8);
                    this.ctx.fillRect(drawX + Math.floor(floor.w / 32) * 8, drawY + Math.floor(floor.h / 16) * 8, Math.floor(floor.w / 16) * 8, Math.floor(floor.h / 16) * 8);
                }
            }
            // Draw shores with foam
            this.ctx.fillStyle = "#fbc531"; // yellow sand
            const shoreWidth = 40;
            this.ctx.fillRect(0, 0, shoreWidth, this.height); // left shore
            this.ctx.fillRect(this.width - shoreWidth, 0, shoreWidth, this.height); // right shore
            // Shore foam
            this.ctx.fillStyle = "#ffffff";
            const tOffset = this.lastTime / 300;
            for (let y = 0; y < this.height; y += 8) {
                let offsetL = Math.sin(y / 20 + tOffset) * 4;
                let offsetR = Math.cos(y / 20 + tOffset) * 4;
                this.ctx.fillRect(shoreWidth + offsetL, y, 4, 8);
                this.ctx.fillRect(this.width - shoreWidth - 4 + offsetR, y, 4, 8);
            }
            this.player.update(dt, this);
            for (let o of this.obstacles)
                o.update();
            if (this.boss)
                this.boss.update(dt, this);
            for (let i = this.enemies.length - 1; i >= 0; i--) {
                let en = this.enemies[i];
                en.update(dt, this);
                if (en.dead) {
                    this.enemies.splice(i, 1);
                    continue;
                }
                if (en.damage > 0 &&
                    this.player.invulnTimer <= 0 &&
                    this.player.activePowerUps.shield <= 0 &&
                    checkCol(en.getRect(), this.player.getRect())) {
                    if (en instanceof KrakenTentacle && !en.solid)
                        continue; // safety for warning state
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
                        this.particles.push(new Particle(t.x + t.w / 2, t.y + t.h / 2, (Math.random() - 0.5) * 150, (Math.random() - 0.5) * 150 - 50, 0.3 + Math.random() * 0.4, Math.random() > 0.5 ? "#fff" : "#0CA4FF", 2 + Math.random() * 3));
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
                const types = [
                    "SPEED",
                    "MAGNET",
                    "SHIELD",
                ];
                let type = types[Math.floor(Math.random() * types.length)];
                let px = Math.random() * (this.width - 200) + 100;
                let py = Math.random() * (this.height - 200) + 100;
                this.powerUps.push(new PowerUp(px, py, type));
            }
            for (let i = this.powerUps.length - 1; i >= 0; i--) {
                this.powerUps[i].update(dt);
                if (checkCol(this.powerUps[i].getRect(), this.player.getRect())) {
                    let p = this.powerUps[i];
                    if (p.type === "SPEED")
                        this.player.activePowerUps.speed = 8;
                    if (p.type === "MAGNET")
                        this.player.activePowerUps.magnet = 10;
                    if (p.type === "SHIELD")
                        this.player.activePowerUps.shield = 8;
                    playCatchSound();
                    this.powerUps.splice(i, 1);
                }
            }
            for (let i = this.particles.length - 1; i >= 0; i--) {
                this.particles[i].update(dt);
                if (this.particles[i].life <= 0) {
                    this.particles.splice(i, 1);
                }
            }
            // Draw
            if (this.portal)
                this.portal.draw(this.ctx);
            for (let o of this.obstacles)
                o.draw(this.ctx);
            for (let t of this.targets)
                t.draw(this.ctx);
            for (let p of this.powerUps)
                p.draw(this.ctx);
            if (this.boss)
                this.boss.draw(this.ctx);
            for (let en of this.enemies)
                en.draw(this.ctx);
            for (let p of this.particles)
                p.draw(this.ctx);
            this.player.draw(this.ctx);
        };
        initAssets();
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d");
        this.setGameStateUI = setGameUI;
        this.setStatsUI = setStats;
        this.player = new Player(this.width / 2 - 10, this.height / 2 + 100);
        for (let i = 0; i < 40; i++) {
            this.seaFloor.push({
                x: Math.random() * (this.width + 200),
                y: Math.random() * (this.height + 200),
                w: Math.floor((Math.random() * 80 + 40) / 8) * 8,
                h: Math.floor((Math.random() * 80 + 40) / 8) * 8,
                type: Math.floor(Math.random() * 3),
                depth: Math.random() * 0.4 + 0.1,
            });
        }
        window.addEventListener("keydown", this.handleKeyDown);
        window.addEventListener("keyup", this.handleKeyUp);
        // draw empty screen initially
        this.ctx.fillStyle = this.waterColor;
        this.ctx.fillRect(0, 0, this.width, this.height);
    }
    destroy() {
        window.removeEventListener("keydown", this.handleKeyDown);
        window.removeEventListener("keyup", this.handleKeyUp);
        this.stop();
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
        this.loop(this.lastTime);
    }
    stop() {
        stopBGM();
        if (this.reqFrame)
            cancelAnimationFrame(this.reqFrame);
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
        if (!cfg)
            return;
        this.waterColor = cfg.water;
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
                // avoid player spawn area
                if (y > this.height - 120 &&
                    x > this.width / 2 - 60 &&
                    x < this.width / 2 + 60)
                    valid = false;
                if (cfg.bs &&
                    y < 100 &&
                    x > this.width / 2 - 100 &&
                    x < this.width / 2 + 100)
                    valid = false; // avoid boss spawn
                let r = { x, y, w, h };
                for (let o of this.obstacles)
                    if (checkCol(r, o.getRect()))
                        valid = false;
                if (valid)
                    return { x, y };
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
        }
        else {
            this.level++;
            this.startLevel(this.level);
        }
    }
}
