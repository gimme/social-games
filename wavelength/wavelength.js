// @ts-check

/*
 * Wavelength — a pass-the-phone party game.
 *
 * One player (the Psychic) privately sees a hidden target wedge on a half-moon
 * dial and a spectrum (e.g. Cold ↔ Hot). They say a one-line clue out loud,
 * then hand the phone to their team, who swing a needle to where they think the
 * target sits. The needle snaps between 21 marks; the closer it lands, the more
 * points: a bullseye scores 4, the rings out from it 3 then 2, and a miss scores
 * 0 — exactly like the physical device.
 *
 * Needs two or more people. Teams (2–6) take turns being the Psychic. Once a team
 * reaches the target score, only rivals that can still catch it keep playing — a
 * team that can't reach the leader even with a perfect round is skipped — and the
 * game ends the moment no one can catch up; a tie at the top plays on in sudden
 * death. With one team — the default — it's pure co-op: the table just keeps a
 * shared score for as long as they like, no target.
 *
 * Self-contained: this game imports nothing and is the only script on its page.
 * The pure scoring/geometry helpers are DOM-free so they can be unit-tested
 * without a browser.
 */

const STORAGE_KEY = 'wavelength.v1';

const MIN_TEAMS = 1;
const MAX_TEAMS = 6;
const DEFAULT_TEAMS = 1;

const MIN_TARGET = 5;
const MAX_TARGET = 30;
const TARGET_STEP = 5;
const DEFAULT_TARGET = 10;

// The needle snaps to one of TICKS evenly-spaced marks across the 0..100 scale
// (no fine-tuning between them). TICK_STEP is the gap between marks, in scale
// units, so mark j sits at j * TICK_STEP.
const TICKS = 21;
const TICK_STEP = 100 / (TICKS - 1); // 5

// Scoring band half-widths, in 0..100 scale units. The target wedge is the five
// marks 2-3-4-3-2 of the real device, each one TICK_STEP wide: the centre mark
// (≤ BAND_4) scores 4, the marks either side (≤ BAND_3) score 3, and the next
// ones out (≤ BAND_2) score 2. The target centre always sits on a mark, so a
// guess scores 4/3/2/0 purely by how many marks away it lands.
const BAND_4 = 2.5;
const BAND_3 = 7.5;
const BAND_2 = 12.5;

// The most a team can score in a single round (a bullseye). Used to tell when a
// lead is already out of reach, so a decided game ends at once instead of playing
// out reply turns — or a sudden-death cycle — that can't change the result.
const MAX_ROUND_POINTS = 4;

const TEAM_COLORS = ['#6c8cff', '#4fd6a0', '#ffc857', '#ff5d6c', '#c084fc', '#38bdf8'];

/**
 * Spectrum cards: each is a [left, right] pair of opposing concepts. The target
 * can land anywhere between them; the Psychic's clue places it. Kept broad and
 * widely-known so any table can argue about them.
 *
 * @type {[string, string][]}
 */
const SPECTRUMS = [
  ['Cold', 'Hot'],
  ['Underrated', 'Overrated'],
  ['Bad', 'Good'],
  ['Round', 'Pointy'],
  ['Hard to do', 'Easy to do'],
  ['Forbidden', 'Encouraged'],
  ['Old-fashioned', 'Modern'],
  ['Useless', 'Useful'],
  ['Casual', 'Formal'],
  ['Common', 'Rare'],
  ['A weakness', 'A strength'],
  ['Temporary', 'Permanent'],
  ['Normal', 'Weird'],
  ['Unhealthy', 'Healthy'],
  ['Quiet', 'Loud'],
  ['Ugly', 'Beautiful'],
  ['Simple', 'Complicated'],
  ['Dangerous', 'Safe'],
  ['Introvert', 'Extrovert'],
  ['Mainstream', 'Niche'],
  ['Gross', 'Tasty'],
  ['A waste of time', 'Worth doing'],
  ['Villain', 'Hero'],
  ['Cheap', 'Expensive'],
  ['Boring', 'Exciting'],
  ['Fragile', 'Sturdy'],
  ['Soft', 'Hard'],
  ['Slow', 'Fast'],
  ['Tiny', 'Huge'],
  ['Dim', 'Bright'],
  ['Childish', 'Mature'],
  ['Messy', 'Tidy'],
  ['Fiction', 'Non-fiction'],
  ['Lowbrow', 'Highbrow'],
  ['A guilty pleasure', 'Widely respected'],
  ['Forgettable', 'Memorable'],
  ['Relaxing', 'Stressful'],
  ['Overpriced', 'A bargain'],
  ['Wholesome', 'Sinful'],
  ['Spontaneous', 'Planned'],
  ['Comfortable', 'Stylish'],
  ['A want', 'A need'],
  ['Smells bad', 'Smells good'],
  ['Indoor', 'Outdoor'],
  ['Serious', 'Silly'],
  ['Fact', 'Opinion'],
  ['Basic', 'Fancy'],
  ['Trendy', 'Timeless'],
  ['Awkward', 'Smooth'],
  ['Local', 'Global'],
  ['Risky', 'Sensible'],
  ['Cute', 'Scary'],
  ['Hard to find', 'Everywhere'],
  ['The underdog', 'The favourite'],
  ['Annoying', 'Pleasant'],
  ['Ordinary', 'Magical'],
  ['Junk food', 'Health food'],
  ['A bad habit', 'A good habit'],
  ['A chore', 'A treat'],
  ['Mild', 'Spicy'],
  ['Calm', 'Chaotic'],
  ['Predictable', 'Surprising'],
  ['Tacky', 'Classy'],
  ['Overdone', 'Original'],
  ['Wet', 'Dry'],
  ['Light', 'Heavy'],
  ['Empty', 'Full'],
  ['Subtle', 'Obvious'],
  ['A pet', 'A pest'],
  ['Work', 'Play'],
  ['Forgivable', 'Unforgivable'],
  ['Lazy', 'Hardworking'],
  ['Cursed', 'Blessed'],
  ['Beginner', 'Expert'],
  ['A quiet night in', 'A wild night out'],
  ['Worst', 'Best'],
  ['Fake', 'Real'],
];

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

