/** Shared utilities for randomization, math, and text helpers. */

export const FIRST_NAMES = [
  'Jordan', 'Alex', 'Taylor', 'Morgan', 'Casey', 'Riley', 'Quinn', 'Avery',
  'Blake', 'Cameron', 'Dakota', 'Emery', 'Finley', 'Harper', 'Jamie', 'Kai',
  'Logan', 'Marley', 'Noah', 'Parker', 'Reese', 'Sage', 'Skyler', 'Tatum',
  'Violet', 'Wren', 'Zion', 'Brooke', 'Chase', 'Drew', 'Ellis', 'Frankie'
];

export const PERSONALITY_TYPES = [
  { id: 'social', name: 'Social Butterfly', strategy: 'befriend', socialBonus: 2, aggressionMod: -1 },
  { id: 'competitor', name: 'Competitor', strategy: 'win', competitionBonus: 2, aggressionMod: 0 },
  { id: 'strategist', name: 'Strategist', strategy: 'manipulate', intelligenceBonus: 2, aggressionMod: 0 },
  { id: 'loyalist', name: 'Loyalist', strategy: 'ally', loyaltyBonus: 2, aggressionMod: -1 },
  { id: 'wildcard', name: 'Wildcard', strategy: 'chaos', variance: 3, aggressionMod: 1 },
  { id: 'aggressor', name: 'Aggressor', strategy: 'attack', aggressionBonus: 3, socialMod: -1 },
  { id: 'floater', name: 'Floater', strategy: 'survive', socialMod: 0, competitionMod: -1 }
];

export const DIFFICULTY_CONFIG = {
  easy: {
    label: 'Easy',
    aiStatBonus: 0,
    playerSocialBonus: 1,
    competitionPlayerBonus: 2,
    aiAggressionMod: -1,
    startingTrust: 15,
    actionsPerDay: 3
  },
  normal: {
    label: 'Normal',
    aiStatBonus: 1,
    playerSocialBonus: 0,
    competitionPlayerBonus: 0,
    aiAggressionMod: 0,
    startingTrust: 5,
    actionsPerDay: 2
  },
  hard: {
    label: 'Hard',
    aiStatBonus: 2,
    playerSocialBonus: -1,
    competitionPlayerBonus: -1,
    aiAggressionMod: 1,
    startingTrust: 0,
    actionsPerDay: 2
  }
};

let idCounter = 0;

/** Generate a unique ID for game entities. */
export function uid(prefix = 'id') {
  idCounter += 1;
  return `${prefix}_${Date.now()}_${idCounter}`;
}

/** Reset ID counter when loading saved games. */
export function resetIdCounter(value = 0) {
  idCounter = value;
}

export function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function randomFloat(min, max) {
  return Math.random() * (max - min) + min;
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function pickRandom(array) {
  return array[randomInt(0, array.length - 1)];
}

export function shuffle(array) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = randomInt(0, i);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function pickN(array, n) {
  return shuffle(array).slice(0, n);
}

export function weightedPick(items, weightFn) {
  const total = items.reduce((sum, item) => sum + weightFn(item), 0);
  let roll = Math.random() * total;
  for (const item of items) {
    roll -= weightFn(item);
    if (roll <= 0) return item;
  }
  return items[items.length - 1];
}

/** Roll a stat check: base stat + d10 vs difficulty. */
export function statCheck(stat, difficulty = 5, bonus = 0) {
  const roll = randomInt(1, 10);
  return stat + roll + bonus >= difficulty + randomInt(3, 7);
}

/** Compare contestants by a stat with small variance. */
export function compareStats(a, statA, b, statB) {
  const scoreA = a[statA] + randomInt(-1, 2);
  const scoreB = b[statB] + randomInt(-1, 2);
  if (scoreA > scoreB) return a;
  if (scoreB > scoreA) return b;
  return Math.random() < 0.5 ? a : b;
}

export function formatRelationship(score) {
  if (score >= 60) return 'Close Ally';
  if (score >= 30) return 'Friendly';
  if (score >= 10) return 'Warm';
  if (score > -10) return 'Neutral';
  if (score > -30) return 'Cold';
  if (score > -60) return 'Hostile';
  return 'Enemy';
}

export function relationshipClass(score) {
  if (score > 10) return 'rel-positive';
  if (score < -10) return 'rel-negative';
  return 'rel-neutral';
}

export function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/** Pick unique names for AI contestants. */
export function generateAINames(count) {
  return pickN(FIRST_NAMES, count);
}
