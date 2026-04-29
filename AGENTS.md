# AGENTS.md

## Project overview

LazyPi is an opinionated installer for the Pi coding agent. It provides a curated catalog of Pi extensions, themes, skills, and workflow tools so users can run one command and get a complete Pi setup.

The CLI is published to npm as `@robzolkos/lazypi`. The main executable is `bin/lazypi.mjs`, with package metadata and install behavior centered around the `PACKAGES` catalog in that file. Public documentation is hand-authored static HTML under `docs/`.


## Git guidance

Use Conventional Commits for commit messages, for example `feat: add package to catalog`, `fix: handle package install failure`, or `docs: update package documentation`.