/** @param {number} v @param {number} lo @param {number} hi @returns {number} */
function clampNum(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

/** @param {number} v @param {number} lo @param {number} hi @returns {number} An integer in [lo, hi]. */
function clampInt(v, lo, hi) {
  return Math.min(hi, Math.max(lo, Math.round(v)));
}

/** @param {number} p @returns {number} The 0..100 position of the nearest mark. */
function snapToTick(p) {
  return clampNum(Math.round(p / TICK_STEP) * TICK_STEP, 0, 100);
}

/** @param {number} p @returns {number} The mark index (0..TICKS-1) nearest p. */
function tickIndex(p) {
  return clampInt(p / TICK_STEP, 0, TICKS - 1);
}

/**
 * Points for landing `dist` scale-units away from the target centre.
 *
 * @param {number} dist  Absolute distance on the 0..100 scale.
 * @returns {0 | 2 | 3 | 4}
 */
function scoreFor(dist) {
  if (dist <= BAND_4) return 4;
  if (dist <= BAND_3) return 3;
  if (dist <= BAND_2) return 2;
  return 0;
}

/** @param {number} pts @returns {string} */
function scoreLabel(pts) {
  switch (pts) {
    case 4:
      return 'Bullseye!';
    case 3:
      return 'So close!';
    case 2:
      return 'On the board!';
    default:
      return 'Missed the mark';
  }
}

/**
 * A random target centre, sitting on a mark and kept far enough from the ends
 * that the whole wedge always fits on the dial.
 *
 * @returns {number} A mark position in [BAND_2, 100 − BAND_2].
 */
function randTarget() {
  const minTick = Math.ceil(BAND_2 / TICK_STEP); // 3 — leaves room for the wedge
  const maxTick = TICKS - 1 - minTick; // 17
  return (minTick + randInt(maxTick - minTick + 1)) * TICK_STEP;
}

/** @param {number} i @returns {string} A stable colour for team index i. */
function teamColor(i) {
  return TEAM_COLORS[i % TEAM_COLORS.length];
}

// --- geometry (DOM-free) ---------------------------------------------------

// SVG viewBox + dial layout. The dial is a filled half-disc: the needle pivots
// at (CX, CY) on the flat (bottom) edge, and the arc sweeps the upper half from
// p=0 (far left) to p=100 (far right). The chunky hub knob at the pivot is an
// HTML button overlaid on top (see .dial__knob) — it's both the needle's anchor
// and the game's one control, so a step advances by pressing it. VBH leaves a
// little room below the pivot for that knob and the frame, so the dial fits.
const VBW = 320;
const VBH = 200;
const CX = 160;
const CY = 160;
const R = 140; // disc radius

/** @param {number} p @returns {number} Standard (y-up) angle in degrees for scale position p. */
function posAngle(p) {
  return 180 - (p / 100) * 180;
}

/** @param {number} p @param {number} radius @returns {{ x: number, y: number }} */
function ptAt(p, radius) {
  const a = (posAngle(p) * Math.PI) / 180;
  return { x: CX + radius * Math.cos(a), y: CY - radius * Math.sin(a) };
}

/** @param {number} p @returns {number} Degrees to rotate an upright needle to point at p. */
function needleRot(p) {
  return -90 + 1.8 * p;
}

/** @param {number} n @returns {string} */
function f(n) {
  return n.toFixed(2);
}

/**
 * Path for a pie slice from the centre out to `radius`, between scale positions
 * pA and pB. Used both for the whole half-disc (0→100) and the target wedge.
 *
 * @param {number} pA @param {number} pB @param {number} [radius] @returns {string}
 */
function sector(pA, pB, radius = R) {
  const a = ptAt(pA, radius);
  const b = ptAt(pB, radius);
  // Centre → left edge → arc over the top to the right edge (sweep 1) → close.
  return `M ${f(CX)} ${f(CY)} L ${f(a.x)} ${f(a.y)} A ${radius} ${radius} 0 0 1 ${f(b.x)} ${f(b.y)} Z`;
}

// ---------------------------------------------------------------------------
// Everything below this line is the browser app (DOM + state + persistence).
// ---------------------------------------------------------------------------

const app = /** @type {HTMLElement} */ (document.getElementById('app'));

/**
 * @typedef {Object} Round
 * @property {number} team               Active (Psychic's) team index.
 * @property {string} left               Spectrum left label.
 * @property {string} right              Spectrum right label.
 * @property {number} target             Hidden target centre, 0..100 (on a mark).
 * @property {number | null} guess       Locked-in needle position, 0..100.
 */

/**
 * @typedef {Object} GameState
 * @property {'home' | 'reveal' | 'guess' | 'result' | 'gameover'} phase
 * @property {number} teamCount
 * @property {number} targetScore
 * @property {number[]} scores           Per-team running totals.
 * @property {number} activeTeam         Whose turn it is to give the clue.
 * @property {number} roundsPlayed        Completed (scored) rounds this game.
 * @property {number[]} deckOrder        Shuffled indices into SPECTRUMS.
 * @property {number} deckPos            Next card to draw from deckOrder.
 * @property {Round | null} round
 * @property {number} needle             Live needle position during guessing, 0..100.
 * @property {number} lastPoints         Points scored on the most recent reveal.
 * @property {boolean} gateOpen          Whether the Psychic's pass-gate is passed.
 */

/** @type {GameState} */
const state = {
  phase: 'home',
  teamCount: DEFAULT_TEAMS,
  targetScore: DEFAULT_TARGET,
  scores: [],
  activeTeam: 0,
  roundsPlayed: 0,
  deckOrder: [],
  deckPos: 0,
  round: null,
  needle: 50,
  lastPoints: 0,
  gateOpen: false,
};

// --- persistence -----------------------------------------------------------

function save() {
  try {
    /** @type {Record<string, unknown>} */
    const data = {
      phase: state.phase,
      teamCount: state.teamCount,
      targetScore: state.targetScore,
      scores: state.scores,
      activeTeam: state.activeTeam,
      roundsPlayed: state.roundsPlayed,
      deckOrder: state.deckOrder,
      deckPos: state.deckPos,
      round: state.round,
      lastPoints: state.lastPoints,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Storage may be unavailable; the game still works fully in memory.
  }
}

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
    if (typeof data.teamCount === 'number') {
      state.teamCount = clampInt(data.teamCount, MIN_TEAMS, MAX_TEAMS);
    }
    if (typeof data.targetScore === 'number') {
      state.targetScore = clampInt(data.targetScore, MIN_TARGET, MAX_TARGET);
    }
    if (Array.isArray(data.scores)) {
      state.scores = data.scores.map((/** @type {unknown} */ s) =>
        typeof s === 'number' ? s : 0,
      );
    }
    if (typeof data.activeTeam === 'number') state.activeTeam = data.activeTeam;
    if (typeof data.roundsPlayed === 'number') state.roundsPlayed = data.roundsPlayed;
    if (Array.isArray(data.deckOrder)) {
      state.deckOrder = data.deckOrder.filter(
        (/** @type {number} */ i) => Number.isInteger(i) && i >= 0 && i < SPECTRUMS.length,
      );
    }
    if (typeof data.deckPos === 'number') state.deckPos = data.deckPos;
    if (typeof data.lastPoints === 'number') state.lastPoints = data.lastPoints;
    if (data.round && typeof data.round === 'object') {
      const r = data.round;
      if (
        typeof r.target === 'number' &&
        typeof r.left === 'string' &&
        typeof r.right === 'string'
      ) {
        state.round = {
          team: typeof r.team === 'number' ? r.team : 0,
          left: r.left,
          right: r.right,
          target: clampNum(r.target, 0, 100),
          guess: typeof r.guess === 'number' ? clampNum(r.guess, 0, 100) : null,
        };
      }
    }

    const validGame =
      state.scores.length === state.teamCount &&
      state.activeTeam >= 0 &&
      state.activeTeam < state.teamCount;

    const phase = data.phase;
    if (
      (phase === 'reveal' || phase === 'guess' || phase === 'result') &&
      state.round &&
      validGame
    ) {
      state.phase = phase;
    } else if (phase === 'gameover' && validGame) {
      state.phase = 'gameover';
    } else {
      state.phase = 'home';
    }

    // Never restore mid-needle or an open Psychic gate: a refresh must not flash
    // the hidden target. The needle resets to centre, and the reveal re-asks for
    // the pass-gate before showing anything.
    state.needle = 50;
    state.gateOpen = false;
  } catch {
    // Corrupt payload — fall back to defaults already in state.
  }
}

