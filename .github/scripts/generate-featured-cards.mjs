import { mkdirSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { themes } from "./generate-language-card.mjs";

export const projects = [
  {
    id: "markdown-table-wrap",
    title: "markdown-table-wrap.nvim",
    description: [
      "Wraps Markdown pipe tables in Neovim.",
      "Original source is never auto-rewritten.",
    ],
    metrics: [
      { value: "Reader", label: "Inline · Float views" },
      { value: "0.10+", label: "Neovim · Lua · CJK" },
    ],
  },
  {
    id: "anishell",
    title: "AniShell",
    description: [
      "A Unix shell written in Rust.",
      "Pipes, redirects, quoting, globbing, completion.",
    ],
    metrics: [
      { value: "63", label: "unit + integration tests" },
      { value: "Rust", label: "Unix · vi mode · history" },
    ],
  },
  {
    id: "dotfiles",
    title: "dotfiles",
    description: [
      "chezmoi-managed ~/.config for both machines.",
      "Shared nvim, kitty, yazi; Hyprland on Linux.",
    ],
    metrics: [
      { value: "Linux", label: "Hyprland · waybar · rofi" },
      { value: "macOS", label: "nvim · kitty · yazi" },
    ],
  },
  {
    id: "anime-horizon",
    title: "Anime Horizon",
    description: [
      "Seasonal anime guide with AniList data.",
      "Local cache and AI-assisted notes.",
    ],
    metrics: [
      { value: "AniList", label: "live API or local cache" },
      { value: "Live", label: "anime.050626.xyz" },
    ],
  },
];

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function renderFeaturedCard(project, themeName) {
  const theme = themes[themeName];
  const desc = project.description
    .map(
      (line, index) =>
        `<text x="24" y="${68 + index * 20}" class="body">${escapeXml(line)}</text>`,
    )
    .join("\n  ");
  const metrics = project.metrics
    .map((metric, index) => {
      const x = 24 + index * 196;
      return `
    <text x="${x}" y="152" class="metric">${escapeXml(metric.value)}</text>
    <text x="${x}" y="176" class="label">${escapeXml(metric.label)}</text>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="420" height="210" viewBox="0 0 420 210" role="img" aria-labelledby="title desc">
  <title id="title">${escapeXml(project.title)}</title>
  <desc id="desc">${escapeXml(project.description.join(" "))} ${escapeXml(project.metrics.map((metric) => `${metric.value} ${metric.label}`).join("; "))}</desc>
  <style>
    text { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .heading { fill: ${theme.title}; font-size: 19px; font-weight: 650; }
    .body { fill: ${theme.text}; font-size: 14px; }
    .label { fill: ${theme.muted}; font-size: 13px; }
    .metric { fill: ${theme.title}; font-size: 24px; font-weight: 650; }
  </style>
  <rect x="0.5" y="0.5" width="419" height="209" rx="14" fill="${theme.background}" stroke="${theme.border}" />
  <path d="M24 30 H38" stroke="${theme.accent}" stroke-width="3" stroke-linecap="round" />
  <text x="48" y="36" class="heading">${escapeXml(project.title)}</text>
  ${desc}
  <path d="M24 124 H396" stroke="${theme.border}" />
  ${metrics}
</svg>
`;
}

export function generateFeaturedCards(directory = "assets/featured") {
  mkdirSync(directory, { recursive: true });
  for (const project of projects) {
    for (const themeName of Object.keys(themes)) {
      writeFileSync(
        `${directory}/${project.id}-${themeName}.svg`,
        renderFeaturedCard(project, themeName),
      );
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  generateFeaturedCards();
  console.log("Generated featured project cards in assets/featured.");
}
