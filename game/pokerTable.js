'use strict';

const { createDeck, shuffle } = require('./deck');
const { evaluateHand, compareHands, describeLiveHand } = require('./handEvaluator');

const STARTING_CHIPS = 1000;
const SMALL_BLIND = 10;
const BIG_BLIND = 20;
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 9;

const PHASES = {
  LOBBY: 'lobby',
  PREFLOP: 'preflop',
  FLOP: 'flop',
  TURN: 'turn',
  RIVER: 'river',
  SHOWDOWN: 'showdown',
  HAND_OVER: 'hand_over',
};

const PHASE_TR = {
  lobby: 'Lobi',
  preflop: 'Ön bahis',
  flop: 'Üç kart',
  turn: 'Dördüncü',
  river: 'Beşinci',
  showdown: 'Gösterim',
  hand_over: 'El bitti',
};


function dativeAmount(n) {
  const x = Number(n) || 0;
  const special = {
    0: "'a",
    10: "'a",
    20: "'ye",
    30: "'a",
    40: "'a",
    50: "'ye",
    60: "'a",
    70: "'e",
    80: "'e",
    90: "'a",
    100: "'e",
    200: "'e",
    1000: "'e",
  };
  if (special[x] != null) return x + special[x];
  const last = String(x).slice(-1);
  if ('069'.includes(last)) return x + "'a";
  if (last === '0') return x + "'a";
  return x + "'e";
}

function makeCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

class PokerTable {
  constructor(code) {
    this.code = code || makeCode();
    this.players = [];
    this.hostId = null;
    this.phase = PHASES.LOBBY;
    this.community = [];
    this.deck = [];
    this.pot = 0;
    this.currentBet = 0;
    this.minRaise = BIG_BLIND;
    this.dealerIndex = -1;
    this.sbIndex = -1;
    this.bbIndex = -1;
    this.actionIndex = -1;
    this.handNumber = 0;
    this.message = 'Oda hazır. Oyuncular bekleniyor.';
    this.winners = [];
    this.showCards = false;
    this.streetActed = new Set();
    /** @type {null|{playerId:string,nickname:string,type:string,amount:number,raiseBy:number,toAmount:number,text:string}} */
    this.lastAction = null;
  }

  addPlayer(id, nickname) {
    if (this.players.length >= MAX_PLAYERS) {
      return { ok: false, error: 'Masa dolu (en fazla 9).' };
    }
    if (this.players.some((p) => p.id === id)) {
      return { ok: true };
    }
    const nick = (nickname || 'Oyuncu').trim().slice(0, 16) || 'Oyuncu';
    this.players.push({
      id,
      nickname: nick,
      chips: STARTING_CHIPS,
      holeCards: [],
      bet: 0,
      totalBet: 0,
      folded: false,
      allIn: false,
      connected: true,
    });
    if (!this.hostId) this.hostId = id;
    this.message = `${nick} masaya katıldı.`;
    return { ok: true };
  }

  removePlayer(id) {
    const idx = this.players.findIndex((p) => p.id === id);
    if (idx === -1) return;
    const removed = this.players[idx];
    const inHand =
      this.phase !== PHASES.LOBBY && this.phase !== PHASES.HAND_OVER;

    if (inHand && !removed.folded) {
      removed.folded = true;
      removed.connected = false;
      this.message = `${removed.nickname} ayrıldı (çekildi).`;
      this.lastAction = {
        playerId: removed.id,
        nickname: removed.nickname,
        type: 'fold',
        amount: 0,
        raiseBy: 0,
        toAmount: removed.bet,
        text: `${removed.nickname} ayrıldı (çekildi)`,
      };
      if (idx === this.actionIndex) {
        this._advanceAfterAction(false);
      } else {
        const alive = this.players.filter((p) => !p.folded);
        if (alive.length === 1) {
          this._awardPot(alive, 'Tek kalan oyuncu');
        }
      }
      removed.holeCards = [];
    } else {
      this.players.splice(idx, 1);
      this.message = `${removed.nickname} ayrıldı.`;
      if (this.hostId === id) {
        this.hostId = this.players[0] ? this.players[0].id : null;
      }
      if (this.dealerIndex >= this.players.length) {
        this.dealerIndex = this.players.length - 1;
      }
    }
  }

