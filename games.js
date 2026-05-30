// @ts-check

/**
 * The hub's registry of games. Add an entry here to make a new game appear on
 * the home page. Games themselves know nothing about this file or about each
 * other — this array is the only place the hub couples to a game.
 *
 * @typedef {Object} Game
 * @property {string} id      Unique slug; matches the game's folder name.
 * @property {string} name    Display name.
 * @property {string} tagline One-line description shown on the card.
 * @property {string} emoji   A single emoji used as the card icon.
 * @property {string} players Human-readable player count, e.g. "3+ players".
 * @property {string} path    Path to the game's entry page, relative to the hub
 *                            (the folder name, e.g. "impostor/").
 */

/** @type {Game[]} */
export const games = [
  {
    id: 'impostor',
    name: 'Impostor',
    tagline: 'Everyone gets the secret word — except the impostor. Work out who’s faking.',
    emoji: '🕵️',
    players: '3+ players',
    path: 'impostor/',
  },
];
