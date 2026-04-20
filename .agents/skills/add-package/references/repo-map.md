# LazyPi repository map

This reference exists to help the `add-package` skill understand how LazyPi is organized.

## Core installer logic

### `bin/lazypi.mjs`

This is the main source of truth for installable catalog entries.

Important structures:

- `CATEGORIES` defines the allowed catalog groups.
- `PACKAGES` is the catalog used by install, status, update, and remove flows.
- Some packages have special install behavior elsewhere in the file.

When adding a package, inspect whether similar packages are grouped together and keep the local ordering/style.

## CI

### `.github/workflows/test.yml`

This workflow installs LazyPi and asserts that expected package sources appear in Pi's `settings.json`.

If you add a package to the default LazyPi catalog, inspect whether the workflow's expected package list must be updated as well.

## Public docs

### `README.md`

High-level project overview and user-facing command examples.

Update only when the catalog summary, package counts, or notable capabilities materially change.

### `docs/docs/index.html`

The docs overview page. It includes:

- sidebar navigation
- high-level package counts and summary text
- command summaries

If package counts or major capability summaries change, update them here.

### `docs/docs/packages/index.html`

The package directory page.

Important notes:

- this page is hand-authored HTML
- package cards are written manually
- not every package in `PACKAGES` necessarily has a dedicated card/page today
- if you add a new user-facing package page, update this index consistently

### `docs/docs/packages/*.html`

Detailed per-package docs pages.

These pages share a common structure:

- same nav bar
- same sidebar block
- `<h1>` title
- `.page-desc`
- sections like "What it does" and "Why it's included"
- optional commands/usage tables
- a "Learn more" link block
- previous/next navigation
- shared footer

Crucially, the sidebar package links are duplicated across many pages. If you add a new package page, you may need to update multiple HTML files so the sidebar stays coherent.

## Themes

### `docs/themes.html`

Theme packages are surfaced differently from general package docs.

This page contains:

- total theme count text
- per-theme tiles
- package-group filters such as `pi-themes`, `pi-curated-themes`, `pi-hackerman`, etc.

If a new package is primarily a theme package, inspect whether the right update is here, not just in `docs/docs/packages/`.

## Documentation strategy hints

Use judgment based on existing repo patterns:

- major user-facing package → dedicated docs page is likely appropriate
- auxiliary/support package → may only need mention in related docs, or limited updates
- theme package → likely belongs in `docs/themes.html`, and maybe elsewhere if the site already documents theme packages in multiple places

The key requirement is consistency with the repo as it exists now.

## Typical checklist for adding a package

1. Inspect upstream package docs.
2. Add a `PACKAGES` entry in `bin/lazypi.mjs`.
3. Decide whether special install logic is needed.
4. Update `.github/workflows/test.yml` if the package is part of the default installed catalog.
5. Decide the right documentation surface.
6. Update duplicated navigation where required.
7. Search for stale counts like `23` or theme totals.
8. Summarize any assumptions.
