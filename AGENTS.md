# AGENTS.md

## Project overview

LazyPi is an opinionated installer for the Pi coding agent. It provides a curated catalog of Pi extensions, themes, skills, and workflow tools so users can run one command and get a complete Pi setup.

The CLI is published to npm as `@robzolkos/lazypi`. The main executable is `bin/lazypi.mjs`, with package metadata and install behavior centered around the `PACKAGES` catalog in that file.

## Git guidance

Use Conventional Commits for commit messages, for example `feat: add package to catalog`, `fix: handle package install failure`, or `docs: update package documentation`.

## Site / docs

The site at [lazypi.org](https://lazypi.org) is a Jekyll site in `docs/`, compiled automatically by GitHub Pages on every push to `master`. Source files are in `docs/`, build output (`docs/_site/`) is gitignored.

### Structure

```
docs/
  _config.yml          — Jekyll config (title, url, excludes)
  _layouts/
    default.html       — top-level pages (index, faq, themes): head + nav + content + footer
    docs.html          — docs sub-pages: head + nav + sidebar + docs-shell + content + footer
  _includes/
    nav.html           — shared site nav; active link detected via page.url
    footer.html        — shared footer
    sidebar.html       — docs sidebar; active link detected via page.url
  assets/css/
    site.css           — CSS variables, body, nav, footer (all pages)
    index.css          — landing page styles
    faq.css            — FAQ page styles
    themes.css         — themes page styles
  docs.css             — docs sub-page layout (sidebar, content, tables, callouts)
  index.html           — landing page
  faq.html             — FAQ page
  themes.html          — themes gallery page
  docs/                — docs section
    index.html         — docs overview
    first-steps.html
    installation.html
    updating.html
    removing.html
    packages/          — one page per package
      *.html
```

### Front matter

Every page has a small front matter block at the top:

```yaml
---
layout: default          # or "docs" for docs sub-pages
title: "Page Title"
description: "..."       # optional, used for meta description
extra_css: /assets/css/index.css  # optional, for page-specific styles
---
```

Docs pages use `layout: docs` and need only `title` (description is optional, no extra_css needed).

### Updating the nav or footer

Edit `docs/_includes/nav.html` or `docs/_includes/footer.html`. The change propagates to every page on the next build.

The nav uses Liquid conditionals for the active state:
```liquid
<a href="/faq.html"{% if page.url == '/faq.html' %} class="active"{% endif %}>FAQ</a>
```

No manual `class="active"` maintenance needed — it's automatic.

### Updating the sidebar

Edit `docs/_includes/sidebar.html`. Active state uses the same `page.url` pattern as the nav. When adding a new docs page, add a link here too.

### Adding a new docs page

1. Create `docs/docs/[name].html` (or `docs/docs/packages/[name].html`) with front matter:
   ```yaml
   ---
   layout: docs
   title: "Page Title — LazyPi Docs"
   description: "Optional description."
   ---
   ```
2. Write the page content (HTML, no surrounding boilerplate — the layout provides head/nav/sidebar/footer).
3. Add a `<a href="..." class="sidebar-link ...">` entry to `docs/_includes/sidebar.html`.
4. Add prev/next navigation links at the bottom of the page content using `<nav class="prev-next">`.

### Adding a package page

Package pages live in `docs/docs/packages/`. Use an existing page (e.g. `subagents.html`) as a template:

```html
---
layout: docs
title: "Package Name — LazyPi Docs"
---
<h1>Package Name</h1>
<p class="page-desc">One-line description.</p>

<h2>What it does</h2>
<p>...</p>

<h2>Why it's included</h2>
<p>...</p>

<h2>Commands</h2>
<table>...</table>

<div class="learn-more">
  <a href="https://github.com/..." target="_blank" rel="noopener">→ GitHub — owner/repo</a>
</div>

<nav class="prev-next">
  <a href="/docs/packages/prev-page.html" class="prev-next-link">
    <span class="prev-next-label">Previous</span>← Previous
  </a>
  <a href="/docs/packages/next-page.html" class="prev-next-link next">
    <span class="prev-next-label">Next</span>Next →
  </a>
</nav>
```

### Local preview

Requires Ruby + Bundler (one-time setup):

```bash
cd docs
gem install bundler
bundle install
```

Then:

```bash
npm run docs:serve   # serves at http://localhost:4000 with livereload
```

GitHub Pages uses the `github-pages` gem (specified in `docs/Gemfile`), which pins Jekyll and plugin versions to match what GitHub runs. Local and production output will be identical.

### Changing styles

- **Nav or footer styles** — edit `docs/assets/css/site.css`
- **Docs layout styles** (sidebar, content area, tables, callouts) — edit `docs/docs.css`
- **Landing page styles** — edit `docs/assets/css/index.css`
- **FAQ styles** — edit `docs/assets/css/faq.css`
- **Themes page styles** — edit `docs/assets/css/themes.css`

CSS variables (colors, spacing tokens) are defined at the top of `docs/assets/css/site.css`.

### Adding videos

Videos are driven by `docs/_data/videos.yml`. Each entry has a `category`, `id` (for anchor links), optional `description`, and a list of `videos`:

```yaml
- category: Intro to Pi
  id: intro
  description: "New to Pi? Start here."
  videos:
    - id: dQw4w9WgXcQ       # YouTube video ID (from ?v= in the URL)
      title: "Video title"
      channel: "Channel name"
      duration: "12:34"        # optional, shown as badge on thumbnail (use H:MM:SS for >1hr)
```

The YouTube thumbnail is loaded automatically from `img.youtube.com/vi/{id}/mqdefault.jpg` — no API key needed. Add a video by appending to the right category block in the YAML file. The four categories are `Intro to Pi`, `Full Course Pi`, `Advanced Pi`, and `Slice of Pi`.

### Catalog updates on the landing page

The catalog grid on `docs/index.html` and the themes data array in `docs/themes.html` are maintained manually. When adding a package to the CLI catalog (`PACKAGES` in `bin/lazypi.mjs`), update the catalog grid in `docs/index.html` to match.
