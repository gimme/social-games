// @ts-check

/*
 * Impostor — a pass-the-phone social deduction game.
 *
 * Players first secretly type words into one shared pool: a roster lists every
 * player, and each opens their own page — in any order, as often as they like —
 * to add words or take their own back out. Every word carries a HINT — the
 * host's category by default, or whatever the player typed instead — so a pool
 * can mix themes freely. A round draws from the whole pool unless the host has
 * picked one category (a hint with two or more words) to PLAY FROM, which lets
 * the table work through a theme. It opens by showing the hint behind its word
 * to the whole table; then the app secretly assigns roles:
 * everyone gets the same secret word except the impostor — who gets nothing, or
 * (in a "decoy" round) a different word under the same hint and no warning. The
 * phone is passed around once more so each player privately sees their screen,
 * then the table gives one-word clues, discusses, and votes — all in person.
 * The app only handles the secret bits.
 *
 * The pool depletes as you play: every word a round draws — the crew's real word
 * and any decoys — is removed, so it won't come up again until you add more.
 * Duplicates are allowed (every entered word counts). Each word remembers who
 * added it, used for two fairness rules: a round won't hand an impostor the very
 * word they typed (unless that's all that's left), and the crew's word is drawn
 * by player before word, so typing more words doesn't make yours come up more
 * often.
 *
 * Players are kept by id, so they can be renamed, added and removed at will
 * without the pool losing track of whose words are whose. A player can also
 * SIT OUT: they stay on the roster with their words, but no role is dealt to
 * them until they rejoin — and since nobody being dealt in typed those words,
 * they're the fairest ones there are.
 *
 * The phone can't tell who's holding it, so nothing stops a player opening
 * someone else's page. Instead the roster keeps a short history of which pages
 * were opened and how long ago, so a peek doesn't go unnoticed by the table.
 *
 * Self-contained: this game imports nothing and is the only script on its page.
 *
 * The pure round-building logic (buildRound) is DOM-free so it can be exercised
 * by a simulation without a browser.
 */

const MIN_PLAYERS = 3;
const MAX_PLAYERS = 12;
const DEFAULT_PLAYERS = 4;
const NAME_MAX = 20;

const STORAGE_KEY = 'impostor.v4';

/** How far back the roster's "opened" history reaches. */
const OPENS_WINDOW_MS = 10 * 60 * 1000;

/**
 * @typedef {'normal' | 'two-impostor' | 'no-impostor' | 'everyone-impostor'} RoundType
 */

/**
 * @typedef {Object} Settings
 * @property {string} category        Default hint for new words (upper-case); '' when unset.
 * @property {number} nonePct         No-impostor odds (0..100).
 * @property {number} everyonePct     Everyone's-impostor odds (0..100).
 * @property {number} twoPct          Two-impostors odds (0..100).
 * @property {number} decoyPct        Decoy modifier odds (0..100).
 */

/**
 * Someone at the table. Kept by id, so a rename never orphans a word.
 *
 * @typedef {Object} Player
 * @property {string} id      Stable and never reused.
 * @property {string} name    Display name, as typed.
 * @property {boolean} out    Sitting out: still on the roster, words kept, but dealt no role.
 */

/**
 * @typedef {Object} Assignment
 * @property {string | null} word   The word this player sees; null => overt impostor.
 * @property {boolean} impostor     Whether this player is an impostor.
 */

/**
 * A word in the pool, tagged with its hint and who added it.
 *
 * @typedef {Object} PoolEntry
 * @property {string} word   Display (upper-case) form.
 * @property {string} hint   Display (upper-case) hint it was added under; '' for none.
 * @property {string} by     Id of the player who added it.
 */

/**
 * One opening of a player's entry page, kept so the roster can show who was
 * looked at and when. Recorded on the tap itself — before any words render —
 * so a refresh or a closed tab can't dodge it.
 *
 * @typedef {Object} PageOpen
 * @property {string} id  Player whose page was opened.
 * @property {number} t   When (epoch ms).
 */

/**
 * @typedef {Object} Round
 * @property {RoundType} type
 * @property {boolean} decoy                 Did the decoy modifier actually apply.
 * @property {string | null} realWord        Shared crew word; null for everyone-impostor.
 * @property {string} hint                   Shown to the whole table before roles go out; '' for none.
 * @property {PoolEntry[]} decoys            Entries handed out as decoy words. Returned to the
 *                                           pool if the round is skipped (the real word stays used up).
 * @property {string[]} players              Ids of those dealt in, in seat order.
 * @property {number} starter                Seat (index into players) who starts the clues.
 * @property {Assignment[]} assignments      Per seat: assignments[i] belongs to players[i].
 */

/**
 * @typedef {Object} GameState
 * @property {'home' | 'entry' | 'hint' | 'reveal' | 'play' | 'result'} phase
 * @property {Player[]} players             Everyone at the table, sitting out or not, in seat order.
 * @property {Settings} settings
 * @property {PoolEntry[]} pool              Words (display form), duplicates allowed; consumed as rounds are built.
 * @property {string | null} playHint        Normalised hint the next round draws from, or null for
 *                                           the whole pool; never '' (words with no hint aren't a
 *                                           category). Kept while it has words; Home clears it
 *                                           once they run out.
 * @property {PageOpen[]} opens              Entry-page opens, oldest first; pruned to OPENS_WINDOW_MS.
 * @property {Round | null} round            The current round (during hint/reveal/play/result).
 * @property {number} turn                   0-based seat: into `players` for whose page is open
 *                                           (entry), into `round.players` for whose turn it is
 *                                           (reveal pass-around).
 * @property {boolean} gateOpen              Whether a player has been picked (entry) or the
 *                                           current player's pass gate is passed (reveal).
 * @property {string} entryHint              Hint the next word gets; starts as the category
 *                                           each time a player opens their page.
 * @property {boolean} advancedOpen          Whether the advanced settings are expanded.
 * @property {string | null} editing         Id of the player whose name is being edited on Home.
 */

// --- pure helpers (DOM-free) ----------------------------------------------

/** @param {number} n @returns {number} A random integer in [0, n). */
function randInt(n) {
  return Math.floor(Math.random() * n);
}

/**
 * @template T
 * @param {T[]} arr
 * @returns {T[]} A shuffled copy (Fisher–Yates).
 */
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    const tmp = a[i];
    a[i] = a[j];
    a[j] = tmp;
  }
  return a;
}

/**
 * Sample `k` distinct indices from [0, n) uniformly at random.
 *
 * @param {number} n
 * @param {number} k
 * @returns {number[]}
 */
function sampleIndices(n, k) {
  const all = [];
  for (let i = 0; i < n; i++) all.push(i);
  return shuffle(all).slice(0, k);
}

/**
 * Normalise a word or hint for comparing: trim, collapse internal whitespace,
 * lowercase.
 *
 * @param {string} raw
 * @returns {string}
 */
function normaliseWord(raw) {
  return raw.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Display form of a word or hint: trimmed, internal whitespace collapsed,
 * upper-cased.
 *
 * @param {string} raw
 * @returns {string}
 */
function displayForm(raw) {
  return raw.trim().replace(/\s+/g, ' ').toUpperCase();
}

/**
 * The opens still inside the history window.
 *
 * @param {PageOpen[]} opens
 * @param {number} [now]
 * @returns {PageOpen[]}
 */
function recentOpens(opens, now = Date.now()) {
  return opens.filter((o) => now - o.t < OPENS_WINDOW_MS);
}

/**
 * A coarse "how long ago" label. Ages aren't ticked live — the roster is
 * re-rendered at every handoff, which is when anyone looks — so the units stay
 * rough enough not to imply precision they don't have.
 *
 * @param {number} ms
 * @returns {string}
 */
function ageLabel(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 10) return 'just now';
  if (s < 60) return `${s} s ago`;
  return `${Math.floor(s / 60)} min ago`;
}

/**
 * A true/false roll: returns true with probability pct/100.
 *
 * @param {number} pct
 * @returns {boolean}
 */
function roll(pct) {
  return Math.random() * 100 < pct;
}

/**
 * The implied "normal" percentage = 100 − (none + everyone + two), clamped.
 *
 * @param {Settings} settings
 * @param {number} n
 * @returns {number}
 */
function normalPct(settings, n) {
  const two = n < 4 ? 0 : settings.twoPct;
  return Math.max(0, 100 - (settings.nonePct + settings.everyonePct + two));
}