  setConnected(id, connected) {
    const p = this.players.find((x) => x.id === id);
    if (p) p.connected = connected;
  }

  purgeDisconnected() {
    if (this.phase !== PHASES.LOBBY && this.phase !== PHASES.HAND_OVER) return;
    this.players = this.players.filter((p) => p.connected);
    if (this.hostId && !this.players.some((p) => p.id === this.hostId)) {
      this.hostId = this.players[0] ? this.players[0].id : null;
    }
  }

  canStart() {
    this.purgeDisconnected();
    return (
      this.players.filter((p) => p.connected && p.chips > 0).length >=
        MIN_PLAYERS &&
      (this.phase === PHASES.LOBBY || this.phase === PHASES.HAND_OVER)
    );
  }

  startHand(requesterId) {
    if (requesterId !== this.hostId) {
      return { ok: false, error: 'Sadece ev sahibi eli başlatabilir.' };
    }
    this.purgeDisconnected();
    const seated = this.players.filter((p) => p.connected && p.chips > 0);
    if (seated.length < MIN_PLAYERS) {
      return { ok: false, error: "En az 2 chip'li oyuncu gerekli." };
    }

    this.handNumber += 1;
    this.community = [];
    this.pot = 0;
    this.currentBet = 0;
    this.minRaise = BIG_BLIND;
    this.winners = [];
    this.showCards = false;
    this.streetActed = new Set();
    this.lastAction = null;
    this.deck = shuffle(createDeck());

    for (const p of this.players) {
      p.holeCards = [];
      p.bet = 0;
      p.totalBet = 0;
      p.folded = !(p.connected && p.chips > 0);
      p.allIn = false;
    }

    if (this.dealerIndex < 0 || this.dealerIndex >= this.players.length) {
      this.dealerIndex = this._firstWithChips();
    } else {
      this.dealerIndex = this._nextWithChips(this.dealerIndex);
    }

    const withChips = this.players.filter((p) => !p.folded).length;
    if (withChips === 2) {
      this.sbIndex = this.dealerIndex;
      this.bbIndex = this._nextWithChips(this.dealerIndex);
    } else {
      this.sbIndex = this._nextWithChips(this.dealerIndex);
      this.bbIndex = this._nextWithChips(this.sbIndex);
    }

    this._postBlind(this.sbIndex, SMALL_BLIND);
    this._postBlind(this.bbIndex, BIG_BLIND);
    this.currentBet = this.players[this.bbIndex].bet;
    this.minRaise = BIG_BLIND;

    for (let r = 0; r < 2; r++) {
      let i = this.sbIndex;
      for (let n = 0; n < this.players.length; n++) {
        const p = this.players[i];
        if (!p.folded) p.holeCards.push(this.deck.pop());
        i = (i + 1) % this.players.length;
      }
    }

    this.phase = PHASES.PREFLOP;
    this.actionIndex = this._nextCanAct(this.bbIndex);
    this.streetActed = new Set();
    this.message = `El #${this.handNumber} — Ön bahis`;
    return { ok: true };
  }

  _firstWithChips() {
    for (let i = 0; i < this.players.length; i++) {
      if (this.players[i].connected && this.players[i].chips > 0) return i;
    }
    return 0;
  }

  _nextWithChips(from) {
    const n = this.players.length;
    for (let s = 1; s <= n; s++) {
      const i = (from + s) % n;
      const p = this.players[i];
      if (p.connected && p.chips > 0 && !p.folded) return i;
      if (p.connected && p.chips > 0) return i;
    }
    return from;
  }

  _nextCanAct(from) {
    const n = this.players.length;
    for (let s = 1; s <= n; s++) {
      const i = (from + s) % n;
      const p = this.players[i];
      if (!p.folded && !p.allIn) return i;
    }
    return -1;
  }

  _postBlind(idx, amount) {
    const p = this.players[idx];
    const pay = Math.min(amount, p.chips);
    p.chips -= pay;
    p.bet += pay;
    p.totalBet += pay;
    this.pot += pay;
    if (p.chips === 0) p.allIn = true;
  }

