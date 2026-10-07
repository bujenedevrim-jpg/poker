'use strict';

const SUIT_SYM = { s: '♠', h: '♥', d: '♦', c: '♣' };
const RANK_SHOW = { T: '10', J: 'J', Q: 'Q', K: 'K', A: 'A' };

const phaseTR = {
  lobby: 'Lobi',
  preflop: 'Ön bahis',
  flop: 'Üç kart',
  turn: 'Dördüncü',
  river: 'Beşinci',
  showdown: 'Gösterim',
  hand_over: 'El bitti',
};

const $ = (id) => document.getElementById(id);

const socket = io({ transports: ['websocket', 'polling'] });

let state = null;
let myId = null;
let lastActionKey = '';

/** Unique per browser tab — never shared across tabs */
function getPlayerId() {
  let id = sessionStorage.getItem('poker_player_id');
  if (!id) {
    id =
      (typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : 'p_' + Math.random().toString(36).slice(2) + Date.now().toString(36)
      ).replace(/[^A-Za-z0-9_-]/g, '');
    sessionStorage.setItem('poker_player_id', id);
  }
  return id;
}

function nick() {
  return ($('nickname').value || '').trim();
}

function saveNickSuggestion() {
  const n = nick();
  if (n) localStorage.setItem('poker_nick', n);
}

function showError(msg) {
  const el = $('lobby-error');
  if (!el) return;
  el.hidden = !msg;
  el.textContent = msg || '';
}

function toast(msg) {
  const el = $('toast');
  el.hidden = false;
  el.textContent = msg;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => {
    el.hidden = true;
  }, 3200);
}

function parseRoomFromUrl() {
  const m = location.pathname.match(/^\/r\/([A-Za-z0-9]+)/i);
  if (m) return m[1].toUpperCase();
  const q = new URLSearchParams(location.search).get('room');
  return q ? q.toUpperCase() : null;
}

function showLobby() {
  $('screen-lobby').hidden = false;
  $('screen-table').hidden = true;
}

function showTable() {
  $('screen-lobby').hidden = true;
  $('screen-table').hidden = false;
}

