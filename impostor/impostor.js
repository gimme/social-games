// @ts-check

/*
 * Impostor — a pass-the-phone social deduction game.
 *
 * Players first take turns secretly typing words into one shared pool. Then the
 * app secretly assigns roles: everyone gets the same secret word except the
 * impostor — who gets nothing, or (in a "decoy" round) a different word and no
 * warning. The phone is passed around once more so each player privately sees
 * their screen, then the table gives one-word clues, discusses, and votes — all
 * in person. The app only handles the secret bits.
 *
 * Self-contained: this game imports nothing and is the only script on its page.
 *
 * The pure round-building logic (buildRound + its helpers) is DOM-free so it can
 * be exercised by a simulation without a browser.
 */

const MIN_PLAYERS = 3;
const MAX_PLAYERS = 12;
const DEFAULT_PLAYERS = 4;

const STORAGE_KEY = 'impostor.v2';

/**
 * @typedef {'normal' | 'two-impostor' | 'no-impostor' | 'everyone-impostor'} RoundType
 */

/**
 * @typedef {Object} Settings
 * @property {string} category        Optional shared theme; '' when unset.
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
 * @typedef {Object} Round
 * @property {RoundType} type
 * @property {boolean} decoy                 Did the decoy modifier actually apply.
 * @property {string | null} realWord        Shared crew word; null for everyone-impostor.
 * @property {number} starter                Player index who starts the clues.
 * @property {Assignment[]} assignments      Per-player index.
 */

/**
 * @typedef {Object} GameState
 * @property {'setup' | 'entry' | 'reveal' | 'play' | 'result'} phase
 * @property {number} playerCount
 * @property {Settings} settings
 * @property {string[]} pool                 Distinct words (display form), shared & shuffled.
 * @property {string[]} recentWords          Recently-chosen real words, most-recent first.
 * @property {Round | null} round            The current round (during reveal/play/result).
 * @property {number} turn                   0-based player index during a pass-around.
 * @property {boolean} gateOpen              Whether the current player's pass gate is passed.
 * @property {string[]} draftWords           Words added this entry turn (display form).
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
 * Normalise a word for de-duping: trim, collapse internal whitespace, lowercase.
 *
 * @param {string} raw
 * @returns {string}
 */
