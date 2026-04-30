# LazyPi

The [Pi](https://github.com/badlogic/pi-mono) coding agent is minimal by design. LazyPi is opinionated by design. Run one command and get a complete, curated Pi setup — everything selected by default, nothing to research, nothing to configure. Remove what you don't want later.

## Quick start

```bash
npx @robzolkos/lazypi
```

LazyPi will:

1. Install `pi` for you if it isn't installed yet.
2. Ask if you want to install all the packages or choose which to install.

That setup includes agent tooling, memory, planning, terminal-native diff review, a Claude Code CLI provider, interactive shell overlays for long-running CLIs, usage tracking, and themes.

That's it.  Once done - run `pi` and experience a feature rich coding agent experience.

Install is **idempotent** — LazyPi reads your Pi settings and skips any package that is already installed, so re-running is safe.

For theme packages, LazyPi also applies a small Pi package filter so duplicate theme IDs do not collide. It keeps both `pi-themes` and `@victor-software-house/pi-curated-themes` installed, but excludes `catppuccin-mocha` and `gruvbox-dark` from `pi-themes` so those two come from the curated themes package.

## Commands

| Command | What it does |
| --- | --- |
| `npx @robzolkos/lazypi` | Install all or selected catalog (interactive picker by default) |
| `npx @robzolkos/lazypi remove <id>` | Remove a catalog package by id (or pass a raw pi source) |
| `npx @robzolkos/lazypi status` | Show which catalog packages are installed, missing, or extra |
| `npx @robzolkos/lazypi update` | Reconcile the catalog and then run `pi update` |
| `npx @robzolkos/lazypi doctor` | Check your environment for common problems |

## Updating

```bash
npx @robzolkos/lazypi update
```

## Removing packages

```bash
npx @robzolkos/lazypi remove
```

Shows an interactive picker of installed packages. Or pass ids directly to skip the picker:

```bash
npx @robzolkos/lazypi remove subagents
npx @robzolkos/lazypi remove npm:pi-subagents@0.13.3   # raw pi source also works
```

There is nothing to "uninstall" for LazyPi itself — `npx` doesn't leave it around.

## Troubleshooting

Run the built-in health check with `npx @robzolkos/lazypi doctor`.

## Site / docs

The site at [lazypi.org](https://lazypi.org) lives in `docs/` and is a Jekyll site compiled by GitHub Pages automatically on push to `master`.

To preview locally (requires Ruby + Bundler):

```bash
cd docs && bundle install   # first time only
npm run docs:serve          # serves at http://localhost:4000 with livereload
```

Shared nav and footer are in `docs/_includes/`. Layouts are in `docs/_layouts/`. CSS variables and nav styles are in `docs/assets/css/site.css`.

## Releasing

LazyPi uses **Release Please** and **npm trusted publishing**.

To release a new version:

- Merge your normal PRs into `master`
- Merge the Release Please release PR when you are ready to publish
- GitHub creates the tag/release and publishes to npm automatically

---

For the full list of included packages and themes, see [lazypi.org](https://lazypi.org).
