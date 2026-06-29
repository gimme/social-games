// @ts-check

/*
 * Trivia — a flexible question deck the host drives live.
 *
 * Not a game with fixed rules: it's a tool. The host runs whatever they like at
 * the table — a knockout, a category streak, a flags round, or pure
 * winging-it — and the phone is the console that keeps good questions coming
 * with the answer a tap away. It never keeps score; that's far easier between
 * people, and leaving it out is what keeps the host in full control.
 *
 * Steer it as you go: pick any mix of categories and difficulties, and the deck
 * draws from whatever's selected. It opens with nothing chosen and no question
 * on screen — pick a category to begin. Changing the selection never disturbs
 * the question on screen; it only shapes what comes next. Nothing repeats this
 * session, even as you switch the mix; when a selection has been fully seen the
 * card says so and a tap starts just that selection over — the deck never
 * recycles on its own. Tap the card to reveal the answer (tap again for the
 * next); tap a picture to throw it full-screen for the table.
 *
 * A question can carry a picture prompt (its `img` path under ./images/), shown
 * with an <img> so it stays crisp on every phone — a flag, an animal photo, or
 * any other art. Flags are SVGs in ./images/flags/ in each country's official
 * aspect ratio (see images/flags/CREDITS.md). Images load on demand; the
 * service worker caches each one as it's viewed, so a round you've played once
 * also works offline.
 *
 * Self-contained at the folder level: this game imports only its own sibling
 * module — the question bank in trivia.data.js, which holds the categories and
 * the full deck — never another game or the hub, and it stays the only script
 * the page loads. The bank lives in its own file so it's easy to grow without
 * wading through rendering code; the service worker precaches trivia.data.js
 * alongside this file (see sw.js), so the split keeps the game playable offline
 * after a single visit to the hub.
 */

import { CATEGORIES, QUESTIONS } from './trivia.data.js';

/** @typedef {import('./trivia.data.js').Difficulty} Difficulty */
/** @typedef {import('./trivia.data.js').Question} Question */

/**
 * The six difficulty tiers, easiest first. `basic` is what virtually everyone
 * should know; `impossible` is the obscure stuff almost no one will. Impossible
 * is off by default (see DEFAULT_DIFFS) — switch it on for a brutal round.
 *
 * @type {{ id: Difficulty, label: string }[]}
 */
const DIFFICULTIES = [
  { id: 'basic', label: 'Basic' },
  { id: 'easy', label: 'Easy' },
  { id: 'med', label: 'Medium' },
  { id: 'hard', label: 'Hard' },
  { id: 'expert', label: 'Expert' },
  { id: 'impossible', label: 'Impossible' },
];

/** Tiers on at first run — everything except the off-by-default Impossible. */
const DEFAULT_DIFFS = DIFFICULTIES.map((d) => d.id).filter((id) => id !== 'impossible');

/** Difficulty id → label, for the on-card badge. */
const DIFF_LABEL = /** @type {Record<string, string>} */ ({});
for (const d of DIFFICULTIES) DIFF_LABEL[d.id] = d.label;

// ---------------------------------------------------------------------------

const STORAGE_KEY = 'trivia.v2';

/**
 * @typedef {Object} GameState
 * @property {'home' | 'play'} phase
 * @property {Set<string>} cats         Categories in play (multi-select; empty at first run).
 * @property {Set<Difficulty>} diffs    Difficulty tiers in play.
 * @property {Question | null} current  The question on screen.
 * @property {boolean} revealed         Whether its answer is showing.
 * @property {boolean} presenting       Whether the visual is shown full-screen.
 * @property {number} asked             Count of questions dealt this session.
 * @property {Set<Question>} seen        Dealt this session — never repeated until recycled.
 * @property {Difficulty[]} lastDiffs    Last two tiers dealt, to keep the mix varied.
 */

/** @type {GameState} */
const state = {
  phase: 'home',
  cats: new Set(),
  diffs: new Set(/** @type {Difficulty[]} */ (DEFAULT_DIFFS)),
  current: null,
  revealed: false,
  presenting: false,
  asked: 0,
  seen: new Set(),
  lastDiffs: [],
};

const app = /** @type {HTMLElement} */ (document.getElementById('app'));

// --- pure helpers (DOM-free) -----------------------------------------------

