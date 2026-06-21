#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const owner = process.env.PROFILE_OWNER || "OldJobobo";
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";
const apiBase = process.env.GITHUB_API_URL || "https://api.github.com";
const dryRun = process.argv.includes("--check") || process.argv.includes("--dry-run");
const skipPreviewCheck = process.env.SKIP_PREVIEW_CHECK === "1";
const skipThemeMetadataCheck = process.env.SKIP_THEME_METADATA_CHECK === "1";

const topics = {
  project: "profile-project",
  featured: "profile-featured",
  archived: "profile-archived",
};

const seededProjects = [
  "wayflipper",
  "theme-manager-plus",
  "dotfiles",
  "oldjobobo-custom-omarchy-templates",
  "make-colors",
  "jobowalls",
  "based",
  "aether",
  "collago",
  "omapal",
];

const seededProductivityThemes = [
  "omarchy-the-navigator-theme",
  "omarchy-biscuit-de-mar-dark-theme",
  "omarchy-miasma-theme",
  "omarchy-deckard-theme",
  "omarchy-x-1632-theme",
  "omarchy-city-783-theme",
  "omarchy-flat-dracula-theme",
  "omarchy-hex-theme",
  "omarchy-hinterlands-theme",
  "omarchy-monolith-theme",
  "omarchy-phosphor-os-theme",
  "omarchy-grimdark-solarized-theme",
  "omarchy-waffle-cat-theme",
  "omarchy-retro-82-theme",
  "omarchy-lumon-theme",
  "omarchy-sakura-mochi-theme",
  "omarchy-gruvbox-theme",
  "omarchy-windows-dark-mode-theme",
];

const seededNoveltyThemes = [
  "omarchy-florida-man-theme",
  "omarchy-dune-theme",
  "omarchy-batman-theme",
  "omarchy-caroline-skyline-theme",
  "omarchy-event-horizon-theme",
  "omarchy-the-loop-theme",
  "omarchy-ghosts-i-theme",
  "omarchy-awakening-theme",
  "omarchy-watchmen-theme",
  "omarchy-01-theme",
  "omarchy-breaking-bad-theme",
  "omarchy-killer-klownz-theme",
  "omarchy-kings-theme",
  "omarchy-dune-messiah-theme",
];

const projectOrder = new Map(seededProjects.map((name, index) => [name, index]));
const productivityOrder = new Map(seededProductivityThemes.map((name, index) => [name, index]));
const noveltyOrder = new Map(seededNoveltyThemes.map((name, index) => [name, index]));

const excludedThemeRepos = new Set([
  // GitHub does not currently report this repository as a fork, but it is
  // upstream-derived and should not appear in the personal theme gallery.
  "omarchy-eldritch-theme",
]);

const themeNameOverrides = new Map([
  ["omarchy-biscuit-de-mar-dark-theme", "Biscuit de Mar Dark"],
  ["omarchy-phosphor-os-theme", "Phosphor OS"],
]);

const projectMetadataOverrides = new Map([
  ["wayflipper", { description: "Switches Waybar themes fast for users managing multiple visual setups.", language: "Shell" }],
  ["theme-manager-plus", { description: "Alternative Omarchy theme manager for streamlined desktop theming workflows.", language: "Shell" }],
  ["dotfiles", { description: "Personal Linux desktop and Omarchy dotfiles for reproducible setup and config workflows.", language: "Shell" }],
  ["oldjobobo-custom-omarchy-templates", { description: "Custom Omarchy templates for faster personal theme scaffolding and customization.", language: "Shell" }],
  ["make-colors", { description: "Generates `colors.toml` files for existing Omarchy themes.", language: "Shell" }],
  ["jobowalls", { description: "Alternative wallpaper picker and manager for Omarchy.", language: "Rust" }],
  ["based", { description: "Base16/Base24 colorscheme editor for theme authoring.", language: "Rust" }],
  ["aether", { description: "Tooling for creating Omarchy themes more quickly.", language: "Go" }],
  ["collago", { description: "Declarative collage wallpaper generator.", language: "Go" }],
  ["omapal", { description: "Theme coloring tool for Omarchy themes.", language: "Python" }],
]);

