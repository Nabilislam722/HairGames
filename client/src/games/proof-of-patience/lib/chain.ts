export const HEMI_CHAIN_ID = 43_111;
export const HEMI_CHAIN_ID_HEX = "0xa867";
export const HEMI_RPC_URL = "https://rpc.hemi.network/rpc";
export const HEMI_EXPLORER_URL = "https://explorer.hemi.xyz";


export const proofOfPatienceAbi = [
  "function startRun() external",
  "function submitScore(uint256 score, uint256 survivalSeconds, uint256 answered, uint256 shots, uint256 hits, uint256 nonce, bytes calldata signature) external payable",
  "function activeRuns(address player) view returns (uint256 startTime, bool isActive)",
  "function userNonces(address player) view returns (uint256)",
  "function playerBestScore(address player) view returns (uint256)",
  "function submissionFee() view returns (uint256)",
  "function trustedSigner() view returns (address)",
  "event RunStarted(address indexed player, uint256 startTime)",
  "event RunCompleted(address indexed player, uint256 score, uint256 survivalSeconds, uint256 answered, uint256 shots, uint256 hits, uint256 feePaid)",
];

/* plausibility  */
/*
 * Backend-only from here down. The contract trusts `trustedSigner`
 * completely and does no scoring math itself, so this is what the signer
 * must run BEFORE it signs — not something the client or contract checks.
 */

/** Mirrors the practical maximum a legitimate run can reach. */
export const MAX_SCORE = 30_000;

/**
 * The highest score a run answering `answered` questions with `hits` correct
 * letters could actually have produced.
 *
 * Derived from every award site in the simulation:
 *   - per correct letter: `20 + combo * 3`, combo <= answered      -> 3ha + 20h
 *   - per answer: `spec.value * combo`, value <= 340, combo <= answered
 *     summed over the run: sum(340 * i) for i in 1..a               -> 170a(a+1)
 *   - perfect-chain bonus <= 750, backlog burn 300, POP OFF 260     -> 1310a
 *   - a perfect-chain bonus and a backlog burn can also land on the
 *     very first answer, so they appear in the constant too         ->   1050
 *   - five MWM breaks at 250, end-of-round <= 6000                  ->   7250
 *
 * This is a real upper bound, not a guess: verified against a full sweep with
 * zero false rejections.
 */
export function honestScoreCeiling(answered: number, hits: number) {
  const a = answered;
  const h = hits;
  return 170 * a * (a + 1) + 1_310 * a + 3 * h * a + 20 * h + 8_300;
}

/** Tolerance over `honestScoreCeiling` before a result is refused. */
export const SCORE_TOLERANCE = 1.25;

/**
 * Rate ceilings implied by the fire cooldown, in events per second.
 *
 * A SOON is four letters at a 0.06s cooldown, so shooting alone answers at most
 * 4.17 questions a second. POP OFF answers cost no time — but they are not free
 * either: the meter gains at most 8 per answer and a clear needs 100, so every
 * POP OFF is paid for with at least 12.5 shot-gated answers and returns at most
 * 8. That bounds the inflation at 1.64x, giving 6.83/s. Rounded up to 8.
 */
export const MAX_ANSWERS_PER_SECOND = 8;
export const MAX_SHOTS_PER_SECOND = 17;

export interface PlausibilityInput {
  score: number;
  survivalSeconds: number;
  answered: number;
  shots: number;
  hits: number;
}

/** Returns a human-readable reason when a result could not have been played. */
export function implausibleReason(result: PlausibilityInput): string | null {
  if (result.hits > result.shots) return "More hits than shots.";
  if (result.score > MAX_SCORE) return "Score is above the contract maximum.";

  // `survivalSeconds` is floored before it is signed, so a run reported as S
  // seconds actually ran for up to S+1. Without this the rate rules refuse
  // honest sub-five-second runs.
  const duration = result.survivalSeconds + 1;

  const ceiling = Math.min(
    honestScoreCeiling(result.answered, result.hits) * SCORE_TOLERANCE,
    MAX_SCORE,
  );
  if (result.score > ceiling) return "Score is higher than this run's answers could produce.";

  if (result.answered > duration * MAX_ANSWERS_PER_SECOND) {
    return "More answers than the round length allows.";
  }
  if (result.shots > duration * MAX_SHOTS_PER_SECOND + 1) {
    return "More shots than the fire rate allows.";
  }
  return null;
}