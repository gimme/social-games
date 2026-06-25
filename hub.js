// @ts-check
import { games } from './games.js';

/**
 * Tiny element helper. Text is set via textContent, so values from the manifest
 * can never inject markup.
 *
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
 * The hub's sections, in display order. Each pulls the games of one `kind` out
 * of the manifest, so adding a game to games.js drops it into the right place.
 *
 * @type {Array<{ kind: import('./games.js').Game['kind'], title: string, subtitle?: string }>}
 */
const SECTIONS = [
  { kind: 'game', title: 'Featured', subtitle: 'Games the phone runs for you.' },
  {
    kind: 'guide',
    title: 'How to play',
    subtitle: 'Rules and refreshers for games the phone doesn’t run — yet.',
  },
];

/**
 * Build one game/guide card (an <li>).
 *
 * @param {import('./games.js').Game} game
 */
function card(game) {
  const link = el('a', 'game-card__link');
  /** @type {HTMLAnchorElement} */ (link).href = game.path;

  const emoji = el('span', 'game-card__emoji', game.emoji);
  emoji.setAttribute('aria-hidden', 'true');

  const body = el('span', 'game-card__body');
  body.append(
    el('span', 'game-card__name', game.name),
    el('span', 'game-card__tagline', game.tagline),
    el('span', 'game-card__players', game.players),
  );

  link.append(emoji, body);
  if (game.kind === 'guide') link.append(el('span', 'game-card__badge', 'Guide'));

  const item = el('li', 'game-card');
  item.append(link);
  return item;
}

const root = document.getElementById('hub-sections');

if (root) {
  for (const section of SECTIONS) {
    const entries = games.filter((g) => g.kind === section.kind);
    if (entries.length === 0) continue;

    const wrap = el('section', 'hub__section');
    const head = el('div', 'hub__section-head');
    head.append(el('h2', 'hub__section-title', section.title));
    if (section.subtitle) head.append(el('p', 'hub__section-sub', section.subtitle));
    wrap.append(head);

    const grid = el('ul', 'game-grid');
    for (const game of entries) grid.append(card(game));
    wrap.append(grid);

    root.append(wrap);
  }
}