/**
 * Roll the round type. two-impostor is skipped when n < 4 (its probability
 * falls through to normal), mirroring the player-count guard.
 *
 * @param {Settings} settings
 * @param {number} n
 * @returns {RoundType}
 */
function rollType(settings, n) {
  const r = Math.random() * 100;
  let acc = settings.nonePct;
  if (r < acc) return 'no-impostor';
  acc += settings.everyonePct;
  if (r < acc) return 'everyone-impostor';
  if (n >= 4) {
    acc += settings.twoPct;
    if (r < acc) return 'two-impostor';
  }
  return 'normal';
}

/**
 * Number of impostors implied by a round type.
 *
 * @param {RoundType} type
 * @param {number} n
 * @returns {number}
 */
function impostorCountForType(type, n) {
  switch (type) {
    case 'no-impostor':
      return 0;
    case 'two-impostor':
      return 2;
    case 'everyone-impostor':
      return n;
    case 'normal':
    default:
      return 1;
  }
}

/**
 * Build a round. Pure: no DOM, no global state.
 *
 * Words are CONSUMED: every word drawn (the crew's real word and any decoys) is
 * removed from the working pool, which is returned so the caller can persist the
 * depleted pool. Duplicates are allowed; a draw removes one instance by index.
 *
 * The round's HINT is the real word's hint, shown to the whole table before
 * roles go out — so everything drawn for the round must share it, or a player's
 * word would contradict the screen and out them:
 *  - The real word is never one an impostor in THIS round contributed — unless
 *    the only words left are theirs (graceful fallback). Among the rest it is
 *    drawn by PLAYER first, then word, so one prolific typist doesn't hog it.
 *  - Decoys carry the real word's hint, differ from the real word (hard
 *    constraint), and differ from each other when the pool allows. Too few such
 *    words => the round falls back to overt impostors.
 *  - An everyone-impostor round has no real word. With decoys it needs one hint
 *    group holding a distinct word for every player, and hands those out. Overt,
 *    it borrows (without consuming) a hint at least two different players used:
 *    a hint only YOUR words carry could never be a crew word's, so seeing it as
 *    the impostor would give the twist away. No such hint => a normal round.
 *
 * @param {string[]} players   Ids of those dealt in, in seat order.
 * @param {PoolEntry[]} pool
 * @param {Settings} settings
 * @returns {{ round: Round, pool: PoolEntry[] }}
 */
function buildRound(players, pool, settings) {
  const n = players.length;
  const work = pool.slice();
  const wordKey = /** @param {PoolEntry} e */ (e) => normaliseWord(e.word);
  const hintKey = /** @param {PoolEntry} e */ (e) => normaliseWord(e.hint);

  /**
   * Indices into `work` whose hint matches, optionally excluding one word text.
   *
   * @param {string} hk
   * @param {string | null} [excludeWordKey]
   * @returns {number[]}
   */
  const withHint = (hk, excludeWordKey) => {
    const out = [];
    for (let i = 0; i < work.length; i++) {
      if (hintKey(work[i]) !== hk) continue;
      if (excludeWordKey != null && wordKey(work[i]) === excludeWordKey) continue;
      out.push(i);
    }
    return out;
  };

  /**
   * Group indices into `work` by a key of their entry, in first-seen order.
   *
   * @template K
   * @param {number[]} idx
   * @param {(e: PoolEntry) => K} key
   * @returns {Map<K, number[]>}
   */
  const groupBy = (idx, key) => {
    /** @type {Map<K, number[]>} */
    const groups = new Map();
    for (const i of idx) {
      const k = key(work[i]);
      const g = groups.get(k);
      if (g) g.push(i);
      else groups.set(k, [i]);
    }
    return groups;
  };

  /** @returns {number[]} Every index into `work`. */
  const allIdx = () => work.map((_, i) => i);

  /** @returns {Map<string, number[]>} Indices into `work`, grouped by hint. */
  const groupsByHint = () => groupBy(allIdx(), hintKey);

  /** @param {number} i @returns {PoolEntry} Draw (remove and return) one entry. */
  const take = (i) => work.splice(i, 1)[0];

  let type = rollType(settings, n);
  let decoy = false;
  let hint = '';
  /** @type {string | null} */
  let realWord = null;
  /** @type {PoolEntry[]} */
  const decoys = [];
  /** @type {Assignment[] | null} */
  let assignments = null;

  if (type === 'everyone-impostor') {
    if (roll(settings.decoyPct)) {
      // Everyone gets a different word under one hint: needs a hint group with a
      // distinct word per player. Pick among such groups, weighted by size.
      const eligible = [];
      for (const idx of groupsByHint().values()) {
        const distinct = new Set(idx.map((i) => wordKey(work[i])));
        if (distinct.size >= n) eligible.push(...idx);
      }
      if (eligible.length > 0) {
        const hk = hintKey(work[eligible[randInt(eligible.length)]]);
        decoy = true;
        assignments = [];
        const used = new Set();
        for (let p = 0; p < n; p++) {
          const fresh = withHint(hk).filter((i) => !used.has(wordKey(work[i])));
          const entry = take(fresh[randInt(fresh.length)]);
          used.add(normaliseWord(entry.word));
          decoys.push(entry);
          assignments.push({ word: entry.word, impostor: true });
        }
        hint = decoys[0].hint;
      }
    }
    if (!decoy) {
      // Overt: borrow a hint that at least two different players used.
      const shared = [];
      for (const idx of groupsByHint().values()) {
        const contributors = new Set(idx.map((i) => work[i].by));
        if (contributors.size >= 2) shared.push(...idx);
      }
      if (shared.length > 0) {
        hint = work[shared[randInt(shared.length)]].hint;
        assignments = [];
        for (let p = 0; p < n; p++) assignments.push({ word: null, impostor: true });
      } else {
        type = 'normal';
      }
    }
  }

  if (assignments === null) {
    // normal / two-impostor / no-impostor (and the everyone-impostor fallback).
    const impostorCount = impostorCountForType(type, n);
    const impostorSet = new Set(sampleIndices(n, impostorCount));
    const impostorIds = new Set([...impostorSet].map((i) => players[i]));

    // Real word: prefer words NOT contributed by an impostor this round; fall
    // back to the whole pool only if every remaining word is an impostor's.
    // Draw a player uniformly, then one of their words uniformly.
    /** @type {PoolEntry | null} */
    let real = null;
    if (work.length > 0) {
      const crewIdx = allIdx().filter((i) => !impostorIds.has(work[i].by));
      const pickFrom = crewIdx.length > 0 ? crewIdx : allIdx();
      const byPlayer = [...groupBy(pickFrom, (e) => e.by).values()];
      const theirs = byPlayer[randInt(byPlayer.length)];
      real = take(theirs[randInt(theirs.length)]);
      realWord = real.word;
      hint = real.hint;
    }
    const realHk = real ? hintKey(real) : '';
    const realWk = real ? wordKey(real) : null;

    // Decoy modifier: only with an impostor to hand one to, and only if enough
    // words share the real word's hint (and differ from it) to give each
    // impostor one. Otherwise fall back to an overt round.
    decoy = impostorCount > 0 && roll(settings.decoyPct);
    if (decoy && withHint(realHk, realWk).length < impostorCount) decoy = false;

    /** Draw a decoy under the real word's hint, preferring text not yet used this round. */
    const usedDecoyKeys = new Set();
    const drawDecoy = () => {
      const candidates = withHint(realHk, realWk);
      const fresh = candidates.filter((i) => !usedDecoyKeys.has(wordKey(work[i])));
      const pickFrom = fresh.length > 0 ? fresh : candidates;
      const entry = take(pickFrom[randInt(pickFrom.length)]);
      usedDecoyKeys.add(normaliseWord(entry.word));
      decoys.push(entry);
      return entry.word;
    };

    assignments = [];
    for (let p = 0; p < n; p++) {
      if (!impostorSet.has(p)) {
        assignments.push({ word: realWord, impostor: false });
      } else if (decoy) {
        assignments.push({ word: drawDecoy(), impostor: true });
      } else {
        assignments.push({ word: null, impostor: true });
      }
    }
  }

  const starter = randInt(n);

  return {
    round: { type, decoy, realWord, hint, decoys, players, starter, assignments },
    pool: work,
  };
}

// ---------------------------------------------------------------------------
// Everything below this line is the browser app (DOM + state + persistence).
// ---------------------------------------------------------------------------

