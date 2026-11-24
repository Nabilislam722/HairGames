import { formatNumber, goalIcon, goalLabel } from './goals.js';

const CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

function restartAnimation(el, className) {
  el.classList.remove(className);
  void el.offsetWidth;
  el.classList.add(className);
}

// The DOM heads-up display: moves, goals, score and the stars still in reach, all animated.
export class Hud {
  constructor(root) {
    this.root = root;
    this.el = {
      level: root.querySelector('#hud-level'),
      name: root.querySelector('#hud-name'),
      movesPanel: root.querySelector('#hud-moves'),
      moves: root.querySelector('#moves'),
      goals: root.querySelector('#goal-list'),
      score: root.querySelector('#score'),
      starRow: root.querySelector('#star-marks'),
      stars: [...root.querySelectorAll('.star-mark')],
    };
    this.shownScore = 0;
    this.targetScore = 0;
    this.inReach = 3;
    this.goalShown = [];
    this.onStar = null; // (index, point) when a star comes back in reach
    this.onStarLost = null; // (index, point) when one goes out of reach
    this.raf = 0;
  }

  setup(level, engine) {
    this.level = level;
    this.el.level.textContent = `Level ${level.id}`;
    this.el.name.textContent = level.name;
    this.shownScore = 0;
    this.targetScore = 0;
    this.el.score.textContent = '0';
    // Stars 2 and 3 show the moves that must be left when the goals are met.
    this.el.stars.forEach((star, i) => {
      const need = i === 0 ? null : level.starMoves[i - 1];
      const badge = star.querySelector('.star-need');
      if (badge) badge.textContent = String(need);
      star.title = i === 0 ? '1 star: clear the level' : `${i + 1} stars: finish with ${need} or more moves left`;
    });
    this.setStars(engine.starsInReach(), false);
    this.setMoves(engine.moves, false);
    this.el.goals.replaceChildren();
    this.goalShown = engine.goals.map((goal) => goal.left);
    engine.goals.forEach((goal, i) => {
      const li = document.createElement('li');
      li.className = 'goal';
      li.dataset.index = i;
      const img = document.createElement('img');
      img.src = goalIcon(goal);
      img.alt = '';
      const count = document.createElement('span');
      count.className = goal.type === 'score' ? 'goal-count goal-score' : 'goal-count';
      const check = document.createElement('span');
      check.className = 'goal-check';
      check.innerHTML = CHECK;
      li.append(img, count, check);
      this.el.goals.append(li);
      this.renderGoal(i, goal);
    });
  }

  renderGoal(index, goal) {
    const li = this.el.goals.children[index];
    if (!li) return;
    const shown = this.goalShown[index];
    const count = li.querySelector('.goal-count');
    if (goal.type === 'score') {
      count.textContent = formatNumber(goal.target);
      li.classList.toggle('done', goal.left <= 0);
      li.setAttribute('aria-label', `Reach ${formatNumber(goal.target)} points`);
      return;
    }
    count.textContent = String(Math.max(0, shown));
    li.classList.toggle('done', shown <= 0);
    li.setAttribute('aria-label', `${goalLabel(goal)}: ${Math.max(0, shown)} left`);
  }

  // Counts down one goal item when a flying candy lands on its icon.
  tickGoal(index, goal) {
    this.goalShown[index] = Math.max(goal.left, this.goalShown[index] - 1);
    this.renderGoal(index, goal);
    const li = this.el.goals.children[index];
    if (li) restartAnimation(li.querySelector('img'), 'bump');
  }

  syncGoal(index, goal) {
    this.goalShown[index] = goal.left;
    this.renderGoal(index, goal);
  }

  setMoves(moves, bump = true) {
    this.el.moves.textContent = String(moves);
    this.el.movesPanel.classList.toggle('low', moves <= 5 && moves > 0);
    if (bump) restartAnimation(this.el.moves, 'bump');
  }

  // Lights the stars a win can still earn. With `animate`, a star that drops out of reach (or comes
  // back, after a stopwatch bonus) gets an animation and its callback.
  setStars(count, animate = true) {
    const before = this.inReach;
    this.inReach = count;
    this.el.stars.forEach((star, i) => {
      const lit = i < count;
      star.classList.toggle('lit', lit);
      if (!animate || lit === i < before) return;
      restartAnimation(star, lit ? 'regained' : 'lost');
      (lit ? this.onStar : this.onStarLost)?.(i, this.center(star));
    });
    this.el.starRow.setAttribute('aria-label', `${count} ${count === 1 ? 'star' : 'stars'} in reach`);
  }

  setScore(score) {
    this.targetScore = score;
    if (this.raf) return;
    let last = performance.now();
    const step = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const gap = this.targetScore - this.shownScore;
      this.shownScore += gap * Math.min(1, dt * 9) + Math.sign(gap) * Math.min(Math.abs(gap), dt * 60);
      if (Math.abs(this.targetScore - this.shownScore) < 1) this.shownScore = this.targetScore;
      this.el.score.textContent = formatNumber(this.shownScore);
      this.raf = this.shownScore === this.targetScore ? 0 : requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }

  center(el) {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  goalPoint(index) {
    const li = this.el.goals.children[index];
    return li ? this.center(li.querySelector('img')) : this.movesPoint();
  }

  movesPoint() {
    return this.center(this.el.movesPanel.querySelector('img'));
  }

  bumpMovesIcon() {
    restartAnimation(this.el.movesPanel.querySelector('img'), 'bump');
  }
}
