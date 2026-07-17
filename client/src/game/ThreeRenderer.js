import * as THREE from "three";
import { ASSETS } from "./assets";
import { MAX_COUNTS, LEVELSConfig } from "./levels";
import { KrakenTentacle, GreenFish, Crab, PirateBoat, Shark } from "./entities";

// This is a flat, unlit, pixel-art 2D scene — disable the sRGB color
// management pipeline so hex/canvas colors pass straight through, exactly
// like the original canvas 2D renderer (no gamma round-tripping to reason
// about in the custom water/particle shaders).
THREE.ColorManagement.enabled = false;

export const WORLD_W = 1280;
export const WORLD_H = 800;

const FISH_TEXTURE_BY_TYPE = {
  RED: "fish_red",
  BLUE: "fish_blue",
  YELLOW: "fish_yellow",
  PURPLE: "fish_purple",
  GOLD: "fish_gold",
};

const RENDER_ORDER = {
  WATER: 0,
  PORTAL: 1,
  OBSTACLE: 2,
  FISH: 3,
  POWERUP: 4,
  BOSS: 5,
  ENEMY: 6,
  PARTICLE: 7,
  PLAYER: 8,
};

// ---- small canvas-based procedural textures not present in ASSETS ----

function makeWarningRingCanvas() {
  const size = 64;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 3;
  ctx.stroke();
  return c;
}

// ---- texture cache: ASSETS entries mutate (canvas objects get replaced
// once async fish sprites finish loading), so we re-check the live
// reference every frame and only rebuild a CanvasTexture when it changes ----

class TextureCache {
  constructor() {
    this.entries = new Map();
    const blank = document.createElement("canvas");
    blank.width = blank.height = 1;
    this.placeholder = new THREE.CanvasTexture(blank);
  }

  get(key, sourceCanvas) {
    const src = sourceCanvas || ASSETS[key];
    if (!src || !src.width || !src.height) return this.placeholder;
    const cached = this.entries.get(key);
    if (cached && cached.canvas === src) return cached.texture;
    const tex = new THREE.CanvasTexture(src);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    if (cached) cached.texture.dispose();
    this.entries.set(key, { canvas: src, texture: tex });
    return tex;
  }
}

const dummy = new THREE.Object3D();
function writeInstance(mesh, index, cx, cy, rotZ, scaleX, scaleY) {
  dummy.position.set(cx, cy, 0);
  dummy.rotation.set(0, 0, rotZ);
  dummy.scale.set(scaleX, scaleY, 1);
  dummy.updateMatrix();
  mesh.setMatrixAt(index, dummy.matrix);
}

function finishPool(mesh, count) {
  mesh.count = count;
  mesh.instanceMatrix.needsUpdate = true;
}

// ---- procedural water/shore/floor background shader ----

const waterVertex = `
  varying vec2 vWorldPos;
  void main() {
    vWorldPos = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const waterFragment = `
  precision mediump float;
  varying vec2 vWorldPos;
  uniform vec3 uColor;
  uniform float uTime;
  uniform vec2 uPlayerOffset;
  uniform float uWidth;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float blobs(vec2 p, float scale, vec2 drift) {
    vec2 q = (p + drift) * scale;
    vec2 cell = floor(q);
    vec2 f = fract(q);
    float h = hash(cell);
    float r = 0.18 + h * 0.14;
    vec2 center = vec2(hash(cell + 1.3), hash(cell + 7.1));
    float d = length(f - center);
    return smoothstep(r, r - 0.06, d) * (0.4 + h * 0.6);
  }

  void main() {
    vec3 color = uColor;
    float shade = 0.0;
    shade += blobs(vWorldPos, 0.018, uPlayerOffset * 0.12 + vec2(uTime * 3.0, 0.0)) * 0.14;
    shade += blobs(vWorldPos + 512.0, 0.007, uPlayerOffset * 0.3 + vec2(uTime * 8.0, 0.0)) * 0.10;
    color *= (1.0 - shade);

    float shoreW = 40.0;
    float shoreDist = min(vWorldPos.x, uWidth - vWorldPos.x);
    if (shoreDist < shoreW + 6.0) {
      float sandMix = smoothstep(0.0, shoreW, shoreDist);
      color = mix(vec3(0.98, 0.83, 0.28), color, sandMix);
      float foamEdge = shoreW + sin(vWorldPos.y * 0.15 + uTime * 3.0) * 4.0;
      float foamBand = smoothstep(foamEdge - 5.0, foamEdge - 1.0, shoreDist) *
                        (1.0 - smoothstep(foamEdge - 1.0, foamEdge + 3.0, shoreDist));
      color = mix(color, vec3(1.0), foamBand * 0.85);
    }
    gl_FragColor = vec4(color, 1.0);
  }