  _setLastAction(player, type, amount, raiseBy, toAmount, text) {
    this.lastAction = {
      playerId: player.id,
      nickname: player.nickname,
      type,
      amount: amount || 0,
      raiseBy: raiseBy || 0,
      toAmount: toAmount != null ? toAmount : player.bet,
      text,
    };
    this.message = text;
  }

  playerAction(playerId, action, raiseTo) {
    if (
      ![PHASES.PREFLOP, PHASES.FLOP, PHASES.TURN, PHASES.RIVER].includes(
        this.phase
      )
    ) {
      return { ok: false, error: 'Şu an bahis turu yok.' };
    }
    if (this.actionIndex < 0) return { ok: false, error: 'Sıra yok.' };
    const player = this.players[this.actionIndex];
    if (!player || player.id !== playerId) {
      return { ok: false, error: 'Sıra sende değil.' };
    }
    if (!player.connected) {
      return { ok: false, error: 'Yeniden bağlanman gerekiyor.' };
    }

    const toCall = this.currentBet - player.bet;
    action = String(action || '').toLowerCase();
    let raised = false;

    if (action === 'fold') {
      player.folded = true;
      this._setLastAction(
        player,
        'fold',
        0,
        0,
        player.bet,
        `${player.nickname} çekildi`
      );
    } else if (action === 'check') {
      if (toCall > 0) {
        return { ok: false, error: 'Pas yok; gör veya çekil.' };
      }
      this._setLastAction(
        player,
        'check',
        0,
        0,
        player.bet,
        `${player.nickname} pas geçti`
      );
    } else if (action === 'call') {
      if (toCall <= 0) {
        this._setLastAction(
          player,
          'check',
          0,
          0,
          player.bet,
          `${player.nickname} pas geçti`
        );
      } else {
        const pay = Math.min(toCall, player.chips);
        player.chips -= pay;
        player.bet += pay;
        player.totalBet += pay;
        this.pot += pay;
        if (player.chips === 0) player.allIn = true;
        this._setLastAction(
          player,
          'call',
          pay,
          0,
          player.bet,
          `${player.nickname} ${pay} gördü`
        );
      }
    } else if (action === 'raise') {
      let target = Number(raiseTo);
      if (!Number.isFinite(target)) {
        return { ok: false, error: 'Geçersiz miktar.' };
      }
      target = Math.floor(target);
      const minTotal = this.currentBet + this.minRaise;
      const maxTotal = player.bet + player.chips;
      if (target > maxTotal) target = maxTotal;
      const isAllIn = target === maxTotal;
      if (target < minTotal && !isAllIn) {
        return { ok: false, error: `Minimum artırma: ${minTotal}` };
      }
      if (target <= this.currentBet && !isAllIn) {
        return { ok: false, error: 'Artırma daha yüksek olmalı.' };
      }
      const need = target - player.bet;
      if (need <= 0) return { ok: false, error: 'Geçersiz artırma.' };
      if (need > player.chips) return { ok: false, error: 'Yetersiz chip.' };

      const prev = this.currentBet;
      player.chips -= need;
      player.bet += need;
      player.totalBet += need;
      this.pot += need;
      if (player.chips === 0) player.allIn = true;

      let raiseBy = 0;
      if (player.bet > prev) {
        raiseBy = player.bet - prev;
        if (raiseBy >= this.minRaise) this.minRaise = raiseBy;
        this.currentBet = player.bet;
        raised = true;
      }

      let text;
      if (prev === 0) {
        text = `${player.nickname} ${need} bahis koydu`;
      } else {
        text = `${player.nickname} ${raiseBy} artırdı (${dativeAmount(player.bet)} yükseltti)`;
      }
      this._setLastAction(player, prev === 0 ? 'bet' : 'raise', need, raiseBy, player.bet, text);
    } else if (action === 'allin') {
      const need = player.chips;
      if (need <= 0) return { ok: false, error: 'Chip yok.' };
      const prev = this.currentBet;
      player.bet += need;
      player.totalBet += need;
      this.pot += need;
      player.chips = 0;
      player.allIn = true;
      let raiseBy = 0;
      if (player.bet > prev) {
        raiseBy = player.bet - prev;
        if (raiseBy >= this.minRaise) this.minRaise = raiseBy;
        this.currentBet = player.bet;
        raised = true;
      }
      let text;
      if (player.bet > prev) {
        text = `${player.nickname} hepsi! ${raiseBy} artırdı (${dativeAmount(player.bet)})`;
      } else {
        text = `${player.nickname} hepsi! (${need} koydu)`;
      }
      this._setLastAction(player, 'allin', need, raiseBy, player.bet, text);
    } else {
      return { ok: false, error: 'Bilinmeyen aksiyon.' };
    }

    this.streetActed.add(player.id);
    if (raised) {
      this.streetActed = new Set([player.id]);
    }

    this._advanceAfterAction(true);
    return { ok: true };
  }