// --- DOM helpers -----------------------------------------------------------

/**
 * @param {string} tag @param {string} [className] @param {string} [text]
 * @returns {HTMLElement}
 */
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

/**
 * @param {string} tag @param {Record<string, string | number>} [attrs]
 * @returns {SVGElement}
 */
function svgEl(tag, attrs) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  if (attrs) for (const k in attrs) node.setAttribute(k, String(attrs[k]));
  return node;
}

/**
 * A labelled +/- stepper.
 *
 * @param {string} label @param {number} value @param {number} min @param {number} max
 * @param {number} step @param {(value: number) => void} onChange
 * @param {{ note?: string }} [opts]
 * @returns {HTMLElement}
 */
function stepper(label, value, min, max, step, onChange, opts) {
  const field = el('div', 'field');
  const labelWrap = el('div', 'field__labelwrap');
  labelWrap.append(el('span', 'field__label', label));
  if (opts?.note) labelWrap.append(el('span', 'field__note', opts.note));
  field.append(labelWrap);

  const control = el('div', 'stepper');
  const dec = el('button', 'stepper__btn', '−');
  const val = el('span', 'stepper__value', String(value));
  const inc = el('button', 'stepper__btn', '+');
  /** @type {HTMLButtonElement} */ (dec).disabled = value <= min;
  /** @type {HTMLButtonElement} */ (inc).disabled = value >= max;
  dec.addEventListener('click', () => onChange(Math.max(min, value - step)));
  inc.addEventListener('click', () => onChange(Math.min(max, value + step)));

  control.append(dec, val, inc);
  field.append(control);
  return field;
}

