import { CANDIES } from '../core/pieces.js';

const BLOCKER_GOALS = {
  ice: { icon: 'assets/items/ice-block.png', label: 'Ice blocks', char: 'I' },
  caramel: { icon: 'assets/items/caramel-block.png', label: 'Caramel blocks', char: 'Cc' },
  chocolate: { icon: 'assets/items/chocolate.png', label: 'Chocolate', char: 'H' },
  cage: { icon: 'assets/items/cane-cage.png', label: 'Cages', char: 'L' },
};

export function goalIcon(goal) {
  if (goal.type === 'collect') return `assets/candies/${CANDIES[goal.color].key}.png`;
  if (goal.type === 'score') return 'assets/candies/star.png';
  return BLOCKER_GOALS[goal.type].icon;
}

export function goalLabel(goal) {
  if (goal.type === 'collect') return CANDIES[goal.color].plural;
  if (goal.type === 'score') return 'Points';
  return BLOCKER_GOALS[goal.type].label;
}

// Goal targets as they will be when the level starts (blockers are counted from the layout).
export function goalTargets(level) {
  return level.goals.map((goal) => {
    if (goal.type === 'score') return { ...goal, target: goal.target };
    if (goal.type === 'collect') return { ...goal, target: goal.count };
    const chars = BLOCKER_GOALS[goal.type].char;
    const target = level.layout.join('').split('').filter((ch) => chars.includes(ch)).length;
    return { ...goal, target };
  });
}

export const formatNumber = (n) => Math.round(n).toLocaleString('en-US');
