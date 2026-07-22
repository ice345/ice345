import { mkdirSync, writeFileSync } from "node:fs";

const owner = process.env.GITHUB_OWNER || "ice345";
const token = process.env.GITHUB_TOKEN;
const repositories = [
  "markdown-table-wrap.nvim",
  "Anime-horizon_pro",
  "anishell",
];
const ignoredLanguages = new Set(["HTML", "CSS"]);

const languageColors = {
  TypeScript: "#3178C6",
  Lua: "#5D82B3",
  Rust: "#DEA584",
  JavaScript: "#F1E05A",
  Shell: "#89E051",
  Python: "#3572A5",
};

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

async function getOverviewStats() {
  const allRepositories = await getPublicRepositories();
  const originalRepositories = allRepositories.filter(
    (repository) => !repository.fork && !repository.archived,
  );
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

function renderCard(entries, themeName) {
  const theme = themes[themeName];
  const totalBytes = entries.reduce((sum, [, bytes]) => sum + bytes, 0);
  const rows = entries.map(([language, bytes]) => ({
    language,
    percent: (bytes / totalBytes) * 100,
    color: languageColors[language] || "#7FA6C9",
  }));
  const subtitle = repositories.join(" · ");
  const rowMarkup = rows
    .map((row, index) => {
      const y = 128 + index * 34;
      const width = Math.max(4, (row.percent / 100) * 404);
      return `
    <circle cx="44" cy="${y - 5}" r="5" fill="${row.color}" />
    <text x="58" y="${y}" class="label">${escapeXml(row.language)}</text>
    <rect x="196" y="${y - 14}" width="404" height="10" rx="5" fill="${theme.track}" />
    <rect x="196" y="${y - 14}" width="${width.toFixed(1)}" height="10" rx="5" fill="${row.color}" />
    <text x="652" y="${y}" class="percent" text-anchor="end">${row.percent.toFixed(1)}%</text>`;
    })
    .join("");
  const height = 106 + rows.length * 34 + 22;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 700 ${height}" role="img" aria-labelledby="title desc">
  <title id="title">Selected project languages</title>
  <desc id="desc">Language distribution across ${escapeXml(subtitle)}.</desc>
  <style>
    text { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .heading { fill: ${theme.title}; font-size: 22px; font-weight: 700; }
    .subtitle { fill: ${theme.muted}; font-size: 12px; }
    .label { fill: ${theme.text}; font-size: 14px; font-weight: 600; }
    .percent { fill: ${theme.muted}; font-size: 13px; font-variant-numeric: tabular-nums; }
  </style>
  <rect x="1" y="1" width="698" height="${height - 2}" rx="18" fill="${theme.background}" stroke="${theme.border}" stroke-width="2" />
  <rect x="30" y="30" width="5" height="48" rx="2.5" fill="${theme.accent}" />
  <text x="50" y="52" class="heading">Selected Project Languages</text>
  <text x="50" y="73" class="subtitle">${escapeXml(subtitle)}</text>${rowMarkup}
</svg>
`;
}

function renderOverviewCard(stats, themeName) {
  const theme = themes[themeName];
  const metrics = [
    [formatNumber(stats.stars), "Stars earned"],
    [formatNumber(stats.repositories), "Original repos"],
    [formatNumber(stats.commits), "Commits · 12 mo"],
    [formatNumber(stats.pullRequests), "PRs opened · 12 mo"],
  ];
  const metricMarkup = metrics
    .map(([value, label], index) => {
      const x = 30 + index * 166;
      return `
    <rect x="${x}" y="96" width="142" height="82" rx="14" fill="${theme.track}" />
    <text x="${x + 71}" y="132" class="metric" text-anchor="middle">${escapeXml(value)}</text>
    <text x="${x + 71}" y="158" class="metric-label" text-anchor="middle">${escapeXml(label)}</text>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 700 226" role="img" aria-labelledby="title desc">
  <title id="title">GitHub overview</title>
  <desc id="desc">Public original repositories, stars, commits, and pull requests for ${escapeXml(owner)}.</desc>
  <style>
    text { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .heading { fill: ${theme.title}; font-size: 22px; font-weight: 700; }
    .subtitle { fill: ${theme.muted}; font-size: 12px; }
    .metric { fill: ${theme.title}; font-size: 28px; font-weight: 750; font-variant-numeric: tabular-nums; }
    .metric-label { fill: ${theme.text}; font-size: 13px; font-weight: 600; }
    .footer { fill: ${theme.muted}; font-size: 11px; }
  </style>
  <rect x="1" y="1" width="698" height="224" rx="18" fill="${theme.background}" stroke="${theme.border}" stroke-width="2" />
  <rect x="30" y="30" width="5" height="48" rx="2.5" fill="${theme.accent}" />
  <text x="50" y="52" class="heading">GitHub Overview</text>
  <text x="50" y="73" class="subtitle">Public activity with forks excluded from repository and star totals</text>${metricMarkup}
  <path d="M30 199h155l16-7 16 7h156l16-7 16 7h265" fill="none" stroke="${theme.border}" stroke-width="2" stroke-linecap="round" />
  <text x="350" y="215" class="footer" text-anchor="middle">Rolling 12 months · generated daily from the GitHub API</text>
</svg>
`;
}

const aggregate = new Map();
const results = await Promise.all(repositories.map(getLanguages));

for (const languages of results) {
  for (const [language, bytes] of Object.entries(languages)) {
    if (!ignoredLanguages.has(language)) {
      aggregate.set(language, (aggregate.get(language) || 0) + bytes);
    }
  }
}

const entries = [...aggregate.entries()]
  .filter(([, bytes]) => Number.isFinite(bytes) && bytes > 0)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 5);

if (entries.length === 0) {
  throw new Error("No language data was returned for the selected repositories");
}

mkdirSync("dist", { recursive: true });
writeFileSync("dist/github-languages-light.svg", renderCard(entries, "light"));
writeFileSync("dist/github-languages-dark.svg", renderCard(entries, "dark"));

const overviewStats = await getOverviewStats();
writeFileSync(
  "dist/github-overview-light.svg",
  renderOverviewCard(overviewStats, "light"),
);
writeFileSync(
  "dist/github-overview-dark.svg",
  renderOverviewCard(overviewStats, "dark"),
);
