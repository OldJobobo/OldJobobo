import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  discoverThemeGalleryRepos,
  isThemeGalleryRepo,
  parseThemeGalleryMetadata,
  isProjectRepo,
  renderProjectTable,
  renderThemeGallery,
  replaceGeneratedRegion,
} from "./generate-profile.mjs";

function repo(overrides = {}) {
  return {
    name: "omarchy-dispatch-theme",
    private: false,
    archived: false,
    disabled: false,
    fork: false,
    topics: [],
    default_branch: "main",
    pushed_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

test("theme gallery repo requires name, public state, non-fork status, preview, and gallery metadata", () => {
  const metadata = { gallery: true, category: "productivity", name: "Dispatch" };

  assert.equal(isThemeGalleryRepo(repo(), { hasPreview: true, metadata }), true);
  assert.equal(isThemeGalleryRepo(repo({ name: "someone-elses-theme" }), { hasPreview: true, metadata }), false);
  assert.equal(isThemeGalleryRepo(repo({ private: true }), { hasPreview: true, metadata }), false);
  assert.equal(isThemeGalleryRepo(repo({ archived: true }), { hasPreview: true, metadata }), false);
  assert.equal(isThemeGalleryRepo(repo({ disabled: true }), { hasPreview: true, metadata }), false);
  assert.equal(isThemeGalleryRepo(repo({ fork: true }), { hasPreview: true, metadata }), false);
  assert.equal(isThemeGalleryRepo(repo(), { hasPreview: false, metadata }), false);
  assert.equal(isThemeGalleryRepo(repo(), { hasPreview: true, metadata: { gallery: false, category: "productivity" } }), false);
});

test("theme gallery metadata supports gallery, category, name, description, and preview fields", () => {
  assert.deepEqual(
    parseThemeGalleryMetadata(`
gallery: true
category: novelty
name: Florida Man
description: Sunshine state chaos
preview: screenshots/preview.png
`),
    {
      gallery: true,
      category: "novelty",
      name: "Florida Man",
      description: "Sunshine state chaos",
      preview: "screenshots/preview.png",
    },
  );
});

test("theme gallery discovery skips forks and categorizes real marked themes", async () => {
  const repos = [
    repo({ name: "omarchy-dispatch-theme", pushed_at: "2026-01-02T00:00:00Z" }),
    repo({ name: "omarchy-forked-theme", fork: true, pushed_at: "2026-01-03T00:00:00Z" }),
    repo({ name: "omarchy-silly-goose-theme", pushed_at: "2026-01-04T00:00:00Z" }),
    repo({ name: "omarchy-missing-preview-theme", pushed_at: "2026-01-05T00:00:00Z" }),
    repo({ name: "not-a-theme" }),
  ];

  const files = new Map([
    ["omarchy-dispatch-theme:preview.png", true],
    ["omarchy-dispatch-theme:.omarchy-theme.yml", "gallery: true\ncategory: productivity\nname: Dispatch\n"],
    ["omarchy-forked-theme:preview.png", true],
    ["omarchy-forked-theme:.omarchy-theme.yml", "gallery: true\ncategory: productivity\n"],
    ["omarchy-silly-goose-theme:preview.png", true],
    ["omarchy-silly-goose-theme:.omarchy-theme.yml", "gallery: true\ncategory: novelty\n"],
    ["omarchy-missing-preview-theme:.omarchy-theme.yml", "gallery: true\ncategory: productivity\n"],
  ]);

  const result = await discoverThemeGalleryRepos(repos, {
    fileExists: async (repo, path) => files.get(`${repo.name}:${path}`) === true,
    readTextFile: async (repo, path) => {
      const value = files.get(`${repo.name}:${path}`);
      if (typeof value !== "string") throw Object.assign(new Error(`missing ${repo.name}:${path}`), { status: 404 });
      return value;
    },
  });

  assert.deepEqual(result.productivity.map((item) => item.name), ["omarchy-dispatch-theme"]);
  assert.deepEqual(result.novelty.map((item) => item.name), ["omarchy-silly-goose-theme"]);
  assert.deepEqual(
    result.skipped.map((item) => `${item.repo.name}:${item.reason}`),
    [
      "omarchy-forked-theme:fork",
      "omarchy-missing-preview-theme:missing preview: preview.png",
      "not-a-theme:name does not match omarchy-<name>-theme",
    ],
  );
});

test("discovery checks the metadata preview path instead of requiring preview.png", async () => {
  const checked = [];
  const result = await discoverThemeGalleryRepos([repo()], {
    readTextFile: async () => "gallery: true\ncategory: productivity\npreview: screenshots/desktop.webp\n",
    fileExists: async (_, path) => { checked.push(path); return path === "screenshots/desktop.webp"; },
  });
  assert.deepEqual(checked, ["screenshots/desktop.webp"]);
  assert.equal(result.productivity.length, 1);
  assert.match(renderThemeGallery(result.productivity), /main\/screenshots\/desktop.webp/);
});

test("missing markers skip new themes but preserve explicitly seeded legacy themes", async () => {
  const result = await discoverThemeGalleryRepos([repo(), repo({ name: "omarchy-miasma-theme" })], {
    readTextFile: async () => { throw Object.assign(new Error("Not found"), { status: 404 }); },
    fileExists: async () => true,
  });
  assert.deepEqual(result.productivity.map(({ name }) => name), ["omarchy-miasma-theme"]);
  assert.equal(result.skipped[0].reason, "missing .omarchy-theme.yml");
});

test("opted-out and invalid-category themes do not request previews, including seeded themes", async () => {
  for (const metadata of ["gallery: false", "gallery: true\ncategory: unknown"]) {
    const result = await discoverThemeGalleryRepos([repo({ name: "omarchy-miasma-theme" })], {
      readTextFile: async () => metadata,
      fileExists: async () => { assert.fail("Excluded theme requested a preview"); },
    });
    assert.equal(result.productivity.length, 0);
    assert.equal(result.skipped.length, 1);
  }
});

test("metadata network errors abort rather than hiding themes or using legacy fallbacks", async () => {
  for (const name of ["omarchy-dispatch-theme", "omarchy-miasma-theme"]) {
    await assert.rejects(discoverThemeGalleryRepos([repo({ name })], {
      readTextFile: async () => { throw Object.assign(new Error("Server unavailable"), { status: 503 }); },
      fileExists: async () => true,
    }), /Server unavailable/);
  }
});

test("preview errors abort; missing custom previews are reported with their path", async () => {
  const readTextFile = async () => "gallery: true\npreview: screenshots/theme.png";
  await assert.rejects(discoverThemeGalleryRepos([repo()], {
    readTextFile,
    fileExists: async () => { throw new Error("Preview server unavailable"); },
  }), /Preview server unavailable/);
  const result = await discoverThemeGalleryRepos([repo()], { readTextFile, fileExists: async () => false });
  assert.equal(result.skipped[0].reason, "missing preview: screenshots/theme.png");
});

test("preview check bypass does not bypass metadata opt-in", async () => {
  const result = await discoverThemeGalleryRepos([repo()], {
    checkPreviews: false,
    readTextFile: async () => "gallery: false",
    fileExists: async () => { assert.fail("Preview bypass was ignored"); },
  });
  assert.equal(result.productivity.length, 0);
  const included = await discoverThemeGalleryRepos([repo()], {
    checkPreviews: false,
    readTextFile: async () => "gallery: true",
    fileExists: async () => { assert.fail("Preview bypass was ignored"); },
  });
  assert.equal(included.productivity.length, 1);
});

test("project selection includes current tools and rejects private, archived, disabled, and fork repos", () => {
  for (const name of ["jobo-themes", "based", "arcana", "omatype", "pi-skill-manager"]) {
    assert.equal(isProjectRepo(repo({ name })), true);
    for (const field of ["private", "archived", "disabled", "fork"]) {
      assert.equal(isProjectRepo(repo({ name, [field]: true })), false);
    }
  }
  for (const name of ["splinterm", "thpm"]) {
    assert.equal(isProjectRepo(repo({ name, topics: ["profile-project"] })), false, "Featured projects must not be duplicated");
  }
  assert.equal(isProjectRepo(repo({ name: "theme-manager-plus" })), false);
  assert.equal(isProjectRepo(repo({ name: "theme-manager-plus", topics: ["profile-project", "profile-featured"] })), false, "Retired projects must not return through topics");
  assert.equal(isProjectRepo(repo({ name: "unselected" })), false);
  assert.equal(isProjectRepo(repo({ name: "topic-selected", topics: ["profile-project"] })), true);
});

test("project table uses upstream descriptions without invented status or stale language labels", () => {
  const output = renderProjectTable([repo({ name: "theme-manager-plus", html_url: "https://github.com/OldJobobo/theme-manager-plus", description: "CLI | TUI\nfor themes", language: "Rust" })]);
  assert.match(output, /CLI \| TUI\nfor themes/);
  assert.doesNotMatch(output, /Active|Status|Language|Shell/);
  assert.match(renderProjectTable([repo({ name: "based", html_url: "https://github.com/OldJobobo/based" })]), /Base16\/Base24/);
});

test("gallery renders escaped metadata and balanced odd rows with original badges", () => {
  const output = renderThemeGallery([repo({ themeMetadata: { name: 'A & "B"', description: "<palette>" } })]);
  assert.match(output, /A &amp; &quot;B&quot;/);
  assert.match(output, /&lt;palette&gt;/);
  assert.equal((output.match(/<td /g) || []).length, 2);
  assert.equal((output.match(/<\/td>/g) || []).length, 2);
  assert.match(output, /img.shields.io\/github\/stars\//);
  assert.match(output, /img.shields.io\/github\/last-commit\//);
});

test("featured SVG cards are self-contained, accessible illustrations linked from the profile", async () => {
  const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");
  const featured = readme.split('<a name="featured-repositories"></a>')[1].split('<a name="omarchy-themes"></a>')[0];
  assert.match(readme, /capsule-render\.vercel\.app\/api\?type=waving/);
  assert.match(featured, /alt="Splinterm:/);
  assert.match(featured, /alt="THPM:/);
  assert.doesNotMatch(featured, /### Miasma|### ThemeManager\+/);
  for (const name of ["splinterm", "thpm"]) {
    const path = `assets/${name}-preview.svg`;
    assert.ok(featured.includes(`src="${path}"`));
    assert.ok(featured.includes(`href="https://github.com/OldJobobo/${name}"`));
    const svg = await readFile(new URL(`../${path}`, import.meta.url), "utf8");
    if (name === "splinterm") {
      assert.match(svg, />STABLE<\/text>/);
      assert.doesNotMatch(svg + featured, /public beta/i);
    }
    assert.match(svg, /viewBox="0 0 1120 560"/);
    assert.match(svg, /role="img" aria-labelledby="title desc"/);
    assert.match(svg, /<title id="title">.+<\/title>/);
    assert.match(svg, /<desc id="desc">.+not a screenshot\.<\/desc>/);
    assert.doesNotMatch(svg, /<script|<foreignObject|<image|@import|@font-face|(?:href|src)=|onload=/i);
    for (const reference of svg.matchAll(/url\(#([^)]+)\)/g)) {
      assert.ok(svg.includes(`id="${reference[1]}"`), `Missing SVG definition: ${reference[1]}`);
    }
  }
});

test("profile hierarchy keeps full-width features, theme previews, and one non-duplicated project list", async () => {
  const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");
  const headings = ['<a name="featured-repositories"></a>', '<a name="omarchy-themes"></a>', '<a name="more-projects"></a>', '<h3>What I work on</h3>', '### Issues and contributions', '### Supporters'];
  let previous = -1;
  for (const heading of headings) {
    const index = readme.indexOf(heading);
    assert.ok(index > previous, `Missing or misplaced heading: ${heading}`);
    previous = index;
  }
  const featured = readme.split(headings[0])[1].split(headings[1])[0];
  assert.doesNotMatch(featured, /<td width=|github\/repo-size|github\/last-commit/);
  assert.equal((featured.match(/<table width="100%">/g) || []).length, 2);
  assert.equal((featured.match(/src="assets\/(?:splinterm|thpm)-preview.svg"/g) || []).length, 2);
  assert.match(featured, /<p><strong>A Wayland terminal/);
  assert.equal((featured.match(/github\/v\/release/g) || []).length, 2);
  const themes = readme.split(headings[1])[1].split(headings[2])[0];
  assert.equal((themes.match(/alt="[^"]+ desktop preview"/g) || []).length, 6);
  assert.equal((themes.match(/<tr>/g) || []).length, 2);
  for (const name of ['Miasma', 'Lumon', 'Retro 82', 'Sakura Mochi', 'Event Horizon', 'Last Call']) {
    assert.ok(themes.includes(`alt="${name} desktop preview"`));
  }
  const projects = readme.split("<!-- profile:projects:start -->")[1].split("<!-- profile:projects:end -->")[0];
  assert.doesNotMatch(projects, /github.com\/OldJobobo\/(?:splinterm|thpm)\b/);
  assert.doesNotMatch(readme, /profile:more|## Start here|## GitHub activity|## Compatibility/);
});

test("Splinterm card embeds the official head logo without changing its paths or colors", async () => {
  const logo = await readFile(new URL('../assets/splinterm-logo.svg', import.meta.url), 'utf8');
  const card = await readFile(new URL('../assets/splinterm-preview.svg', import.meta.url), 'utf8');
  assert.match(logo, /Splinterm app logo/);
  assert.match(card, /id="splinterm-app-logo"/);
  const paths = [...logo.matchAll(/<path\b[^>]*\bd="([^"]+)"/g)];
  assert.ok(paths.length > 20);
  for (const [, path] of paths) assert.ok(card.includes(`d="${path}"`));
  for (const [, color] of logo.matchAll(/fill="(#[a-fA-F0-9]+)"/g)) assert.ok(card.includes(`fill="${color}"`));
  assert.doesNotMatch(logo, /<script|<foreignObject|<image|(?:href|src)=|onload=/i);
});

test("project panels escape upstream HTML and balance paired and odd cells", () => {
  const items = [repo({ name: 'one<&', html_url: 'https://example.com/?a="x"&b=1', description: '<script>alert(1)</script>' }), repo({ name: 'two' }), repo({ name: 'three' })];
  const output = renderProjectTable(items);
  assert.match(output, /one&lt;&amp;/);
  assert.match(output, /&quot;x&quot;&amp;b=1/);
  assert.match(output, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(output, /<script>/);
  assert.equal((output.match(/<td /g) || []).length, 4);
  assert.equal((output.match(/<\/td>/g) || []).length, 4);
  assert.match(renderProjectTable([]), /No public repositories/);
});

test("section and footer artwork have accessible light and dark variants without active content", async () => {
  const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');
  assert.doesNotMatch(readme, /<style|<script|\sstyle=|\sclass=|<iframe|<foreignObject/i);
  assert.match(readme, /I make things I want to use, fix things that bother me, and share what comes out of it\./);
  assert.match(readme, /Built for my use, shared for yours\./);
  for (const name of ['section-featured', 'section-themes', 'section-projects', 'footer']) {
    for (const mode of ['dark', 'light']) {
      const path = `assets/${name}-${mode}.svg`;
      assert.ok(readme.includes(path));
      const svg = await readFile(new URL(`../${path}`, import.meta.url), 'utf8');
      assert.match(svg, /<title id="title">.+<\/title>/);
      assert.doesNotMatch(svg, /<script|<foreignObject|<image|@import|@font-face|(?:href|src)=|onload=/i);
    }
  }
});

test("profile artwork and banner use the approved Last Call palette", async () => {
  const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');
  assert.match(readme, /color=0:010506,35:0B1D20,70:1E4147,100:00C6C2/);
  assert.match(readme, /fontColor=E0F5F2/);
  assert.match(readme, /labelColor=030E10&color=0B1D20/);
  assert.doesNotMatch(readme, /labelColor=142431|color=27434B|labelColor=001123|color=00172E/);
  for (const name of ['splinterm-preview', 'thpm-preview', 'section-featured-dark', 'section-themes-dark', 'section-projects-dark', 'footer-dark']) {
    const svg = await readFile(new URL(`../assets/${name}.svg`, import.meta.url), 'utf8');
    assert.ok(svg.includes('#e0f5f2'), `Missing pale foreground in ${name}`);
    assert.ok(svg.includes('#00c6c2'), `Missing turquoise accent in ${name}`);
    assert.doesNotMatch(svg, /#5bc0be|#79d0cb|#9bb8ea|#f6dcac|#faa968/i);
  }
});

test("generated region replacement preserves surrounding copy and is idempotent", () => {
  const markers = ["<!-- start -->", "<!-- end -->"];
  const source = "Personal copy\n<!-- start -->\nold\n<!-- end -->\nSupporters";
  const updated = replaceGeneratedRegion(source, markers, "new");
  assert.equal(updated, "Personal copy\n<!-- start -->\nnew\n<!-- end -->\nSupporters");
  assert.equal(replaceGeneratedRegion(updated, markers, "new"), updated);
  assert.throws(() => replaceGeneratedRegion("missing markers", markers, "new"), /Missing or invalid/);
});