const app = /** @type {HTMLElement} */ (document.getElementById('app'));

/** @returns {Settings} */
function defaultSettings() {
  return { category: '', nonePct: 0, everyonePct: 0, twoPct: 0, decoyPct: 0 };
}

/** @returns {string} A fresh player id; random enough never to collide at one table. */
function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/** @returns {Player[]} A fresh table of DEFAULT_PLAYERS placeholder-named players. */
function defaultPlayers() {
  /** @type {Player[]} */
  const players = [];
  for (let i = 0; i < DEFAULT_PLAYERS; i++) {
    players.push({ id: newId(), name: `Player ${i + 1}`, out: false });
  }
  return players;
}

/** @type {GameState} */
const state = {
  phase: 'home',
  players: defaultPlayers(),
  settings: defaultSettings(),
  pool: [],
  playHint: null,
  opens: [],
  round: null,
  turn: 0,
  gateOpen: false,
  entryHint: '',
  advancedOpen: false,
  editing: null,
};

// --- persistence -----------------------------------------------------------

/**
 * Save the durable parts of state. Transient pass-around bits (turn, gateOpen,
 * the round's secrets) are saved only enough to restore safely.
 */
function save() {
  try {
    /** @type {Record<string, unknown>} */
    const data = {
      phase: state.phase,
      players: state.players,
      settings: state.settings,
      pool: state.pool,
      playHint: state.playHint,
      opens: recentOpens(state.opens),
      round: state.round,
      turn: state.turn,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Storage may be unavailable; the game still works fully in memory.
  }
}

/** Load persisted state, resetting any pass-around to a safe pass-gate. */
function load() {
  let data;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    data = JSON.parse(raw);
  } catch {
    return;
  }
  if (!data || typeof data !== 'object') return;

  try {
    if (Array.isArray(data.players)) state.players = parsePlayers(data.players);
    if (data.settings && typeof data.settings === 'object') {
      const s = data.settings;
      state.settings = {
        category: typeof s.category === 'string' ? s.category : '',
        nonePct: clampPct(s.nonePct),
        everyonePct: clampPct(s.everyonePct),
        twoPct: clampPct(s.twoPct),
        decoyPct: clampPct(s.decoyPct),
      };
    }
    // Words and opens belong to players on the roster; anything else is noise.
    if (Array.isArray(data.pool)) {
      state.pool = parseEntries(data.pool).filter((e) => playerById(e.by));
    }
    state.playHint = typeof data.playHint === 'string' ? data.playHint : null;
    if (Array.isArray(data.opens)) {
      state.opens = recentOpens(parseOpens(data.opens)).filter((o) => playerById(o.id));
    }
    if (data.round && typeof data.round === 'object') {
      const r = data.round;
      if (typeof r.hint !== 'string') r.hint = '';
      r.decoys = Array.isArray(r.decoys) ? parseEntries(r.decoys) : [];
      // The seats must line up with the assignments, or the pass-around would
      // hand out the wrong screens.
      const seated =
        Array.isArray(r.players) &&
        Array.isArray(r.assignments) &&
        r.players.length === r.assignments.length &&
        r.players.every((/** @type {unknown} */ id) => typeof id === 'string');
      if (seated) state.round = /** @type {Round} */ (r);
    }

    const phase = data.phase;
    if (phase === 'hint' || phase === 'reveal' || phase === 'play' || phase === 'result') {
      // Only restore a round in progress if we actually have the round data;
      // otherwise fall back to Home.
      state.phase = state.round ? phase : 'home';
    } else if (phase === 'entry') {
      state.phase = 'entry';
    } else {
      state.phase = 'home';
    }

    // Always reset any pass-around to a safe gate (the roster during entry,
    // the pass-gate during reveal) so no player's screen can flash on refresh.
    const turn = typeof data.turn === 'number' ? data.turn : 0;
    const seats =
      state.phase === 'reveal' && state.round ? state.round.players.length : state.players.length;
    state.turn = clamp(turn, 0, Math.max(0, seats - 1));
    state.gateOpen = false;
    state.entryHint = '';
  } catch {
    // Corrupt payload — fall back to defaults already in state.
  }
}

/**
 * @param {unknown[]} items
 * @returns {PoolEntry[]} The well-formed entries among `items`.
 */
function parseEntries(items) {
  /** @type {PoolEntry[]} */
  const out = [];
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const e = /** @type {Record<string, unknown>} */ (item);
    if (typeof e.word !== 'string') continue;
    out.push({
      word: e.word,
      hint: typeof e.hint === 'string' ? e.hint : '',
      by: typeof e.by === 'string' ? e.by : '',
    });
  }
  return out;
}

/**
 * @param {unknown[]} items
 * @returns {PageOpen[]} The well-formed opens among `items`.
 */
function parseOpens(items) {
  /** @type {PageOpen[]} */
  const out = [];
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const o = /** @type {Record<string, unknown>} */ (item);
    if (typeof o.id !== 'string') continue;
    if (typeof o.t !== 'number' || !Number.isFinite(o.t)) continue;
    out.push({ id: o.id, t: o.t });
  }
  return out;
}

/**
 * @param {unknown[]} items
 * @returns {Player[]} The well-formed players among `items`; a duplicate id keeps its first.
 */
function parsePlayers(items) {
  /** @type {Player[]} */
  const out = [];
  const seen = new Set();
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const p = /** @type {Record<string, unknown>} */ (item);
    if (typeof p.id !== 'string' || !p.id || seen.has(p.id)) continue;
    if (typeof p.name !== 'string') continue;
    seen.add(p.id);
    out.push({ id: p.id, name: p.name, out: p.out === true });
    if (out.length >= MAX_PLAYERS) break;
  }
  return out;
}

/**
 * @param {number} v @param {number} lo @param {number} hi @returns {number}
 */
function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, Math.round(v)));
}

/** @param {unknown} v @returns {number} A percentage in [0, 100]. */
function clampPct(v) {
  return typeof v === 'number' && Number.isFinite(v) ? clamp(v, 0, 100) : 0;
}

// --- DOM helpers -----------------------------------------------------------

/**
 * @param {string} tag
 * @param {string} [className]
 * @param {string} [text]
 * @returns {HTMLElement}
 */
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

/**
 * A text input that shows capitals as you type: the (mobile) keyboard is asked
 * for them, and the live value is forced to caps so the letters appear
 * uppercase the instant they're typed — not just when committed.
 *
 * @param {string} placeholder
 * @param {string} value
 * @returns {HTMLInputElement}
 */
function upperInput(placeholder, value) {
  const input = /** @type {HTMLInputElement} */ (el('input', 'field__input'));
  input.type = 'text';
  input.placeholder = placeholder;
  input.value = value;
  input.autocomplete = 'off';
  input.setAttribute('autocapitalize', 'characters');
  input.addEventListener('input', () => {
    const upper = input.value.toUpperCase();
    if (upper === input.value) return;
    // Preserve the caret (upper-casing keeps length for these characters).
    const start = input.selectionStart ?? upper.length;
    const end = input.selectionEnd ?? upper.length;
    input.value = upper;
    input.setSelectionRange(start, end);
  });
  return input;
}

/**
 * Make a card behave as a big tap target (the card *is* the button — no
 * separate button beneath it). Adds pointer + keyboard activation.
 *
 * @param {HTMLElement} node
 * @param {() => void} onActivate
 * @returns {HTMLElement}
 */
function makeTappable(node, onActivate) {
  node.classList.add('card--tap');
  node.setAttribute('role', 'button');
  node.setAttribute('tabindex', '0');
  node.addEventListener('click', onActivate);
  node.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onActivate();
    }
  });
  return node;
}

/**
 * A row of progress dots showing turn position (leaks nothing).
 *
 * @param {number} total
 * @param {number} current
 * @returns {HTMLElement}
 */
function progressDots(total, current) {
  const row = el('div', 'dots');
  for (let i = 0; i < total; i++) {
    const dot = el('span', 'dots__dot');
    if (i < current) dot.classList.add('dots__dot--done');
    if (i === current) dot.classList.add('dots__dot--active');
    row.append(dot);
  }
  return row;
}

/**
 * A labelled percentage stepper (0..100 in steps of 5).
 *
 * @param {string} label
 * @param {number} value
 * @param {(value: number) => void} onChange
 * @param {{ disabled?: boolean, note?: string }} [opts]
 * @returns {HTMLElement}
 */