/** The running scoreboard (co-op shows one line; teams show coloured chips). */
function scoreboard() {
  const wrap = el('div', 'scoreboard');
  if (state.teamCount === 1) {
    wrap.classList.add('scoreboard--solo');
    wrap.append(el('span', 'scoreboard__solo', `Score ${state.scores[0]}`));
    const r = state.roundsPlayed;
    wrap.append(el('span', 'scoreboard__meta', `${r} ${r === 1 ? 'round' : 'rounds'} played`));
    return wrap;
  }
  for (let i = 0; i < state.teamCount; i++) {
    const chip = el('div', 'team-chip');
    if (i === state.activeTeam) chip.classList.add('team-chip--active');
    const dot = el('span', 'team-chip__dot');
    dot.style.background = teamColor(i);
    chip.append(dot);
    chip.append(el('span', 'team-chip__name', `Team ${i + 1}`));
    chip.append(el('span', 'team-chip__score', String(state.scores[i])));
    wrap.append(chip);
  }
  return wrap;
}

// --- the dial --------------------------------------------------------------

/**
 * Build the half-moon dial as an SVG.
 *
 * @param {Object} opts
 * @param {boolean} opts.showWedge          Reveal the target bands.
 * @param {number} opts.target              Target centre (only used if showWedge).
 * @param {number | null} opts.needle       Needle position, or null to hide it.
 * @param {boolean} opts.interactive        Allow dragging the needle.
 * @param {(p: number) => void} [opts.onInput]  Called as the needle moves.
 * @returns {{ el: SVGElement, setNeedle: (p: number) => void }}
 */
