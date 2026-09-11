import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  generateFeaturedCards,
  projects,
  renderFeaturedCard,
} from "./generate-featured-cards.mjs";
import { themes } from "./generate-language-card.mjs";

test("featured cards use the activity canvas and theme, with repository facts", () => {
  const wrap = projects.find((project) => project.id === "markdown-table-wrap");
  const shell = projects.find((project) => project.id === "anishell");
  const dots = projects.find((project) => project.id === "dotfiles");
  const anime = projects.find((project) => project.id === "anime-horizon");
  const darkWrap = renderFeaturedCard(wrap, "dark");
  const lightShell = renderFeaturedCard(shell, "light");

  assert.match(darkWrap, /width="420"/);
  assert.match(darkWrap, /height="210"/);
  assert.match(darkWrap, /never auto-rewritten/);
  assert.match(darkWrap, />Reader</);
  assert.match(darkWrap, new RegExp(themes.dark.background));
  assert.doesNotMatch(darkWrap, new RegExp(themes.light.background));

  assert.match(lightShell, />63</);
  assert.match(lightShell, /unit \+ integration tests/);
  assert.match(lightShell, new RegExp(themes.light.background));

  assert.match(renderFeaturedCard(dots, "dark"), />Linux</);
  assert.match(renderFeaturedCard(anime, "dark"), /anime\.050626\.xyz/);
});

test("generation writes eight themed featured SVGs", () => {
  const directory = mkdtempSync(join(tmpdir(), "featured-cards-"));
  try {
    generateFeaturedCards(directory);
    for (const project of projects) {
      for (const theme of ["light", "dark"]) {
        const svg = readFileSync(
          `${directory}/${project.id}-${theme}.svg`,
          "utf8",
        );
        assert.match(svg, /viewBox="0 0 420 210"/);
        assert.match(svg, new RegExp(project.title.replaceAll(".", "\\.")));
      }
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
