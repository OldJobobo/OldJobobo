# Profile maintenance

`README.md` is the profile overview. `THEMES.md` is the visual catalog. Personal copy, the Splinterm and THPM features, and supporter names are edited manually. Their preview illustrations are self-contained SVG files in `assets/`; they are not application screenshots and do not load external fonts or images.

## Visual layout

The profile uses the Last Call palette: deep green-charcoal (`#0b1d20`), turquoise (`#00c6c2`), muted blue-gray (`#94b3b5`), and pale foregrounds (`#e0f5f2`). Artwork uses the theme's other ANSI and semantic colors for secondary surfaces and details; light-mode dividers use darker accents for readability. The original Splinterm logo keeps its own colors. GitHub controls ordinary text/link colors, and Shields controls live badge lettering. Featured artwork, descriptions, live release/star badges, and repository links are grouped in full-width HTML tables. Keep descriptions and links as real HTML text rather than baking them into images.

- `assets/splinterm-logo.svg`: original Splinterm head-logo paths and colors from `dist/icons/com.oldjobobo.splinterm.svg` at upstream revision `dadbe2709fd84e0376b32e2befec9399c0efd7ff`, with editor metadata removed. The card embeds these vectors to remain self-contained; update both copies together.
- `assets/*-preview.svg`: matching 1120 × 560 product illustrations. Status labels are manually maintained; releases and star counts remain live Shields badges in the README.
- `assets/section-*.svg` and `assets/footer-*.svg`: paired light/dark artwork selected with `<picture>`. Update both variants together. Section artwork increases its internal text size at narrow widths.
- Featured themes: two rows of three previews—Miasma, Lumon, Retro 82, Sakura Mochi, Event Horizon, and Last Call. These are manually curated in the README; the full gallery remains separately generated.
- More projects: generated two-column HTML panels, with escaped upstream names and descriptions. Odd selections retain a balanced final row.
- Core stack: native `<code>` chips; tools and languages wrap without a single wide badge image.

GitHub controls typography, link colors, table borders, and spacing. Do not add stylesheet/class dependencies, scripts, or iframe embeds to the README. Native tables retain their columns on mobile rather than reproducing the CSS mockup's stacking. Light/dark picture sources follow the browser's color-scheme media query; check both schemes and the actual GitHub page after publishing.

Local visual studies live in the ignored `.profile-proof/` directory and are not publishable profile assets.

## Generate and check

Requires Node.js 22 or newer. No dependency installation is needed.

```sh
node --test scripts/generate-profile.test.mjs
node scripts/generate-profile.mjs
node scripts/generate-profile.mjs --check
git diff --check
git diff -- README.md THEMES.md
```

Generation and `--check` use the public GitHub API and raw repository files. Set `GITHUB_TOKEN` or `GH_TOKEN` if authenticated API access is needed. `--check` (also `--dry-run`) reports drift without writing files.

The workflow in `.github/workflows/update-profile.yml` runs daily and can be started manually. It tests the generator before updating and committing generated regions. Keep all `profile:*` and `themes:*` start/end markers intact.

## Project selection

Edit `seededProjects` in `scripts/generate-profile.mjs` to curate the More projects table. A public repository with the `profile-project` topic is also included. `featuredProjects` excludes the manually illustrated features from this table so they are not duplicated, even when tagged. `retiredProjects` excludes deprecated projects even when tagged; ThemeManager+ is retired. Private, archived, disabled, and fork repositories are excluded.

Explicit selections keep their listed order. Topic-selected additions follow them, with `profile-featured` entries first, then latest push time. A recent push is not treated as proof of active maintenance.

Jobo Themes and Based have short factual summaries in `projectDescriptions`. Other descriptions come from GitHub repository metadata. Review manual summaries and feature copy when capabilities or release status change; that copy is not refreshed automatically. The table does not display inferred status or language labels. Feature release badges include prereleases and link to each repository's releases.

## Theme discovery

New themes opt in with `.omarchy-theme.yml`, as documented in `THEMES.md`. The metadata reader supports simple one-line scalars, not general YAML or multiline descriptions. Existing seeded themes can use a fallback category when their marker is absent; a present marker always takes precedence.

Previews use the default branch and the metadata `preview` path, or `preview.png` when omitted. Missing markers and explicit exclusions are logged. A missing preview for an included theme or a network/server failure stops generation before either Markdown file is written.

`SKIP_PREVIEW_CHECK=1` skips preview requests. `SKIP_THEME_METADATA_CHECK=1` bypasses metadata discovery and its opt-in requirement but still checks previews unless both flags are set. These are diagnostic overrides; the daily workflow uses neither.

## Manual review

- Check the profile and gallery on GitHub at desktop and mobile widths.
- Confirm images load and project links point to the intended repositories.
- Review newly discovered names, categories, and any upstream descriptions.
- Do not add themes without metadata merely to silence a skip warning. Add the marker in the owning theme repository through a separately authorized change.