  _advanceAfterAction(fromAction) {
    const alive = this.players.filter((p) => !p.folded);
    if (alive.length === 1) {
      this._awardPot(alive, `${alive[0].nickname} kazandı (diğerleri çekildi)`);
      return;
    }

    const canAct = this.players.filter((p) => !p.folded && !p.allIn);

    if (canAct.length === 0) {
      this._runOutBoard();
      this._showdown();
      return;
    }

    const unmatched = canAct.some((p) => p.bet < this.currentBet);
    const notActed = canAct.some((p) => !this.streetActed.has(p.id));

    if (unmatched || notActed) {
      this.actionIndex = this._nextCanAct(this.actionIndex);
      if (this.actionIndex < 0) {
        this._runOutBoard();
        this._showdown();
      }
      return;
    }

    this._goNextStreet();
  }

  _goNextStreet() {
    for (const p of this.players) p.bet = 0;
    this.currentBet = 0;
    this.minRaise = BIG_BLIND;
    this.streetActed = new Set();

    if (this.phase === PHASES.PREFLOP) {
      this.deck.pop();
      this.community.push(this.deck.pop(), this.deck.pop(), this.deck.pop());
      this.phase = PHASES.FLOP;
      this.message = 'Üç kart açıldı';
    } else if (this.phase === PHASES.FLOP) {
      this.deck.pop();
      this.community.push(this.deck.pop());
      this.phase = PHASES.TURN;
      this.message = 'Dördüncü kart açıldı';
    } else if (this.phase === PHASES.TURN) {
      this.deck.pop();
      this.community.push(this.deck.pop());
      this.phase = PHASES.RIVER;
      this.message = 'Beşinci kart açıldı';
    } else if (this.phase === PHASES.RIVER) {
      this._showdown();
      return;
    }

    this.actionIndex = this._nextCanAct(this.dealerIndex);
    const canAct = this.players.filter((p) => !p.folded && !p.allIn);
    if (this.actionIndex < 0 || canAct.length === 0) {
      this._runOutBoard();
      this._showdown();
    }
  }

  _runOutBoard() {
    while (this.community.length < 5) {
      this.deck.pop();
      if (this.community.length === 0) {
        this.community.push(this.deck.pop(), this.deck.pop(), this.deck.pop());
      } else {
        this.community.push(this.deck.pop());
      }
    }
    this.phase = PHASES.RIVER;
  }

  _showdown() {
    this.phase = PHASES.SHOWDOWN;
    this.showCards = true;
    const contenders = this.players.filter((p) => !p.folded);
    if (contenders.length === 1) {
      this._awardPot(contenders, 'Çekilmelerle');
      return;
    }
    const evaluated = contenders.map((p) => ({
      player: p,
      hand: evaluateHand([...p.holeCards, ...this.community]),
    }));
    evaluated.sort((a, b) => compareHands(b.hand, a.hand));
    const best = evaluated[0].hand;
    const winners = evaluated
      .filter((e) => compareHands(e.hand, best) === 0)
      .map((e) => e.player);
    const detail = winners
      .map((w) => {
        const h = evaluated.find((e) => e.player.id === w.id).hand;
        return `${w.nickname} (${h.name})`;
      })
      .join(', ');
    this._awardPot(winners, `Gösterim: ${detail}`);
  }

