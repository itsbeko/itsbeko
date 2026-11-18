// Carte "Most used languages" calculée sur TOUS tes dépôts (privés compris si LANGS_TOKEN est fourni).
// Usage : LANGS_TOKEN=... node scripts/langs.mjs <dossier-de-sortie> [login]
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT = process.argv[2] || "dist";
const LOGIN = process.argv[3] || process.env.GITHUB_REPOSITORY_OWNER || "itsbeko";
const PAT = process.env.LANGS_TOKEN;           // token perso : voit les dépôts privés
const TOKEN = PAT || process.env.GITHUB_TOKEN; // sinon : dépôts publics seulement
const MAX = 8;

const COLORS = {
  JavaScript: "#f1e05a", TypeScript: "#3178c6", Rust: "#dea584", C: "#555555", "C++": "#f34b7d",
  "C#": "#178600", HTML: "#e34c26", CSS: "#663399", SCSS: "#c6538c", Shell: "#89e051", Astro: "#ff5a03",
  Python: "#3572A5", Go: "#00ADD8", Java: "#b07219", Kotlin: "#A97BFF", Swift: "#F05138", Lua: "#000080",
  Vue: "#41b883", Svelte: "#ff3e00", PHP: "#4F5D95", Dockerfile: "#384d54", PowerShell: "#012456",
  Batchfile: "#C1F12E", Makefile: "#427819", MDX: "#fcb32c", "Objective-C": "#438eff", GLSL: "#5686a5",
};

async function gh(path) {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "langs-card", ...(TOKEN && { Authorization: `Bearer ${TOKEN}` }) },
  });
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${await res.text()}`);
  return res.json();
}

async function repos() {
  const all = [];
  for (let page = 1; ; page++) {
    const batch = PAT
      ? await gh(`/user/repos?affiliation=owner&per_page=100&page=${page}`)
      : await gh(`/users/${LOGIN}/repos?per_page=100&page=${page}`);
    all.push(...batch);
    if (batch.length < 100) break;
  }
  return all.filter((r) => !r.fork && !r.archived);
}

async function main() {
  const totals = {};
  const list = await repos();
  for (const r of list) {
    for (const [lang, bytes] of Object.entries(await gh(`/repos/${r.full_name}/languages`))) {
      totals[lang] = (totals[lang] || 0) + bytes;
    }
  }
  const sum = Object.values(totals).reduce((a, b) => a + b, 0) || 1;
  let langs = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  if (langs.length > MAX) {
    const rest = langs.slice(MAX - 1).reduce((a, [, b]) => a + b, 0);
    langs = [...langs.slice(0, MAX - 1), ["Other", rest]];
  }
  langs = langs.map(([name, bytes]) => ({ name, pct: (bytes / sum) * 100, color: COLORS[name] || "#b9a6e0" }));

  const W = 350, H = 165, X = 25, BAR = W - 2 * X;
  let x = X;
  const bar = langs.map((l) => {
    const w = Math.max((l.pct / 100) * BAR, 1.5);
    const s = `<rect x="${x.toFixed(2)}" y="48" width="${w.toFixed(2)}" height="8" fill="${l.color}"/>`;
    x += w;
    return s;
  }).join("");
  const legend = langs.map((l, i) => {
    const lx = X + (i % 2) * 155, ly = 80 + Math.floor(i / 2) * 20;
    return `<circle cx="${lx + 5}" cy="${ly - 4}" r="5" fill="${l.color}"/>` +
      `<text x="${lx + 16}" y="${ly}" class="t">${l.name} <tspan class="p">${l.pct.toFixed(1)}%</tspan></text>`;
  }).join("");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <style>
    .h{font:600 18px 'Segoe UI',Ubuntu,sans-serif;fill:#ff3b5c}
    .t{font:400 12px 'Segoe UI',Ubuntu,sans-serif;fill:#fdf3c7}
    .p{fill:#b9a6e0}
    .s{font:400 10px 'Segoe UI',Ubuntu,sans-serif;fill:#b9a6e0}
  </style>
  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="4.5" fill="#1a1033" stroke="#6b3fa0"/>
  <text x="${X}" y="33" class="h">Most used languages</text>
  <clipPath id="c"><rect x="${X}" y="48" width="${BAR}" height="8" rx="4"/></clipPath>
  <g clip-path="url(#c)">${bar}</g>
  ${legend}
</svg>`;

  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, "langs.svg"), svg);
  console.log(`OK : ${list.length} dépôts (${PAT ? "privés compris" : "publics seulement"}) ->`,
    langs.map((l) => `${l.name} ${l.pct.toFixed(1)}%`).join(", "));
}

await main();
