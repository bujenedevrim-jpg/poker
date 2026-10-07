'use strict';

const { RANKS, cardRank, cardSuit, rankValue } = require('./deck');

const HAND_NAMES = [
  'Yüksek Kart',
  'Çift',
  'İki Çift',
  'Üçlü',
  'Kent',
  'Renk',
  'Full House',
  'Dörtlü',
  'Straight Flush',
  'Royal Flush',
];

/**
 * Evaluate best 5-card hand from up to 7 cards.
 * Returns { rank: 0-9, values: number[], name: string, cards: string[] }
 * Higher rank wins; on tie compare values lexicographically (high first).
 */
function evaluateHand(cards) {
  if (!cards || cards.length < 5) {
    return { rank: -1, values: [], name: 'Geçersiz', cards: [] };
  }

  const combos = combinations(cards, 5);
  let best = null;
  for (const combo of combos) {
    const scored = scoreFive(combo);
    if (!best || compareHands(scored, best) > 0) {
      best = scored;
    }
  }
  return best;
}

function combinations(arr, k) {
  const result = [];
  function rec(start, path) {
    if (path.length === k) {
      result.push(path.slice());
      return;
    }
    for (let i = start; i < arr.length; i++) {
      path.push(arr[i]);
      rec(i + 1, path);
      path.pop();
    }
  }
  rec(0, []);
  return result;
}

function scoreFive(cards) {
  const ranks = cards.map(cardRank).map(rankValue).sort((a, b) => b - a);
  const suits = cards.map(cardSuit);
  const counts = {};
  for (const r of ranks) counts[r] = (counts[r] || 0) + 1;

  const byCount = Object.entries(counts)
    .map(([r, c]) => ({ r: Number(r), c }))
    .sort((a, b) => b.c - a.c || b.r - a.r);

  const isFlush = suits.every((s) => s === suits[0]);
  const uniqueSorted = [...new Set(ranks)].sort((a, b) => b - a);
  const straightHigh = findStraightHigh(uniqueSorted);
  const isStraight = straightHigh !== null;

  let rank;
  let values;

  if (isStraight && isFlush) {
    rank = straightHigh === 12 ? 9 : 8; // Royal or SF
    values = [straightHigh];
  } else if (byCount[0].c === 4) {
    rank = 7;
    values = [byCount[0].r, byCount[1].r];
  } else if (byCount[0].c === 3 && byCount[1].c === 2) {
    rank = 6;
    values = [byCount[0].r, byCount[1].r];
  } else if (isFlush) {
    rank = 5;
    values = ranks;
  } else if (isStraight) {
    rank = 4;
    values = [straightHigh];
  } else if (byCount[0].c === 3) {
    rank = 3;
    values = [byCount[0].r, ...byCount.slice(1).map((x) => x.r)];
  } else if (byCount[0].c === 2 && byCount[1].c === 2) {
    rank = 2;
    const pairs = [byCount[0].r, byCount[1].r].sort((a, b) => b - a);
    const kicker = byCount[2].r;
    values = [...pairs, kicker];
  } else if (byCount[0].c === 2) {
    rank = 1;
    values = [byCount[0].r, ...byCount.slice(1).map((x) => x.r)];
  } else {
    rank = 0;
    values = ranks;
  }

  return {
    rank,
    values,
    name: HAND_NAMES[rank],
    cards: cards.slice(),
  };
}

/** Wheel (A-2-3-4-5) counts as high=3 (5). */
function findStraightHigh(uniqueSortedDesc) {
  if (uniqueSortedDesc.length < 5) return null;
  // Check normal straights
  for (let i = 0; i <= uniqueSortedDesc.length - 5; i++) {
    const slice = uniqueSortedDesc.slice(i, i + 5);
    if (slice[0] - slice[4] === 4) return slice[0];
  }
  // A-2-3-4-5 (wheel): ranks 12,3,2,1,0
  const set = new Set(uniqueSortedDesc);
  if ([12, 3, 2, 1, 0].every((r) => set.has(r))) return 3;
  return null;
}

function compareHands(a, b) {
  if (a.rank !== b.rank) return a.rank - b.rank;
  const n = Math.max(a.values.length, b.values.length);
  for (let i = 0; i < n; i++) {
    const av = a.values[i] || 0;
    const bv = b.values[i] || 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}

function rankLabel(rankIndex) {
  return RANKS[rankIndex] || '?';
}

module.exports = {
  HAND_NAMES,
  evaluateHand,
  compareHands,
  scoreFive,
  rankLabel,
};