`;

function makeWaterMesh() {
  const geo = new THREE.PlaneGeometry(WORLD_W, WORLD_H, 1, 1);
  geo.translate(WORLD_W / 2, WORLD_H / 2, 0);
  const mat = new THREE.ShaderMaterial({
    vertexShader: waterVertex,
    fragmentShader: waterFragment,
    uniforms: {
      uColor: { value: new THREE.Color("#0CA4FF") },
      uTime: { value: 0 },
      uPlayerOffset: { value: new THREE.Vector2(0, 0) },
      uWidth: { value: WORLD_W },
    },
    depthTest: false,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = RENDER_ORDER.WATER;
  return mesh;
}

// ---- GPU particle system: one draw call for every catch/wake particle ----

const particleVertex = `
  attribute float aSize;
  attribute vec3 aColor;
  attribute float aAlpha;
  varying vec3 vColor;
  varying float vAlpha;
  uniform float uPixelsPerWorldUnit;
  void main() {
    vColor = aColor;
    vAlpha = aAlpha;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = aSize * uPixelsPerWorldUnit;
  }
`;

const particleFragment = `
  precision mediump float;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    float a = smoothstep(0.5, 0.3, d) * vAlpha;
    if (a <= 0.001) discard;
    gl_FragColor = vec4(vColor, a);
  }
