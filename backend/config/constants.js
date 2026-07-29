export const ECOSYSTEM_CONTRACTS = {
  "space_huggers": "0x895087a3b85C38DAB365495A5E1EA518459A9750",
  "racing_game": "0x3E0784ffE4e036bCc1859CA124dF327e8B866E29", 
  "fishing_party": "0x45cee112Ba2EbDE8224a1fA14D329f6AB190a7eA",
  "fruit_ninja": "0x1f2a78Ce71aFbac323bEDc3404d206E7F94D8CFd",
  "default_legacy": "0x61A86E5B2075d0E6ff659a6b29D1E367CAa6a8E5"
};

export const GENERIC_GAME_ABI = [
  {
    "inputs": [{ "internalType": "address", "name": "", "type": "address" }],
    "name": "userNonces",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  }
];

export const SUBMIT_LEVEL_SCORE_SELECTOR = "0xaba261ec";
export const GAME_CONFIG = {
  RACE_INITIAL_POINTS: Number(process.env.RACE_INITIAL_POINTS) || 15000,
  RACE_POINTS_DECREMENT_PER_SECOND: Number(process.env.RACE_POINTS_DECREMENT_PER_SECOND) || 100
};