/** @param {number} n @returns {number} A random integer in [0, n). */
function randInt(n) {
  return Math.floor(Math.random() * n);
}

/** Questions matching the selected categories and difficulties. */
function eligiblePool() {
  return QUESTIONS.filter((q) => state.cats.has(q.cat) && state.diffs.has(q.d));
}

/**
 * Pick the next question. Nothing in the selected pool is dealt twice in a
 * session: once the whole pool has been seen this returns null and the deck
 * stops — it never recycles on its own (the host taps Start over to deal the
 * selection again). A light touch keeps the difficulties from clumping. Also
 * returns null if nothing is selected or nothing matches.
 *
 * @returns {Question | null}
 */
function pickNext() {
  let fresh = eligiblePool().filter((q) => !state.seen.has(q));
  if (fresh.length === 0) return null; // nothing selected, no match, or all seen

  // Don't deal a third of the same tier in a row if another tier is available.
  const n = state.lastDiffs.length;
  if (n >= 2 && state.lastDiffs[n - 1] === state.lastDiffs[n - 2]) {
    const spread = fresh.filter((q) => q.d !== state.lastDiffs[n - 1]);
    if (spread.length) fresh = spread;
  }

  return fresh[randInt(fresh.length)];
}

/**
 * Deal a fresh question, recording it so the session won't repeat it. Pass
 * `count = false` to deal without bumping the session tally — that's what a
 * skip does, so passing over a question you don't fancy never inflates the
 * number at the top. The dealt question is still tracked (so it won't repeat
 * and the tier mix stays varied); only the visible count holds still.
 *
 * @param {boolean} [count]
 */
function deal(count = true) {
  const q = pickNext();
  state.current = q;
  state.revealed = false;
  state.presenting = false;
  if (!q) return;

  state.seen.add(q);
  if (count) state.asked += 1;
  state.lastDiffs.push(q.d);
  if (state.lastDiffs.length > 2) state.lastDiffs.shift();
}

/**
 * Start the current selection over: forget that its questions have been seen so
 * the deck can deal them again, then deal the first one. Only questions matching
 * what's selected are cleared — anything seen under a category or tier you've yet
 * to return to stays remembered, so switching back still won't repeat. The
 * session tally keeps climbing; this is a fresh pass over the same pool, not a
 * new session.
 */
function replaySelection() {
  for (const q of eligiblePool()) state.seen.delete(q);
  deal();
}

// --- persistence -----------------------------------------------------------

/** Save the host's standing preferences (categories + difficulty). */
function save() {
  try {
    const data = { cats: [...state.cats], diffs: [...state.diffs] };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Storage may be unavailable; the game still works fully in memory.
  }
}

/** Restore preferences, ignoring anything stale or unknown. */
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

  const validCats = new Set(CATEGORIES.map((c) => c.id));
  if (Array.isArray(data.cats)) {
    const cats = /** @type {string[]} */ (data.cats);
    state.cats = new Set(cats.filter((id) => validCats.has(id)));
  }
  const validDiffs = new Set(DIFFICULTIES.map((d) => d.id));
  if (Array.isArray(data.diffs)) {
    const diffs = /** @type {Difficulty[]} */ (data.diffs).filter((id) => validDiffs.has(id));
    state.diffs = new Set(diffs);
  }
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
 * Make a node behave as a tap target (pointer + keyboard activation).
 *
 * @param {HTMLElement} node
 * @param {() => void} onActivate
 * @returns {HTMLElement}
 */
