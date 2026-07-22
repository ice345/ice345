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

async function getLanguages(repository) {
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "ice345-profile-readme",
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repository}/languages`,
    { headers },
  );

  if (!response.ok) {
    throw new Error(
      `GitHub API returned ${response.status} for ${owner}/${repository}`,
    );
  }

  return response.json();
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
