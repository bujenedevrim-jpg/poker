'use strict';

const { evaluateHand, compareHands } = require('./handEvaluator');

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assert failed');
}

// Royal flush
{
  const h = evaluateHand(['As', 'Ks', 'Qs', 'Js', 'Ts', '2d', '3c']);
  assert(h.rank === 9, 'royal ' + h.name);
}

// Wheel straight
{
  const h = evaluateHand(['As', '2d', '3c', '4h', '5s', '9d', 'Kc']);
  assert(h.rank === 4, 'wheel ' + h.name);
  assert(h.values[0] === 3, 'wheel high 5');
}

// Full house beats flush
{
  const fh = evaluateHand(['Ah', 'Ad', 'Ac', 'Kd', 'Ks', '2c', '3d']);
  const fl = evaluateHand(['Ah', '3h', '7h', '9h', 'Jh', '2c', 'Kd']);
  assert(compareHands(fh, fl) > 0, 'FH > flush');
}

// Pair vs high card
{
  const p = evaluateHand(['As', 'Ad', '2c', '5h', '9d', 'Jc', 'Kd']);
  const hc = evaluateHand(['As', 'Kd', 'Qc', 'Jh', '9d', '3c', '2d']);
  assert(compareHands(p, hc) > 0, 'pair > high');
}

console.log('handEvaluator tests OK');