function normaliseWord(raw) {
  return raw.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Distinct words in the pool (the pool is already kept distinct by entry, but
 * this guards the round logic regardless of how the pool was built).
 *
 * @param {string[]} pool
 * @returns {string[]}
 */
function distinctWords(pool) {
  const seen = new Set();
  const out = [];
  for (const w of pool) {
    const key = normaliseWord(w);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(w);
    }
  }
  return out;
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
 * Pick a real word, preferring ones not used recently (soft window).
 *
 * 1. fresh = distinct(pool) − recentWords; pick uniformly from fresh if any,
 * 2. else pick uniformly from the whole distinct pool (graceful fallback).
 *
 * @param {string[]} pool
 * @param {string[]} recentWords
 * @returns {string}
 */
function pickWord(pool, recentWords) {
  const distinct = distinctWords(pool);
  const recentKeys = new Set(recentWords.map(normaliseWord));
  const fresh = distinct.filter((w) => !recentKeys.has(normaliseWord(w)));
  const source = fresh.length > 0 ? fresh : distinct;
  return source[randInt(source.length)];
}

/**
 * Prepend a freshly-used real word to recentWords and trim to the soft window
 * length floor(distinctPoolSize / 2). Mutates and returns the array.
 *
 * @param {string[]} recentWords
 * @param {string} word
 * @param {number} distinctPoolSize
 * @returns {string[]}
 */
function rememberWord(recentWords, word, distinctPoolSize) {
  const key = normaliseWord(word);
  // Keep most-recent-first, no duplicates.
  const next = [word, ...recentWords.filter((w) => normaliseWord(w) !== key)];
  const windowLen = Math.floor(distinctPoolSize / 2);
  next.length = Math.min(next.length, windowLen);
  return next;
}

/**
 * Build a round. Pure: no DOM, no global state. Mutates `recentWords` only via
 * the returned value (caller assigns it back).
 *
 * Picks (impostors and word) are uniform and INDEPENDENT — no contributor
 * tracking anywhere.
 *
 * @param {number} n
 * @param {string[]} pool
 * @param {Settings} settings
 * @param {string[]} recentWords
 * @returns {{ round: Round, recentWords: string[] }}
 */
function buildRound(n, pool, settings, recentWords) {
  const distinct = distinctWords(pool);
  const type = rollType(settings, n);
  const impostorCount = impostorCountForType(type, n);
  const impostorSet = new Set(sampleIndices(n, impostorCount));

  const hasCrew = impostorCount < n;
  const realWord = hasCrew ? pickWord(pool, recentWords) : null;

  // The decoy modifier rolls independently and only matters when there is at
  // least one impostor to hand a decoy to.
  let decoy = impostorCount > 0 && roll(settings.decoyPct);

  // Pool guard: need enough DISTINCT words for unique decoys (+ the real word).
  const needed = impostorCount + (realWord ? 1 : 0);
  if (decoy && distinct.length < needed) {
    decoy = false; // graceful fallback to an overt round
  }

  // Throwaway decoy words: distinct pool minus the real word, shuffled. Decoys
  // do NOT respect the recently-used window.
  const realKey = realWord != null ? normaliseWord(realWord) : null;
  const decoyBag = decoy
    ? shuffle(distinct.filter((w) => normaliseWord(w) !== realKey))
    : [];

  /** @type {Assignment[]} */
  const assignments = [];
  for (let p = 0; p < n; p++) {
    if (!impostorSet.has(p)) {
      assignments.push({ word: realWord, impostor: false });
    } else if (decoy) {
      const decoyWord = decoyBag.pop();
      assignments.push({ word: decoyWord ?? null, impostor: true });
    } else {
      assignments.push({ word: null, impostor: true });
    }
  }

  const starter = randInt(n);

  let nextRecent = recentWords;
  if (realWord != null) {
    nextRecent = rememberWord(recentWords, realWord, distinct.length);
  }

  return {
    round: { type, decoy, realWord, starter, assignments },
    recentWords: nextRecent,
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
  phase: 'setup',
  playerCount: DEFAULT_PLAYERS,
  settings: defaultSettings(),
  pool: [],
  recentWords: [],
  round: null,
  turn: 0,
  gateOpen: false,
  draftWords: [],
  advancedOpen: false,
};

// --- persistence -----------------------------------------------------------

/**
 * Save the durable parts of state. Transient pass-around bits (turn, gateOpen,
 * draftWords, the round's secrets) are saved only enough to restore safely.
 */
function save() {
  try {
    /** @type {Record<string, unknown>} */
    const data = {
      phase: state.phase,
      playerCount: state.playerCount,
      settings: state.settings,
      pool: state.pool,
      recentWords: state.recentWords,
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
    if (Array.isArray(data.pool)) {
      state.pool = data.pool.filter(
        /** @param {unknown} w @returns {w is string} */ (w) => typeof w === 'string',
      );
    }
    if (Array.isArray(data.recentWords)) {
      state.recentWords = data.recentWords.filter(
        /** @param {unknown} w @returns {w is string} */ (w) => typeof w === 'string',
      );
    }
    if (data.round && typeof data.round === 'object') {
      state.round = /** @type {Round} */ (data.round);
    }

    const phase = data.phase;
    if (phase === 'reveal' || phase === 'play' || phase === 'result') {
      // Only restore an in-progress round if we actually have its data.
      if (state.round) {
        state.phase = phase;
      } else {
        state.phase = state.pool.length > 0 ? 'play' : 'setup';
      }
    } else if (phase === 'entry') {
      state.phase = 'entry';
    } else {
      state.phase = 'setup';
    }

    // Always reset any pass-around to a safe pass-gate and clear transient
    // per-turn drafts so no secret can flash on refresh.
    const turn = typeof data.turn === 'number' ? data.turn : 0;
    state.turn = clamp(turn, 0, Math.max(0, state.playerCount - 1));
    state.gateOpen = false;
    state.draftWords = [];
  } catch {
    // Corrupt payload — fall back to defaults already in state.
  }
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
 * @param {string} [className]
 * @returns {HTMLElement}
 */
function categoryBanner(text, className) {
  return el('div', `category-banner ${className ?? ''}`.trim(), text);
}

// --- phase transitions -----------------------------------------------------

/** Go to setup. */
function goSetup() {
  state.phase = 'setup';
  render();
}

/** Begin the entry pass-around (append mode if the pool already has words). */
function goEntry() {
  state.phase = 'entry';
  state.turn = 0;
  state.gateOpen = false;
  state.draftWords = [];
  render();
}

/** Build a round from the current pool and start the reveal pass-around. */
function startRound() {
  if (distinctWords(state.pool).length === 0) return;
  const { round, recentWords } = buildRound(
    state.playerCount,
    state.pool,
    state.settings,
    state.recentWords,
  );
  state.round = round;
  state.recentWords = recentWords;
  state.phase = 'reveal';
  state.turn = 0;
  state.gateOpen = false;
  render();
}

// --- screens ---------------------------------------------------------------

function renderSetup() {
  const screen = el('section', 'screen');
  screen.append(el('h1', 'screen__title', 'Impostor'));
  screen.append(
    el(
      'p',
      'screen__lede',
      'Everyone secretly types words into one shared pool. Then the app hands ' +
        'out the same secret word to all — except the impostor. Pass the phone ' +
        'around, give one-word clues, and work out who is faking.',
    ),
  );

  screen.append(
    stepper('Players', state.playerCount, MIN_PLAYERS, MAX_PLAYERS, (v) => {
      state.playerCount = v;
      render();
    }),
  );

  // Category (optional).
  const catField = el('label', 'field field--input');
  catField.append(el('span', 'field__label', 'Category'));
  const catInput = /** @type {HTMLInputElement} */ (el('input', 'field__input'));
  catInput.type = 'text';
  catInput.placeholder = 'Optional theme (e.g. Movies)';
  catInput.value = state.settings.category;
  catInput.addEventListener('input', () => {
    state.settings.category = catInput.value;
    save();
  });
  catField.append(catInput);
  screen.append(catField);

  // Advanced settings (collapsible).
  screen.append(renderAdvanced());

  screen.append(
    el(
      'p',
      'screen__hint',
      'Pick a category everyone here knows well, and enter words you’d ' +
        'expect the others to recognise.',
    ),
  );

  const start = el('button', 'btn', 'Start → enter words');
  start.addEventListener('click', () => {
    // Fresh game from setup: start the pool from scratch.
    state.pool = [];
    state.recentWords = [];
    state.round = null;
    save();
    goEntry();
  });
  screen.append(start);

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
    pctStepper('No impostor', s.nonePct, (v) => {
      s.nonePct = v;
      save();
      render();
    }),
  );
  body.append(
    pctStepper('Everyone’s the impostor', s.everyonePct, (v) => {
      s.everyonePct = v;
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
    pctStepper('Decoy round', s.decoyPct, (v) => {
      s.decoyPct = v;
      save();
      render();
    }),
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
  screen.append(card);
  const btn = el('button', 'btn', action);
  btn.addEventListener('click', onPass);
  screen.append(btn);
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
        render();
      },
    );
  }

  const screen = el('section', 'screen');
  screen.append(progressDots(state.playerCount, state.turn));
  screen.append(el('h2', 'screen__title', `Player ${i + 1}, add words`));
  if (state.settings.category.trim()) {
    screen.append(categoryBanner(state.settings.category.trim()));
  }
  screen.append(
    el('p', 'screen__hint', 'Aim for about 2 words. Nobody sees who added what.'),
  );

  // Input row.
  const form = el('form', 'entry__form');
  const input = /** @type {HTMLInputElement} */ (el('input', 'field__input'));
  input.type = 'text';
  input.placeholder = 'Type a word…';
  input.autocomplete = 'off';
  /** @type {HTMLInputElement} */ (input).setAttribute('autocapitalize', 'none');
  const add = /** @type {HTMLButtonElement} */ (el('button', 'btn entry__add', 'Add'));
  add.type = 'submit';
  form.append(input, add);

  const chips = el('div', 'chips');
  const renderChips = () => {
    chips.replaceChildren();
    state.draftWords.forEach((w, idx) => {
      const chip = el('span', 'chip');
      chip.append(el('span', 'chip__text', w));
      const x = el('button', 'chip__remove', '×');
      /** @type {HTMLButtonElement} */ (x).type = 'button';
      x.setAttribute('aria-label', `Remove ${w}`);
      x.addEventListener('click', () => {
        state.draftWords.splice(idx, 1);
        renderChips();
      });
      chip.append(x);
      chips.append(chip);
    });
  };

  /** Add the current input to the draft + pool (de-duped). */
  const addWord = () => {
    const raw = input.value;
    const norm = normaliseWord(raw);
    input.value = '';
    input.focus();
    if (!norm) return;
    const poolKeys = new Set(state.pool.map(normaliseWord));
    const draftKeys = new Set(state.draftWords.map(normaliseWord));
    // A player's duplicate of their own word (or one already in the pool) is
    // ignored. Display form preserves the player's casing.
    if (draftKeys.has(norm)) return;
    const display = raw.trim().replace(/\s+/g, ' ');
    state.draftWords.push(display);
    if (!poolKeys.has(norm)) {
      state.pool.push(display);
      save();
    }
    renderChips();
  };

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    addWord();
  });

  screen.append(form);
  screen.append(chips);
  renderChips();

  const done = el('button', 'btn', isLast ? 'Done → start round' : 'Done → pass to next');
  done.addEventListener('click', () => {
    if (isLast) {
      // Need at least one word to start.
      if (distinctWords(state.pool).length === 0) {
        state.gateOpen = true;
        return;
      }
      startRound();
    } else {
      state.turn += 1;
      state.gateOpen = false;
      state.draftWords = [];
      render();
    }
  });
  screen.append(done);

  // Guard: if the pool is empty on the last player, show a gentle note.
  if (isLast && distinctWords(state.pool).length === 0) {
    screen.append(el('p', 'screen__hint', 'Add at least one word to start.'));
  }

  return screen;
}

function renderReveal() {
  const round = state.round;
  if (!round) {
    state.phase = 'setup';
    return renderSetup();
  }
  const i = state.turn;
  const isLast = i >= state.playerCount - 1;

  if (!state.gateOpen) {
    return renderPassGate(
      `Pass to Player ${i + 1}. Make sure only they can see.`,
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
  const cat = state.settings.category.trim();

  // One rule covers every case: word != null => "Your word: X" (crew AND
  // decoy-impostors look identical); word == null => overt impostor.
  if (assignment && assignment.word != null) {
    const card = el('section', 'card card--word');
    if (cat) card.append(el('span', 'card__category', cat));
    card.append(el('span', 'card__role', 'Your word'));
    card.append(el('span', 'card__word', assignment.word));
    screen.append(card);
  } else {
    const card = el('section', 'card card--impostor');
    if (cat) card.append(el('span', 'card__category', cat));
    card.append(el('span', 'card__role', 'You are the impostor'));
    card.append(el('span', 'card__note', 'Blend in — don’t get caught.'));
    screen.append(card);
  }

  const next = el('button', 'btn', isLast ? 'Hide & start playing' : 'Hide & pass on');
  next.addEventListener('click', () => {
    if (isLast) {
      state.phase = 'play';
      save();
    } else {
      state.turn += 1;
      state.gateOpen = false;
    }
    render();
  });
  screen.append(next);

  return screen;
}

function renderPlay() {
  const round = state.round;
  if (!round) {
    state.phase = 'setup';
    return renderSetup();
  }
  const screen = el('section', 'screen');
  screen.append(el('h2', 'screen__title', 'Play it out'));

  const cat = state.settings.category.trim();
  if (cat) screen.append(categoryBanner(cat));

  screen.append(
    el(
      'p',
      'screen__lede',
      'Going round the circle, each player says one word about their word. ' +
        'Then discuss and work out who’s faking — if anyone.',
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
    state.phase = 'setup';
    return renderSetup();
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

  // Actions.
  const again = el('button', 'btn', 'Play again — same words');
  again.addEventListener('click', () => startRound());
  screen.append(again);

  const more = el('button', 'btn btn--ghost', 'Add more words');
  more.addEventListener('click', () => goEntry());
  screen.append(more);

  const newGame = el('button', 'btn btn--ghost', 'New game');
  newGame.addEventListener('click', () => {
    const ok = window.confirm(
      'Start a new game? This clears the word pool (your settings are kept).',
    );
    if (!ok) return;
    state.pool = [];
    state.recentWords = [];
    state.round = null;
    save();
    goSetup();
  });
  screen.append(newGame);

  return screen;
}

// --- render ----------------------------------------------------------------

function render() {
  let screen;
  switch (state.phase) {
    case 'entry':
      screen = renderEntry();
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
    case 'setup':
    default:
      screen = renderSetup();
      break;
  }
  app.replaceChildren(screen);
  save();
}

load();
render();

// Exported for the headless simulation/tests. Harmless in the browser.
export {
  buildRound,
  pickWord,
  rememberWord,
  rollType,
  impostorCountForType,
  normalPct,
  normaliseWord,
  distinctWords,
};
