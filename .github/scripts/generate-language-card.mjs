import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const owner = process.env.GITHUB_OWNER || "ice345";
const token = process.env.GITHUB_TOKEN;
const config = JSON.parse(
  readFileSync(new URL("../profile-config.json", import.meta.url), "utf8"),
);

const languageColors = {
  Lua: "#5D82B3",
  Rust: "#DEA584",
  Shell: "#92AA87",
  Python: "#3572A5",
  C: "#8C9EB2",
  OCaml: "#C69B63",
  Other: "#B1BDC4",
};

export function selectOriginalRepositories(repositories, account) {
  return repositories.filter(
    (repository) =>
      !repository.fork &&
      !repository.archived &&
      !repository.private &&
      repository.owner.login.toLowerCase() === account.toLowerCase() &&
      repository.name.toLowerCase() !== account.toLowerCase(),
  );
}

export function aggregateLanguages(results, excludedLanguages, maxLanguages = 6) {
  if (!Number.isInteger(maxLanguages) || maxLanguages < 2 || maxLanguages > 6) {
    throw new Error("maxLanguages must be an integer between 2 and 6");
  }
  const excluded = new Set(excludedLanguages.map((language) => language.toLowerCase()));
  const aggregate = new Map();

  for (const languages of results) {
    for (const [language, bytes] of Object.entries(languages)) {
      // Filter before both ranking and normalization; excluded bytes never enter Other.
      if (!excluded.has(language.toLowerCase()) && Number.isFinite(bytes) && bytes > 0) {
        aggregate.set(language, (aggregate.get(language) || 0) + bytes);
      }
    }
  }

  const entries = [...aggregate.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  );
  if (entries.length <= maxLanguages) return entries;
  return [
    ...entries.slice(0, maxLanguages - 1),
    ["Other", entries.slice(maxLanguages - 1).reduce((sum, [, bytes]) => sum + bytes, 0)],
  ];
}

const themes = {
  light: {
    background: "#F8FAF7",
    border: "#DCE8D3",
    title: "#252B46",
    text: "#334462",
    muted: "#718096",
    track: "#E8EEF0",
    accent: "#D6A64B",
  },
  dark: {
    background: "#252B46",
    border: "#334462",
    title: "#E9EEF3",
    text: "#D8E1EA",
    muted: "#A6B5C5",
    track: "#334462",
    accent: "#E6BD68",
  },
};

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function apiHeaders() {
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "ice345-profile-readme",
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: apiHeaders() });

  if (!response.ok) {
    throw new Error(`GitHub API returned ${response.status} for ${url}`);
  }

  return response.json();
}

async function getLanguages(repository) {
  return fetchJson(
    `https://api.github.com/repos/${owner}/${repository}/languages`,
  );
}

async function getPublicRepositories() {
  const allRepositories = [];

  for (let page = 1; ; page += 1) {
    const batch = await fetchJson(
      `https://api.github.com/users/${owner}/repos?type=owner&sort=updated&per_page=100&page=${page}`,
    );
    allRepositories.push(...batch);

    if (batch.length < 100) {
      return allRepositories;
    }
  }
}

async function getCommitCount(repository, since) {
  const params = new URLSearchParams({
    author: owner,
    since,
    per_page: "1",
  });
  const url = `https://api.github.com/repos/${owner}/${repository}/commits?${params}`;
  const response = await fetch(url, { headers: apiHeaders() });

  if (response.status === 409) {
    return 0;
  }

  if (!response.ok) {
    throw new Error(
      `GitHub API returned ${response.status} while counting commits in ${repository}`,
    );
  }

  const commits = await response.json();
  const link = response.headers.get("link") || "";
  const lastPage = link.match(/[?&]page=(\d+)>; rel="last"/);

  return lastPage ? Number(lastPage[1]) : commits.length;
}

async function mapWithConcurrency(items, limit, callback) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await callback(items[index], index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );
  return results;
}

async function getPullRequestCount(sinceDate) {
  const query = `author:${owner} type:pr created:>=${sinceDate}`;
  const params = new URLSearchParams({ q: query, per_page: "1" });
  const result = await fetchJson(
    `https://api.github.com/search/issues?${params}`,
  );

  return result.total_count;
}

async function getOverviewStats(originalRepositories) {
  const since = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
  const sinceIso = since.toISOString();
  const sinceDate = sinceIso.slice(0, 10);
  const commitCounts = await mapWithConcurrency(
    originalRepositories,
    4,
    (repository) => getCommitCount(repository.name, sinceIso),
  );

  return {
    stars: originalRepositories.reduce(
      (sum, repository) => sum + repository.stargazers_count,
      0,
    ),
    repositories: originalRepositories.length,
    commits: commitCounts.reduce((sum, count) => sum + count, 0),
    pullRequests: await getPullRequestCount(sinceDate),
  };
}