function pctStepper(label, value, onChange, opts) {
  const field = el('div', 'field field--pct');
  if (opts?.disabled) field.classList.add('field--disabled');

  const labelWrap = el('div', 'field__labelwrap');
  labelWrap.append(el('span', 'field__label', label));
  if (opts?.note) labelWrap.append(el('span', 'field__note', opts.note));
  field.append(labelWrap);

  const control = el('div', 'stepper');
  const dec = el('button', 'stepper__btn', '−');
  const val = el('span', 'stepper__value', `${value}%`);
  const inc = el('button', 'stepper__btn', '+');

  const disabled = !!opts?.disabled;
  /** @type {HTMLButtonElement} */ (dec).disabled = disabled || value <= 0;
  /** @type {HTMLButtonElement} */ (inc).disabled = disabled || value >= 100;
  dec.addEventListener('click', () => onChange(Math.max(0, value - 5)));
  inc.addEventListener('click', () => onChange(Math.min(100, value + 5)));

  control.append(dec, val, inc);
  field.append(control);
  return field;
}

/**
 * @param {string} text
 * @returns {HTMLElement}
 */
function hintBanner(text) {
  return el('div', 'hint-banner', text);
}

// --- phase transitions -----------------------------------------------------

/** Go to the one Home screen (settings + pool + actions). */
function goHome() {
  state.phase = 'home';
  render();
}

/** Open the entry roster (always append mode — never resets the pool). */
function goEntry() {
  state.phase = 'entry';
  state.turn = 0;
  state.gateOpen = false;
  render();
}

/**
 * Build a round and show its hint. The round draws from the chosen hint's
 * words when one is chosen (and still has words), else from the whole pool —
 * and consumes what it draws, so the depleted pool is written back to state.
 */
function startRound() {
  const seats = activePlayers().map((p) => p.id);
  const draw = drawPool();
  if (draw.length === 0 || seats.length < MIN_PLAYERS) return;
  const { round, pool } = buildRound(seats, draw, state.settings);
  // buildRound hands back the drawn-from words it didn't use, as the same
  // objects: whatever's missing was consumed. Drop just those from the full
  // pool, so words under other hints stay put and in order.
  const used = new Set(draw);
  for (const e of pool) used.delete(e);
  state.pool = state.pool.filter((e) => !used.has(e));
  state.round = round;
  state.phase = 'hint';
  render();
}

/** Hand out roles: begin the reveal pass-around. */
function startReveal() {
  state.phase = 'reveal';
  state.turn = 0;
  state.gateOpen = false;
  render();
}

/**
 * Drop the round before roles go out. The word behind the hint stays used up
 * (so the same hint doesn't come straight back); decoys quietly return to the
 * pool.
 */
function skipRound() {
  if (state.round) state.pool = state.pool.concat(state.round.decoys);
  state.round = null;
  goHome();
}

// --- screens ---------------------------------------------------------------

/**
 * The one Home screen: settings, pool status, and actions. Settings stay
 * editable here between rounds without ever losing the pool.
 */
function renderHome() {
  const screen = el('section', 'screen');
  const wordCount = state.pool.length;
  const hasWords = wordCount > 0;
  // A brand-new pool that has never been played gets the full welcome; once
  // there are words (or a round has happened) Home stays uncluttered.
  const firstRun = !hasWords && state.round === null;

  screen.append(el('h1', 'screen__title', 'Impostor'));

  const howto = /** @type {HTMLAnchorElement} */ (
    el('a', 'screen__howto', 'How to play →')
  );
  howto.href = 'how-to-play.html';
  screen.append(howto);

  if (firstRun) {
    screen.append(
      el(
        'p',
        'screen__lede',
        'Everyone secretly types words into one shared pool. Then the app hands ' +
          'out the same secret word to all — except the impostor. Pass the phone ' +
          'around, give one-word clues (2 each), and work out who is faking. But ' +
          'be careful — if the impostor guesses the word, they win!',
      ),
    );
  }

  screen.append(renderLineup());

  // Category — the default hint on every word added from now on. Words already
  // in the pool keep the hint they were added under, so it can change any time.
  const catField = el('label', 'field field--input');
  const catLabel = el('div', 'field__labelwrap');
  catLabel.append(el('span', 'field__label', 'Category'));
  catLabel.append(el('span', 'field__note', 'Default hint for new words'));
  catField.append(catLabel);
  const catInput = upperInput('Optional, e.g. MOVIE', state.settings.category);
  catInput.addEventListener('input', () => {
    state.settings.category = catInput.value;
    save();
  });
  catField.append(catInput);
  screen.append(catField);

  // Play from — which hint the next round draws from, once there's a choice.
  const playFrom = renderPlayFrom();
  if (playFrom) screen.append(playFrom);

  // Advanced settings (collapsible).
  screen.append(renderAdvanced());

  // Pool status (or, on a fresh pool, a one-line tip).
  if (hasWords) {
    screen.append(
      el(
        'p',
        'screen__lede',
        `${wordCount} ${wordCount === 1 ? 'word' : 'words'} in the pool.`,
      ),
    );
    const warn = lonePoolWarningEl();
    if (warn) screen.append(warn);
  } else if (firstRun) {
    screen.append(
      el(
        'p',
        'screen__hint',
        'Pick a category everyone here knows well, then add words you’d ' +
          'expect the others to recognise.',
      ),
    );
  } else {
    screen.append(el('p', 'screen__lede', 'No words in the pool yet.'));
  }

  const tooFew = activePlayers().length < MIN_PLAYERS;
  const start = el('button', 'btn', 'Start round');
  /** @type {HTMLButtonElement} */ (start).disabled = !hasWords || tooFew;
  start.addEventListener('click', () => startRound());
  screen.append(start);

  const add = el('button', 'btn btn--ghost', 'Add words');
  add.addEventListener('click', () => goEntry());
  screen.append(add);

  if (hasWords) {
    const clear = el('button', 'btn btn--ghost', 'Clear words');
    clear.addEventListener('click', () => {
      const ok = window.confirm(`Clear all ${wordCountLabel(wordCount)} from the pool?`);
      if (!ok) return;
      state.pool = [];
      state.opens = [];
      state.round = null;
      save();
      render();
    });
    screen.append(clear);
  } else {
    screen.append(el('p', 'screen__hint', 'Add words to start.'));
  }
  if (tooFew) {
    screen.append(
      el(
        'p',
        'screen__hint screen__hint--warn',
        `Needs at least ${MIN_PLAYERS} players playing to start.`,
      ),
    );
  }

  return screen;
}

/**
 * The Home lineup: who's at the table, by name, in seat order. Each row's ⋮
 * menu renames the player, sits them out (or brings them back), or removes
 * them; the ⠿ grip drags them to another seat. Sitting out keeps the player
 * and their words — the round just deals around them — while removing takes
 * their words with them, so it asks first when there are any.
 *
 * Seat order is the order the phone goes round: the entry roster lists players
 * in it, and the reveal passes the phone along it. A lineup that matches the
 * table means the phone always goes to the next person along.
 *
 * @returns {HTMLElement}
 */
function renderLineup() {
  const field = el('section', 'field field--lineup');
  const active = activePlayers().length;
  const out = state.players.length - active;

  const labelWrap = el('div', 'field__labelwrap');
  labelWrap.append(el('span', 'field__label', 'Players'));
  let note = `${active} playing`;
  if (out > 0) note += ` · ${out} sitting out`;
  const noteEl = el('span', 'field__note', note);
  if (active < MIN_PLAYERS) noteEl.classList.add('field__note--warn');
  labelWrap.append(noteEl);
  field.append(labelWrap);

  const list = el('ul', 'lineup');
  for (const p of state.players) list.append(lineupRow(p, list));
  field.append(list);

  const add = el('button', 'btn btn--ghost lineup__add', '+ Add player');
  /** @type {HTMLButtonElement} */ (add).type = 'button';
  /** @type {HTMLButtonElement} */ (add).disabled = state.players.length >= MAX_PLAYERS;
  add.addEventListener('click', () => {
    const player = { id: newId(), name: nextDefaultName(), out: false };
    state.players.push(player);
    // Straight into naming them; leaving the placeholder is fine too.
    state.editing = player.id;
    render();
  });
  field.append(add);

  return field;
}

