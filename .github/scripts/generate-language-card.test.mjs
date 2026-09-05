import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  aggregateLanguages,
  generateCards,
  renderCard,
  selectOriginalRepositories,
} from "./generate-language-card.mjs";

const config = JSON.parse(readFileSync(new URL("../profile-config.json", import.meta.url)));

test("frontend bytes are removed before percentages and Other are calculated", () => {
  const entries = aggregateLanguages([
    { JavaScript: 1_000_000, TypeScript: 900_000, Rust: 60, Lua: 30 },
    { Vue: 800_000, Svelte: 700_000, SCSS: 600_000, Python: 5, C: 5 },
  ], config.excludedLanguages, 3);
  assert.deepEqual(entries, [["Rust", 60], ["Lua", 30], ["Other", 10]]);
  const svg = renderCard(entries, "light");
  assert.match(svg, /60\.0%/);
  assert.match(svg, /30\.0%/);
  assert.match(svg, /10\.0%/);
  assert.doesNotMatch(svg, /JavaScript|TypeScript|Vue|Svelte|SCSS/);
});

test("all configured exclusions work even when capitalization differs", () => {
  const frontendOnly = Object.fromEntries(config.excludedLanguages.map(name => [name.toLowerCase(), 100]));
  assert.deepEqual(aggregateLanguages([frontendOnly], config.excludedLanguages), []);
  for (const theme of ["light", "dark"]) {
    const svg = renderCard([], theme);
    assert.match(svg, /No matching language data yet/);
    assert.doesNotMatch(svg, /NaN|Infinity/);
  }
});

test("invalid counts do not corrupt real language totals", () => {
  assert.deepEqual(aggregateLanguages([
    { Rust: 10, Lua: -1, C: NaN, Python: Infinity, Shell: "50" },
    { Rust: 20, Lua: 0 },
  ], []), [["Rust", 30]]);
});

test("new owned repositories are included, with forks, archives, private and profile repositories excluded", () => {
  const repo = { owner: { login: "ice345" }, fork: false, archived: false, private: false };
  const selected = selectOriginalRepositories([
    { ...repo, name: "new-learning-project" },
    { ...repo, name: "Ice345" },
    { ...repo, name: "fork", fork: true },
    { ...repo, name: "archive", archived: true },
    { ...repo, name: "private", private: true },
    { ...repo, name: "someone-elses", owner: { login: "someone-else" } },
  ], "ICE345");
  assert.deepEqual(selected.map(({ name }) => name), ["new-learning-project"]);
});

test("generation discovers a new project on page two and writes all four themed cards", async () => {
  const previousFetch = globalThis.fetch;
  const previousDirectory = process.cwd();
  const directory = mkdtempSync(join(tmpdir(), "profile-cards-test-"));
  const calls = [];
  const owner = process.env.GITHUB_OWNER || "ice345";
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    const parsed = new URL(url);
    if (parsed.pathname === `/users/${owner}/repos`) {
      return Response.json(parsed.searchParams.get("page") === "1"
        ? Array.from({ length: 100 }, (_, i) => ({ name: `fork-${i}`, fork: true }))
        : [{ name: "brand-new-project", owner: { login: owner }, stargazers_count: 3 }]);
    }
    if (parsed.pathname.endsWith("/languages")) return Response.json({ Rust: 100, TypeScript: 99999 });
    if (parsed.pathname.endsWith("/commits")) return Response.json([{}], {
      headers: { link: '<https://api.github.com/commits?per_page=1&page=7>; rel="last"' },
    });
    if (parsed.pathname === "/search/issues") return Response.json({ total_count: 2 });
    throw new Error(`Unexpected URL: ${url}`);
  };
  try {
    process.chdir(directory);
    await generateCards();
    assert.ok(calls.some(url => url.includes("page=2")));
    assert.ok(calls.some(url => url.includes("brand-new-project/languages")));
    for (const theme of ["light", "dark"]) {
      const languageCard = readFileSync(`dist/github-languages-${theme}.svg`, "utf8");
      const overviewCard = readFileSync(`dist/github-overview-${theme}.svg`, "utf8");
      assert.match(languageCard, /100\.0%/);
      assert.doesNotMatch(languageCard, /TypeScript/);
      assert.match(overviewCard, />7<\/text>/);
    }
  } finally {
    globalThis.fetch = previousFetch;
    process.chdir(previousDirectory);
    rmSync(directory, { recursive: true, force: true });
  }
});
