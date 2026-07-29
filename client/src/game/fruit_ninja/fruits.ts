import type { FruitKind, AbilityKind } from "./types";

// Adjust these two import paths to wherever you drop the logo assets in
// your project (e.g. src/assets/fruit-ninja/). Vite will resolve them to a
// URL string, which is what AbilityKind.iconSrc expects.
import hairIcon from "/hair.png";
import hemiIcon from "/hemi.png";

function rad(deg: number) {
  return (deg * Math.PI) / 180;
}

export const FRUITS: FruitKind[] = [
  {
    id: "watermelon",
    name: "Watermelon",
    color: "#2e7d32",
    rim: "#66bb6a",
    inner: "#ef5350",
    seed: "#1b1b1b",
    radius: 58,
    points: 40,
  },
  {
    id: "orange",
    name: "Orange",
    color: "#fb8c00",
    rim: "#ffa726",
    inner: "#ffb74d",
    seed: "#e65100",
    radius: 46,
    points: 30,
  },
  {
    id: "apple",
    name: "Apple",
    color: "#e53935",
    rim: "#ef5350",
    inner: "#fff3e0",
    seed: "#6d4c41",
    radius: 44,
    points: 20,
  },
  {
    id: "lemon",
    name: "Lemon",
    color: "#fdd835",
    rim: "#fff176",
    inner: "#fff59d",
    seed: "#c0ca33",
    radius: 40,
    points: 20,
  },
  {
    id: "kiwi",
    name: "Kiwi",
    color: "#7cb342",
    rim: "#aed581",
    inner: "#dcedc8",
    seed: "#33691e",
    radius: 42,
    points: 20,
  },
  {
    id: "strawberry",
    name: "Strawberry",
    color: "#e91e63",
    rim: "#ec407a",
    inner: "#ff80ab",
    seed: "#fffde7",
    radius: 40,
    points: 20,
  },
  {
    id: "dragonfruit",
    name: "Dragonfruit",
    color: "#d81b60",
    rim: "#f06292",
    inner: "#f8bbd0",
    seed: "#311b92",
    radius: 50,
    points: 30,
  },
  {
    id: "blueberry",
    name: "Blueberry",
    color: "#3f51b5",
    rim: "#5c6bc0",
    inner: "#9fa8da",
    seed: "#1a237e",
    radius: 34,
    points: 20,
  },
  {
    id: "mango",
    name: "Mango",
    color: "#fb8c00",
    rim: "#ffca28",
    inner: "#ffe082",
    seed: "#bf360c",
    radius: 48,
    points: 25,
  },
  {
    id: "pomelo",
    name: "Pomelo",
    color: "#9ccc65",
    rim: "#c5e1a5",
    inner: "#f1f8e9",
    seed: "#558b2f",
    radius: 56,
    points: 25,
  },
  {
    id: "lychee",
    name: "Lychee",
    color: "#f48fb1",
    rim: "#f8bbd0",
    inner: "#fffde7",
    seed: "#880e4f",
    radius: 38,
    points: 15,
  },
  {
    id: "persimmon",
    name: "Persimmon",
    color: "#ff7043",
    rim: "#ffab91",
    inner: "#ffccbc",
    seed: "#bf360c",
    radius: 44,
    points: 15,
  },
  {
    id: "grape",
    name: "Grape",
    color: "#7b1fa2",
    rim: "#ab47bc",
    inner: "#ce93d8",
    seed: "#4a148c",
    radius: 36,
    points: 20,
  },
  {
    id: "coconut",
    name: "Coconut",
    color: "#8d6e63",
    rim: "#bcaaa4",
    inner: "#fff8e1",
    seed: "#3e2723",
    radius: 52,
    points: 25,
  },
];

export const BOMB = {
  id: "bomb" as const,
  radius: 46,
};

export const ABILITY_FRUITS: AbilityKind[] = [
  {
    id: "frenzy",
    name: "Frenzy",
    color: "#FFFFFF",
    rim: "#f48fb1",
    inner: "#050505",
    seed: "#880e4f",
    radius: 44,
    points: 30,
    ability: "frenzy",
    glow: "#ff80ab",
  },
  {
    id: "glitch",
    name: "Glitch",
    color: "#B9131A",
    rim: "#EF4F4D",
    inner: "#9fa8da",
    seed: "#1a237e",
    radius: 44,
    points: 10,
    ability: "glitch",
    glow: "#7c4dff",
  },
  {
    id: "golden",
    name: "Golden",
    color: "#ffc107",
    rim: "#ffe082",
    inner: "#fff8e1",
    seed: "#ff6f00",
    radius: 42,
    points: 500,
    ability: "golden",
    glow: "#ffca28",
  },
  {
    id: "multiplier",
    name: "Multiplier",
    color: "#26a69a",
    rim: "#80cbc4",
    inner: "#b2dfdb",
    seed: "#004d40",
    radius: 44,
    points: 20,
    ability: "multiplier",
    glow: "#4db6ac",
  },
  {
    id: "hair",
    name: "$HAIR Bonus",
    color: "#FF6B00",
    rim: "#FFB74D",
    inner: "#FFE0B2",
    seed: "#E65100",
    radius: 44,
    points: 45,
    ability: "hair",
    glow: "#FF9800",
    iconSrc: hairIcon,
  },
  {
    id: "hemi",
    name: "Hemi Boost",
    color: "#FF4500",
    rim: "#FF8A50",
    inner: "#FFCCBC",
    seed: "#BF360C",
    radius: 44,
    points: 65,
    ability: "hemi",
    glow: "#FF5722",
    iconSrc: hemiIcon,
  },
];

export function randomFruit(): FruitKind {
  return FRUITS[Math.floor(Math.random() * FRUITS.length)];
}

export function randomAbilityFruit(): AbilityKind {
  return ABILITY_FRUITS[Math.floor(Math.random() * ABILITY_FRUITS.length)];
}