// Génère un lézard animé qui mange le graphe de contributions GitHub.
// Usage : GITHUB_TOKEN=... node scripts/lizard.mjs <dossier-de-sortie> [login]
// Sans GITHUB_TOKEN, utilise des données de démo (pour prévisualiser).
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT = process.argv[2] || "dist";
const LOGIN = process.argv[3] || process.env.GITHUB_REPOSITORY_OWNER || "itsbeko";
const TOKEN = process.env.GITHUB_TOKEN;

const LEVEL = { NONE: 0, FIRST_QUARTILE: 1, SECOND_QUARTILE: 2, THIRD_QUARTILE: 3, FOURTH_QUARTILE: 4 };

async function fetchWeeks() {
  if (!TOKEN) {
    // Données de démo : 53 semaines aléatoires mais stables.
    let s = 42;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    return Array.from({ length: 53 }, () =>
      Array.from({ length: 7 }, () => {
        const r = rnd();
        const level = r < 0.55 ? 0 : r < 0.7 ? 1 : r < 0.82 ? 2 : r < 0.93 ? 3 : 4;
        return { level, count: level * 3 };
      })
    );
  }
  const query = `query($login:String!){user(login:$login){contributionsCollection{contributionCalendar{
    weeks{contributionDays{contributionCount contributionLevel}}}}}}`;
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json", "User-Agent": "lizard-graph" },
    body: JSON.stringify({ query, variables: { login: LOGIN } }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) throw new Error(JSON.stringify(json.errors || json));
  return json.data.user.contributionsCollection.contributionCalendar.weeks.map((w) =>
    w.contributionDays.map((d) => ({ level: LEVEL[d.contributionLevel] ?? 0, count: d.contributionCount }))
  );
}

const THEMES = {
  light: {
    empty: "#ebedf0",
    levels: ["#ebedf0", "#d9c8f5", "#a57be0", "#ff6b8a", "#ff3b5c"],
    text: "#4b2a8a",
    body: "#ff3b5c", belly: "#ffd84a", outline: "#4b2a8a", eye: "#1a1033",
  },
  dark: {
    empty: "#1d1530",
    levels: ["#1d1530", "#4b2a8a", "#8a4fd0", "#e0447a", "#ff3b5c"],
    text: "#fdf3c7",
    body: "#ff3b5c", belly: "#ffd84a", outline: "#1a1033", eye: "#1a1033",
  },
};

const P = 15;        // pas de la grille
const C = 11;        // taille d'une case
const PAD = 16;      // marge autour
const STEP = 0.07;   // secondes par case
const PAUSE = 2.5;   // pause à la fin avant de recommencer

function lizard(t) {
  // Lézard vu de dessus, tête vers +x, centré sur (0,0).
  const leg = (x, side, delay) => `
    <g transform="translate(${x} ${side * 2.6})">
      <path d="M0 0 L${-1.5} ${side * 4.2} L${0.8} ${side * 5.4}" fill="none" stroke="${t.body}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
        <animateTransform attributeName="transform" type="rotate" values="${side * -22};${side * 22};${side * -22}" dur="0.32s" begin="${delay}s" repeatCount="indefinite"/>
      </path>
    </g>`;
  return `
  <g id="lizard" transform="scale(1.45)">
    <path d="M-5 -2.2 Q-12 -1.5 -19 0 Q-12 1.5 -5 2.2 Z" fill="${t.body}" stroke="${t.outline}" stroke-width="0.7">
      <animateTransform attributeName="transform" type="skewY" values="-6;6;-6" dur="0.64s" repeatCount="indefinite"/>
    </path>
    ${leg(3.2, -1, 0)}${leg(3.2, 1, 0.16)}${leg(-3.4, -1, 0.16)}${leg(-3.4, 1, 0)}
    <ellipse cx="-0.5" cy="0" rx="6.5" ry="3.6" fill="${t.body}" stroke="${t.outline}" stroke-width="0.7"/>
    <ellipse cx="-0.5" cy="0" rx="4" ry="1.3" fill="${t.belly}" opacity="0.85"/>
    <line x1="10.5" y1="0" x2="14" y2="0" stroke="#ff8fb1" stroke-width="0.9" stroke-linecap="round">
      <animate attributeName="opacity" values="0;0;1;0" dur="0.9s" repeatCount="indefinite"/>
    </line>
    <ellipse cx="7.5" cy="0" rx="4" ry="3" fill="${t.body}" stroke="${t.outline}" stroke-width="0.7"/>
    <circle cx="8.6" cy="-1.7" r="0.95" fill="${t.belly}"/><circle cx="8.6" cy="1.7" r="0.95" fill="${t.belly}"/>
    <circle cx="8.9" cy="-1.7" r="0.45" fill="${t.eye}"/><circle cx="8.9" cy="1.7" r="0.45" fill="${t.eye}"/>
  </g>`;
}

function render(weeks, t) {
  const cols = weeks.length;
  const W = PAD * 2 + (cols - 1) * P + C;
  const H = PAD * 2 + 6 * P + C + 22;
  const center = (c, r) => [PAD + c * P + C / 2, PAD + r * P + C / 2];

  // Trajet en zigzag : descend une colonne, remonte la suivante.
  const order = [];
  weeks.forEach((days, c) => {
    const rows = [...days.keys()];
    (c % 2 ? rows.reverse() : rows).forEach((r) => order.push([c, r]));
  });
  const move = (order.length - 1) * STEP;
  const D = move + PAUSE;
  const path = order.map(([c, r], i) => `${i ? "L" : "M"}${center(c, r).join(" ")}`).join(" ");
  const f = (x) => x.toFixed(5);

  let total = 0;
  const cells = order.map(([c, r], i) => {
    const d = weeks[c][r];
    total += d.count;
    const fill = t.levels[d.level];
    const x = PAD + c * P, y = PAD + r * P;
    if (!d.level) return `<rect x="${x}" y="${y}" width="${C}" height="${C}" rx="2.5" fill="${t.empty}"/>`;
    const k = (i * STEP) / D;
    return `<rect x="${x}" y="${y}" width="${C}" height="${C}" rx="2.5" fill="${fill}">` +
      `<animate attributeName="fill" values="${fill};${fill};${t.empty};${t.empty};${fill}" ` +
      `keyTimes="0;${f(k)};${f(k + 0.002)};${f(move / D + 0.02)};1" dur="${D.toFixed(2)}s" repeatCount="indefinite"/></rect>`;
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <defs>${lizard(t)}</defs>
  ${cells.join("\n  ")}
  <use href="#lizard">
    <animateMotion path="${path}" rotate="auto" dur="${D.toFixed(2)}s" repeatCount="indefinite"
      keyPoints="0;1;1" keyTimes="0;${f(move / D)};1" calcMode="linear"/>
  </use>
  <text x="${W / 2}" y="${H - 8}" text-anchor="middle" fill="${t.text}" font-family="ui-monospace,SFMono-Regular,Consolas,monospace" font-size="11" font-weight="700">🦎 ${total} contributions dévorées cette année</text>
</svg>`;
}

const weeks = await fetchWeeks();
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "lizard.svg"), render(weeks, THEMES.light));
writeFileSync(join(OUT, "lizard-dark.svg"), render(weeks, THEMES.dark));
console.log(`OK : ${weeks.length} semaines -> ${OUT}/lizard.svg, ${OUT}/lizard-dark.svg`);
