// Must match GAME_HP in backend/config/constants.js. Games the server scales show their score already
// scaled with hpForScore, so the number on screen is the HP the play earns. Games the server doesn't
// scale cap their own score at MAX_HP_PER_PLAY.
export const MAX_HP_PER_PLAY = 3000;

const HP_SCALE = {
  racing_game: 0.2,
  proof_of_patience: 0.2,
  candy_cascade: 0.2,
  space_huggers: 0.3,
};

export const hpForScore = (gameId, score) =>
  Math.min(Math.round(Math.max(0, Number(score) || 0) * (HP_SCALE[gameId] ?? 1)), MAX_HP_PER_PLAY);