function buildDial(opts) {
  const svg = svgEl('svg', { viewBox: `0 0 ${VBW} ${VBH}` });
  svg.classList.add('dial__svg');

  // Dial body: a smooth, blank half-disc. No tick marks are drawn — the surface
  // looks like a continuous scale, but the needle still snaps (and buzzes) onto
  // one of the 21 marks, so the accuracy is felt rather than seen.
  svg.append(svgEl('path', { d: sector(0, 100), class: 'dial__bg' }));

  // Target wedge: five pie slices fanning from the centre, point value on each.
  if (opts.showWedge) {
    const t = opts.target;
    const g = svgEl('g', { class: 'dial__wedge' });
    /** @type {[number, number, string][]} */
    const bands = [
      [t - BAND_2, t - BAND_3, 'b2'],
      [t - BAND_3, t - BAND_4, 'b3'],
      [t - BAND_4, t + BAND_4, 'b4'],
      [t + BAND_4, t + BAND_3, 'b3'],
      [t + BAND_3, t + BAND_2, 'b2'],
    ];
    for (const [a, b, cls] of bands) {
      g.append(svgEl('path', { d: sector(a, b), class: `dial__band dial__band--${cls}` }));
    }
    const lr = R * 0.9; // sit the point numbers right out near the rim
    /** @type {[number, string][]} */
    const labels = [
      [t, '4'],
      [t - 5, '3'],
      [t + 5, '3'],
      [t - 10, '2'],
      [t + 10, '2'],
    ];
    for (const [p, txt] of labels) {
      const c = ptAt(p, lr);
      const tn = svgEl('text', { x: f(c.x), y: f(c.y), class: 'dial__pts' });
      tn.textContent = txt;
      g.append(tn);
    }
    svg.append(g);
  }

  // Needle: a red line over a slightly fatter black line, so the two read as one
  // piece sharing a thin dark outline; a drop shadow lifts it. Its base at the
  // pivot is covered by the HTML hub knob (.dial__knob), which sits on top.
  let current = opts.needle ?? 50;
  /** @type {SVGElement | null} */
  let needle = null;
  if (opts.needle != null) {
    needle = svgEl('g', { class: 'dial__needle' });
    needle.append(
      svgEl('line', { x1: CX, y1: CY, x2: CX, y2: CY - (R - 4), class: 'dial__needle-edge' }),
    );
    needle.append(
      svgEl('line', { x1: CX, y1: CY, x2: CX, y2: CY - (R - 4), class: 'dial__needle-line' }),
    );
    svg.append(needle);
  }

  const setNeedle = (/** @type {number} */ p) => {
    current = clampNum(p, 0, 100);
    if (needle) needle.setAttribute('transform', `rotate(${f(needleRot(current))} ${CX} ${CY})`);
    svg.setAttribute('aria-valuenow', String(Math.round(current)));
  };
  if (opts.needle != null) setNeedle(current);

  if (opts.interactive) {
    svg.classList.add('dial__svg--interactive');
    svg.setAttribute('role', 'slider');
    svg.setAttribute('tabindex', '0');
    svg.setAttribute('aria-valuemin', '0');
    svg.setAttribute('aria-valuemax', '100');
    svg.setAttribute('aria-label', 'Move the needle to your guess');

    // Map a pointer anywhere on (or around) the dial to the mark the needle
    // should point at: the needle just aims at wherever your finger is, so a
    // drag tracks it instantly and the whole arc is one big target.
    /** @param {PointerEvent} e @returns {number} The snapped mark position. */
    const toP = (e) => {
      const rect = svg.getBoundingClientRect();
      const vx = ((e.clientX - rect.left) / rect.width) * VBW;
      const vy = ((e.clientY - rect.top) / rect.height) * VBH;
      // Angle above the pivot: 180° at the far left → 0° at the far right.
      let ang = (Math.atan2(CY - vy, vx - CX) * 180) / Math.PI;
      // Below the pivot the angle goes negative; clamp to the nearest end.
      if (ang < 0) ang = vx < CX ? 180 : 0;
      return snapToTick(((180 - ang) / 180) * 100);
    };

    let lastTick = tickIndex(current);
    /** @param {PointerEvent} e */
    const apply = (e) => {
      const p = toP(e);
      const t = tickIndex(p);
      // Buzz each time the needle flips onto a new mark — a tactile "tick".
      if (t !== lastTick) {
        lastTick = t;
        if (typeof navigator.vibrate === 'function') navigator.vibrate(8);
      }
      setNeedle(p);
      if (opts.onInput) opts.onInput(p);
    };

    let dragging = false;
    svg.addEventListener('pointerdown', (e) => {
      dragging = true;
      lastTick = tickIndex(current);
      svg.setPointerCapture(e.pointerId);
      apply(e);
      e.preventDefault();
    });
    svg.addEventListener('pointermove', (e) => {
      if (dragging) apply(e);
    });
    const end = () => {
      dragging = false;
    };
    svg.addEventListener('pointerup', end);
    svg.addEventListener('pointercancel', end);
    svg.addEventListener('keydown', (e) => {
      let d = 0;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') d = -1;
      else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') d = 1;
      if (!d) return;
      e.preventDefault();
      setNeedle(snapToTick(current + d * TICK_STEP));
      if (typeof navigator.vibrate === 'function') navigator.vibrate(8);
      if (opts.onInput) opts.onInput(current);
    });
  }

  return { el: svg, setNeedle };
}

// --- deck + round flow -----------------------------------------------------

/** @returns {[string, string]} The next spectrum, reshuffling when exhausted. */
function drawSpectrum() {
  if (state.deckPos >= state.deckOrder.length) {
    state.deckOrder = shuffle(SPECTRUMS.map((_, i) => i));
    state.deckPos = 0;
  }
  const idx = state.deckOrder[state.deckPos];
  state.deckPos += 1;
  return SPECTRUMS[idx];
}

