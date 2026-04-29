---
name: add-package
description: Add a new package to the LazyPi repository. Use when asked to add a Pi package URL or install source to LazyPi, update the installer catalog, and create or update the matching documentation.
---

# Add Package to LazyPi

Use this skill for this repository only.

Invoke it with:

```text
/skill:add-package <url-or-pi-source>
```

Pi appends the command arguments to this skill as `User: <args>`.

## Goal

Add a new package to LazyPi in a way that matches the repository's existing structure and conventions.

That means you must do more than just append a package object. You need to inspect how this repo currently:

- stores package metadata for installation
- categorizes packages
- handles package-specific install quirks
- presents package documentation
- maintains navigation, counts, and summaries

## First: inspect the repository before editing

Always read these files first:

- `bin/lazypi.mjs`
- `README.md`
- `.github/workflows/test.yml`
- `docs/docs/index.html`
- `docs/docs/packages/index.html`
- `docs/themes.html`

Then read the repository map:

- [references/repo-map.md](references/repo-map.md)

Then read at least two existing package docs pages that are closest to the new package in category and style. Prefer pages from `docs/docs/packages/` that resemble the new package.

## Input normalization

The user may give you:

- an npm package name or npm URL
- a GitHub URL
- a git install source
- a raw Pi install source such as `npm:foo` or `git:github.com/org/repo`

Normalize that into the LazyPi catalog `source` format used in `bin/lazypi.mjs`.

Examples:

- npm package → `npm:<name>` or pinned form if this repo clearly uses a pin for that package
- GitHub repo → `git:github.com/<owner>/<repo>` or a pinned ref if the repo's existing conventions suggest it

Do not invent pins unless there is a good reason.

## Determine the package metadata

Work out the following before editing:

- `id`
- `category`
- `source`
- short `description`
- short `hint`
- docs title
- docs slug / filename
- whether the package needs a dedicated docs page, a themes-page update, or both

Use the repository's current naming style, not the upstream project's exact wording, if that wording is inconsistent with LazyPi.

## Category rules

LazyPi currently uses these categories in `bin/lazypi.mjs`:

- `core`
- `ui`
- `research`
- `frameworks`
- `themes`

Choose the single best fit.

## Required implementation steps

### 1) Inspect upstream package details

Before editing, inspect the upstream package enough to understand:

- what it actually does
- how users access it inside Pi
- whether it is user-facing or just a support dependency
- whether it needs auth, environment variables, setup, or repair logic
- whether it is a theme package

Use the package's docs, README, package metadata, and install instructions as needed.

### 2) Update the installer catalog

Add the package to `PACKAGES` in `bin/lazypi.mjs`.

Follow existing conventions:

- preserve category grouping and nearby ordering
- keep object formatting consistent
- write a concise `description`
- write a practical `hint`

### 3) Add special-case install logic only if justified

Inspect whether the package needs special handling.

Examples already present in this repo include:

- subagent settings overrides

If the new package needs special handling, place it near the relevant existing install/settings logic and explain it briefly in code comments only when necessary.

If the package does **not** need special logic, do not add any.

### 4) Update documentation

Work out the right documentation surface based on how this repo is already organized.

Typical cases:

- user-facing non-theme package → add `docs/docs/packages/<slug>.html`
- theme package → update `docs/themes.html`, and add package docs only if the existing docs structure suggests it belongs there
- support/auxiliary package → decide whether it deserves its own page or should be documented indirectly through a related page

When creating a dedicated package page, match the structure of existing pages:

- title
- one-line page description
- "What it does"
- "Why it's included"
- commands or usage notes if relevant
- "Learn more" link to upstream project
- previous/next nav
- footer and sidebar structure matching the existing docs pages

### 5) Update navigation, docs, and CI expectations

If the new docs page is user-facing, update all places that should link to it.

This repo uses hand-authored static HTML, so navigation is duplicated across files. Do not assume there is a generator.

Also inspect CI. The GitHub Actions workflow may assert that specific default package sources are installed, so adding a package to the default LazyPi catalog may require updating workflow expectations.

Check and update as needed:

- `.github/workflows/test.yml`
- `docs/docs/packages/index.html`
- sidebars in docs pages that list package pages
- `docs/docs/index.html`
- `README.md`
- `docs/themes.html`
- any package-count text such as "23 packages" or theme counts

### 6) Validate before finishing

At minimum:

- search for outdated package counts or stale navigation
- verify the new slug/path is linked correctly
- verify formatting in `bin/lazypi.mjs` matches surrounding entries
- verify `.github/workflows/test.yml` still reflects the default installed catalog when applicable
- verify the package category and source are defensible
- call out any uncertainty about pins, categories, or whether a package should have a dedicated page

## Editing principles

- Prefer small, precise edits.
- Preserve the tone and formatting already used in this repo.
- Do not rewrite unrelated docs.
- Do not remove existing packages unless explicitly asked.
- If the package is ambiguous, ask a clarifying question before making risky assumptions.

## Final response

When done, summarize:

- chosen `id`
- chosen `category`
- chosen `source`
- files changed
- any special install logic added
- any assumptions or follow-up review items
