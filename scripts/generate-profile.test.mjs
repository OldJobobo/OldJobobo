import test from "node:test";
import assert from "node:assert/strict";

import {
  discoverThemeGalleryRepos,
  isThemeGalleryRepo,
  parseThemeGalleryMetadata,
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
      if (typeof value !== "string") throw new Error(`missing ${repo.name}:${path}`);
      return value;
    },
  });

  assert.deepEqual(result.productivity.map((item) => item.name), ["omarchy-dispatch-theme"]);
  assert.deepEqual(result.novelty.map((item) => item.name), ["omarchy-silly-goose-theme"]);
  assert.deepEqual(
    result.skipped.map((item) => `${item.repo.name}:${item.reason}`),
    [
      "omarchy-forked-theme:fork",
      "omarchy-missing-preview-theme:missing preview.png",
      "not-a-theme:name does not match omarchy-<name>-theme",
    ],
  );
});