/** Start a brand-new game from the current settings. */
function startGame() {
  state.scores = new Array(state.teamCount).fill(0);
  state.activeTeam = 0;
  state.roundsPlayed = 0;
  state.deckOrder = shuffle(SPECTRUMS.map((_, i) => i));
  state.deckPos = 0;
  state.lastPoints = 0;
  state.needle = 50;
  beginRound();
}

/** Begin a round for the current active team: fresh card, target, Psychic gate.
 * The needle is left where it was — only HIDE recentres it, right before the
 * guessing team takes over — so pressing NEXT never makes the dial jump. */
function beginRound() {
  const [left, right] = drawSpectrum();
  state.round = { team: state.activeTeam, left, right, target: randTarget(), guess: null };
  state.phase = 'reveal';
  state.gateOpen = false;
  render();
}

/** Score the locked-in guess and move to the reveal. */
function lockGuess() {
  const round = state.round;
  if (!round) return;
  round.guess = state.needle;
  const pts = scoreFor(Math.abs(state.needle - round.target));
  state.scores[state.activeTeam] += pts;
  state.lastPoints = pts;
  state.roundsPlayed += 1;
  state.phase = 'result';
  render();
}

/** Hand off to the next team and start their round. Once a team has reached the
 * target, the phone skips any team that can't tie-or-beat the current leader on a
 * single turn — the most it could add is MAX_ROUND_POINTS, so if that still falls
 * short it can't change the result and sits the rest of the game out. Before anyone
 * hits the target every team can still get there, so play just goes seat to seat.
 * (A non-leader's score is frozen once it's skipped and the lead only grows, so a
 * team that drops out never becomes a threat again — the scan always terminates on
 * the leader, who is a threat to itself.) */
function nextRound() {
  const best = Math.max(...state.scores);
  let next = (state.activeTeam + 1) % state.teamCount;
  if (best >= state.targetScore) {
    while (state.scores[next] + MAX_ROUND_POINTS < best) {
      next = (next + 1) % state.teamCount;
    }
  }
  state.activeTeam = next;
  beginRound();
}

/**
 * Whether the game is over. Once a team reaches the target score, only rivals that
 * can still tie-or-beat the leader keep playing (nextRound skips the rest) — and
 * the game ends as soon as none are left. A rival still owed a turn this cycle (an
 * index after the active team) can add up to MAX_ROUND_POINTS, so it counts as a
 * live threat; a team already past its turn this cycle, or one that can't reach the
 * leader even with a perfect round, does not. A tie at the top keeps a live threat
 * on the board, so play runs on in sudden death until one team pulls ahead for
 * good. Co-op (one team) has no target, so it never ends on its own — the table
 * ends it themselves.
 *
 * @returns {boolean}
 */
function gameDecided() {
  if (state.teamCount < 2) return false;
  const best = Math.max(...state.scores);
  if (best < state.targetScore) return false;
  const leaderIdx = state.scores.indexOf(best);
  // Any rival who could still reach the leader keeps the game going — including a
  // team already level at the top (it can tie again → sudden death). Teams still
  // owed a turn this cycle can add up to MAX_ROUND_POINTS; teams that already
  // played this cycle cannot until the next one, which only happens on a tie.
  for (let i = 0; i < state.teamCount; i++) {
    if (i === leaderIdx) continue;
    const owed = i > state.activeTeam ? MAX_ROUND_POINTS : 0;
    if (state.scores[i] + owed >= best) return false;
  }
  return true;
}

/** @returns {boolean} Whether play has reached the target but isn't over yet —
 * the "overtime" stretch where trailing teams still get their equalising turn and
 * any tie at the top forces another full cycle. (If a reveal is on screen the game
 * can't already be decided, so "some team is at the target" is enough to know.) */
function inOvertime() {
  return state.teamCount > 1 && Math.max(...state.scores) >= state.targetScore;
}

// --- screens ---------------------------------------------------------------

/**
 * The hub knob at the dial's pivot — the game's one control. Pressing it
 * advances the step (reveal → guess → result → next). It's deliberately the same
 * red knob the needle pivots on, so the dial reads as a single physical device.
 *
 * @param {string} label @param {string} aria @param {() => void} onPress
 * @returns {HTMLElement}
 */
function knobButton(label, aria, onPress) {
  const btn = /** @type {HTMLButtonElement} */ (el('button', 'dial__knob'));
  btn.type = 'button';
  btn.setAttribute('aria-label', aria);
  btn.append(el('span', 'dial__knob-label', label));
  btn.addEventListener('click', onPress);
  // A press on the knob must not also start a needle drag on the dial beneath it.
  btn.addEventListener('pointerdown', (e) => e.stopPropagation());
  return btn;
}

