# Repository Guidelines

## Project Structure & Module Organization
This repository is documentation-first and currently contains two primary Markdown documents:
- `README.md`: profile-facing overview, selected tools, themes, and supporters.
- `THEMES.md`: visual Omarchy theme gallery with external repository links and preview images.
- `scripts/generate-profile.mjs`: GitHub-backed project and gallery generation.
- `scripts/generate-profile.test.mjs`: dependency-free Node.js tests.
- `docs/profile-maintenance.md`: selection rules, generator commands, and manual checks.

Keep new content in Markdown unless there is a clear need for scripts/assets. If you add files, group them by purpose (for example, `docs/`, `assets/`, `scripts/`) and keep paths short and descriptive.

## Build, Test, and Development Commands
There is no compile/build pipeline in this repository. Use lightweight content checks before opening a PR:
- `rg --files`: quick inventory of files.
- `node --test scripts/generate-profile.test.mjs`: run generator tests (Node.js 22+).
- `node scripts/generate-profile.mjs`: regenerate project tables and galleries using GitHub.
- `node scripts/generate-profile.mjs --check`: verify generated content without writing.
- `git diff --check`: catch whitespace errors.
- `markdownlint "**/*.md"` (if installed): enforce Markdown consistency.
- `git diff -- README.md THEMES.md`: verify only intended documentation edits.

If you introduce tooling, document exact setup and commands in this file and in `README.md`.

## Coding Style & Naming Conventions
- Use Markdown headings in logical order (`#`, `##`, `###`) and keep sections scannable.
- Prefer short paragraphs and flat bullet lists.
- Use sentence case for headings and concise, imperative wording for edits.
- File names should be uppercase for top-level docs already following that pattern (`README.md`, `THEMES.md`); use kebab-case for any new non-root docs.
- Preserve existing HTML-in-Markdown patterns where already used for gallery/table layout.

## Testing Guidelines
Run the generator tests and check generated content, then validate rendering manually:
- Confirm links and image URLs render correctly in GitHub preview.
- Check table/layout changes on desktop and mobile-width preview.
- Re-open edited files to catch broken Markdown structure.

When possible, include before/after screenshots for major visual layout changes.

## Commit & Pull Request Guidelines
Recent history favors short, imperative commit subjects (examples: `Refine README theme gallery section`, `Fix theme gallery table cell ordering`).
- Keep commit subjects focused on one change.
- Avoid bundling unrelated README/THEMES updates.

PRs should include:
- A brief summary of what changed and why.
- Files touched (`README.md`, `THEMES.md`, etc.).
- Screenshots for visible gallery/layout updates.
- Any follow-up tasks or known limitations.
