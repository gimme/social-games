# Social Games

A little hub of **pass-the-phone party games** — pick a game, hand the phone
around the table, and play. The phone is just a tool for the fiddly bits
(handing out secret roles, picking who starts); the real game happens in the
conversation around it.

Built to be hosted for free on **GitHub Pages**. No accounts, no server, no
internet needed once the page has loaded.

## Games

The home page has two sections: **Featured** games the phone actually runs, and
**How to play** — reference cards for games the phone doesn't run (yet).

| Featured | Players | What it does |
| --- | --- | --- |
| 🕵️ Impostor | 3+ | Players fill the word pool; everyone gets the same secret word — except the impostor. |
| 🎚️ Wavelength | 2+ | A Psychic clues a target hidden on a half-moon dial; the team swings the needle to find it and scores by how close they land. |

Plus **how-to-play guides** for 16 more party games — Impostor Q&A, Just One,
Werewords, Who Am I?, Heads Up, Family Feud, 8 Words, Word Chain Link, Who Knows
Most?, Don't Copy My Answer, I Can Name…, I'm Going Camping, Mind Meld, Top 5
Picks, Form a Word, and the 12345678 Rhythm challenge. These are
rules-and-refreshers cards; some are natural candidates to grow into full
phone-run games later.

## How it's built

Plain HTML, CSS, and JavaScript (ES modules). **No build step** — what's in the
repo is exactly what ships.

Each game lives in its own folder at the repo root (the folder name is its URL,
e.g. `/impostor/`) and is fully self-contained: a game never imports another
game or the hub. The hub only learns about a game through one entry in
`games.js`. That keeps games completely decoupled — you can add or delete one
without touching anything else.

```
index.html         the hub / home page
hub.js, hub.css    renders the list of games, split into Featured / How to play
games.js           the one place the hub lists its games and guides
sw.js              service worker: keeps an offline copy of the whole site
shared/tokens.css  shared theme (colors, spacing) — optional for a game to use
shared/guide.css   shared styling for the how-to-play guide pages
impostor/          a self-contained game (folder name = its URL)
  index.html
  impostor.js
  impostor.css
just-one/          a how-to-play guide — a self-contained folder, like a game
  index.html
jsconfig.json      editor type-checking for the plain JS (no build, just hints)
```

Types are checked in your editor via `// @ts-check` + JSDoc comments and
`jsconfig.json`. This is purely an editor aid — nothing is compiled.

Offline support comes from `sw.js`, a service worker that precaches the hub and
every folder listed in `games.js`, then answers every request **network-first**:
while online you always see the latest deploy (the cache is only a fallback for
bad or missing signal), and once a device has opened the hub, the whole site
keeps working with no connection. Adding a game needs no service-worker change —
the games.js entry is enough. The `VERSION` constant in `sw.js` only needs a
bump to purge files you deleted or renamed.

## Run it locally

Because the pages use ES modules, open the site through a local web server
rather than double-clicking the file. A `Makefile` wraps it:

```bash
make serve            # then open the URL it prints
make serve PORT=9000  # use a different port
```

This serves the folder with HTTP caching disabled, so your edits show up on a
plain refresh — including on mobile browsers like Samsung Internet, which
otherwise cache `*.js`/`*.css` and keep serving stale files. (Plain `python3 -m
http.server` is the one that *doesn't* disable caching.)

It's pure Python and **dev-only** — nothing ships. GitHub Pages serves the raw
files exactly as they are in the repo.

## Add a new game

1. Create a folder `<your-game>/` at the repo root with its own `index.html`,
   JS, and CSS. Copying `impostor/` is the easiest start. (Avoid names that
   clash with existing root files/folders like `shared` or `hub`.)
2. Add one entry to the `games` array in `games.js`, with `path` set to
   `'<your-game>/'`.
3. That's it — it shows up on the home page.

Keep each game standalone: don't import from other games. Using
`shared/tokens.css` for a consistent look is fine and encouraged. Inside a game,
link it as `../shared/tokens.css`.

## Add a how-to-play guide

A guide is just a game folder with no game in it yet:

1. Create a folder `<your-id>/` with a static `index.html` rules page. Copying
   an existing guide (e.g. `just-one/`) is the easiest start — link
   `../shared/tokens.css` and `../shared/guide.css` for the shared look.
2. Add one entry to `games.js` with `kind: 'guide'` and `path: '<your-id>/'`.

When a guide grows into a full phone-run game, keep the folder and its URL:
`index.html` becomes the app, move the rules into `how-to-play.html` (as
`impostor/` does), and flip `kind` to `'game'`.

## Deploy to GitHub Pages

Push to GitHub, then in **Settings → Pages**, set the source to **Deploy from a
branch**, branch `main`, folder `/ (root)`. The site is live a moment later — no
Actions or build step required.