const markers = {
  projects: ["<!-- profile:projects:start -->", "<!-- profile:projects:end -->"],
  productivity: ["<!-- themes:productivity:start -->", "<!-- themes:productivity:end -->"],
  novelty: ["<!-- themes:novelty:start -->", "<!-- themes:novelty:end -->"],
};

async function main() {
  const repos = await getAllRepos();
  const publicRepos = repos.filter((repo) => !repo.private && (!repo.archived || hasTopic(repo, topics.archived)));
  const themeDiscovery = await discoverThemeGalleryRepos(publicRepos, {
    fileExists: githubFileExists,
    readTextFile: githubReadTextFile,
    requireFiles: !skipThemeMetadataCheck,
  });
  const projectRepos = publicRepos.filter(isProjectRepo);

  if (!skipPreviewCheck && themeDiscovery.skipped.some((item) => item.reason === "missing preview.png")) {
    const missing = themeDiscovery.skipped
      .filter((item) => item.reason === "missing preview.png")
      .map((item) => `${item.repo.name}: ${rawPreviewUrl(item.repo)}`);
    throw new Error(`Theme preview.png check failed:\n${missing.join("\n")}`);
  }

  const nextReadme = replaceGeneratedRegion(
    await readFile("README.md", "utf8"),
    markers.projects,
    renderProjectTable(sortRepos(projectRepos, projectOrder)),
  );

  const nextThemes = replaceGeneratedRegion(
    replaceGeneratedRegion(
      await readFile("THEMES.md", "utf8"),
      markers.productivity,
      renderThemeGallery(sortRepos(themeDiscovery.productivity, productivityOrder)),
    ),
    markers.novelty,
    renderThemeGallery(sortRepos(themeDiscovery.novelty, noveltyOrder)),
  );

  if (dryRun) {
    const currentReadme = await readFile("README.md", "utf8");
    const currentThemes = await readFile("THEMES.md", "utf8");
    if (currentReadme !== nextReadme || currentThemes !== nextThemes) {
      throw new Error("Generated profile output is out of date. Run node scripts/generate-profile.mjs.");
    }
    console.log("Profile Markdown is up to date.");
    return;
  }

  await writeFile("README.md", nextReadme);
  await writeFile("THEMES.md", nextThemes);
  console.log(`Updated README.md and THEMES.md from ${repos.length} ${owner} repositories.`);
}

async function getAllRepos() {
  const repos = [];
  let page = 1;

  while (true) {
    const batch = await githubJson(`/users/${owner}/repos?type=owner&sort=updated&per_page=100&page=${page}`);
    repos.push(...batch);
    if (batch.length < 100) break;
    page += 1;
  }

  return repos;
}

async function githubJson(path) {
  const response = await fetch(`${apiBase}${path}`, {
    headers: githubHeaders(),
  });

  if (!response.ok) {
    throw new Error(`GitHub API request failed: ${response.status} ${response.statusText} ${path}`);
  }

  return response.json();
}