/**
 * One lineup row: the ⠿ grip, the name (or, while renaming, an input in its
 * place), a "sitting out" tag when it applies, and the ⋮ menu.
 *
 * @param {Player} p
 * @param {HTMLElement} list   The lineup the row belongs to; a drag reorders it live.
 * @returns {HTMLElement}
 */
function lineupRow(p, list) {
  const row = el('li', 'lineup__row');
  row.dataset.id = p.id;
  if (p.out) row.classList.add('lineup__row--out');
  row.append(grip(p, row, list));

  if (state.editing === p.id) {
    const input = /** @type {HTMLInputElement} */ (el('input', 'field__input lineup__input'));
    input.type = 'text';
    input.value = p.name;
    input.maxLength = NAME_MAX;
    input.autocomplete = 'off';
    input.setAttribute('autocapitalize', 'words');
    input.setAttribute('enterkeyhint', 'done');
    input.setAttribute('aria-label', 'Player name');
    input.dataset.autofocus = '';
    // Enter and blur both commit; Escape cancels. A commit re-renders, which
    // can fire a blur of its own, so make sure it only happens once.
    // A drag on a grip closes the rename itself, so a blur that arrives after
    // that (some browsers fire one as the input leaves the page) has nothing
    // left to do.
    let done = false;
    /** @param {boolean} keep */
    const finish = (keep) => {
      if (done) return;
      done = true;
      if (state.editing !== p.id) return;
      if (keep) setName(p, input.value);
      state.editing = null;
      render();
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        finish(true);
      } else if (e.key === 'Escape') {
        finish(false);
      }
    });
    input.addEventListener('blur', () => finish(true));
    row.append(input);
    return row;
  }

  row.append(el('span', 'lineup__name', p.name));
  if (p.out) row.append(el('span', 'lineup__tag', 'Sitting out'));

  const { button, menu } = kebabMenu(`Options for ${p.name}`, [
    {
      label: 'Rename',
      run: () => {
        state.editing = p.id;
        render();
      },
    },
    {
      label: p.out ? 'Rejoin' : 'Sit out',
      run: () => {
        p.out = !p.out;
        render();
      },
    },
    {
      label: 'Remove',
      danger: true,
      run: () => {
        const words = wordsBy(p.id).length;
        if (words > 0) {
          const ok = window.confirm(`Remove ${p.name} and their ${wordCountLabel(words)}?`);
          if (!ok) return;
        }
        state.players = state.players.filter((q) => q !== p);
        state.pool = state.pool.filter((e) => e.by !== p.id);
        state.opens = state.opens.filter((o) => o.id !== p.id);
        render();
      },
    },
  ]);
  row.append(button, menu);
  return row;
}

/**
 * The ⠿ grip on a lineup row. Dragging it carries the row up or down the list,
 * the others sliding out of its way as it goes, and letting go seats the
 * player where it landed. A drag only ever translates rows — the DOM and state
 * stay put until the drop — so cancelling (Escape, or the browser taking the
 * pointer back) just re-renders from state, which puts everything back.
 * Reordering the DOM mid-drag would also release the pointer capture, after
 * which the drag would only follow a finger still over the grip.
 *
 * @param {Player} p
 * @param {HTMLElement} row    The row this grip sits in.
 * @param {HTMLElement} list   The lineup the row belongs to.
 * @returns {HTMLElement}
 */
function grip(p, row, list) {
  const handle = el('button', 'lineup__grip');
  /** @type {HTMLButtonElement} */ (handle).type = 'button';
  handle.setAttribute('aria-label', `Move ${p.name}`);
  handle.title = 'Drag to reorder';

  // A long press on a phone would otherwise pop a context menu and cancel the drag.
  handle.addEventListener('contextmenu', (e) => e.preventDefault());

  handle.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    // Don't move focus or start a text selection — in particular, don't blur a
    // rename in progress, whose re-render would pull the list out from under
    // the drag. Starting a drag ends the rename instead, keeping what was typed.
    e.preventDefault();
    if (state.editing !== null) commitRename();

    // Measured once: nothing below changes layout, so these hold until the drop.
    const rows = Array.from(list.querySelectorAll('li'));
    const boxes = rows.map((r) => r.getBoundingClientRect());
    const listBox = list.getBoundingClientRect();
    const from = rows.findIndex((r) => r === row);
    const mine = boxes[from];
    const grab = e.clientY - mine.top;
    let target = from;
    handle.setPointerCapture(e.pointerId);
    row.classList.add('lineup__row--dragging');

    /** @param {PointerEvent} ev */
    const onMove = (ev) => {
      // The row rides under the finger, kept within the list...
      const top = clamp(ev.clientY - grab, listBox.top, listBox.bottom - mine.height);
      const bottom = top + mine.height;
      row.style.transform = `translateY(${top - mine.top}px)`;
      // ...and takes the seat of the topmost row above whose middle its top
      // edge has passed, or the lowest row below whose middle its bottom edge
      // has. The thresholds are the others' resting middles, which never move,
      // so there's nothing to jitter; and pinned to either end of the list it
      // always counts as past the end row, whatever their exact heights.
      target = from;
      boxes.forEach((b, i) => {
        const middle = b.top + b.height / 2;
        if (i < from && top < middle && i < target) target = i;
        else if (i > from && bottom > middle) target = i;
      });
      // Rows between the old seat and the new step aside by its height.
      rows.forEach((r, i) => {
        if (i === from) return;
        let dy = 0;
        if (from < i && i <= target) dy = -mine.height;
        else if (target <= i && i < from) dy = mine.height;
        r.style.transform = dy === 0 ? '' : `translateY(${dy}px)`;
      });
    };
    let active = true;
    /** @param {boolean} commit */
    const end = (commit) => {
      if (!active) return;
      active = false;
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      handle.removeEventListener('pointercancel', onCancel);
      handle.removeEventListener('lostpointercapture', onLost);
      document.removeEventListener('keydown', onKey);
      if (commit) movePlayer(p, target);
      render();
    };
    const onUp = () => end(true);
    const onCancel = () => end(false);
    // Capture is released after pointerup too; only a grip that has left the
    // page (something else re-rendered mid-drag) needs tidying up here.
    const onLost = () => {
      if (!handle.isConnected) end(false);
    };
    /** @param {KeyboardEvent} ev */
    const onKey = (ev) => {
      if (ev.key === 'Escape') end(false);
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onCancel);
    handle.addEventListener('lostpointercapture', onLost);
    document.addEventListener('keydown', onKey);
  });

  return handle;
}

/**
 * Seat a player elsewhere in the lineup, shifting the others along.
 *
 * @param {Player} p
 * @param {number} seat   Where to put them; clamped to the lineup.
 * @returns {boolean} Whether anything moved.
 */
function movePlayer(p, seat) {
  const from = state.players.indexOf(p);
  const to = clamp(seat, 0, state.players.length - 1);
  if (from === -1 || from === to) return false;
  state.players.splice(from, 1);
  state.players.splice(to, 0, p);
  return true;
}

/**
 * Give a player a typed name, tidied; blank leaves the old one.
 *
 * @param {Player} p
 * @param {string} raw
 */
function setName(p, raw) {
  const name = raw.trim().replace(/\s+/g, ' ');
  if (name) p.name = name;
}

/**
 * Close the rename in progress, keeping what's been typed. Doesn't render:
 * for the grip, which needs the list to stay put until its drag is over.
 */
function commitRename() {
  const p = state.editing !== null ? playerById(state.editing) : undefined;
  const input = app.querySelector('.lineup__input');
  if (p && input instanceof HTMLInputElement) setName(p, input.value);
  state.editing = null;
}

/**
 * A ⋮ button with a small popover menu beneath it. The menu is DOM-local: it
 * opens and closes without touching state, and every action re-renders the
 * screen, which takes the menu with it. Tapping elsewhere or pressing Escape
 * closes it.
 *
 * @param {string} label   Accessible name for the button.
 * @param {{ label: string, run: () => void, danger?: boolean }[]} items
 * @returns {{ button: HTMLElement, menu: HTMLElement }}
 */
