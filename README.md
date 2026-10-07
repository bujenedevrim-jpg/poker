# Texas Hold'em — Multiplayer Chip Poker (Prototype)

Friends join from their phones via a shareable room link/code and play **Texas Hold'em** with fun chips (no real money).

## Stack

- Node.js + Express + Socket.IO
- Single-page mobile-first HTML/CSS/JS client

## Requirements

- Node.js 18+

## Run

```bash
cd /workspace/poker-holdem
npm install
npm start
```

Then open:

- Local: http://localhost:3000
- On the same machine/network: http://\<your-lan-ip\>:3000

Create a room → share the link (`/r/CODE`) or the 6-character code → friends join with a nickname.

**Host** taps **Eli Başlat** when at least 2 players are seated.

## How to play (v1)

1. Enter a nickname → **Oda Oluştur** or enter a code → **Odaya Katıl**
2. Host starts the hand (blinds 10/20, everyone starts with 1000 chips)
3. On your turn: **Fold / Check / Call / Raise / All-in**
4. Flop → Turn → River → showdown; winner takes the pot
5. Host can start the next hand

## Implemented

- Create / join room by code or URL (`/r/ABC123`)
- 2–9 players, nickname, 1000 starting chips
- Full streets: preflop, flop, turn, river
- Fold / check / call / raise / all-in
- Standard 5-card hand rankings from 7 cards
- Real-time sync over WebSockets
- Mobile-friendly green table UI (Turkish UI labels)

## Not in v1 (next steps)

- Side pots (multi-way all-in)
- Persistent reconnect / re-seat with same nickname
- Blind increase / tournament mode
- Chat, emotes, hand history log
- Auth / accounts
- Production HTTPS deploy (e.g. Railway, Fly.io, VPS + reverse proxy)

## Env

| Variable | Default | Meaning        |
|----------|---------|----------------|
| `PORT`   | `3000`  | HTTP port      |
| `HOST`   | `0.0.0.0` | Bind address |

## License

MIT — prototype for friends / fun only.