function formatNumber(value) {
  return Number(value).toLocaleString("en-US");
}

function cardFrame(themeName, title, description, content) {
  const theme = themes[themeName];
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="420" height="210" viewBox="0 0 420 210" role="img" aria-labelledby="title desc">
  <title id="title">${escapeXml(title)}</title>
  <desc id="desc">${escapeXml(description)}</desc>
  <style>
    text { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .heading { fill: ${theme.title}; font-size: 19px; font-weight: 650; }
    .label { fill: ${theme.text}; font-size: 14px; }
    .percent { fill: ${theme.muted}; font-size: 13px; font-variant-numeric: tabular-nums; }
    .metric { fill: ${theme.title}; font-size: 28px; font-weight: 650; font-variant-numeric: tabular-nums; }
  </style>
  <rect x="0.5" y="0.5" width="419" height="209" rx="14" fill="${theme.background}" stroke="${theme.border}" />
  <path d="M24 30 H38" stroke="${theme.accent}" stroke-width="3" stroke-linecap="round" />
  <text x="48" y="36" class="heading">${escapeXml(title)}</text>
  ${content}
</svg>
`;
}

export function renderCard(entries, themeName) {
  const theme = themes[themeName];
  if (entries.length === 0) {
    return cardFrame(themeName, "Programming Languages", "No language data remains after filtering.",
      '<text x="24" y="113" class="label">No matching language data yet.</text>');
  }
  const totalBytes = entries.reduce((sum, [, bytes]) => sum + bytes, 0);
  let offset = 24;
  const segments = entries.map(([language, bytes]) => {
    const width = (bytes / totalBytes) * 372;
    const segment = `<rect x="${offset.toFixed(3)}" y="62" width="${width.toFixed(3)}" height="12" fill="${languageColors[language] || "#7FA6C9"}" />`;
    offset += width;
    return segment;
  }).join("");
  const legend = entries.map(([language, bytes], index) => {
    const x = 24 + (index % 2) * 196;
    const y = 111 + Math.floor(index / 2) * 35;
    return `
    <circle cx="${x + 4}" cy="${y - 5}" r="4" fill="${languageColors[language] || "#7FA6C9"}" />
    <text x="${x + 16}" y="${y}" class="label">${escapeXml(language)}</text>
    <text x="${x + 174}" y="${y}" class="percent" text-anchor="end">${((bytes / totalBytes) * 100).toFixed(1)}%</text>`;
  }).join("");
  return cardFrame(themeName, "Programming Languages",
    "Language byte share in original public repositories after configured exclusions; not a measure of proficiency.",
    `<defs><clipPath id="bar"><rect x="24" y="62" width="372" height="12" rx="6" /></clipPath></defs>
    <rect x="24" y="62" width="372" height="12" rx="6" fill="${theme.track}" />
    <g clip-path="url(#bar)">${segments}</g>${legend}`);
}

export function renderOverviewCard(stats, themeName) {
  const theme = themes[themeName];
  const metrics = [
    [formatNumber(stats.stars), "Stars earned"],
    [formatNumber(stats.repositories), "Original repos"],
    [formatNumber(stats.commits), "Commits · 12 mo"],
    [formatNumber(stats.pullRequests), "PRs opened · 12 mo"],
  ];
  const metricMarkup = metrics.map(([value, label], index) => {
    const x = 24 + (index % 2) * 196;
    const y = 91 + Math.floor(index / 2) * 72;
    return `
    <text x="${x}" y="${y}" class="metric">${escapeXml(value)}</text>
    <text x="${x}" y="${y + 22}" class="label">${escapeXml(label)}</text>`;
  }).join("");
  return cardFrame(themeName, "GitHub Overview",
    `Public original repositories, stars, commits, and pull requests for ${owner}.`,
    `<path d="M24 130 H396" stroke="${theme.border}" />${metricMarkup}`);
}

export async function generateCards() {
  const publicRepositories = await getPublicRepositories();
  const originalRepositories = selectOriginalRepositories(publicRepositories, owner);
  const results = await mapWithConcurrency(
    originalRepositories, 4, ({ name }) => getLanguages(name),
  );
  const entries = aggregateLanguages(results, config.excludedLanguages, config.maxLanguages);
  const overviewStats = await getOverviewStats(originalRepositories);

  // Fetch all data before writing so a failed API request cannot publish a partial set.
  mkdirSync("dist", { recursive: true });
  for (const theme of Object.keys(themes)) {
    writeFileSync(`dist/github-languages-${theme}.svg`, renderCard(entries, theme));
    writeFileSync(`dist/github-overview-${theme}.svg`, renderOverviewCard(overviewStats, theme));
  }
  console.log(`Generated activity cards from ${originalRepositories.length} original public repositories.`);
  console.log(`Displayed languages: ${entries.map(([language]) => language).join(", ") || "none"}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await generateCards();
}
