import { formatNumber, goalIcon, goalLabel } from './goals.js';

// Star markers sit evenly along the meter; the fill moves piecewise between thresholds.
const MARKS = [0.28, 0.6, 0.9];

function meterFraction(score, stars) {
  const at = [0, ...MARKS];
  const thresholds = [0, ...stars];
  if (score >= stars[2]) return 1;
  for (let i = 1; i < 4; i++) {
    if (score < thresholds[i]) return at[i - 1] + ((at[i] - at[i - 1]) * (score - thresholds[i - 1])) / (thresholds[i] - thresholds[i - 1]);
  }
  return 1;
}

const CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

function restartAnimation(el, className) {
  el.classList.remove(className);
  void el.offsetWidth;
  el.classList.add(className);
}

// The DOM heads-up display: moves, goals and the score meter, all animated.
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
      fill: root.querySelector('#meter-fill'),
      stars: [...root.querySelectorAll('.meter-star')],
    };
    this.shownScore = 0;
    this.targetScore = 0;
    this.lit = 0;
    this.goalShown = [];
    this.onStar = null;
    this.raf = 0;
  }

  setup(level, engine) {
    this.level = level;
    this.el.level.textContent = `Level ${level.id}`;
    this.el.name.textContent = level.name;
    this.shownScore = 0;
    this.targetScore = 0;
    this.lit = 0;
    this.el.score.textContent = '0';
    this.el.fill.style.width = '0%';
    this.el.stars.forEach((star, i) => {
      star.classList.remove('lit');
      star.style.left = `${MARKS[i] * 100}%`;
    });
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

  setScore(score) {
    this.targetScore = score;
    if (!this.raf) {
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
    const stars = this.level.stars;
    this.el.fill.style.width = `${meterFraction(score, stars) * 100}%`;
    while (this.lit < 3 && score >= stars[this.lit]) {
      const star = this.el.stars[this.lit];
      star.classList.add('lit');
      this.onStar?.(this.lit, this.center(star));
      this.lit++;
    }
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