/**
 * A small "End" affordance in the dial's top-left corner — the way to stop a
 * game early (the only exit from an open-ended co-op session).
 *
 * @returns {HTMLElement}
 */
function exitButton() {
  const btn = /** @type {HTMLButtonElement} */ (el('button', 'dial__exit', 'End'));
  btn.type = 'button';
  btn.setAttribute('aria-label', 'End game and see results');
  btn.addEventListener('click', () => {
    state.phase = 'gameover';
    render();
  });
  btn.addEventListener('pointerdown', (e) => e.stopPropagation());
  return btn;
}

/**
 * The compact status chip in the dial's top-right corner: whose turn it is and
 * the running score (co-op shows just the score). Small enough to tuck into the
 * empty corner of the half-disc without ever shifting the dial.
 *
 * @returns {HTMLElement}
 */
function playStatus() {
  const wrap = el('div', 'status');
  if (state.teamCount === 1) {
    wrap.append(el('span', 'status__turn', `Score ${state.scores[0]}`));
    return wrap;
  }
  const turn = el('span', 'status__turn', `Team ${state.activeTeam + 1}`);
  turn.style.color = teamColor(state.activeTeam);
  wrap.append(turn);
  const scores = el('div', 'status__scores');
  for (let i = 0; i < state.teamCount; i++) {
    const n = el('span', 'status__num', String(state.scores[i]));
    n.style.color = teamColor(i);
    if (i === state.activeTeam) n.classList.add('status__num--active');
    scores.append(n);
  }
  wrap.append(scores);
  return wrap;
}

/**
 * A spectrum end label, pinned to a bottom corner of the dial — where that end
 * of the scale actually sits (p=0 left, p=100 right), like the printed words on
 * the physical board.
 *
 * @param {'left' | 'right'} side @param {string} text @returns {HTMLElement}
 */
function spectrumEnd(side, text) {
  return el('span', `dial__end dial__end--${side}`, text);
}

/**
 * A points number that floats up over the dial on the reveal, then fades — the
 * brief feedback that replaces the old result banner. Positioned absolutely, so
 * it never moves the dial.
 *
 * @param {number} pts @returns {HTMLElement}
 */
function pointsPop(pts) {
  return el('div', `points-pop points-pop--p${pts}`, `+${pts}`);
}

/**
 * Build a play screen: the full-bleed dial with every control overlaid into its
 * corners. Reveal, guess and result all go through here with the same skeleton,
 * so only the dial's contents (wedge, needle) and the knob label change between
 * steps — the graphic itself holds a steady, static position.
 *
 * @param {Object} opts
 * @param {boolean} opts.showWedge   Reveal the target bands.
 * @param {string} opts.knobLabel    Text on the hub knob.
 * @param {string} opts.knobAria     Accessible label for the knob.
 * @param {() => void} opts.onKnob   What pressing the knob does.
 * @param {string} [opts.caption]    A centred note on the dial face (hand-off).
 * @param {boolean} [opts.showExit]  Show the "End" affordance.
 * @param {number} [opts.points]     Float a "+N" over the dial (result step).
 * @returns {HTMLElement}
 */
function renderPlay(opts) {
  const round = state.round;
  if (!round) return renderHome();

  const screen = el('section', 'screen screen--play');
  const dial = el('div', 'dial');

  const built = buildDial({
    showWedge: opts.showWedge,
    target: round.target,
    needle: state.needle,
    interactive: true,
    onInput: (/** @type {number} */ p) => {
      state.needle = p;
    },
  });
  dial.append(built.el);

  dial.append(spectrumEnd('left', round.left), spectrumEnd('right', round.right));
  dial.append(playStatus());
  if (opts.caption) dial.append(el('div', 'dial__caption', opts.caption));
  if (opts.showExit) dial.append(exitButton());
  if (opts.points != null) dial.append(pointsPop(opts.points));
  dial.append(knobButton(opts.knobLabel, opts.knobAria, opts.onKnob));

  screen.append(dial);
  return screen;
}