function githubHeaders() {
  return {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "oldjobobo-profile-generator",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function githubFileExists(repo, path) {
  const response = await fetch(rawRepoFileUrl(repo, path), { method: "HEAD", headers: { "User-Agent": "oldjobobo-profile-generator" } });
  return response.ok;
}

async function githubReadTextFile(repo, path) {
  const response = await fetch(rawRepoFileUrl(repo, path), { headers: { "User-Agent": "oldjobobo-profile-generator" } });
  if (!response.ok) {
    throw new Error(`Unable to read ${path} from ${repo.name}: ${response.status} ${response.statusText}`);
  }
  return response.text();
}

async function discoverThemeGalleryRepos(repos, options = {}) {
  const fileExists = options.fileExists || githubFileExists;
  const readTextFile = options.readTextFile || githubReadTextFile;
  const requireFiles = options.requireFiles !== false;
  const productivity = [];
  const novelty = [];
  const skipped = [];

  for (const repo of repos) {
    const basicReason = themeGalleryBasicSkipReason(repo);
    if (basicReason) {
      skipped.push({ repo, reason: basicReason });
      continue;
    }

    if (requireFiles && !(await fileExists(repo, "preview.png"))) {
      skipped.push({ repo, reason: "missing preview.png" });
      continue;
    }

    let metadata = {};
    if (requireFiles) {
      let source = "";
      try {
        source = await readTextFile(repo, ".omarchy-theme.yml");
        metadata = parseThemeGalleryMetadata(source);
      } catch {
        if (isSeededTheme(repo)) {
          metadata = legacySeededThemeMetadata(repo);
        } else {
          skipped.push({ repo, reason: "missing .omarchy-theme.yml" });
          continue;
        }
      }
    }

    if (!isThemeGalleryRepo(repo, { hasPreview: true, metadata, requireFiles })) {
      skipped.push({ repo, reason: metadata.gallery === true ? "invalid category" : "metadata gallery is not true" });
      continue;
    }

    const enrichedRepo = { ...repo, themeMetadata: metadata };
    if (themeCategory(enrichedRepo) === "novelty") {
      novelty.push(enrichedRepo);
    } else {
      productivity.push(enrichedRepo);
    }
  }

  return { productivity, novelty, skipped };
}

function isThemeGalleryRepo(repo, { hasPreview = false, metadata = {}, requireFiles = true } = {}) {
  if (themeGalleryBasicSkipReason(repo)) return false;
  if (requireFiles && !hasPreview) return false;
  if (requireFiles && metadata.gallery !== true) return false;
  if (!isValidThemeCategory(metadata.category || "productivity")) return false;
  return true;
}

function themeGalleryBasicSkipReason(repo) {
  if (excludedThemeRepos.has(repo.name)) return "manually excluded";
  if (!/^omarchy-.+-theme$/.test(repo.name)) return "name does not match omarchy-<name>-theme";
  if (repo.private) return "private";
  if (repo.archived) return "archived";
  if (repo.disabled) return "disabled";
  if (repo.fork) return "fork";
  return "";
}

function parseThemeGalleryMetadata(source) {
  const metadata = {};
  for (const rawLine of String(source).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf(":");
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    const rawValue = line.slice(separator + 1).trim();
    const value = unquoteYamlScalar(rawValue);
    if (key === "gallery") {
      metadata.gallery = value === "true" || value === true;
    } else if (["category", "name", "description", "preview"].includes(key)) {
      metadata[key] = String(value);
    }
  }
  return metadata;
}

function unquoteYamlScalar(value) {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function replaceGeneratedRegion(source, [start, end], content) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end);

  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
    throw new Error(`Missing or invalid generated region: ${start} / ${end}`);
  }

  return `${source.slice(0, startIndex + start.length)}\n${content.trim()}\n${source.slice(endIndex)}`;
}

function renderProjectTable(repos) {
  if (repos.length === 0) {
    return "_No repositories currently match the `profile-project` topic._";
  }

  const rows = repos.map((repo) => {
    const metadata = projectMetadataOverrides.get(repo.name) || {};
    const description = escapeMarkdownCell(metadata.description || repo.description || "No description provided.");
    const language = escapeMarkdownCell(metadata.language || repo.language || "Mixed");
    return `| [${escapeMarkdownCell(repo.name)}](${repo.html_url}) | Active | ${description} | ${language} |`;
  });

  return [
    "| Repository | Status | Description | Language |",
    "|------------|--------|-------------|----------|",
    ...rows,
  ].join("\n");
}

function renderThemeGallery(repos) {
  if (repos.length === 0) {
    return "_No repositories currently match this theme gallery category._";
  }

  const rows = [];
  for (let index = 0; index < repos.length; index += 2) {
    const left = repos[index];
    const right = repos[index + 1];
    rows.push("  <tr>");
    rows.push(renderThemeCell(left));
    rows.push(right ? renderThemeCell(right) : '    <td width="50%" valign="top" align="center"></td>');
    rows.push("  </tr>");
  }

  return ['<table width="100%">', ...rows, "</table>"].join("\n");
}

