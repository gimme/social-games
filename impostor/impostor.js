// @ts-check

/*
 * Impostor — a pass-the-phone social deduction game.
 *
 * Players first take turns secretly typing words into one shared pool. Every
 * word carries a HINT — the host's category by default, or whatever the player
 * typed instead — so a pool can mix themes freely. A round opens by showing the
 * hint behind its word to the whole table; then the app secretly assigns roles:
 * everyone gets the same secret word except the impostor — who gets nothing, or
 * (in a "decoy" round) a different word under the same hint and no warning. The
 * phone is passed around once more so each player privately sees their screen,
 * then the table gives one-word clues, discusses, and votes — all in person.
 * The app only handles the secret bits.
 *
 * The pool depletes as you play: every word a round draws — the crew's real word
 * and any decoys — is removed, so it won't come up again until you add more.
 * Duplicates are allowed (every entered word counts). Each word remembers who
 * added it, used for one fairness rule: a round won't hand an impostor the very
 * word they typed (unless that's all that's left).
 *
 * Self-contained: this game imports nothing and is the only script on its page.
 *
 * The pure round-building logic (buildRound) is DOM-free so it can be exercised
 * by a simulation without a browser.
 */

const MIN_PLAYERS = 3;
const MAX_PLAYERS = 12;
const DEFAULT_PLAYERS = 4;

const STORAGE_KEY = 'impostor.v3';

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
 * @property {number} by     Entry player index that added it; -1 if unknown.
 */

/**
 * @typedef {Object} Round
 * @property {RoundType} type
 * @property {boolean} decoy                 Did the decoy modifier actually apply.
 * @property {string | null} realWord        Shared crew word; null for everyone-impostor.
 * @property {string} hint                   Shown to the whole table before roles go out; '' for none.
 * @property {PoolEntry[]} decoys            Entries handed out as decoy words. Returned to the
 *                                           pool if the round is skipped (the real word stays used up).
 * @property {number} starter                Player index who starts the clues.
 * @property {Assignment[]} assignments      Per-player index.
 */

/**
 * @typedef {Object} GameState
 * @property {'home' | 'entry' | 'hint' | 'reveal' | 'play' | 'result'} phase
 * @property {number} playerCount
 * @property {Settings} settings
 * @property {PoolEntry[]} pool              Words (display form), duplicates allowed; consumed as rounds are built.
 * @property {Round | null} round            The current round (during hint/reveal/play/result).
 * @property {number} turn                   0-based player index during a pass-around.
 * @property {boolean} gateOpen              Whether the current player's pass gate is passed.
 * @property {PoolEntry[]} draftWords        Words added this entry turn (committed to the pool on Done).
 * @property {string} draftHint              Hint the next word gets; starts as the category each turn.
 * @property {boolean} advancedOpen          Whether the advanced settings are expanded.
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
 *    the only words left are theirs (graceful fallback).
 *  - Decoys carry the real word's hint, differ from the real word (hard
 *    constraint), and differ from each other when the pool allows. Too few such
 *    words => the round falls back to overt impostors.
 *  - An everyone-impostor round has no real word. With decoys it needs one hint
 *    group holding a distinct word for every player, and hands those out. Overt,
 *    it borrows (without consuming) a hint at least two different players used:
 *    a hint only YOUR words carry could never be a crew word's, so seeing it as
 *    the impostor would give the twist away. No such hint => a normal round.
 *
 * @param {number} n
 * @param {PoolEntry[]} pool
 * @param {Settings} settings
 * @returns {{ round: Round, pool: PoolEntry[] }}
 */