function kebabMenu(label, items) {
  const button = el('button', 'lineup__more', '\u22EE');
  /** @type {HTMLButtonElement} */ (button).type = 'button';
  button.setAttribute('aria-label', label);
  button.setAttribute('aria-haspopup', 'menu');
  button.setAttribute('aria-expanded', 'false');

  const menu = el('div', 'menu');
  menu.setAttribute('role', 'menu');
  menu.hidden = true;

  const close = () => {
    menu.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', onOutside, true);
    document.removeEventListener('keydown', onKey);
  };
  /** @param {Event} e */
  const onOutside = (e) => {
    const t = e.target;
    if (t instanceof Node && (menu.contains(t) || button.contains(t))) return;
    close();
  };
  /** @param {KeyboardEvent} e */
  const onKey = (e) => {
    if (e.key !== 'Escape') return;
    close();
    button.focus();
  };
  const open = () => {
    menu.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    document.addEventListener('pointerdown', onOutside, true);
    document.addEventListener('keydown', onKey);
  };
  button.addEventListener('click', () => (menu.hidden ? open() : close()));

  for (const item of items) {
    const b = el('button', 'menu__item', item.label);
    /** @type {HTMLButtonElement} */ (b).type = 'button';
    if (item.danger) b.classList.add('menu__item--danger');
    b.setAttribute('role', 'menuitem');
    b.addEventListener('click', () => {
      close();
      item.run();
    });
    menu.append(b);
  }

  return { button, menu };
}

/**
 * The Home "Play from" picker: one pill per category in the pool — a hint
 * with two or more words — plus Any. Words with no hint aren't a category:
 * they only ever come up under Any. Rounds draw only from the chosen one, so
 * the table can work through a theme; Any is the default, and the picker only
 * appears when there's a category to choose and other words to leave out. A
 * chosen category stays listed down to its last word, so a theme can be
 * finished; once it's used up the pick is cleared here — on the screen that
 * shows it — so it can't silently spring back to life when words under that
 * hint are added later.
 *
 * @returns {HTMLElement | null}
 */
function renderPlayFrom() {
  const hints = poolHints();
  if (state.playHint !== null && !hints.has(state.playHint)) state.playHint = null;
  const listed = [...hints].filter(([key, count]) => key && (count >= 2 || key === state.playHint));
  if (listed.length === 0 || hints.size < 2) return null;

  const field = el('section', 'field field--picks');
  const labelWrap = el('div', 'field__labelwrap');
  labelWrap.append(el('span', 'field__label', 'Play from'));
  labelWrap.append(el('span', 'field__note', 'Which category the next round draws from'));
  field.append(labelWrap);

  const row = el('div', 'picks');
  row.setAttribute('role', 'group');
  row.setAttribute('aria-label', 'Play from');
  /**
   * @param {string} label
   * @param {string | null} key
   * @param {number | null} count
   */
  const pill = (label, key, count) => {
    const b = el('button', 'pick');
    b.append(el('span', 'pick__label', label));
    if (count !== null) b.append(el('span', 'pick__count', String(count)));
    const selected = state.playHint === key;
    b.classList.toggle('pick--selected', selected);
    b.setAttribute('aria-pressed', String(selected));
    b.addEventListener('click', () => {
      state.playHint = key;
      render();
    });
    row.append(b);
  };
  pill('Any', null, null);
  for (const [key, count] of listed) pill(displayForm(key), key, count);
  field.append(row);
  return field;
}

function renderAdvanced() {
  const wrap = el('section', 'advanced');
  const toggle = el(
    'button',
    'advanced__toggle btn btn--ghost',
    `${state.advancedOpen ? '▾' : '▸'} Advanced settings`,
  );
  toggle.addEventListener('click', () => {
    state.advancedOpen = !state.advancedOpen;
    render();
  });
  wrap.append(toggle);

  if (!state.advancedOpen) return wrap;

  const body = el('div', 'advanced__body');
  const s = state.settings;
  const n = activePlayers().length;

  body.append(
    pctStepper('All impostors', s.everyonePct, (v) => {
      s.everyonePct = v;
      save();
      render();
    }),
  );
  body.append(
    pctStepper('No impostors', s.nonePct, (v) => {
      s.nonePct = v;
      save();
      render();
    }),
  );
  body.append(
    pctStepper(
      'Two impostors',
      s.twoPct,
      (v) => {
        s.twoPct = v;
        save();
        render();
      },
      { disabled: n < 4, note: '(needs 4+ players)' },
    ),
  );
  body.append(
    pctStepper(
      'Decoy round',
      s.decoyPct,
      (v) => {
        s.decoyPct = v;
        save();
        render();
      },
      { note: 'Impostors unknowingly get a different word' },
    ),
  );

  body.append(
    el('p', 'advanced__implied', `Normal round: ${normalPct(s, n)}%`),
  );

  wrap.append(body);
  return wrap;
}

/**
 * Pass gate shown before each player's turn during a pass-around.
 *
 * @param {number} seats   How many turns the pass-around has.
 * @param {string} label
 * @param {string} action
 * @param {() => void} onPass
 * @returns {HTMLElement}
 */
function renderPassGate(seats, label, action, onPass) {
  const screen = el('section', 'screen');
  screen.append(progressDots(seats, state.turn));
  const card = el('section', 'card card--gate');
  card.append(el('span', 'card__hint', label));
  card.append(el('span', 'card__action', action));
  makeTappable(card, onPass);
  screen.append(card);
  return screen;
}

/** @returns {Player[]} Those dealt in: everyone not sitting out, in seat order. */
function activePlayers() {
  return state.players.filter((p) => !p.out);
}

/**
 * @param {string} id
 * @returns {Player | undefined}
 */
function playerById(id) {
  return state.players.find((p) => p.id === id);
}

/**
 * A player's name for display. Every id shown comes from the roster, so the
 * fallback is only ever a safety net.
 *
 * @param {string} id
 * @returns {string}
 */
function nameOf(id) {
  return playerById(id)?.name ?? 'Someone';
}

/**
 * A placeholder name for a new player: "Player N" for their seat number, or the
 * next number up that nobody at the table is already called.
 *
 * @returns {string}
 */
function nextDefaultName() {
  const taken = new Set(state.players.map((p) => p.name.trim().toLowerCase()));
  let n = state.players.length + 1;
  while (taken.has(`player ${n}`)) n++;
  return `Player ${n}`;
}

/**
 * Words in the pool that a given player added.
 *
 * @param {string} id
 * @returns {PoolEntry[]}
 */
function wordsBy(id) {
  return state.pool.filter((e) => e.by === id);
}

/** @param {number} n @returns {string} e.g. "1 word", "3 words". */
function wordCountLabel(n) {
  return `${n} ${n === 1 ? 'word' : 'words'}`;
}

/**
 * The hint the next round draws from: the host's pick, or null for the whole
 * pool — also null while the pick has no words left, so it quietly acts as
 * Any until Home clears it.
 *
 * @returns {string | null}
 */
function chosenHintKey() {
  const key = state.playHint;
  if (key === null) return null;
  return state.pool.some((e) => normaliseWord(e.hint) === key) ? key : null;
}

/**
 * The words the next round can draw: those under the chosen hint, or all.
 *
 * @returns {PoolEntry[]}
 */
function drawPool() {
  const key = chosenHintKey();
  return key === null ? state.pool : state.pool.filter((e) => normaliseWord(e.hint) === key);
}

/**
 * How many pool words carry each hint, keyed by normalised hint: the host's
 * category first, then A–Z, the no-hint group ('') last.
 *
 * @returns {Map<string, number>}
 */
function poolHints() {
  /** @type {Map<string, number>} */
  const counts = new Map();
  for (const e of state.pool) {
    const k = normaliseWord(e.hint);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const cat = normaliseWord(state.settings.category);
  const rank = /** @param {string} k */ (k) => (k === cat ? 0 : k === '' ? 2 : 1);
  return new Map(
    [...counts.entries()].sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b)),
  );
}

/**
 * A fairness warning about the pool, or null when there's nothing to flag.
 *
 * When every word the next round can draw — the whole pool, or just the
 * chosen hint's words — came from one player, a round that makes them the
 * impostor has no choice but to use one of their own words as the secret — and
 * the hint would tell them which. Shown wherever a round can be started, and
 * on the roster where it gets fixed. For the whole pool it's deliberately
 * vague: it nudges the table to top up the pool without naming who's carrying
 * it. Playing from one category it names them — the table chose that category
 * on purpose, and fixing it means knowing whose words it's leaning on.
 *
 * @returns {string | null}
 */
function lonePoolWarning() {
  const draw = drawPool();
  if (draw.length === 0) return null;
  const by = new Set(draw.map((e) => e.by));
  if (by.size !== 1) return null;
  const [id] = by;
  const p = playerById(id);
  // A sitter's words are nobody's at the table, so they're never a problem.
  if (!p || p.out) return null;
  const key = chosenHintKey();
  if (key === null) return 'The pool is short on words.';
  return `Only ${p.name} has words in ${displayForm(key)}.`;
}