function makeTappable(node, onActivate) {
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
 * A small colour-graded difficulty badge (Basic → Impossible), so the host can
 * read the tier of the question on screen at a glance.
 *
 * @param {Difficulty} d
 * @returns {HTMLElement}
 */
function difficultyBadge(d) {
  const label = DIFF_LABEL[d] || d;
  const badge = el('span', `diff diff--${d}`, label);
  badge.setAttribute('aria-label', `Difficulty: ${label}`);
  return badge;
}

/**
 * A row of multi-select toggle chips. Toggling only updates `selected` and
 * re-renders — it never deals a new question, so the host can adjust the mix
 * without disturbing what's on screen.
 *
 * @param {{ id: string, label: string }[]} options
 * @param {Set<string>} selected
 * @returns {HTMLElement}
 */
function chipRow(options, selected) {
  const row = el('div', 'chips');
  for (const o of options) {
    const on = selected.has(o.id);
    const chip = el('button', `chip${on ? ' chip--on' : ''}`, o.label);
    chip.setAttribute('type', 'button');
    chip.setAttribute('aria-pressed', String(on));
    chip.addEventListener('click', () => {
      if (selected.has(o.id)) {
        selected.delete(o.id);
      } else {
        selected.add(o.id);
      }
      save();
      render();
    });
    row.append(chip);
  }
  return row;
}

// --- screens ---------------------------------------------------------------

/** Home: a one-line framing, then into the console. */
function renderHome() {
  const screen = el('section', 'screen');

  screen.append(el('h1', 'screen__title', 'Trivia'));

  const howto = /** @type {HTMLAnchorElement} */ (el('a', 'screen__howto', 'How to play →'));
  howto.href = 'how-to-play.html';
  screen.append(howto);

  screen.append(
    el('p', 'screen__lede', 'You host; the phone deals. Run a knockout, a category streak, a flags round — whatever you like.'),
  );

  const start = el('button', 'btn', 'Start');
  start.addEventListener('click', () => {
    // Open the console with a clean slate: no question dealt yet and the tally
    // at zero, so the host picks a category before anything is on screen.
    state.asked = 0;
    state.seen = new Set();
    state.lastDiffs = [];
    state.current = null;
    state.revealed = false;
    state.presenting = false;
    state.phase = 'play';
    render();
  });
  screen.append(start);

  return screen;
}

/** Play: current question on top, live console beneath. */
function renderPlay() {
  const screen = el('section', 'screen');

  const bar = el('div', 'topbar');
  const back = el('button', 'topbar__back', '← Done');
  back.setAttribute('type', 'button');
  back.addEventListener('click', () => {
    state.phase = 'home';
    render();
  });
  bar.append(back);

  // An inconspicuous tally of how many have been dealt this session. Hidden
  // until the first question, and held still by Skip (which deals without
  // counting), so the number only tracks questions actually moved on from.
  bar.append(el('span', 'topbar__count', state.asked > 0 ? `#${state.asked}` : ''));

  const skip = /** @type {HTMLButtonElement} */ (el('button', 'topbar__skip', 'Skip'));
  skip.setAttribute('type', 'button');
  skip.disabled = !state.current || eligiblePool().length === 0;
  skip.addEventListener('click', () => {
    deal(false);
    render();
  });
  bar.append(skip);
  screen.append(bar);

  screen.append(renderCard());
  screen.append(renderDeck());

  return screen;
}

/**
 * The current question card. Tapping the card reveals the answer, then taps
 * again to the next question. A visual prompt (a flag) is its own tap target
 * that throws it full-screen for the table. Fixed heights on the card and the
 * answer slot keep the layout from jumping when the answer appears.
 */
function renderCard() {
  const q = state.current;
  const card = el('article', 'qcard');
  makeTappable(card, () => {
    if (!state.current) deal();
    else if (!state.revealed) state.revealed = true;
    else deal();
    render();
  });

  if (!q) {
    // No question yet. Steer the host: point at whichever selection is empty
    // when nothing feeds the deck, say so when the selection has been fully
    // seen (with a tap to replay it), otherwise just tap to deal the next one.
    const content = el('div', 'qcard__content');
    const pool = eligiblePool();
    const spent = pool.length > 0 && pool.every((p) => state.seen.has(p));
    const hint = state.cats.size === 0
      ? 'Pick a category to begin.'
      : state.diffs.size === 0
        ? 'Pick a difficulty to begin.'
        : pool.length === 0
          ? 'No questions match — widen the selection.'
          : spent
            ? "You've seen everything in this selection."
            : state.asked === 0
              ? 'Tap for your first question.'
              : 'Tap for the next question.';
    content.append(el('p', 'qcard__q', hint));
    if (spent) {
      const replay = el('button', 'qcard__replay', 'Start over');
      replay.setAttribute('type', 'button');
      // Its own action; keep the tap/key off the card's deal handler.
      replay.addEventListener('click', (e) => {
        e.stopPropagation();
        replaySelection();
        render();
      });
      replay.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') e.stopPropagation();
      });
      content.append(replay);
    }
    card.append(content);
    return card;
  }

  const cat = CATEGORIES.find((c) => c.id === q.cat);
  const meta = el('div', 'qcard__meta');
  meta.append(el('span', 'qcard__cat', cat ? `${cat.emoji} ${cat.name}` : q.cat));
  meta.append(difficultyBadge(q.d));
  card.append(meta);

  const content = el('div', 'qcard__content');
  // Picture prompt, text prompt, or both: flags are picture-only (empty `q`),
  // most questions text-only, and some (a "name this animal" photo) carry both.
  // The image leads and the text sits beneath it, like a question under a photo.
  if (q.img) {
    const glyph = el('div', 'qcard__glyph');
    const img = /** @type {HTMLImageElement} */ (el('img'));
    img.src = `images/${q.img}`;
    img.alt = '';
    // Nepal is the only non-rectangular flag; its own pennant edge stands in
    // for the frame, so a box border would just float around it.
    if (q.img === 'flags/np.svg') img.classList.add('flag--shaped');
    glyph.append(img);
    glyph.setAttribute('role', 'button');
    glyph.setAttribute('tabindex', '0');
    glyph.setAttribute('aria-label', 'Show image full screen');
    // Its own action (present), and stop the tap/key bubbling so the card's
    // reveal doesn't also fire.
    const present = () => {
      state.presenting = true;
      render();
    };
    glyph.addEventListener('click', (e) => {
      e.stopPropagation();
      present();
    });
    glyph.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        present();
      }
    });
    content.append(glyph);
  }
  if (q.q) content.append(el('p', 'qcard__q', q.q));
  card.append(content);

  // Answer slot: fixed height, so flipping it never resizes anything.
  const answer = el('div', 'qcard__answer');
  answer.append(
    state.revealed ? el('span', 'qcard__a', q.a) : el('span', 'qcard__ahint', 'Tap to reveal'),
  );
  card.append(answer);

  return card;
}