  _awardPot(winners, reason) {
    const total = this.pot;
    const share = Math.floor(total / winners.length);
    let rem = total - share * winners.length;
    this.winners = winners.map((w) => {
      let amt = share;
      if (rem > 0) {
        amt += 1;
        rem -= 1;
      }
      w.chips += amt;
      let handName = null;
      let handCards = null;
      if (
        w.holeCards &&
        w.holeCards.length === 2 &&
        this.community.length >= 5
      ) {
        const h = evaluateHand([...w.holeCards, ...this.community]);
        handName = h.name;
        handCards = h.cards;
      }
      return {
        id: w.id,
        nickname: w.nickname,
        amount: amt,
        handName,
        handCards,
      };
    });
    this.message = `${reason}. Pot: ${total}`;
    this.pot = 0;
    this.phase = PHASES.HAND_OVER;
    this.actionIndex = -1;
    this.showCards = true;
  }

  getPublicState(forPlayerId) {
    const me = this.players.find((p) => p.id === forPlayerId);
    let yourLiveHand = null;
    let yourShowdownHand = null;
    if (me && me.holeCards.length === 2 && !me.folded) {
      yourLiveHand = describeLiveHand(me.holeCards, this.community);
      if (
        (this.phase === PHASES.HAND_OVER || this.phase === PHASES.SHOWDOWN) &&
        this.community.length >= 5
      ) {
        const h = evaluateHand([...me.holeCards, ...this.community]);
        yourShowdownHand = { name: h.name, cards: h.cards, rank: h.rank };
      }
    } else if (me && me.holeCards.length === 2 && me.folded) {
      // Still show what they had folded with during hand if cards known
      yourLiveHand = describeLiveHand(me.holeCards, this.community);
    }

    return {
      code: this.code,
      phase: this.phase,
      phaseLabel: PHASE_TR[this.phase] || this.phase,
      pot: this.pot,
      community: this.community.slice(),
      currentBet: this.currentBet,
      minRaise: this.minRaise,
      bigBlind: BIG_BLIND,
      smallBlind: SMALL_BLIND,
      dealerIndex: this.dealerIndex,
      actionIndex: this.actionIndex,
      handNumber: this.handNumber,
      message: this.message,
      lastAction: this.lastAction,
      winners: this.winners,
      hostId: this.hostId,
      showCards: this.showCards,
      you: forPlayerId,
      canStart: this.canStart(),
      startingChips: STARTING_CHIPS,
      yourLiveHand,
      yourShowdownHand,
      players: this.players.map((p, i) => {
        const isYou = p.id === forPlayerId;
        const reveal =
          isYou ||
          ((this.showCards || this.phase === PHASES.HAND_OVER) && !p.folded);
        let handName = null;
        if (isYou && p.holeCards.length === 2) {
          const live = describeLiveHand(p.holeCards, this.community);
          handName = live ? live.name : null;
        } else if (
          reveal &&
          p.holeCards.length === 2 &&
          this.community.length >= 3 &&
          !p.folded
        ) {
          handName = evaluateHand([...p.holeCards, ...this.community]).name;
        }
        return {
          id: p.id,
          nickname: p.nickname,
          chips: p.chips,
          bet: p.bet,
          folded: p.folded,
          allIn: p.allIn,
          connected: p.connected,
          isHost: p.id === this.hostId,
          isDealer: i === this.dealerIndex,
          isSB: i === this.sbIndex,
          isBB: i === this.bbIndex,
          isTurn: i === this.actionIndex,
          holeCards: reveal
            ? p.holeCards.slice()
            : p.holeCards.map(() => 'back'),
          handName,
        };
      }),
      legalActions: this._legalActions(forPlayerId),
    };
  }

  _legalActions(playerId) {
    if (this.actionIndex < 0) return null;
    const p = this.players[this.actionIndex];
    if (!p || p.id !== playerId) return null;
    const toCall = this.currentBet - p.bet;
    const minRaiseTo = this.currentBet + this.minRaise;
    const maxRaiseTo = p.bet + p.chips;
    return {
      canFold: true,
      canCheck: toCall === 0,
      canCall: toCall > 0 && p.chips > 0,
      callAmount: Math.min(toCall, p.chips),
      canRaise: p.chips > toCall,
      minRaiseTo: Math.min(minRaiseTo, maxRaiseTo),
      maxRaiseTo,
      canAllIn: p.chips > 0,
    };
  }
}

module.exports = {
  PokerTable,
  makeCode,
  STARTING_CHIPS,
  SMALL_BLIND,
  BIG_BLIND,
  MIN_PLAYERS,
  MAX_PLAYERS,
  PHASES,
  PHASE_TR,
};