function buildRound(n, pool, settings) {
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

  /** @returns {Map<string, number[]>} Indices into `work`, grouped by hint. */
  const groupsByHint = () => {
    /** @type {Map<string, number[]>} */
    const groups = new Map();
    work.forEach((e, i) => {
      const g = groups.get(hintKey(e));
      if (g) g.push(i);
      else groups.set(hintKey(e), [i]);
    });
    return groups;
  };

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

    // Real word: prefer words NOT contributed by an impostor this round; fall
    // back to the whole pool only if every remaining word is an impostor's.
    /** @type {PoolEntry | null} */
    let real = null;
    if (work.length > 0) {
      const crewIdx = [];
      for (let i = 0; i < work.length; i++) {
        if (!impostorSet.has(work[i].by)) crewIdx.push(i);
      }
      const pickFrom = crewIdx.length > 0 ? crewIdx : work.map((_, i) => i);
      real = take(pickFrom[randInt(pickFrom.length)]);
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
    round: { type, decoy, realWord, hint, decoys, starter, assignments },
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

/** @type {GameState} */
const state = {
  phase: 'home',
  playerCount: DEFAULT_PLAYERS,
  settings: defaultSettings(),
  pool: [],
  round: null,
  turn: 0,
  gateOpen: false,
  draftWords: [],
  draftHint: '',
  advancedOpen: false,
};

// --- persistence -----------------------------------------------------------

/**
 * Save the durable parts of state. Transient pass-around bits (turn, gateOpen,
 * drafts, the round's secrets) are saved only enough to restore safely.
 */
function save() {
  try {
    /** @type {Record<string, unknown>} */
    const data = {
      phase: state.phase,
      playerCount: state.playerCount,
      settings: state.settings,
      pool: state.pool,
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
    if (typeof data.playerCount === 'number') {
      state.playerCount = clamp(data.playerCount, MIN_PLAYERS, MAX_PLAYERS);
    }
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
    if (Array.isArray(data.pool)) state.pool = parseEntries(data.pool);
    if (data.round && typeof data.round === 'object') {
      const r = data.round;
      if (typeof r.hint !== 'string') r.hint = '';
      r.decoys = Array.isArray(r.decoys) ? parseEntries(r.decoys) : [];
      state.round = /** @type {Round} */ (r);
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

    // Always reset any pass-around to a safe pass-gate and clear transient
    // per-turn drafts so no secret can flash on refresh.
    const turn = typeof data.turn === 'number' ? data.turn : 0;
    state.turn = clamp(turn, 0, Math.max(0, state.playerCount - 1));
    state.gateOpen = false;
    state.draftWords = [];
    state.draftHint = '';
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
      by: typeof e.by === 'number' && Number.isInteger(e.by) ? e.by : -1,
    });
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
 * A labelled +/- number control.
 *
 * @param {string} label
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @param {(value: number) => void} onChange
 * @returns {HTMLElement}
 */
function stepper(label, value, min, max, onChange) {
  const field = el('div', 'field');
  field.append(el('span', 'field__label', label));

  const control = el('div', 'stepper');
  const dec = el('button', 'stepper__btn', '−');
  const val = el('span', 'stepper__value', String(value));
  const inc = el('button', 'stepper__btn', '+');

  /** @type {HTMLButtonElement} */ (dec).disabled = value <= min;
  /** @type {HTMLButtonElement} */ (inc).disabled = value >= max;
  dec.addEventListener('click', () => onChange(Math.max(min, value - 1)));
  inc.addEventListener('click', () => onChange(Math.min(max, value + 1)));

  control.append(dec, val, inc);
  field.append(control);
  return field;
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

/** Begin the entry pass-around (always append mode — never resets the pool). */
function goEntry() {
  state.phase = 'entry';
  state.turn = 0;
  state.gateOpen = false;
  state.draftWords = [];
  render();
}

/**
 * Build a round from the current pool and show its hint. The round consumes
 * words, so the depleted pool is written back to state.
 */
function startRound() {
  if (state.pool.length === 0) return;
  const { round, pool } = buildRound(state.playerCount, state.pool, state.settings);
  state.round = round;
  state.pool = pool;
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

  screen.append(
    stepper('Players', state.playerCount, MIN_PLAYERS, MAX_PLAYERS, (v) => {
      state.playerCount = v;
      render();
    }),
  );

  // Category — the default hint on every word added from now on. Words already
  // in the pool keep the hint they were added under, so it can change any time.
  const catField = el('label', 'field field--input');
  const catLabel = el('div', 'field__labelwrap');
  catLabel.append(el('span', 'field__label', 'Category'));
  catLabel.append(el('span', 'field__note', 'Default hint for new words'));
  catField.append(catLabel);
  const catInput = upperInput('Optional, e.g. MOVIES', state.settings.category);
  catInput.addEventListener('input', () => {
    state.settings.category = catInput.value;
    save();
  });
  catField.append(catInput);
  screen.append(catField);

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

  const start = el('button', 'btn', 'Start round');
  /** @type {HTMLButtonElement} */ (start).disabled = !hasWords;
  start.addEventListener('click', () => startRound());
  screen.append(start);

  const add = el('button', 'btn btn--ghost', 'Add words');
  add.addEventListener('click', () => goEntry());
  screen.append(add);

  if (hasWords) {
    const clear = el('button', 'btn btn--ghost', 'Clear words');
    clear.addEventListener('click', () => {
      const ok = window.confirm(
        'Clear the word pool? Your settings (players, category, odds) are kept.',
      );
      if (!ok) return;
      state.pool = [];
      state.round = null;
      save();
      render();
    });
    screen.append(clear);
  } else {
    screen.append(el('p', 'screen__hint', 'Add words to start.'));
  }

  return screen;
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
  const n = state.playerCount;

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
 * @param {string} label
 * @param {string} action
 * @param {() => void} onPass
 * @returns {HTMLElement}
 */
function renderPassGate(label, action, onPass) {
  const screen = el('section', 'screen');
  screen.append(progressDots(state.playerCount, state.turn));
  const card = el('section', 'card card--gate');
  card.append(el('span', 'card__hint', label));
  card.append(el('span', 'card__action', action));
  makeTappable(card, onPass);
  screen.append(card);
  return screen;
}

function renderEntry() {
  const i = state.turn;
  const isLast = i >= state.playerCount - 1;

  if (!state.gateOpen) {
    return renderPassGate(
      `Pass to Player ${i + 1}.`,
      'I’m holding the phone',
      () => {
        state.gateOpen = true;
        state.draftWords = [];
        state.draftHint = displayForm(state.settings.category);
        render();
      },
    );
  }

  const screen = el('section', 'screen');
  screen.append(progressDots(state.playerCount, state.turn));
  screen.append(el('h2', 'screen__title', `Player ${i + 1}, add words`));
  screen.append(
    el('p', 'screen__hint', 'Aim for 2+ words. Nobody sees who added what.'),
  );

  // Input rows: the word, and beneath it the hint it'll carry — prefilled with
  // the host's category and sticky for the rest of this player's turn.
  const form = el('form', 'entry__form');
  const row = el('div', 'entry__row');
  const input = upperInput('Type a word…', '');
  const add = /** @type {HTMLButtonElement} */ (el('button', 'btn entry__add', 'Add'));
  add.type = 'submit';
  row.append(input, add);
  const hintRow = el('label', 'entry__hintrow');
  hintRow.append(el('span', 'entry__hintlabel', 'Hint'));
  const hintInput = upperInput('Optional', state.draftHint);
  hintInput.classList.add('entry__hintinput');
  hintInput.addEventListener('input', () => {
    state.draftHint = hintInput.value;
  });
  hintRow.append(hintInput);
  form.append(row, hintRow);

  // This turn's words, grouped under their hints — the host's category first,
  // then any hints the player typed themselves, in the order they appeared.
  const groupsEl = el('div', 'chipgroups');
  const renderChips = () => {
    groupsEl.replaceChildren();
    const catKey = normaliseWord(state.settings.category);
    /** @type {Map<string, PoolEntry[]>} */
    const groups = new Map();
    for (const e of state.draftWords) {
      const g = groups.get(normaliseWord(e.hint));
      if (g) g.push(e);
      else groups.set(normaliseWord(e.hint), [e]);
    }
    const ordered = [...groups.entries()].sort(
      ([a], [b]) => Number(b === catKey) - Number(a === catKey),
    );
    for (const [, entries] of ordered) {
      const group = el('div', 'chipgroup');
      group.append(el('span', 'chipgroup__title', entries[0].hint || 'No hint'));
      const chips = el('div', 'chips');
      for (const e of entries) {
        const chip = el('span', 'chip');
        chip.append(el('span', 'chip__text', e.word));
        const x = el('button', 'chip__remove', '×');
        /** @type {HTMLButtonElement} */ (x).type = 'button';
        x.setAttribute('aria-label', `Remove ${e.word}`);
        x.addEventListener('click', () => {
          state.draftWords.splice(state.draftWords.indexOf(e), 1);
          renderChips();
        });
        chip.append(x);
        chips.append(chip);
      }
      group.append(chips);
      groupsEl.append(group);
    }
  };

  /** Add the current input to this turn's draft (committed to the pool on Done). */
  const addWord = () => {
    const raw = input.value;
    const norm = normaliseWord(raw);
    input.value = '';
    input.focus();
    if (!norm) return;
    // Reject only an exact duplicate within this player's OWN draft (so a
    // double-tap doesn't bloat their chips). Duplicates across players are kept —
    // every word entered ends up in the pool.
    if (state.draftWords.some((e) => normaliseWord(e.word) === norm)) return;
    state.draftWords.push({
      word: displayForm(raw),
      hint: displayForm(state.draftHint),
      by: state.turn,
    });
    renderChips();
  };

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    addWord();
  });

  screen.append(form);
  screen.append(groupsEl);
  renderChips();

  const done = el('button', 'btn', isLast ? 'Done adding words' : 'Done → pass to next');
  done.addEventListener('click', () => {
    // The last player must leave at least one word in the pool (counting this
    // turn's not-yet-committed draft).
    if (isLast && state.pool.length + state.draftWords.length === 0) return;

    // Commit this turn's words to the shared pool, then move on. (Committing on
    // Done — not per keystroke — keeps the chips and the pool in sync, so
    // removing a chip really removes the word.)
    state.pool.push(...state.draftWords);
    state.draftWords = [];

    if (isLast) {
      goHome();
    } else {
      state.turn += 1;
      state.gateOpen = false;
      render();
    }
  });
  screen.append(done);

  // Guard: nothing anywhere yet on the last player — show a gentle note.
  if (isLast && state.pool.length === 0 && state.draftWords.length === 0) {
    screen.append(el('p', 'screen__hint', 'Add at least one word to start.'));
  }

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
  const i = state.turn;
  const isLast = i >= state.playerCount - 1;

  if (!state.gateOpen) {
    return renderPassGate(
      `Pass to Player ${i + 1}.`,
      'Show my screen',
      () => {
        state.gateOpen = true;
        render();
      },
    );
  }

  const screen = el('section', 'screen');
  screen.append(progressDots(state.playerCount, state.turn));

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
    el('p', 'play__starter', `\u{1F449} Player ${round.starter + 1} starts.`),
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
  const names = impostors.map((idx) => `Player ${idx + 1}`);

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
        list.append(el('li', undefined, `Player ${idx + 1}: ${a.word ?? '—'}`));
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
            `Player ${idx + 1} was secretly given: ${decoyWord ?? '—'}`,
          ),
        );
      });
    }
  }
  screen.append(card);

  // How many words remain (rounds consume them) — always shown so you know
  // whether there's anything left to Play again with.
  const left = state.pool.length;
  screen.append(
    el(
      'p',
      'screen__hint',
      left === 0
        ? 'Pool empty — go home to add words.'
        : `${left} ${left === 1 ? 'word' : 'words'} left in the pool.`,
    ),
  );

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
  save();
}

load();
render();

// Exported for the headless simulation/tests. Harmless in the browser.
export { buildRound, rollType, impostorCountForType, normalPct };