/** The live console: which categories and difficulties feed the deck. */
function renderDeck() {
  const deck = el('div', 'deck');

  // Categories — multi-select, with All / None for quick soloing.
  const catGroup = el('div', 'deck__group');
  const catHead = el('div', 'deck__head');
  catHead.append(el('span', 'deck__label', 'Categories'));
  const quick = el('div', 'deck__quick');
  const all = el('button', 'linkbtn', 'All');
  all.setAttribute('type', 'button');
  all.addEventListener('click', () => {
    state.cats = new Set(CATEGORIES.map((c) => c.id));
    save();
    render();
  });
  const none = el('button', 'linkbtn', 'None');
  none.setAttribute('type', 'button');
  none.addEventListener('click', () => {
    state.cats = new Set();
    save();
    render();
  });
  quick.append(all, none);
  catHead.append(quick);
  catGroup.append(catHead);
  catGroup.append(
    chipRow(
      CATEGORIES.map((c) => ({ id: c.id, label: `${c.emoji} ${c.name}` })),
      state.cats,
    ),
  );
  deck.append(catGroup);

  // Difficulty — multi-select; like categories, it can sit empty.
  const diffGroup = el('div', 'deck__group');
  const diffHead = el('div', 'deck__head');
  diffHead.append(el('span', 'deck__label', 'Difficulty'));
  diffGroup.append(diffHead);
  diffGroup.append(chipRow(DIFFICULTIES, /** @type {Set<string>} */ (state.diffs)));
  deck.append(diffGroup);

  return deck;
}

/** Full-screen view of a visual prompt, for showing the table. */
function renderPresent() {
  const q = /** @type {Question} */ (state.current);
  const overlay = el('div', 'present');
  overlay.append(el('div', 'present__close', '✕'));
  const glyph = el('div', 'present__glyph');
  const img = /** @type {HTMLImageElement} */ (el('img'));
  img.src = `images/${q.img}`;
  img.alt = '';
  if (q.img === 'flags/np.svg') img.classList.add('flag--shaped'); // see renderPlay: non-rectangular
  glyph.append(img);
  overlay.append(glyph);
  makeTappable(overlay, () => {
    state.presenting = false;
    render();
  });
  return overlay;
}

function render() {
  let screen;
  if (state.phase === 'play' && state.presenting && state.current && state.current.img) {
    screen = renderPresent();
  } else if (state.phase === 'play') {
    screen = renderPlay();
  } else {
    screen = renderHome();
  }
  app.replaceChildren(screen);
}

load();
render();
