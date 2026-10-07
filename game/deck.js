'use strict';

const SUITS = ['s', 'h', 'd', 'c']; // spades, hearts, diamonds, clubs
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];

function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push(rank + suit);
    }
  }
  return deck;
}

function shuffle(deck) {
  const a = deck.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function cardRank(card) {
  return card[0];
}

function cardSuit(card) {
  return card[1];
}

function rankValue(rank) {
  return RANKS.indexOf(rank);
}

module.exports = {
  SUITS,
  RANKS,
  createDeck,
  shuffle,
  cardRank,
  cardSuit,
  rankValue,
};
