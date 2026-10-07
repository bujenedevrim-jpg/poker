'use strict';

const { PokerTable } = require('./pokerTable');

function assert(c, m) {
  if (!c) throw new Error(m || 'fail');
}

const t = new PokerTable('TEST01');
assert(t.addPlayer('p1', 'Ali').ok);
assert(t.addPlayer('p2', 'Veli').ok);
assert(t.canStart());
assert(t.startHand('p1').ok, 'start');
assert(t.phase === 'preflop');
assert(t.players[0].holeCards.length === 2);
assert(t.players[1].holeCards.length === 2);

// Play until hand over: always call/check
let guard = 0;
while (t.phase !== 'hand_over' && guard++ < 200) {
  const idx = t.actionIndex;
  assert(idx >= 0, 'need action ' + t.phase);
  const p = t.players[idx];
  const toCall = t.currentBet - p.bet;
  const act = toCall > 0 ? 'call' : 'check';
  const r = t.playerAction(p.id, act);
  assert(r.ok, r.error + ' ' + act + ' ' + t.message);
}

assert(t.phase === 'hand_over', 'hand over, got ' + t.phase);
assert(t.winners.length >= 1, 'winners');
assert(t.community.length === 5, 'board');
console.log('smoke OK:', t.message, 'winners', t.winners);

// Fold wins
const t2 = new PokerTable('TEST02');
t2.addPlayer('a', 'A');
t2.addPlayer('b', 'B');
t2.startHand('a');
const actor = t2.players[t2.actionIndex];
assert(t2.playerAction(actor.id, 'fold').ok);
assert(t2.phase === 'hand_over');
console.log('fold smoke OK:', t2.message);
