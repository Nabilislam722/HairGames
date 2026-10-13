import { Engine } from './core/engine.js';
import { EPISODES, EPISODE_SIZE, LEVELS, episodeOf } from './core/levels.js';
import { createRng } from './core/rng.js';
import { connectHost } from './host.js';
import { Hud } from './ui/hud.js';
import { formatNumber, goalIcon, goalLabel, goalTargets } from './ui/goals.js';
import { renderMap } from './ui/map.js';
import { loadProgress, saveProgress, totalStars } from './ui/progress.js';
import { Sound } from './view/audio.js';
import { BoardScene } from './view/board-scene.js';
import { Stage } from './view/stage.js';

const LOGO_COLORS = ['#ff4f9a', '#ffb526', '#ffe14d', '#34d69d', '#38c6ff', '#c27bff', '#ff7a3d'];
const WIN_LINES = ['Sweet victory!', 'Deliciously done!', 'Sugar-coated win!', 'What a treat!'];
const LOSE_LINES = ['So close!', 'Almost had it!', 'One more try?'];

const pick = (list) => list[Math.floor(Math.random() * list.length)];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

export class App {
  constructor(root, { images, snapshot = {} }) {
    this.root = root;
    // Inside HairGames the host owns game state (on chain); on its own the game keeps it locally.
    this.host = connectHost();
    this.localState = !this.host;
    this.progress = loadProgress(snapshot.progress, { local: this.localState });
    this.startToken = 0;
    this.sound = new Sound({ sfx: this.progress.sound, music: this.progress.music });
    this.stage = new Stage({ board: root.querySelector('#stage'), effects: root.querySelector('#fx'), images, sound: this.sound });
    this.hudEl = root.querySelector('#hud');
    this.hud = new Hud(this.hudEl);
    this.modalLayer = root.querySelector('#modal-layer');
    this.modal = root.querySelector('#modal');
    this.mapScroll = root.querySelector('#map-scroll');
    this.mapPath = root.querySelector('#map-path');
    this.session = null;
    this.episode = episodeOf(Math.min(this.progress.unlocked, LEVELS.length));
    this.modalActions = {};
    this.modalKind = null;
    this.modalToken = 0;

    this.safeBottom = document.createElement('div');
    this.safeBottom.style.cssText = 'position:fixed;left:0;bottom:0;width:1px;height:env(safe-area-inset-bottom,0px);visibility:hidden;pointer-events:none';
    root.append(this.safeBottom);

    this.stage.boardArea = () => this.boardArea();
    this.stage.hudPoint = () => this.hud.movesPoint();
    this.hud.onStar = (i, point) => this.meterStar(i, point);
    new ResizeObserver(() => (this.stage.dirty = true)).observe(this.hudEl);
    window.addEventListener('resize', () => {
      if (this.root.dataset.screen === 'map') this.renderMap(false);
    });

    this.buildLogo();
    this.bindUi();

    if (this.host) {
      this.host.onProgress = (progress) => this.applyHostProgress(progress);
      this.host.ready();
    }
  }

  // On-chain progress from the host replaces the game state; settings stay as they are.
  applyHostProgress({ unlocked, stars, best }) {
    Object.assign(this.progress, { unlocked: Math.max(1, unlocked), stars: { ...stars }, best: { ...best } });
    if (this.root.dataset.screen === 'map') this.renderMap(false);
  }

  snapshot() {
    return { progress: this.progress };
  }

  // ------------------------------------------------------------------ layout

  boardArea() {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const hud = this.hudEl;
    const bottom = this.safeBottom.offsetHeight;
    if (hud.offsetWidth < W * 0.6) {
      const left = hud.offsetLeft + hud.offsetWidth + 18;
      return { x: left, y: 18, w: W - left - 18, h: H - 36 - bottom };
    }
    const top = hud.offsetTop + hud.offsetHeight + 16;
    return { x: 10, y: top, w: W - 20, h: H - top - 16 - bottom };
  }

  // ------------------------------------------------------------------ screens

  show(screen) {
    this.root.dataset.screen = screen;
    this.stage.setMode(screen);
  }

  showTitle() {
    this.endSession();
    this.show('title');
  }

