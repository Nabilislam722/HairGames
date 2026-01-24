
export const CURRENT_USER = {
  id: 'u1',
  username: 'PlayerOne',
  avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=PlayerOne',
  level: 5,
  points: 1250,
  rank: 42,
  streak: 3,
  achievements: ['Speedster', 'Brainiac']
};

export const QUESTIONS = [
  {
    id: 1,
    text: "What is the output of typeof null in JavaScript?",
    options: ["'null'", "'undefined'", "'object'", "'number'"],
    correctAnswer: 2,
    points: 100
  },
  {
    id: 2,
    text: "Which method is used to remove the last element from an array?",
    options: ["shift()", "pop()", "slice()", "splice()"],
    correctAnswer: 1,
    points: 100
  },
  {
    id: 3,
    text: "What does CSS stand for?",
    options: ["Computer Style Sheets", "Creative Style Sheets", "Cascading Style Sheets", "Colorful Style Sheets"],
    correctAnswer: 2,
    points: 50
  },
  {
    id: 4,
    text: "Which hook is used for side effects in React?",
    options: ["useState", "useEffect", "useContext", "useReducer"],
    correctAnswer: 1,
    points: 150
  },
  {
    id: 5,
    text: "How do you declare a variable that cannot be reassigned?",
    options: ["var", "let", "const", "def"],
    correctAnswer: 2,
    points: 50
  }
];

export const LEADERBOARD_DATA = [
  { id: 'u2', username: 'CodeMaster', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=CodeMaster', points: 2500, trend: 'up' },
  { id: 'u3', username: 'ReactNinja', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=ReactNinja', points: 2350, trend: 'same' },
  { id: 'u4', username: 'PixelPerfect', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=PixelPerfect', points: 2100, trend: 'down' },
  { id: 'u5', username: 'BugHunter', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=BugHunter', points: 1950, trend: 'up' },
  { id: 'u1', username: 'PlayerOne', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=PlayerOne', points: 1250, trend: 'up' },
];