function renderThemeCell(repo) {
  const metadata = repo.themeMetadata || {};
  const displayName = metadata.name || themeDisplayName(repo.name);
  const repoUrl = `https://github.com/${owner}/${repo.name}`;
  const previewUrl = rawPreviewUrl(repo);
  const alt = `${displayName} Theme Preview`;

  return [
    '    <td width="50%" valign="top" align="center">',
    `      <a href="${htmlAttr(repoUrl)}">`,
    `        <img src="${htmlAttr(previewUrl)}" alt="${htmlAttr(alt)}" width="100%" />`,
    "      </a>",
    "      <br />",
    `      <strong><a href="${htmlAttr(repoUrl)}">${htmlText(displayName)}</a></strong>`,
    ...(metadata.description ? ["      <br />", `      <em>${htmlText(metadata.description)}</em>`] : []),
    "      <br />",
    `      <img alt="Stars" src="https://img.shields.io/github/stars/${owner}/${repo.name}?style=flat-square" />`,
    `      <img alt="Last Commit" src="https://img.shields.io/github/last-commit/${owner}/${repo.name}?style=flat-square" />`,
    "    </td>",
  ].join("\n");
}

function sortRepos(repos, seededOrder = new Map()) {
  return [...repos].sort((a, b) => {
    const orderA = seededOrder.has(a.name) ? seededOrder.get(a.name) : Number.POSITIVE_INFINITY;
    const orderB = seededOrder.has(b.name) ? seededOrder.get(b.name) : Number.POSITIVE_INFINITY;
    if (orderA !== orderB) return orderA - orderB;

    const featuredDelta = Number(hasTopic(b, topics.featured)) - Number(hasTopic(a, topics.featured));
    if (featuredDelta !== 0) return featuredDelta;

    const pushedDelta = new Date(b.pushed_at).getTime() - new Date(a.pushed_at).getTime();
    if (pushedDelta !== 0) return pushedDelta;

    return a.name.localeCompare(b.name);
  });
}

function isProjectRepo(repo) {
  return seededProjects.includes(repo.name) || hasTopic(repo, topics.project);
}

function isSeededTheme(repo) {
  return seededProductivityThemes.includes(repo.name) || seededNoveltyThemes.includes(repo.name);
}

function legacySeededThemeMetadata(repo) {
  return {
    gallery: true,
    category: seededNoveltyThemes.includes(repo.name) ? "novelty" : "productivity",
  };
}

function themeCategory(repo) {
  const category = repo.themeMetadata?.category || "productivity";
  return isValidThemeCategory(category) ? category : "productivity";
}

function isValidThemeCategory(category) {
  return category === "productivity" || category === "novelty";
}

function hasTopic(repo, topic) {
  return Array.isArray(repo.topics) && repo.topics.includes(topic);
}

function rawPreviewUrl(repo) {
  return rawRepoFileUrl(repo, repo.themeMetadata?.preview || "preview.png");
}

function rawRepoFileUrl(repo, path) {
  const normalizedPath = String(path).replace(/^\/+/, "");
  return `https://raw.githubusercontent.com/${owner}/${repo.name}/${repo.default_branch}/${normalizedPath}`;
}

function themeDisplayName(repoName) {
  if (themeNameOverrides.has(repoName)) {
    return themeNameOverrides.get(repoName);
  }

  const slug = repoName.replace(/^omarchy-/, "").replace(/-theme$/, "");
  const words = slug.split("-");
  const displayWords = [];

  for (let index = 0; index < words.length; index += 1) {
    const current = words[index];
    const next = words[index + 1];
    if (/^[a-z]$/i.test(current) && /^\d/.test(next || "")) {
      displayWords.push(`${current.toUpperCase()}-${next}`);
      index += 1;
      continue;
    }
    displayWords.push(titleCase(current));
  }

  return displayWords.join(" ");
}

function titleCase(value) {
  if (/^\d+$/.test(value)) return value;
  return value
    .split(/([_/])/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

function escapeMarkdownCell(value) {
  return String(value).replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();
}

function htmlAttr(value) {
  return htmlText(value).replace(/"/g, "&quot;");
}

function htmlText(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const isCli = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isCli) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

export {
  discoverThemeGalleryRepos,
  isThemeGalleryRepo,
  parseThemeGalleryMetadata,
};
