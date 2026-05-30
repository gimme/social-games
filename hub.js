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

const grid = document.getElementById('game-grid');

if (grid) {
  for (const game of games) {
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

    const item = el('li', 'game-card');
    item.append(link);
    grid.append(item);
  }
}