/**
 * The lone-contributor warning as a screen element, or null.
 *
 * @returns {HTMLElement | null}
 */
function lonePoolWarningEl() {
  const text = lonePoolWarning();
  return text ? el('p', 'screen__hint screen__hint--warn', text) : null;
}

/**
 * The entry roster: one tile per player, sitters included — sitting out is
 * about rounds, not words. Each player taps their own to open
 * their private page — in any order, as often as they like — so there's no
 * pass-around to sit through, and anyone can come back later for more. The
 * roster doubles as the "safe" screen between players: each tile's dot shows
 * how its player stands in the pool — none, one, or more words — so the table
 * can see who still needs a go, but never which words nor an exact count.
 *
 * Nothing stops a player tapping someone else's tile, so the roster ends with
 * a history of which pages were opened and how long ago. Every legitimate
 * handoff opens exactly one page, so a name that shows up when its player
 * didn't have the phone is there for the whole table to see.
 */
function renderRoster() {
  const screen = el('section', 'screen');
  screen.append(el('h2', 'screen__title', 'Add words'));
  screen.append(
    el(
      'p',
      'screen__lede',
      'Pass the phone around. Tap your own tile to add or change your words in private.',
    ),
  );

  const grid = el('div', 'players');
  state.players.forEach((player, seat) => {
    // Grey dot: nothing in the pool. Yellow: down to one word. Green: two or more.
    const count = wordsBy(player.id).length;
    const status = count === 0 ? 'empty' : count === 1 ? 'low' : 'stocked';
    const tile = el('button', `player player--${status}`);
    /** @type {HTMLButtonElement} */ (tile).type = 'button';
    if (player.out) tile.classList.add('player--out');
    // On screen the status is just a coloured dot; spell it out for screen readers.
    const spoken = { empty: 'no words yet', low: 'one word left', stocked: 'has words' }[status];
    const sitting = player.out ? ', sitting out' : '';
    tile.setAttribute('aria-label', `${player.name}, ${spoken}${sitting}`);
    tile.append(el('span', 'player__name', player.name));
    if (player.out) tile.append(el('span', 'player__tag', 'sitting out'));
    tile.addEventListener('click', () => {
      // Log the open first: render() persists it before the page can be seen.
      state.opens = recentOpens(state.opens);
      state.opens.push({ id: player.id, t: Date.now() });
      state.turn = seat;
      state.gateOpen = true;
      state.entryHint = displayForm(state.settings.category);
      render();
    });
    grid.append(tile);
  });
  screen.append(grid);

  const total = state.pool.length;
  screen.append(
    el(
      'p',
      'screen__hint',
      total === 0 ? 'Add at least one word to start.' : `${wordCountLabel(total)} in the pool.`,
    ),
  );
  const warn = lonePoolWarningEl();
  if (warn) screen.append(warn);

  const done = el('button', 'btn', 'Done adding words');
  done.addEventListener('click', () => goHome());
  screen.append(done);

  const history = opensHistory();
  if (history) screen.append(history);

  return screen;
}

/**
 * The roster's "opened" history: every entry-page open inside the window,
 * newest first, each with a coarse age. Null when there's nothing to show.
 *
 * @returns {HTMLElement | null}
 */
function opensHistory() {
  const now = Date.now();
  const opens = recentOpens(state.opens, now);
  if (opens.length === 0) return null;

  const wrap = el('section', 'opens');
  wrap.append(el('h3', 'opens__title', 'Opened'));
  const list = el('ol', 'opens__list');
  list.setAttribute('aria-label', 'Pages opened recently, newest first');
  for (let k = opens.length - 1; k >= 0; k--) {
    const o = opens[k];
    const item = el('li', 'opens__item');
    item.append(el('span', 'opens__who', nameOf(o.id)));
    item.append(el('span', 'opens__age', ageLabel(now - o.t)));
    list.append(item);
  }
  wrap.append(list);
  return wrap;
}

/**
 * One player's private entry page: every word of theirs still in the pool,
 * plus the input to add more. Adds and removes write straight to the pool, so
 * the list is always the truth and nothing is lost if the page is refreshed
 * (a refresh just drops back to the roster).
 */
function renderEntry() {
  if (!state.gateOpen) return renderRoster();

  const player = state.players[state.turn];
  if (!player) {
    state.gateOpen = false;
    return renderRoster();
  }
  const me = player.id;

  const screen = el('section', 'screen');
  screen.append(el('h2', 'screen__title', `${player.name}, add words`));
  screen.append(
    el('p', 'screen__hint', 'Aim for 2+ words. Nobody sees who added what.'),
  );

  // Input rows: the word, and beneath it the hint it'll carry — prefilled with
  // the host's category and sticky while this player's page is open.
  const form = el('form', 'entry__form');
  const row = el('div', 'entry__row');
  const input = upperInput('Type a word…', '');
  const add = /** @type {HTMLButtonElement} */ (el('button', 'btn entry__add', 'Add'));
  add.type = 'submit';
  row.append(input, add);
  const hintRow = el('label', 'entry__hintrow');
  hintRow.append(el('span', 'entry__hintlabel', 'Hint'));
  const hintInput = upperInput('Optional', state.entryHint);
  hintInput.classList.add('entry__hintinput');
  hintInput.addEventListener('input', () => {
    state.entryHint = hintInput.value;
    markSelectedHint();
  });
  hintRow.append(hintInput);
  form.append(row, hintRow);

  // This player's words, grouped under their hints — the host's category first
  // (always shown, even before any words carry it, so the default hint is
  // visible and one tap away), then any hints the player typed themselves, in
  // the order they appeared. Each group's title is a button that copies its
  // hint into the hint input; the title matching the input is marked selected.
  const groupsEl = el('div', 'chipgroups');
  const markSelectedHint = () => {
    const current = normaliseWord(hintInput.value);
    for (const title of groupsEl.querySelectorAll('.chipgroup__title')) {
      const selected = title.getAttribute('data-hint') === current;
      title.classList.toggle('chipgroup__title--selected', selected);
      title.setAttribute('aria-pressed', String(selected));
    }
  };
  const renderChips = () => {
    groupsEl.replaceChildren();
    const catKey = normaliseWord(state.settings.category);
    /** @type {Map<string, { hint: string, entries: PoolEntry[] }>} */
    const groups = new Map();
    if (catKey) groups.set(catKey, { hint: displayForm(state.settings.category), entries: [] });
    for (const e of wordsBy(me)) {
      const g = groups.get(normaliseWord(e.hint));
      if (g) g.entries.push(e);
      else groups.set(normaliseWord(e.hint), { hint: e.hint, entries: [e] });
    }
    const ordered = [...groups.entries()].sort(
      ([a], [b]) => Number(b === catKey) - Number(a === catKey),
    );
    for (const [key, { hint, entries }] of ordered) {
      const group = el('div', 'chipgroup');
      const title = el('button', 'chipgroup__title', hint || 'No hint');
      /** @type {HTMLButtonElement} */ (title).type = 'button';
      title.setAttribute('data-hint', key);
      title.setAttribute('aria-label', hint ? `Use hint ${hint}` : 'Use no hint');
      title.addEventListener('click', () => {
        hintInput.value = hint;
        state.entryHint = hint;
        markSelectedHint();
        input.focus();
      });
      group.append(title);
      if (entries.length === 0) {
        group.append(el('span', 'chipgroup__empty', 'No words yet'));
        groupsEl.append(group);
        continue;
      }
      const chips = el('div', 'chips');
      for (const e of entries) {
        const chip = el('span', 'chip');
        chip.append(el('span', 'chip__text', e.word));
        const x = el('button', 'chip__remove', '×');
        /** @type {HTMLButtonElement} */ (x).type = 'button';
        x.setAttribute('aria-label', `Remove ${e.word}`);
        x.addEventListener('click', () => {
          // Chips hold the pool's own entry objects, so removing by identity
          // removes exactly this word — even if another player added the same text.
          state.pool.splice(state.pool.indexOf(e), 1);
          save();
          renderChips();
        });
        chip.append(x);
        chips.append(chip);
      }
      group.append(chips);
      groupsEl.append(group);
    }
    markSelectedHint();
  };

  /** Add the current input to the pool under this player's name. */
  const addWord = () => {
    const raw = input.value;
    input.value = '';
    input.focus();
    if (!normaliseWord(raw)) return;
    // No dedup: every word entered goes in, even a repeat by the same player.
    state.pool.push({
      word: displayForm(raw),
      hint: displayForm(state.entryHint),
      by: me,
    });
    save();
    renderChips();
  };

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    addWord();
  });

  screen.append(form);
  screen.append(groupsEl);
  renderChips();

  const done = el('button', 'btn', 'Done');
  done.addEventListener('click', () => {
    state.gateOpen = false;
    render();
  });
  screen.append(done);

  return screen;
}