`;

function makeParticleSystem(maxCount) {
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(maxCount * 3);
  const sizes = new Float32Array(maxCount);
  const colors = new Float32Array(maxCount * 3);
  const alphas = new Float32Array(maxCount);
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  geo.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
  geo.setAttribute("aAlpha", new THREE.BufferAttribute(alphas, 1));
  geo.setDrawRange(0, 0);
  const mat = new THREE.ShaderMaterial({
    vertexShader: particleVertex,
    fragmentShader: particleFragment,
    uniforms: { uPixelsPerWorldUnit: { value: 1 } },
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const points = new THREE.Points(geo, mat);
  points.renderOrder = RENDER_ORDER.PARTICLE;
  points.frustumCulled = false;
  return points;
}

const tmpColor = new THREE.Color();

function syncParticles(points, particles) {
  const geo = points.geometry;
  const pos = geo.attributes.position.array;
  const size = geo.attributes.aSize.array;
  const color = geo.attributes.aColor.array;
  const alpha = geo.attributes.aAlpha.array;
  const max = size.length;
  const count = Math.min(particles.length, max);
  for (let i = 0; i < count; i++) {
    const p = particles[i];
    pos[i * 3] = p.x;
    pos[i * 3 + 1] = p.y;
    pos[i * 3 + 2] = 0;
    size[i] = p.size * 2;
    tmpColor.set(p.color);
    color[i * 3] = tmpColor.r;
    color[i * 3 + 1] = tmpColor.g;
    color[i * 3 + 2] = tmpColor.b;
    alpha[i] = Math.max(0, p.life / p.maxLife);
  }
  geo.attributes.position.needsUpdate = true;
  geo.attributes.aSize.needsUpdate = true;
  geo.attributes.aColor.needsUpdate = true;
  geo.attributes.aAlpha.needsUpdate = true;
  geo.setDrawRange(0, count);
}

// ---- instanced sprite pool factory ----

function makePool(texture, capacity, renderOrder) {
  const geo = new THREE.PlaneGeometry(1, 1);
  geo.scale(1, -1, 1); 
  
  const mat = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    alphaTest: 0.05,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  
  const mesh = new THREE.InstancedMesh(geo, mat, capacity);
  mesh.renderOrder = renderOrder;
  mesh.count = 0;
  mesh.frustumCulled = false;
  return mesh;
}

export class ThreeRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.textures = new TextureCache();
    this.elapsed = 0;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      depth: false,
      stencil: false,
      powerPreference: "high-performance",
    });
    this.renderer.setClearColor(0x0ca4ff, 1);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(0, WORLD_W, WORLD_H, 0, 0.1, 1000);
    this.camera.position.z = 100;

    // Canvas-style (x-right, y-down) coordinates map directly onto every
    // entity's position/rotation/scale below; this group performs the one
    // basis change needed to display that correctly in Three's y-up world.
    this.world = new THREE.Group();
    this.world.position.y = WORLD_H;
    this.world.scale.y = -1;
    this.scene.add(this.world);

    this._buildBackground();
    this._buildPools();
    this._buildSingles();
    this._buildParticles();

    this._contextLost = (e) => {
      e.preventDefault();
      this.lost = true;
    };
    this._contextRestored = () => {
      this.lost = false;
    };
    canvas.addEventListener("webglcontextlost", this._contextLost, false);
    canvas.addEventListener("webglcontextrestored", this._contextRestored, false);

    this._ro = new ResizeObserver(() => this.resize());
    this._ro.observe(canvas.parentElement);
    this.resize();
  }

  _buildBackground() {
    this.water = makeWaterMesh();
    this.world.add(this.water);
  }

  _buildPools() {
    const t = this.textures;
    const RO = RENDER_ORDER;
    this.pools = {
      rock: makePool(t.get("rock"), MAX_COUNTS.rock, RO.OBSTACLE),
      barrel: makePool(t.get("barrel"), MAX_COUNTS.barrel, RO.OBSTACLE),
      coral: makePool(t.get("coral"), MAX_COUNTS.coral, RO.OBSTACLE),
      greenFish: makePool(t.get("green_fish"), MAX_COUNTS.greenFish, RO.ENEMY),
      crab: makePool(t.get("crab"), MAX_COUNTS.crab, RO.ENEMY),
      pirate: makePool(t.get("pirate"), MAX_COUNTS.pirate, RO.ENEMY),
      shark: makePool(t.get("shark"), MAX_COUNTS.shark, RO.ENEMY),
      tentacleActive: makePool(t.get("tentacle"), MAX_COUNTS.tentacle, RO.ENEMY),
      tentacleWarn: makePool(
        t.get("warning_ring", makeWarningRingCanvas()),
        MAX_COUNTS.tentacle,
        RO.ENEMY
      ),
      fish: makePool(t.get("fish_red"), MAX_COUNTS.fish, RO.FISH),
      iconSpeed: makePool(t.get("icon_speed"), MAX_COUNTS.powerupPerType, RO.POWERUP),
      iconMagnet: makePool(t.get("icon_net"), MAX_COUNTS.powerupPerType, RO.POWERUP),
      iconShield: makePool(t.get("icon_shield"), MAX_COUNTS.powerupPerType, RO.POWERUP),
    };
    for (const mesh of Object.values(this.pools)) this.world.add(mesh);
  }

  _buildSingles() {
    const t = this.textures;
    const unitGeo = new THREE.PlaneGeometry(1, 1);
    unitGeo.scale(1, -1, 1);

    const spriteMat = (tex) =>
      new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        alphaTest: 0.05,
        depthTest: false,
        depthWrite: false,
        side: THREE.DoubleSide,
      });

    this.player = new THREE.Mesh(unitGeo, spriteMat(t.get("boat")));
    this.player.renderOrder = RENDER_ORDER.PLAYER;
    this.world.add(this.player);

    this.boss = new THREE.Mesh(unitGeo, spriteMat(t.get("kraken")));
    this.boss.renderOrder = RENDER_ORDER.BOSS;
    this.boss.visible = false;
    this.world.add(this.boss);

    this.portal = new THREE.Mesh(unitGeo, spriteMat(t.get("portal")));
    this.portal.renderOrder = RENDER_ORDER.PORTAL;
    this.portal.visible = false;
    this.world.add(this.portal);

    const ringMat = (color, opacity) =>
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        depthTest: false,
        depthWrite: false,
        side: THREE.DoubleSide,
      });

    this.shieldRing = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 32), ringMat(0x3498db, 0.8));
    this.shieldRing.renderOrder = RENDER_ORDER.PLAYER;
    this.shieldRing.visible = false;
    this.world.add(this.shieldRing);

    this.magnetRing = new THREE.Mesh(new THREE.RingGeometry(0.985, 1, 48), ringMat(0xe74c3c, 0.4));
    this.magnetRing.renderOrder = RENDER_ORDER.PLAYER;
    this.magnetRing.visible = false;
    this.world.add(this.magnetRing);
  }

  _buildParticles() {
    this.particles = makeParticleSystem(MAX_COUNTS.particles);
    this.world.add(this.particles);
  }

  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    this.renderer.setSize(w, h, false);
    this.particles.material.uniforms.uPixelsPerWorldUnit.value = this.canvas.width / WORLD_W;
  }

  setWaterColor(hex) {
    this.water.material.uniforms.uColor.value.set(hex);
  }

  _refreshTextures() {
    const t = this.textures;
    const p = this.pools;
    p.rock.material.map = t.get("rock");
    p.barrel.material.map = t.get("barrel");
    p.coral.material.map = t.get("coral");
    p.greenFish.material.map = t.get("green_fish");
    p.crab.material.map = t.get("crab");
    p.pirate.material.map = t.get("pirate");
    p.shark.material.map = t.get("shark");
    p.tentacleActive.material.map = t.get("tentacle");
    this.player.material.map = t.get("boat");
    this.boss.material.map = t.get("kraken");
    this.portal.material.map = t.get("portal");
    p.iconSpeed.material.map = t.get("icon_speed");
    p.iconMagnet.material.map = t.get("icon_net");
    p.iconShield.material.map = t.get("icon_shield");
  }

  render(engine, dt, time) {
    if (this.lost) return;
    this.elapsed += dt;
    this._refreshTextures();

    const cfg = LEVELSConfig[engine.level - 1];
    if (cfg) this.setWaterColor(cfg.water);

    const player = engine.player;
    this.water.material.uniforms.uTime.value = this.elapsed;
    this.water.material.uniforms.uPlayerOffset.value.set(
      player.x - WORLD_W / 2,
      player.y - WORLD_H / 2
    );

    this._syncObstacles(engine.obstacles);
    this._syncFish(engine.targets, cfg);
    this._syncPowerUps(engine.powerUps);
    this._syncEnemies(engine.enemies);
    this._syncBoss(engine.boss);
    this._syncPortal(engine.portal);
    this._syncPlayer(player);
    syncParticles(this.particles, engine.particles);

    this.renderer.render(this.scene, this.camera);
  }

  _syncObstacles(obstacles) {
    const p = this.pools;
    let rock = 0,
      barrel = 0,
      coral = 0;
    for (const o of obstacles) {
      if (o.invisible) continue;
      if (o.type === "ROCK") writeInstance(p.rock, rock++, o.x + 24, o.y + 24, 0, 56, 56);
      else if (o.type === "BARREL") writeInstance(p.barrel, barrel++, o.x + 16, o.y + 20, 0, 40, 52);
      else writeInstance(p.coral, coral++, o.x + 24, o.y + 24, 0, 56, 60);
    }
    finishPool(p.rock, rock);
    finishPool(p.barrel, barrel);
    finishPool(p.coral, coral);
  }

  _syncFish(targets, cfg) {
    const mesh = this.pools.fish;
    if (cfg) mesh.material.map = this.textures.get(FISH_TEXTURE_BY_TYPE[cfg.fishType]);
    let i = 0;
    for (const t of targets) {
      const cx = t.x + t.w / 2;
      const cy = t.y + t.h / 2;
      if (t.dirRight) writeInstance(mesh, i++, cx, cy, t.angle, -56, 44);
      else writeInstance(mesh, i++, cx, cy, t.angle - Math.PI, 56, 44);
    }
    finishPool(mesh, i);
  }

  _syncPowerUps(powerUps) {
    const p = this.pools;
    let speed = 0,
      magnet = 0,
      shield = 0;
    for (const pu of powerUps) {
      const cy = pu.y + 12 + Math.sin(pu.pulseTimer) * 2;
      if (pu.type === "SPEED") writeInstance(p.iconSpeed, speed++, pu.x + 12, cy, 0, 32, 32);
      else if (pu.type === "MAGNET") writeInstance(p.iconMagnet, magnet++, pu.x + 12, cy, 0, 32, 32);
      else writeInstance(p.iconShield, shield++, pu.x + 12, cy, 0, 32, 32);
    }
    finishPool(p.iconSpeed, speed);
    finishPool(p.iconMagnet, magnet);
    finishPool(p.iconShield, shield);
  }

  _syncEnemies(enemies) {
    const p = this.pools;
    let green = 0,
      crab = 0,
      pirate = 0,
      shark = 0,
      tWarn = 0,
      tActive = 0;
    for (const en of enemies) {
      if (en instanceof KrakenTentacle) {
        if (en.state === "WARN") writeInstance(p.tentacleWarn, tWarn++, en.x + 24, en.y + 30, 0, 48, 48);
        else writeInstance(p.tentacleActive, tActive++, en.x + 24, en.y + 30, 0, 48, 76);
      } else if (en instanceof GreenFish) {
        writeInstance(p.greenFish, green++, en.x + 18, en.y + 15, en.angle, 48, en.dirRight ? 40 : -40);
      } else if (en instanceof Crab) {
        writeInstance(p.crab, crab++, en.x + 15, en.y + 12, 0, 48, 30);
      } else if (en instanceof PirateBoat) {
        if (en.dirRight) writeInstance(p.pirate, pirate++, en.x + 23, en.y + 19, en.angle, -54, 54);
        else writeInstance(p.pirate, pirate++, en.x + 23, en.y + 19, en.angle - Math.PI, 54, 54);
      } else if (en instanceof Shark) {
        writeInstance(p.shark, shark++, en.x + 28, en.y + 13, en.angle, 60, en.dirRight ? 36 : -36);
      }
    }
    finishPool(p.greenFish, green);
    finishPool(p.crab, crab);
    finishPool(p.pirate, pirate);
    finishPool(p.shark, shark);
    finishPool(p.tentacleWarn, tWarn);
    finishPool(p.tentacleActive, tActive);
  }

  _syncBoss(boss) {
    if (!boss) {
      this.boss.visible = false;
      return;
    }
    this.boss.visible = true;
    this.boss.position.set(boss.x + 120, boss.y + 18, 0);
    this.boss.rotation.z = Math.sin(boss.animTimer * 1.2) * 0.05;
    this.boss.scale.set(300, 216, 1);
  }

  _syncPortal(portal) {
    if (!portal) {
      this.portal.visible = false;
      return;
    }
    this.portal.visible = true;
    this.portal.position.set(portal.x + 32, portal.y + 32, 0);
    this.portal.rotation.z = portal.timer * 4;
    this.portal.scale.set(64, 64, 1);
  }

  _syncPlayer(player) {
    const cx = player.x + 18;
    const cy = player.y + 12;
    this.player.position.set(cx, cy, 0);
    this.player.rotation.z = 0;
    this.player.scale.set(player.dirRight ? 52 : -52, 52, 1);

    const blink =
      (player.invulnTimer > 0 || player.activePowerUps.shield > 0) &&
      Math.floor(performance.now() / 100) % 2 === 0;
    this.player.material.opacity = blink ? 0.5 : 1;

    const centerX = player.x + player.w / 2;
    const centerY = player.y + player.h / 2;

    if (player.activePowerUps.shield > 0) {
      this.shieldRing.visible = true;
      this.shieldRing.position.set(centerX, centerY, 0);
      this.shieldRing.scale.set(36, 36, 1);
      this.shieldRing.material.opacity = 0.6 + Math.sin(performance.now() / 100) * 0.4;
    } else {
      this.shieldRing.visible = false;
    }

    if (player.activePowerUps.magnet > 0) {
      this.magnetRing.visible = true;
      this.magnetRing.position.set(centerX, centerY, 0);
      this.magnetRing.scale.set(200, 200, 1);
      this.magnetRing.rotation.z = -(performance.now() / 1000) % (Math.PI * 2);
    } else {
      this.magnetRing.visible = false;
    }
  }

  dispose() {
    this._ro.disconnect();
    this.canvas.removeEventListener("webglcontextlost", this._contextLost);
    this.canvas.removeEventListener("webglcontextrestored", this._contextRestored);
    this.scene.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (obj.material.map) obj.material.map.dispose();
        obj.material.dispose();
      }
    });
    this.renderer.dispose();
  }
}