# Social Games

A little hub of **pass-the-phone party games** — pick a game, hand the phone
around the table, and play. The phone is just a tool for the fiddly bits
(handing out secret roles, picking who starts); the real game happens in the
conversation around it.

Built to be hosted for free on **GitHub Pages**. No accounts, no server, no
internet needed once the page has loaded.

## Games

| Game | Players | What it does |
| --- | --- | --- |
| 🕵️ Impostor | 3+ | Players fill the word pool; everyone gets the same secret word — except the impostor. |

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
hub.js, hub.css    renders the list of games
games.js           the one place the hub lists its games
shared/tokens.css  shared theme (colors, spacing) — optional for a game to use
impostor/          a self-contained game (folder name = its URL)
  index.html
  impostor.js
  impostor.css
jsconfig.json      editor type-checking for the plain JS (no build, just hints)
```

Types are checked in your editor via `// @ts-check` + JSDoc comments and
`jsconfig.json`. This is purely an editor aid — nothing is compiled.

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

## Deploy to GitHub Pages

Push to GitHub, then in **Settings → Pages**, set the source to **Deploy from a
branch**, branch `main`, folder `/ (root)`. The site is live a moment later — no
Actions or build step required.