function renderHome() {
  const screen = el('section', 'screen');
  screen.append(el('h1', 'screen__title', 'Wavelength'));

  const howto = /** @type {HTMLAnchorElement} */ (el('a', 'screen__howto', 'How to play →'));
  howto.href = 'how-to-play.html';
  screen.append(howto);

  screen.append(
    el(
      'p',
      'screen__lede',
      'One player sees a hidden target on the dial and gives a clue. Everyone ' +
        'else swings the needle to find it — the closer you land, the more you score.',
    ),
  );

  screen.append(
    stepper(
      'Teams',
      state.teamCount,
      MIN_TEAMS,
      MAX_TEAMS,
      1,
      (v) => {
        state.teamCount = v;
        save();
        render();
      },
      {
        note:
          state.teamCount === 1
            ? 'Co-op — the whole table plays together'
            : `${state.teamCount} teams take turns as Psychic`,
      },
    ),
  );

  // Teams race to a target score; co-op (one team) just keeps playing, so the
  // goal only appears once there's someone to race.
  if (state.teamCount > 1) {
    screen.append(
      stepper('Play to', state.targetScore, MIN_TARGET, MAX_TARGET, TARGET_STEP, (v) => {
        state.targetScore = v;
        save();
        render();
      }, { note: 'Reach it first to win — ties play on in sudden death' }),
    );
  }

  const start = el('button', 'btn', 'Start game');
  start.addEventListener('click', () => startGame());
  screen.append(start);

  return screen;
}

function renderReveal() {
  const round = state.round;
  if (!round) return renderHome();

  // Hand-off step: the target stays hidden until the Psychic presses the knob to
  // reveal it. This replaces the old pass-the-phone card — the dial is always on
  // screen, so handing the phone over no longer jumps to a different-looking page.
  if (!state.gateOpen) {
    let caption;
    if (state.teamCount > 1) {
      caption = `Pass to Team ${state.activeTeam + 1} · Psychic only`;
      if (inOvertime()) caption = `Sudden death · ${caption}`;
    } else {
      caption = 'Pass to the next Psychic';
    }
    return renderPlay({
      showWedge: false,
      caption,
      knobLabel: 'Reveal',
      knobAria: 'Reveal the target — Psychic only',
      onKnob: () => {
        state.gateOpen = true;
        render();
      },
    });
  }

  // Only the Psychic sees this: the target wedge is revealed. They say their clue
  // out loud, then press the knob to hide it and pass the phone to their team.
  return renderPlay({
    showWedge: true,
    knobLabel: 'Hide',
    knobAria: 'Hide the target and pass to your team',
    onKnob: () => {
      state.needle = 50;
      state.phase = 'guess';
      render();
    },
  });
}

function renderGuess() {
  if (!state.round) return renderHome();

  // The team swings the needle (drag anywhere on the dial) to the Psychic's clue,
  // then presses the knob to lock it in.
  return renderPlay({
    showWedge: false,
    knobLabel: 'Lock',
    knobAria: 'Lock in your guess',
    onKnob: () => lockGuess(),
  });
}

function renderResult() {
  if (!state.round) return renderHome();

  // The wedge is revealed around the locked-in needle — right where your eyes
  // already are, since the dial never moved. The "+N" floats up as feedback, and
  // the score chip ticks up; the knob carries on to the next round.
  const over = gameDecided();
  return renderPlay({
    showWedge: true,
    knobLabel: over ? 'Finish' : 'Next',
    knobAria: over ? 'See the final results' : 'Start the next round',
    onKnob: () => {
      if (over) {
        state.phase = 'gameover';
        render();
      } else {
        nextRound();
      }
    },
    showExit: !over,
    points: state.lastPoints,
  });
}

function renderGameOver() {
  const screen = el('section', 'screen');

  if (state.teamCount === 1) {
    screen.append(el('h2', 'screen__title', 'Well played!'));
    const card = el('div', 'result result--p4');
    card.append(el('span', 'result__pts', String(state.scores[0])));
    const rounds = state.roundsPlayed;
    card.append(
      el('span', 'result__label', `points over ${rounds} ${rounds === 1 ? 'round' : 'rounds'}`),
    );
    screen.append(card);
  } else {
    const best = Math.max(...state.scores);
    const winners = [];
    for (let i = 0; i < state.teamCount; i++) {
      if (state.scores[i] === best) winners.push(i);
    }
    screen.append(
      el(
        'h2',
        'screen__title',
        winners.length > 1 ? 'It’s a tie!' : `Team ${winners[0] + 1} wins!`,
      ),
    );
    screen.append(scoreboard());
  }

  const again = el('button', 'btn', 'Play again');
  again.addEventListener('click', () => startGame());
  screen.append(again);

  const home = el('button', 'btn btn--ghost', 'Home');
  home.addEventListener('click', () => {
    state.phase = 'home';
    render();
  });
  screen.append(home);

  return screen;
}

// --- render ----------------------------------------------------------------

function render() {
  let screen;
  switch (state.phase) {
    case 'reveal':
      screen = renderReveal();
      break;
    case 'guess':
      screen = renderGuess();
      break;
    case 'result':
      screen = renderResult();
      break;
    case 'gameover':
      screen = renderGameOver();
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
export { scoreFor, scoreLabel, randTarget, posAngle, needleRot, sector, SPECTRUMS };