function cardEl(code, small) {
  const div = document.createElement('div');
  div.className = 'card' + (small ? ' sm' : '');
  if (!code || code === 'back' || code === '??') {
    div.classList.add('back');
    div.textContent = '';
    return div;
  }
  const rank = code[0];
  const suit = code[1];
  const show = RANK_SHOW[rank] || rank;
  const sym = SUIT_SYM[suit] || suit;
  if (suit === 'h' || suit === 'd') div.classList.add('red');
  div.textContent = show + sym;
  return div;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatCards(codes) {
  if (!codes || !codes.length) return '';
  return codes
    .map((c) => {
      if (!c || c === 'back') return '?';
      const r = RANK_SHOW[c[0]] || c[0];
      const s = SUIT_SYM[c[1]] || c[1];
      return r + s;
    })
    .join(' ');
}

function renderSeats(players) {
  const root = $('seats');
  root.innerHTML = '';
  let order = players.slice();
  const youIdx = order.findIndex((p) => p.id === myId);
  if (youIdx > 0) {
    order = order.slice(youIdx).concat(order.slice(0, youIdx));
  }
  order.forEach((p, visualIdx) => {
    const angle = Math.PI / 2 + (visualIdx / order.length) * Math.PI * 2;
    const x = 50 + Math.cos(angle) * 40;
    const y = 52 + Math.sin(angle) * 34;

    const seat = document.createElement('div');
    seat.className = 'seat';
    if (p.id === myId) seat.classList.add('you');
    if (p.isTurn) seat.classList.add('turn');
    if (p.folded) seat.classList.add('folded');
    if (p.connected === false) seat.classList.add('disconnected');
    seat.style.left = x + '%';
    seat.style.top = y + '%';

    const tags = [];
    if (p.isDealer) tags.push('D');
    if (p.isSB) tags.push('Küçük');
    if (p.isBB) tags.push('Büyük');
    if (p.isHost) tags.push('Ev sahibi');
    if (p.allIn) tags.push('Hepsi');
    if (p.connected === false) tags.push('…');
    if (p.revealChoice === 'show') tags.push('Gösterdi');
    if (p.revealChoice === 'muck') tags.push('Gizledi');

    seat.innerHTML = `
      <div class="seat-name">${escapeHtml(p.nickname)}</div>
      <div class="tags">${tags.join(' · ')}</div>
      <div class="seat-chips">${p.chips} chip</div>
      <div class="seat-cards"></div>
      <div class="seat-bet">${p.bet > 0 ? 'Bahis: ' + p.bet : ''}</div>
    `;
    const cards = seat.querySelector('.seat-cards');
    if (p.id !== myId) {
      (p.holeCards || []).forEach((c) => cards.appendChild(cardEl(c, true)));
    }
    root.appendChild(seat);
  });
}

function renderCommunity(cards) {
  const el = $('community');
  el.innerHTML = '';
  (cards || []).forEach((c) => el.appendChild(cardEl(c, false)));
}

function renderHole(s) {
  const row = $('hole-row');
  row.innerHTML = '';
  const me = (s.players || []).find((p) => p.id === myId);
  if (!me) return;
  const wrap = document.createElement('div');
  wrap.style.textAlign = 'center';
  const cards = document.createElement('div');
  cards.style.display = 'flex';
  cards.style.gap = '8px';
  cards.style.justifyContent = 'center';
  (me.holeCards || []).forEach((c) => {
    if (c !== 'back') cards.appendChild(cardEl(c, false));
  });
  wrap.appendChild(cards);

  const liveName =
    (s.yourLiveHand && s.yourLiveHand.name) ||
    me.handName ||
    null;
  if (liveName && me.holeCards && me.holeCards.length === 2) {
    const lab = document.createElement('div');
    lab.className = 'hand-strength';
    lab.textContent = 'Elim: ' + liveName;
    wrap.appendChild(lab);
  }
  row.appendChild(wrap);
}

function renderShowdown(s) {
  const panel = $('showdown-panel');
  const isEnd = s.phase === 'hand_over' || s.phase === 'showdown';
  if (!isEnd || !s.winners || !s.winners.length) {
    panel.hidden = true;
    panel.innerHTML = '';
    return;
  }
  panel.hidden = false;
  const lines = [];
  lines.push('<div class="sd-title">El sonucu</div>');
  for (const w of s.winners) {
    let handBit = '';
    if (w.handName) {
      handBit =
        ` — <strong>${escapeHtml(w.handName)}</strong>` +
        (w.handCards ? ` (${escapeHtml(formatCards(w.handCards))})` : '');
    } else if (w.mucked) {
      handBit = ' — <em>kartlar gizli</em>';
    } else if (s.awaitingReveal) {
      handBit = ' — <em>seçim bekleniyor…</em>';
    }
    lines.push(
      `<div class="sd-line">🏆 ${escapeHtml(w.nickname)} kazandı: ${w.amount} chip${handBit}</div>`
    );
  }
  if (s.yourShowdownHand && s.yourShowdownHand.name) {
    const isWinner = (s.winners || []).some((w) => w.id === myId);
    const prefix = isWinner ? 'Senin elin' : 'Senin elin (kazanmadı)';
    lines.push(
      `<div class="sd-line sd-you">${prefix}: <strong>${escapeHtml(
        s.yourShowdownHand.name
      )}</strong>` +
        (s.yourShowdownHand.cards
          ? ` (${escapeHtml(formatCards(s.yourShowdownHand.cards))})`
          : '') +
        '</div>'
    );
  } else {
    const me = (s.players || []).find((p) => p.id === myId);
    if (me && me.folded) {
      lines.push('<div class="sd-line sd-you">Sen çekilmiştin.</div>');
    }
  }
  if (s.awaitingReveal) {
    lines.push(
      '<div class="sd-line sd-wait">Kalan oyuncular kartlarını gösteriyor veya gizliyor…</div>'
    );
  }
  panel.innerHTML = lines.join('');
}

function renderTurnBanner(s) {
  const el = $('turn-banner');
  if (!el) return;
  const betting = ['preflop', 'flop', 'turn', 'river'].includes(s.phase);
  if (betting && s.turnNickname) {
    el.hidden = false;
    const isMe = s.actionIndex >= 0 && s.you && (s.players || []).some(
      (p) => p.id === s.you && p.isTurn
    );
    el.textContent = isMe
      ? 'Sen düşünüyorsun…'
      : `${s.turnNickname} düşünüyor…`;
    el.classList.toggle('you-turn', !!isMe);
  } else if (s.awaitingReveal) {
    el.hidden = false;
    el.classList.remove('you-turn');
    el.textContent = 'Kart gösterimi: Göster veya Gizle';
  } else {
    el.hidden = true;
    el.textContent = '';
    el.classList.remove('you-turn');
  }
}

function renderPotChips(pot) {
  const el = $('pot-chips');
  if (!el) return;
  el.innerHTML = '';
  const n = Number(pot) || 0;
  if (n <= 0) return;
  // Scale stack: 1 chip per ~40, min 1 max 12
  let count = Math.min(12, Math.max(1, Math.ceil(n / 40)));
  const colors = ['#c0392b', '#2980b9', '#27ae60', '#f1c40f', '#8e44ad', '#ecf0f1'];
  for (let i = 0; i < count; i++) {
    const chip = document.createElement('span');
    chip.className = 'chip-disc';
    chip.style.setProperty('--chip-i', String(i));
    chip.style.background = colors[i % colors.length];
    chip.style.color = colors[i % colors.length] === '#ecf0f1' || colors[i % colors.length] === '#f1c40f' ? '#222' : '#fff';
    el.appendChild(chip);
  }
}

function renderReveal(legal) {
  const bar = $('reveal-bar');
  if (!bar) return;
  if (!legal) {
    bar.hidden = true;
    return;
  }
  bar.hidden = false;
}

function renderLastAction(s) {
  const el = $('last-action');
  if (!s.lastAction || !s.lastAction.text) {
    el.hidden = true;
    el.textContent = '';
    return;
  }
  el.hidden = false;
  el.textContent = s.lastAction.text + (s.pot > 0 ? ` · Pot: ${s.pot}` : '');

  // Toast on new raise/bet/all-in so amount is obvious
  const key =
    (s.lastAction.playerId || '') +
    '|' +
    (s.lastAction.type || '') +
    '|' +
    (s.lastAction.toAmount || 0) +
    '|' +
    (s.lastAction.amount || 0) +
    '|' +
    (s.handNumber || 0);
  if (
    key !== lastActionKey &&
    (s.lastAction.type === 'raise' ||
      s.lastAction.type === 'bet' ||
      s.lastAction.type === 'allin' ||
      s.lastAction.type === 'call')
  ) {
    lastActionKey = key;
    toast(s.lastAction.text);
  } else if (key !== lastActionKey) {
    lastActionKey = key;
  }
}

function renderActions(legal) {
  const box = $('actions');
  if (!legal) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  $('btn-fold').disabled = !legal.canFold;
  $('btn-check').disabled = !legal.canCheck;
  $('btn-check').hidden = !legal.canCheck;
  $('btn-call').disabled = !legal.canCall;
  $('btn-call').hidden = !legal.canCall;
  $('btn-call').textContent = legal.canCall
    ? `Gör ${legal.callAmount}`
    : 'Gör';
  $('btn-raise').disabled = !legal.canRaise;
  $('btn-raise').textContent = 'Artır';
  $('btn-allin').disabled = !legal.canAllIn;

  const slider = $('raise-slider');
  const min = legal.minRaiseTo || 0;
  const max = legal.maxRaiseTo || min;
  slider.min = min;
  slider.max = Math.max(min, max);
  slider.value = min;
  $('raise-label').textContent = String(slider.value);
  slider.oninput = () => {
    $('raise-label').textContent = slider.value;
  };
}

function render(s) {
  state = s;
  myId = s.you;
  showTable();

  $('room-code').textContent = s.code;
  $('phase-badge').textContent =
    s.phaseLabel || phaseTR[s.phase] || s.phase;
  $('pot').textContent = s.pot;
  $('table-msg').textContent = s.message || '';

  renderPotChips(s.pot);
  renderTurnBanner(s);
  renderCommunity(s.community);
  renderSeats(s.players);
  renderHole(s);
  renderShowdown(s);
  renderLastAction(s);
  renderActions(s.legalActions);
  renderReveal(s.legalReveal);

  const isHost = s.hostId === myId;
  const hostBar = $('host-bar');
  const showStart =
    isHost && (s.phase === 'lobby' || s.phase === 'hand_over') && s.canStart;
  hostBar.hidden = !showStart;

  const path = `/r/${s.code}`;
  if (location.pathname !== path) {
    history.replaceState(null, '', path);
  }
}

function emitCreate() {
  showError('');
  saveNickSuggestion();
  if (!nick()) {
    showError('Takma ad gir.');
    return;
  }
  socket.emit('create_room', { nickname: nick(), playerId: getPlayerId() });
}

function emitJoin(code) {
  showError('');
  saveNickSuggestion();
  const c = (code || $('join-code').value || '').trim().toUpperCase();
  if (!nick()) {
    showError('Takma ad gir.');
    return;
  }
  if (!c) {
    showError('Oda kodu gir.');
    return;
  }
  socket.emit('join_room', {
    code: c,
    nickname: nick(),
    playerId: getPlayerId(),
  });
}

$('btn-create').onclick = () => emitCreate();
$('btn-join').onclick = () => emitJoin();

$('btn-start').onclick = () => socket.emit('start_hand');

$('btn-fold').onclick = () => socket.emit('action', { action: 'fold' });
$('btn-check').onclick = () => socket.emit('action', { action: 'check' });
$('btn-call').onclick = () => socket.emit('action', { action: 'call' });
$('btn-raise').onclick = () => {
  const raiseTo = Number($('raise-slider').value);
  socket.emit('action', { action: 'raise', raiseTo });
};
$('btn-allin').onclick = () => socket.emit('action', { action: 'allin' });

$('btn-show').onclick = () => socket.emit('reveal_hand', { choice: 'show' });
$('btn-muck').onclick = () => socket.emit('reveal_hand', { choice: 'muck' });

$('btn-copy').onclick = async () => {
  const code = state && state.code;
  if (!code) return;
  const url = `${location.origin}/r/${code}`;
  try {
    await navigator.clipboard.writeText(url);
    toast('Link kopyalandı');
  } catch {
    prompt('Linki kopyala:', url);
  }
};

socket.on('joined', ({ code, playerId }) => {
  myId = playerId;
  sessionStorage.setItem('poker_room', code);
  sessionStorage.setItem('poker_player_id', playerId);
  showTable();
  toast(`Odaya girildi: ${code}`);
});

socket.on('state', (s) => render(s));

socket.on('error_msg', (msg) => {
  if (!$('screen-lobby').hidden) showError(msg);
  else toast(msg);
});

socket.on('connect', () => {
  const saved = localStorage.getItem('poker_nick');
  if (saved && !$('nickname').value) $('nickname').value = saved;

  const roomFromUrl = parseRoomFromUrl();
  const savedRoom = sessionStorage.getItem('poker_room');
  if (roomFromUrl) $('join-code').value = roomFromUrl;

  if (savedRoom) {
    const n = nick() || saved || 'Oyuncu';
    if (!$('nickname').value) $('nickname').value = n;
    socket.emit('join_room', {
      code: savedRoom,
      nickname: nick() || n,
      playerId: getPlayerId(),
    });
  }
});

if (!localStorage.getItem('poker_nick')) {
  $('nickname').placeholder = 'Örn. Ali';
}
