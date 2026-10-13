import { DECOR_KEYS } from '../view/assets.js';

const SPACING = 128;
const LOCK =
  '<svg class="lock" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10V8a5 5 0 0 1 10 0v2h1a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 18 21H6a1.5 1.5 0 0 1-1.5-1.5v-8A1.5 1.5 0 0 1 6 10Zm2.5 0h5V8a2.5 2.5 0 0 0-5 0Z"/></svg>';

// One episode of the level trail: a winding path from its first level (bottom) to its last.
// `offset` is the index of the first level overall, so the curve continues across episodes.
export function renderMap(container, levels, progress, onSelect, offset = 0) {
  const width = container.clientWidth || 360;
  const height = levels.length * SPACING + 180;
  container.style.height = `${height}px`;
  container.replaceChildren();

  const points = levels.map((level, i) => {
    const swing = Math.min(width * 0.3, 150);
    return { x: width / 2 + Math.sin((offset + i) * 1.15 + 0.4) * swing, y: height - 110 - i * SPACING };
  });

  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('class', 'map-svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('aria-hidden', 'true');
  let d = `M ${points[0].x} ${points[0].y + 60}`;
  d += ` L ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const my = (a.y + b.y) / 2;
    d += ` C ${a.x} ${my}, ${b.x} ${my}, ${b.x} ${b.y}`;
  }
  const under = document.createElementNS(svgNS, 'path');
  under.setAttribute('d', d);
  under.setAttribute('fill', 'none');
  under.setAttribute('stroke', 'rgba(74, 29, 87, 0.22)');
  under.setAttribute('stroke-width', '30');
  under.setAttribute('stroke-linecap', 'round');
  const dots = document.createElementNS(svgNS, 'path');
  dots.setAttribute('d', d);
  dots.setAttribute('fill', 'none');
  dots.setAttribute('stroke', '#ffffff');
  dots.setAttribute('stroke-width', '11');
  dots.setAttribute('stroke-linecap', 'round');
  dots.setAttribute('stroke-dasharray', '0.1 22');
  dots.setAttribute('opacity', '0.9');
  svg.append(under, dots);
  container.append(svg);

  // Treats from the art pack decorate the trail, alternating sides.
  levels.forEach((level, i) => {
    if (i % 2 === 1) return;
    const p = points[i];
    const img = document.createElement('img');
    img.className = 'map-decor';
    img.src = `assets/items/${DECOR_KEYS[((offset + i) / 2) % DECOR_KEYS.length]}.png`;
    img.alt = '';
    const side = p.x > width / 2 ? -1 : 1;
    img.style.left = side < 0 ? `${Math.max(6, width * 0.06)}px` : `${Math.min(width - 78, width * 0.94 - 72)}px`;
    img.style.top = `${p.y - 36}px`;
    img.style.setProperty('--d', `${-i * 0.7}s`);
    img.style.setProperty('--r', `${side * 8}deg`);
    container.append(img);
  });

  let current = null;
  levels.forEach((level, i) => {
    const p = points[i];
    const unlocked = level.id <= progress.unlocked;
    const earned = progress.stars[level.id] ?? 0;
    const state = !unlocked ? 'locked' : level.id === progress.unlocked && !earned ? 'current' : 'done';

    if (unlocked && earned) {
      const stars = document.createElement('div');
      stars.className = 'node-stars';
      stars.style.left = `${p.x}px`;
      stars.style.top = `${p.y}px`;
      for (let s = 0; s < 3; s++) {
        const img = document.createElement('img');
        img.src = 'assets/candies/star.png';
        img.alt = '';
        if (s >= earned) img.className = 'star-off';
        stars.append(img);
      }
      container.append(stars);
    }

    if (state === 'current') {
      const frame = document.createElement('img');
      frame.className = 'map-frame';
      frame.src = 'assets/ui/select-frame.png';
      frame.alt = '';
      frame.style.left = `${p.x}px`;
      frame.style.top = `${p.y}px`;
      container.append(frame);
    }

    const node = document.createElement('button');
    node.type = 'button';
    node.className = 'map-node';
    node.dataset.state = state;
    if (level.challenge) node.dataset.challenge = '';
    node.style.left = `${p.x}px`;
    node.style.top = `${p.y}px`;
    node.style.setProperty('--d', `${Math.min(i, 8) * 0.04}s`);
    node.textContent = String(level.id);
    const starsText = earned ? `, ${earned} of 3 stars` : '';
    const kind = level.challenge ? ' (challenge)' : '';
    node.setAttribute('aria-label', unlocked ? `Level ${level.id}${kind}: ${level.name}${starsText}` : `Level ${level.id}${kind}, locked`);
    if (level.challenge) {
      const badge = document.createElement('img');
      badge.className = 'node-badge';
      badge.src = 'assets/items/bomb.png';
      badge.alt = '';
      node.append(badge);
    }
    if (!unlocked) {
      node.insertAdjacentHTML('beforeend', LOCK);
      node.setAttribute('aria-disabled', 'true');
    }
    node.addEventListener('click', () => onSelect(level, unlocked, node));
    container.append(node);

    if (state !== 'locked') {
      const label = document.createElement('span');
      label.className = 'node-label';
      if (level.challenge) label.dataset.challenge = '';
      label.textContent = level.name;
      label.style.left = `${p.x}px`;
      label.style.top = `${p.y}px`;
      container.append(label);
    }
    if (level.id === progress.unlocked) current = p;
  });
  return current;
}
