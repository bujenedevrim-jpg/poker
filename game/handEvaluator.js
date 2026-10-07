'use strict';

const { RANKS, cardRank, cardSuit, rankValue } = require('./deck');

const HAND_NAMES = [
  'Yüksek Kart',
  'Çift',
  'İki Çift',
  'Üçlü',
  'Sokak',
  'Renk',
  'Full House',
  'Dörtlü',
  'Renkli Sokak',
  'Royal Flush',
];

const RANK_TR = {
  '2': '2',
  '3': '3',
  '4': '4',
  '5': '5',
  '6': '6',
  '7': '7',
  '8': '8',
  '9': '9',
  T: '10',
  J: 'Vale',
  Q: 'Kız',
  K: 'Papaz',
  A: 'As',
};

/**
 * Evaluate best 5-card hand from up to 7 cards.
 * Returns { rank: 0-9, values: number[], name: string, cards: string[] }
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
    rank = straightHigh === 12 ? 9 : 8;
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
    name: formatScoredName(rank, values),
    cards: cards.slice(),
  };
}

/** Wheel (A-2-3-4-5) counts as high=3 (5). */
function findStraightHigh(uniqueSortedDesc) {
  if (uniqueSortedDesc.length < 5) return null;
  for (let i = 0; i <= uniqueSortedDesc.length - 5; i++) {
    const slice = uniqueSortedDesc.slice(i, i + 5);
    if (slice[0] - slice[4] === 4) return slice[0];
  }
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


function formatScoredName(rank, values) {
  const lab = (v) => rankLabelTR(RANKS[v] || rankLabel(v));
  switch (rank) {
    case 0:
      return `Yüksek Kart (${lab(values[0])})`;
    case 1:
      return `Çift (${lab(values[0])})`;
    case 2:
      return `İki Çift (${lab(values[0])} ve ${lab(values[1])})`;
    case 3:
      return `Üçlü (${lab(values[0])})`;
    case 4:
      return `Sokak (${lab(values[0])} yüksek)`;
    case 5:
      return `Renk (${lab(values[0])} yüksek)`;
    case 6:
      return `Full House (${lab(values[0])} dolu ${lab(values[1])})`;
    case 7:
      return `Dörtlü (${lab(values[0])})`;
    case 8:
      return `Renkli Sokak (${lab(values[0])} yüksek)`;
    case 9:
      return 'Royal Flush';
    default:
      return HAND_NAMES[rank] || 'Geçersiz';
  }
}

function rankLabel(rankIndex) {
  return RANKS[rankIndex] || '?';
}

function rankLabelTR(rankChar) {
  return RANK_TR[rankChar] || rankChar;
}

/**
 * Live hand description for hole + community (any street).
 * Preflop (<5 cards): pair / high card + suited/connector hints.
 * Flop+: full evaluateHand ranking in Turkish.
 */
function describeLiveHand(holeCards, community) {
  if (!holeCards || holeCards.length < 2) return null;
  const hole = holeCards.filter((c) => c && c !== 'back' && c !== '??');
  if (hole.length < 2) return null;

  const board = (community || []).filter((c) => c && c !== 'back');
  const all = [...hole, ...board];

  if (all.length >= 5) {
    const scored = evaluateHand(all);
    const name = scored.name;
    return {
      rank: scored.rank,
      name,
      cards: scored.cards,
      detail: name,
    };
  }

  // Preflop (2 cards) — or rare incomplete board
  const r1 = cardRank(hole[0]);
  const r2 = cardRank(hole[1]);
  const s1 = cardSuit(hole[0]);
  const s2 = cardSuit(hole[1]);
  const v1 = rankValue(r1);
  const v2 = rankValue(r2);
  const high = Math.max(v1, v2);
  const low = Math.min(v1, v2);
  const suited = s1 === s2;
  const gap = high - low;

  if (r1 === r2) {
    const name = `Çift (${rankLabelTR(r1)})`;
    return { rank: 1, name, cards: hole.slice(), detail: name };
  }

  let name = `Yüksek Kart (${rankLabelTR(RANKS[high])})`;
  const extras = [];
  if (suited) extras.push('aynı renk');
  if (gap === 1) extras.push('ardışık');
  else if (gap === 2) extras.push('tek boşluk');
  if (extras.length) name += ' — ' + extras.join(', ');
  return { rank: 0, name, cards: hole.slice(), detail: name };
}

function handNameTR(rankIndex) {
  if (rankIndex < 0 || rankIndex >= HAND_NAMES.length) return 'Geçersiz';
  return HAND_NAMES[rankIndex];
}

module.exports = {
  HAND_NAMES,
  evaluateHand,
  compareHands,
  scoreFive,
  rankLabel,
  rankLabelTR,
  describeLiveHand,
  handNameTR,
  formatScoredName,
};