  buildLogo() {
    const logo = this.root.querySelector('#game-title');
    let n = 0;
    for (const word of ['Candy', 'Cascade']) {
      const span = document.createElement('span');
      span.className = 'logo-word';
      span.setAttribute('aria-hidden', 'true');
      for (const ch of word) {
        const letter = document.createElement('span');
        letter.className = 'logo-letter';
        letter.textContent = ch;
        letter.style.setProperty('--c', LOGO_COLORS[n % LOGO_COLORS.length]);
        letter.style.setProperty('--d', `${0.15 + n * 0.06}s`);
        span.append(letter);
        n++;
      }
      logo.append(span);
    }
  }

  bindUi() {
    const $ = (id) => this.root.querySelector(id);
    $('#play-btn').addEventListener('click', () => {
      this.sound.unlock();
      this.sound.play('click');
      this.openMap();
    });
    const soundToggle = $('#sound-toggle');
    const musicToggle = $('#music-toggle');
    soundToggle.setAttribute('aria-pressed', String(this.progress.sound));
    musicToggle.setAttribute('aria-pressed', String(this.progress.music));
    soundToggle.addEventListener('click', () => this.toggle('sound', soundToggle));
    musicToggle.addEventListener('click', () => this.toggle('music', musicToggle));
    $('#map-back').addEventListener('click', () => {
      this.sound.play('click');
      this.show('title');
    });
    $('#episode-prev').addEventListener('click', () => this.changeEpisode(-1));
    $('#episode-next').addEventListener('click', () => this.changeEpisode(1));
    $('#pause-btn').addEventListener('click', () => {
      this.sound.play('click');
      this.pause();
    });
    this.modal.addEventListener('click', (e) => {
      const button = e.target.closest('[data-action]');
      if (!button || this.modalLayer.classList.contains('closing')) return;
      this.sound.play('click');
      this.modalActions[button.dataset.action]?.(button);
    });
    window.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (!this.modalLayer.hidden) {
        if (this.modalKind === 'pause') this.resume();
        else if (this.modalKind === 'intro') this.closeModal();
      } else if (this.root.dataset.screen === 'game') this.pause();
    });
  }

  toggle(kind, button) {
    this.sound.unlock();
    const on = !this.progress[kind];
    this.progress[kind] = on;
    saveProgress(this.progress, { local: this.localState });
    if (kind === 'sound') this.sound.setSfx(on);
    else this.sound.setMusic(on);
    for (const el of this.root.querySelectorAll(`[data-toggle="${kind}"], #${kind}-toggle`)) el.setAttribute('aria-pressed', String(on));
    button?.setAttribute('aria-pressed', String(on));
    if (on) this.sound.play('click');
  }

  // ------------------------------------------------------------------ map

  // Shows the episode holding `levelId`, or the player's current level.
  openMap(levelId = null) {
    this.startToken++; // drop a level start still waiting on the host
    this.endSession();
    this.closeModal();
    this.episode = episodeOf(levelId ?? Math.min(this.progress.unlocked, LEVELS.length));
    this.show('map');
    this.renderMap(true);
  }

  changeEpisode(step) {
    const next = this.episode + step;
    if (next < 0 || next >= EPISODES.length) return;
    this.sound.play('click');
    this.episode = next;
    this.renderMap(true);
    this.mapPath.classList.remove('slide-next', 'slide-prev');
    void this.mapPath.offsetWidth;
    this.mapPath.classList.add(step > 0 ? 'slide-next' : 'slide-prev');
  }

  renderMap(scroll) {
    const first = this.episode * EPISODE_SIZE;
    const levels = LEVELS.slice(first, first + EPISODE_SIZE);
    const last = levels[levels.length - 1].id;
    this.root.querySelector('#map-title').textContent = EPISODES[this.episode];
    const locked = levels[0].id > this.progress.unlocked;
    this.root.querySelector('#map-sub').textContent = `Episode ${this.episode + 1} · Levels ${levels[0].id}–${last}${locked ? ' · locked' : ''}`;
    this.root.querySelector('#episode-prev').disabled = this.episode === 0;
    this.root.querySelector('#episode-next').disabled = this.episode === EPISODES.length - 1;
    const current = renderMap(this.mapPath, levels, this.progress, (level, unlocked, node) => {
      if (!unlocked) {
        this.sound.play('nope');
        node.animate(
          [{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }],
          { duration: 260 },
        );
        return;
      }
      this.sound.play('click');
      this.openLevel(level);
    });
    this.root.querySelector('#star-total').textContent = `${totalStars(this.progress)} / ${LEVELS.length * 3}`;
    if (scroll) {
      // Center the current level; otherwise start at the bottom of the trail, where the episode begins.
      requestAnimationFrame(() => {
        this.mapScroll.scrollTop = current ? current.y - this.mapScroll.clientHeight * 0.55 : this.mapScroll.scrollHeight;
      });
    }
  }

  // Inside HairGames a level with all 3 stars is finished (the contract won't start it again), so
  // players head for new levels instead of farming old ones. On its own the game allows replays.
  // The level's intro, or the mastered screen for a finished level.
  openLevel(level) {
    if (this.isMastered(level)) this.showMastered(level);
    else this.levelIntro(level);
  }

  isMastered(level) {
    return !!this.host && (this.progress.stars[level.id] ?? 0) >= 3;
  }

  showMastered(level) {
    const newest = LEVELS.find((l) => l.id === this.progress.unlocked);
    const target = newest && !this.isMastered(newest) ? newest : null;
    const stars = [0, 1, 2]
      .map(() => '<div class="result-star earned"><img class="star-off" src="assets/candies/star.png" alt=""><img class="on" src="assets/candies/star.png" alt=""></div>')
      .join('');
    this.openModal(
      'intro',
      `<h2 class="ribbon mint" id="modal-title">Level ${level.id} mastered</h2>
      <div class="modal-body">
        <p class="modal-sub">${escapeHtml(level.name)}</p>
        <div class="result-stars" role="img" aria-label="3 of 3 stars">${stars}</div>
        <p class="modal-text">${target ? 'You have all 3 stars here. Fresh levels are waiting for you!' : 'You have all 3 stars on every level. Amazing!'}</p>
        <div class="modal-actions">
          <button class="btn btn-quiet" type="button" data-action="close">Back</button>
          ${target ? `<button class="btn btn-candy" type="button" data-action="newest">Play level ${target.id}</button>` : ''}
        </div>
      </div>`,
      {
        close: () => this.closeModal(),
        newest: () => {
          this.openMap(target.id);
          setTimeout(() => this.root.dataset.screen === 'map' && this.levelIntro(target), 650);
        },
      },
    );
  }

  levelIntro(level) {
    const goals = goalTargets(level);
    const goalItems = goals
      .map(
        (g) => `<li class="modal-goal"><img src="${goalIcon(g)}" alt=""><strong>${g.type === 'score' ? formatNumber(g.target) : g.target}</strong><span>${escapeHtml(goalLabel(g))}</span></li>`,
      )
      .join('');
    const challenge = level.challenge
      ? '<p class="modal-challenge"><img src="assets/items/bomb.png" alt="">Challenge level: a little tougher than usual. It may take a second try.</p>'
      : '';
    this.openModal(
      'intro',
      `<h2 class="ribbon${level.challenge ? ' challenge' : ''}" id="modal-title">Level ${level.id}</h2>
      <div class="modal-body">
        <p class="modal-sub">${escapeHtml(level.name)}</p>
        ${challenge}
        <ul class="modal-goals" aria-label="Goals">${goalItems}</ul>
        ${level.tip ? `<p class="modal-text">${escapeHtml(level.tip)}</p>` : ''}
        <p class="modal-moves"><img src="assets/items/stopwatch.png" alt="">${level.moves} moves</p>
        <div class="modal-actions">
          <button class="btn btn-quiet" type="button" data-action="close">Back</button>
          <button class="btn btn-candy" type="button" data-action="start">Play</button>
        </div>
      </div>`,
      { start: () => this.startLevel(level), close: () => this.closeModal() },
    );
  }

  //  playing

  // Inside HairGames the board comes from a server seed, so the server can replay the moves later;
  // on its own the game seeds itself.
  async startLevel(level) {
    this.sound.unlock();
    const token = ++this.startToken;
    let seed;
    let sessionId = null;
    if (this.host) {
      this.openModal(
        'loading',
        `<h2 class="ribbon${level.challenge ? ' challenge' : ''}" id="modal-title">Level ${level.id}</h2>
        <div class="modal-body"><p class="modal-sub">Shuffling the candies…</p></div>`,
        {},
      );
      try {
        ({ sessionId, seed } = await this.host.startLevel(level.id));
      } catch (error) {
        if (token === this.startToken) this.showStartError(level, error.message);
        return;
      }
      if (token !== this.startToken) return;
    }
    this.closeModal();
    this.endSession();
    const engine = new Engine(level, { rng: createRng(seed) });
    const scene = new BoardScene(this.stage, engine, level);
    engine.anim = scene;
    const session = { level, engine, scene, sessionId, flyers: 0, prevBest: this.progress.best[level.id] ?? 0 };
    engine.hooks = this.hooksFor(session);
    this.session = session;
    this.hud.setup(level, engine);
    this.show('game');
    this.stage.setScene(scene);
    this.stage.paused = false;
    this.stage.resize();
    scene.intro();
  }

  showStartError(level, message) {
    this.openModal(
      'error',
      `<h2 class="ribbon dusk" id="modal-title">Level ${level.id}</h2>
      <div class="modal-body">
        <p class="modal-sub">Couldn't start the level</p>
        <p class="modal-text">${escapeHtml(message)}</p>
        <div class="modal-actions">
          <button class="btn btn-quiet" type="button" data-action="map">Level map</button>
          <button class="btn btn-candy" type="button" data-action="retry">Try again</button>
        </div>
      </div>`,
      { retry: () => this.startLevel(level), map: () => this.openMap(level.id) },
    );
  }

  endSession() {
    this.session = null;
    this.stage.setScene(null);
    this.stage.paused = false;
  }

  hooksFor(session) {
    const live =
      (fn) =>
      (...args) => {
        if (this.session === session) fn(...args);
      };
    const { engine, scene } = session;
    return {
      score: live((total) => {
        this.hud.setScore(total);
        engine.goals.forEach((goal, i) => goal.type === 'score' && this.hud.renderGoal(i, goal));
      }),
      moves: live((moves, delta, cell) => {
        if (delta > 0 && cell) {
          const [x, y] = scene.center(cell);
          const to = this.hud.movesPoint();
          this.stage.fx.flyer(this.stage.bank.badge, x, y, to.x, to.y, {
            duration: 0.75,
            scale0: 1.6,
            scale1: 1.1,
            onArrive: () => {
              if (this.session !== session) return;
              this.hud.setMoves(engine.moves);
              this.hud.bumpMovesIcon();
              this.stage.fx.sparkles(to.x, to.y, 8, 24, { size: 0.6 });
            },
          });
        } else {
          this.hud.setMoves(moves, delta !== 0);
        }
      }),
      goal: live((index, goal, cell, detail) => this.goalProgress(session, index, goal, cell, detail)),
      win: live((result) => this.finish(session, result)),
      lose: live((result) => this.finish(session, result)),
    };
  }

  goalSprite(goal, detail) {
    const bank = this.stage.bank;
    if (goal.type === 'collect') return bank.candies[detail.color].normal;
    if (goal.type === 'ice') return bank.ice.normal;
    if (goal.type === 'caramel') return bank.caramelCracked.normal;
    if (goal.type === 'chocolate') return bank.chocolate.normal;
    return bank.cage.normal;
  }

  // A cleared goal item flies up to its HUD icon; the counter ticks when it lands.
  goalProgress(session, index, goal, cell, detail) {
    if (!cell || !detail) {
      this.hud.syncGoal(index, goal);
      return;
    }
    if (session.flyers > 28 || this.stage.reduced) {
      this.hud.tickGoal(index, goal);
      return;
    }
    const [x, y] = session.scene.center(cell);
    const to = this.hud.goalPoint(index);
    const sprite = this.goalSprite(goal, detail);
    session.flyers++;
    this.stage.fx.flyer(sprite, x, y, to.x, to.y, {
      duration: 0.62 + Math.random() * 0.18,
      delay: 0.1,
      scale0: 1,
      scale1: 34 / Math.max(34, sprite.iw ?? sprite.w),
      arc: 0.28,
      onArrive: () => {
        session.flyers--;
        if (this.session !== session) return;
        this.hud.tickGoal(index, goal);
        this.stage.fx.sparkles(to.x, to.y, 3, 14, { size: 0.45 });
        this.sound.play('ding', { step: 9 });
      },
    });
  }

  meterStar(i, point) {
    this.stage.fx.sparkles(point.x, point.y, 8, 16, { size: 0.7 });
    this.stage.fx.ring(point.x, point.y, 4, 34, '#fff3b0', 0.45, 6);
    this.sound.play('star', { step: i });
  }

  async finish(session, result) {
    const { level } = session;
    if (result.win && this.localState) {
      const p = this.progress;
      p.stars[level.id] = Math.max(p.stars[level.id] ?? 0, result.stars);
      p.best[level.id] = Math.max(p.best[level.id] ?? 0, result.score);
      p.unlocked = Math.max(p.unlocked, Math.min(LEVELS.length, level.id + 1));
      if (level.id === LEVELS.length) p.unlocked = LEVELS.length;
      saveProgress(p);
    }
    await sleep(result.win ? 650 : 750);
    if (this.session !== session) return;
    if (result.win) this.showWin(session, result);
    else this.showLose(session);
    if (result.win && this.host) this.saveWin(session);
  }

  // The host verifies the moves, saves the result on chain and sends back the new progress. It
  // shows its own progress and error screens over the game, so failures need nothing here: the
  // level just stays as it was on chain.
  async saveWin(session) {
    try {
      const { progress } = await this.host.submitWin({
        sessionId: session.sessionId,
        levelId: session.level.id,
        moves: session.engine.moveLog,
      });
      this.applyHostProgress(progress);
    } catch {
      // Shown by the host.
    }
  }

  showWin(session, result) {
    const { level } = session;
    const next = LEVELS.find((l) => l.id === level.id + 1);
    const newBest = result.score > session.prevBest;
    // A 3-star clear inside HairGames finishes the level, so there's nothing to replay.
    const canReplay = !(this.host && result.stars >= 3);
    const stars = [0, 1, 2]
      .map((i) => `<div class="result-star"><img class="star-off" src="assets/candies/star.png" alt=""><img class="on" src="assets/candies/star.png" alt=""></div>`)
      .join('');
    this.openModal(
      'win',
      `<h2 class="ribbon mint" id="modal-title">${level.challenge ? 'Challenge cleared' : `Level ${level.id} cleared`}</h2>
      <div class="modal-body">
        <p class="modal-sub">${pick(WIN_LINES)}</p>
        <div class="result-stars" role="img" aria-label="${result.stars} of 3 stars">${stars}</div>
        <p class="result-score" id="result-score">0</p>
        <p class="result-best${newBest ? ' new' : ''}">${newBest ? 'New best score!' : `Best ${formatNumber(session.prevBest)}`}</p>
        <div class="modal-actions">
          ${canReplay ? '<button class="btn btn-quiet" type="button" data-action="replay">Replay</button>' : ''}
          <button class="btn btn-mint" type="button" data-action="next">${next ? 'Next level' : 'Level map'}</button>
        </div>
      </div>`,
      {
        replay: () => this.startLevel(level),
        next: () => {
          this.openMap(next?.id ?? level.id);
          // Inside HairGames the next level unlocks once the win is saved on chain.
          const unlocked = next && next.id <= this.progress.unlocked;
          if (unlocked) setTimeout(() => this.root.dataset.screen === 'map' && this.openLevel(next), 650);
        },
      },
    );
    const scoreEl = this.modal.querySelector('#result-score');
    const start = performance.now();
    const count = (now) => {
      const k = Math.min(1, (now - start) / 1200);
      scoreEl.textContent = formatNumber(result.score * (1 - (1 - k) ** 3));
      if (k < 1 && scoreEl.isConnected) requestAnimationFrame(count);
    };
    requestAnimationFrame(count);
    const slots = [...this.modal.querySelectorAll('.result-star')];
    for (let i = 0; i < result.stars; i++) {
      setTimeout(() => {
        if (!slots[i].isConnected) return;
        slots[i].classList.add('earned');
        setTimeout(() => {
          const r = slots[i].getBoundingClientRect();
          const x = r.left + r.width / 2;
          const y = r.top + r.height / 2;
          this.stage.fx.sparkles(x, y, 12, r.width * 0.5, { size: 1 });
          this.stage.fx.ring(x, y, 10, r.width, '#fff3b0', 0.5, 10);
          if (i === 2) this.stage.fx.confettiRain(window.innerWidth, window.innerHeight, 150);
        }, 260);
        this.sound.play('star', { step: i });
      }, 550 + i * 420);
    }
  }

  showLose(session) {
    const { level, engine } = session;
    const items = engine.goals
      .map((g) => {
        const met = g.left <= 0;
        const value = met ? 'Done' : g.type === 'score' ? formatNumber(g.left) : g.left;
        const caption = met ? escapeHtml(goalLabel(g)) : g.type === 'score' ? 'points to go' : `${escapeHtml(goalLabel(g))} left`;
        return `<li class="modal-goal${met ? ' met' : ''}"><img src="${goalIcon(g)}" alt=""><strong>${value}</strong><span>${caption}</span></li>`;
      })
      .join('');
    this.sound.play('lose');
    this.openModal(
      'lose',
      `<h2 class="ribbon dusk" id="modal-title">Out of moves</h2>
      <div class="modal-body">
        <p class="modal-sub">${pick(LOSE_LINES)}</p>
        <ul class="modal-goals">${items}</ul>
        <div class="modal-actions">
          <button class="btn btn-quiet" type="button" data-action="map">Level map</button>
          <button class="btn btn-caramel" type="button" data-action="retry">Try again</button>
        </div>
      </div>`,
      { retry: () => this.startLevel(level), map: () => this.openMap(level.id) },
    );
  }

  pause() {
    if (!this.session || this.root.dataset.screen !== 'game' || !this.modalLayer.hidden || this.session.engine.over) return;
    this.stage.paused = true;
    const { level } = this.session;
    this.openModal(
      'pause',
      `<h2 class="ribbon dusk" id="modal-title">Paused</h2>
      <div class="modal-body">
        <p class="modal-sub">Level ${level.id} · ${escapeHtml(level.name)}</p>
        <div class="modal-toggles">
          <button class="chip" type="button" data-action="sound" data-toggle="sound" aria-pressed="${this.progress.sound}">Sound</button>
          <button class="chip" type="button" data-action="music" data-toggle="music" aria-pressed="${this.progress.music}">Music</button>
        </div>
        <div class="modal-actions stack">
          <button class="btn btn-mint" type="button" data-action="resume">Resume</button>
          <button class="btn btn-caramel" type="button" data-action="restart">Restart level</button>
          <button class="btn btn-quiet" type="button" data-action="quit">Quit to map</button>
        </div>
      </div>`,
      {
        resume: () => this.resume(),
        restart: () => this.startLevel(level),
        quit: () => this.openMap(level.id),
        sound: (b) => this.toggle('sound', b),
        music: (b) => this.toggle('music', b),
      },
    );
  }

  resume() {
    this.closeModal();
    this.stage.paused = false;
  }

  // ------------------------------------------------------------------ modal

  openModal(kind, html, actions) {
    this.modalToken++;
    this.modalKind = kind;
    this.modal.innerHTML = html;
    this.modalActions = actions;
    this.modalLayer.classList.remove('closing');
    this.modalLayer.hidden = false;
    const primary = this.modal.querySelector('.btn-mint, .btn-candy, .btn-caramel');
    primary?.focus({ preventScroll: true });
  }

  closeModal() {
    if (this.modalLayer.hidden) return;
    const token = ++this.modalToken;
    this.modalKind = null;
    if (this.modal.contains(document.activeElement)) document.activeElement.blur();
    this.modalLayer.classList.add('closing');
    setTimeout(() => {
      if (token !== this.modalToken) return;
      this.modalLayer.hidden = true;
      this.modalLayer.classList.remove('closing');
    }, 240);
  }
}