/**
 * The round opener: the hint behind this round's word, shown to the whole
 * table (impostor included) before roles go out. Skipping is tucked away —
 * it's a rare thing to want.
 */
function renderHint() {
  const round = state.round;
  if (!round) {
    state.phase = 'home';
    return renderHome();
  }
  const screen = el('section', 'screen');

  const card = el('section', 'card card--hint');
  if (round.hint) {
    card.append(el('span', 'card__eyebrow', 'Hint'));
    card.append(el('span', 'card__word card__word--hint', round.hint));
  } else {
    card.append(el('span', 'card__note', 'No hint this round'));
  }
  card.append(el('span', 'card__tap', 'Tap to pass out roles'));
  makeTappable(card, startReveal);
  screen.append(card);

  const skip = el('button', 'screen__skip', 'Skip this round');
  /** @type {HTMLButtonElement} */ (skip).type = 'button';
  skip.addEventListener('click', skipRound);
  screen.append(skip);

  return screen;
}

function renderReveal() {
  const round = state.round;
  if (!round) {
    state.phase = 'home';
    return renderHome();
  }
  const seats = round.players;
  const i = state.turn;
  const isLast = i >= seats.length - 1;

  if (!state.gateOpen) {
    return renderPassGate(
      seats.length,
      `Pass to ${nameOf(seats[i])}.`,
      'Show my screen',
      () => {
        state.gateOpen = true;
        render();
      },
    );
  }

  const screen = el('section', 'screen');
  screen.append(progressDots(seats.length, i));

  const assignment = round.assignments[i];
  const tapHint = isLast ? 'Tap to hide & start playing' : 'Tap to hide & pass on';

  /** Advance the reveal pass-around (the whole card is the tap target). */
  const advance = () => {
    if (isLast) {
      state.phase = 'play';
      save();
    } else {
      state.turn += 1;
      state.gateOpen = false;
    }
    render();
  };

  // One rule covers every case: word != null => "Your word: X" (crew AND
  // decoy-impostors look identical); word == null => overt impostor.
  if (assignment && assignment.word != null) {
    const card = el('section', 'card card--word');
    if (round.hint) card.append(el('span', 'card__eyebrow', round.hint));
    card.append(el('span', 'card__role', 'Your word'));
    card.append(el('span', 'card__word', assignment.word));
    card.append(el('span', 'card__tap', tapHint));
    makeTappable(card, advance);
    screen.append(card);
  } else {
    const card = el('section', 'card card--impostor');
    if (round.hint) card.append(el('span', 'card__eyebrow', round.hint));
    card.append(el('span', 'card__role', 'You are the impostor'));
    card.append(el('span', 'card__tap', tapHint));
    makeTappable(card, advance);
    screen.append(card);
  }

  return screen;
}

function renderPlay() {
  const round = state.round;
  if (!round) {
    state.phase = 'home';
    return renderHome();
  }
  const screen = el('section', 'screen');
  screen.append(el('h2', 'screen__title', 'Play it out'));

  if (round.hint) screen.append(hintBanner(round.hint));

  screen.append(
    el(
      'p',
      'screen__lede',
      'Going round the circle twice, each player says one word. ' +
        'Then discuss and work out who’s faking.',
    ),
  );

  screen.append(
    el('p', 'play__starter', `\u{1F449} ${nameOf(round.players[round.starter])} starts.`),
  );

  const reveal = el('button', 'btn', 'Reveal the answer');
  reveal.addEventListener('click', () => {
    state.phase = 'result';
    save();
    render();
  });
  screen.append(reveal);

  return screen;
}

function renderResult() {
  const round = state.round;
  if (!round) {
    state.phase = 'home';
    return renderHome();
  }
  const screen = el('section', 'screen');
  screen.append(el('h2', 'screen__title', 'The reveal'));

  const impostors = round.assignments
    .map((a, idx) => (a.impostor ? idx : -1))
    .filter((idx) => idx >= 0);
  const names = impostors.map((idx) => nameOf(round.players[idx]));

  const card = el('section', 'card card--result');

  if (round.type === 'no-impostor') {
    card.append(el('span', 'result__twist', 'Plot twist — there was no impostor!'));
    card.append(el('span', 'result__line', `Everyone shared: ${round.realWord ?? ''}`));
  } else if (round.type === 'everyone-impostor') {
    if (round.decoy) {
      card.append(
        el('span', 'result__twist', 'Plot twist — everyone had a different word!'),
      );
      card.append(el('span', 'result__line', 'There was never a shared one.'));
      const list = el('ul', 'result__list');
      round.assignments.forEach((a, idx) => {
        list.append(el('li', undefined, `${nameOf(round.players[idx])}: ${a.word ?? '—'}`));
      });
      card.append(list);
    } else {
      card.append(
        el('span', 'result__twist', 'Plot twist — everyone was an impostor!'),
      );
      card.append(el('span', 'result__line', 'There was no word.'));
    }
  } else {
    // normal / two-impostor
    const label = names.length > 1 ? `The impostors were ${names.join(' and ')}.` : `The impostor was ${names[0]}.`;
    card.append(el('span', 'result__line result__line--strong', label));
    card.append(el('span', 'result__word', `The word was: ${round.realWord ?? ''}`));
    if (round.decoy) {
      impostors.forEach((idx) => {
        const decoyWord = round.assignments[idx].word;
        card.append(
          el(
            'span',
            'result__decoy',
            `${nameOf(round.players[idx])} was secretly given: ${decoyWord ?? '—'}`,
          ),
        );
      });
    }
  }
  screen.append(card);

  // How many words remain (rounds consume them) — always shown so you know
  // whether there's anything left to Play again with. Playing from one hint,
  // say how many of those are left, or that Play again falls back to the whole
  // pool now they've run out (Home clears the pick).
  const left = state.pool.length;
  const key = state.playHint;
  let leftLine =
    left === 0 ? 'Pool empty — go home to add words' : `${wordCountLabel(left)} left in the pool`;
  if (left > 0 && key) {
    const n = state.pool.filter((e) => normaliseWord(e.hint) === key).length;
    const cat = displayForm(key);
    leftLine +=
      n > 0
        ? `, ${n} of them ${cat}`
        : `, none of them ${cat} — Play again draws from the whole pool`;
  }
  screen.append(el('p', 'screen__hint', `${leftLine}.`));
  const warn = lonePoolWarningEl();
  if (warn) screen.append(warn);

  // Actions: straight into another round (while the pool still has words —
  // rounds consume them), or back to the one Home for everything else.
  const again = el('button', 'btn', 'Play again');
  /** @type {HTMLButtonElement} */ (again).disabled = left === 0;
  again.addEventListener('click', () => startRound());
  screen.append(again);

  const home = el('button', 'btn btn--ghost', 'Back to home');
  home.addEventListener('click', () => goHome());
  screen.append(home);

  return screen;
}

// --- render ----------------------------------------------------------------

function render() {
  let screen;
  switch (state.phase) {
    case 'entry':
      screen = renderEntry();
      break;
    case 'hint':
      screen = renderHint();
      break;
    case 'reveal':
      screen = renderReveal();
      break;
    case 'play':
      screen = renderPlay();
      break;
    case 'result':
      screen = renderResult();
      break;
    case 'home':
    default:
      screen = renderHome();
      break;
  }
  app.replaceChildren(screen);
  // An input flagged for focus gets it now that it's in the document. This runs
  // inside the tap that asked for it, which is what lets a phone show the keyboard.
  const focus = screen.querySelector('[data-autofocus]');
  if (focus instanceof HTMLInputElement) {
    focus.focus();
    focus.select();
  }
  save();
}

load();
render();

// Exported for the headless simulation/tests. Harmless in the browser.
export { buildRound, rollType, impostorCountForType, normalPct };
