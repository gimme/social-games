// @ts-check

/**
 * The hub's registry of games. Add an entry here to make a new game appear on
 * the home page. Games themselves know nothing about this file or about each
 * other — this array is the only place the hub couples to a game.
 *
 * Each entry is one of two kinds, and both are just self-contained folders:
 *  - 'game'  — a game the phone runs; its folder's index.html is the app.
 *  - 'guide' — a how-to-play reference card; its folder's index.html is a
 *              static rules page. A guide that grows into a full game keeps its
 *              folder (and URL): index.html becomes the app, the rules move to
 *              how-to-play.html, and `kind` flips to 'game'.
 *
 * @typedef {Object} Game
 * @property {string} id      Unique slug; matches the folder name.
 * @property {'game' | 'guide'} kind  Interactive game, or reference-only guide.
 * @property {string} name    Display name.
 * @property {string} tagline One-line description shown on the card.
 * @property {string} emoji   A single emoji used as the card icon.
 * @property {string} players Human-readable player count, e.g. "3+ players".
 * @property {string} path    Path to the folder, relative to the hub, e.g.
 *                            "impostor/".
 */

/** @type {Game[]} */
export const games = [
  // --- Games the phone runs ------------------------------------------------
  {
    id: 'impostor',
    kind: 'game',
    name: 'Impostor',
    tagline: 'Everyone gets the secret word — except the impostor. Work out who’s faking.',
    emoji: '🕵️',
    players: '3+ players',
    path: 'impostor/',
  },
  {
    id: 'wavelength',
    kind: 'game',
    name: 'Wavelength',
    tagline: 'Read your team’s mind on a hidden dial — the closer you land, the more you score.',
    emoji: '🎚️',
    players: '2+ players',
    path: 'wavelength/',
  },
  {
    id: 'trivia',
    kind: 'game',
    name: 'Trivia',
    tagline: 'A trivia deck you steer — run a category, fire off a flags round, or wing it. You host; the phone deals.',
    emoji: '🧠',
    players: '2+ players',
    path: 'trivia/',
  },

  // --- How-to-play guides (reference only, for now) ------------------------
  {
    id: 'impostor-qa',
    kind: 'guide',
    name: 'Impostor Q&A',
    tagline: 'Everyone answers the same question — except the impostor, who got a different one.',
    emoji: '❓',
    players: '4+ players',
    path: 'impostor-qa/',
  },
  {
    id: 'just-one',
    kind: 'guide',
    name: 'Just One',
    tagline: 'Everyone gives the guesser one clue — but matching clues cancel out.',
    emoji: '💬',
    players: '3+ players',
    path: 'just-one/',
  },
  {
    id: 'werewords',
    kind: 'guide',
    name: 'Werewords',
    tagline: 'Twenty questions with a secret helper — and a secret saboteur.',
    emoji: '🐺',
    players: '4+ players',
    path: 'werewords/',
  },
  {
    id: 'who-am-i',
    kind: 'guide',
    name: 'Who Am I?',
    tagline: 'Yes/no questions until you crack the secret person, place or thing.',
    emoji: '🤔',
    players: '2+ players',
    path: 'who-am-i/',
  },
  {
    id: 'heads-up',
    kind: 'guide',
    name: 'Heads Up',
    tagline: 'A word you can’t see. Guess it fast from your friends’ hints.',
    emoji: '🙆',
    players: '2+ players',
    path: 'heads-up/',
  },
  {
    id: 'family-feud',
    kind: 'guide',
    name: 'Family Feud',
    tagline: 'Name the top survey answers. Two teams, three rounds, fast money.',
    emoji: '📊',
    players: '4+, teams',
    path: 'family-feud/',
  },
  {
    id: 'eight-words',
    kind: 'guide',
    name: '8 Words',
    tagline: 'Guess eight unrelated words from the shortest clues you can give.',
    emoji: '🔤',
    players: '2+ players',
    path: 'eight-words/',
  },
  {
    id: 'word-chain-link',
    kind: 'guide',
    name: 'Word Chain Link',
    tagline: 'Eight linked words, only first letters shown. Beat the clock.',
    emoji: '🔗',
    players: '1+ players',
    path: 'word-chain-link/',
  },
  {
    id: 'dont-copy',
    kind: 'guide',
    name: 'Don’t Copy My Answer',
    tagline: 'Match the host’s answer — or get it wrong — and you’re out.',
    emoji: '🙅',
    players: '3+ players',
    path: 'dont-copy/',
  },
  {
    id: 'i-can-name',
    kind: 'guide',
    name: 'I Can Name…',
    tagline: 'Bid how many you can name, or call the bluff. 45 seconds to deliver.',
    emoji: '🎯',
    players: '2+ players',
    path: 'i-can-name/',
  },
  {
    id: 'going-camping',
    kind: 'guide',
    name: 'I’m Going Camping',
    tagline: 'The host has a secret rule. Crack it by what you’re allowed to bring.',
    emoji: '🏕️',
    players: '3+ players',
    path: 'going-camping/',
  },
  {
    id: 'mind-meld',
    kind: 'guide',
    name: 'Mind Meld',
    tagline: 'Say a word at the same time, then converge until your minds meet.',
    emoji: '🤝',
    players: '2+ players',
    path: 'mind-meld/',
  },
  {
    id: 'top-5',
    kind: 'guide',
    name: 'Top 5 Picks',
    tagline: 'Two people trade top picks for a theme; everyone else reacts.',
    emoji: '🏆',
    players: '2+ players',
    path: 'top-5/',
  },
  {
    id: 'form-a-word',
    kind: 'guide',
    name: 'Form a Word',
    tagline: 'Two letters flip up — first to call a word that fits them wins.',
    emoji: '⚡',
    players: '2 players',
    path: 'form-a-word/',
  },
  {
    id: 'rhythm-12345678',
    kind: 'guide',
    name: '12345678 Rhythm',
    tagline: 'Count to 8 and back in rhythm, dropping a number each pass.',
    emoji: '🥁',
    players: '1+ players',
    path: 'rhythm-12345678/',
  },
];
