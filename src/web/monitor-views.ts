import { html, SafeHtml } from './html.js';
import { avatar, progressBar, STATUS_ICON } from './view-helpers.js';
import { refreshMs, type NavCounts } from './views.js';
import type { BoardRow } from '../modules/board/board-service.js';
import { orderLabel } from '../modules/orders/order-label.js';
import type { Colour } from '../modules/urgency/urgency-rules.js';

/**
 * Widok na monitor (styl D): duże kafle czytelne z kilku metrów, np. na telewizorze w biurze.
 * Osobna strona bez menu; sama się odświeża i pokazuje zegar.
 */

const COLOURS: readonly Colour[] = ['red', 'yellow', 'green'];
const COLOUR_LABEL: Record<Colour, string> = {
  red: 'po terminie',
  yellow: 'ostatni dzień',
  green: 'w terminie',
};

export function monitorPage(rows: BoardRow[], counts: NavCounts, refreshSeconds: number): string {
  const script = new SafeHtml(`var REFRESH_MS = ${refreshMs(refreshSeconds)};${MONITOR_SCRIPT}`);
  return html`<!doctype html>
    <html lang="pl">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>ZGE Menedżer · monitor</title>
        <style>
          ${TRUSTED_STYLES}
        </style>
      </head>
      <body>
        <header class="top">
          <div class="brand">
            <span class="logo" role="img" aria-label="Geodezja-ZGE"
              ><span class="logo-top">GEODEZJA</span><span class="logo-zge">ZGE</span></span
            >
            ZGE Menedżer · widok na monitor <a class="back" href="/">← Tablica</a>
          </div>
          <div class="clock"><span id="zegar"></span><small id="data"></small></div>
        </header>
        ${summary(rows, counts)}
        ${
          rows.length === 0
            ? html`<p class="empty">Brak aktywnych zleceń.</p>`
            : html`<div class="wall">${rows.map(tile)}</div>`
        }
        <script>
          ${script};
        </script>
      </body>
    </html>`.value;
}

/** Pasek liczników na górze: kolory zleceń oraz sprawy z Ofert i Niezapłaconych. */
function summary(rows: BoardRow[], counts: NavCounts): SafeHtml {
  const box = (cls: string, count: number, text: string) =>
    html`<div class="s ${cls}"><b>${count}</b> ${text}</div>`;
  return html`<div class="sum">
    ${COLOURS.map((c) =>
      box(c, rows.filter((r) => r.urgency.colour === c).length, `${STATUS_ICON[c]} ${COLOUR_LABEL[c]}`),
    )}
    ${box('blue', counts.offersToCall, '📞 oferty do telefonu')}
    ${box('purple', counts.unpaidToRemind, '💰 przypomnij o zapłacie')}
  </div>`;
}

function tile(r: BoardRow): SafeHtml {
  const { colour, blink, daysOverdue } = r.urgency;
  const late = daysOverdue > 0 ? ` · ${daysOverdue} ${dayWord(daysOverdue)}` : '';
  return html`<article class="t ${colour}${blink ? ' blink' : ''}">
    <div class="lab">${STATUS_ICON[colour]} ${COLOUR_LABEL[colour]}${late}</div>
    <div class="n">${orderLabel(r)}</div>
    <div class="tw">📍 ${r.town}${r.plot ? `, dz. ${r.plot}` : ''}</div>
    <div class="st">${r.currentStepName}</div>
    ${r.measurementMissing ? html`<div class="nd">📅 Uzupełnij datę pomiaru</div>` : ''}
    ${progressBar(r.currentStepPosition, r.stepCount)}
    <div class="ft">
      <span>${who(r)}</span>
      <span><b>${r.daysOnStep}</b> ${dayWord(r.daysOnStep)} na kroku</span>
    </div>
  </article>`;
}

/** Czyja kolej: osoby bieżących kroków; gdy nikt nie jest przypisany, kto ostatnio coś zrobił. */
function who(r: BoardRow): SafeHtml | string {
  if (r.owners.length > 0) return html`${r.owners.map((name) => html`${avatar(name)} ${name} `)}`;
  if (r.lastPerson) return html`<small>ostatnio</small> ${avatar(r.lastPerson)} ${r.lastPerson}`;
  return '–';
}

function dayWord(n: number): string {
  return n === 1 ? 'dzień' : 'dni';
}

const MONITOR_SCRIPT = `
function tick() {
  var now = new Date();
  document.getElementById('zegar').textContent = now.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
  document.getElementById('data').textContent = now.toLocaleDateString('pl-PL', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
}
tick();
setInterval(tick, 10000);
// Na monitorze nikt nic nie wpisuje, więc strona odświeża się zawsze.
setInterval(function () { location.reload(); }, REFRESH_MS);`;

const STYLES = `
* { box-sizing:border-box; }
body { margin:0; font:18px/1.35 "Segoe UI", Inter, system-ui, sans-serif; background:#0b1220; color:#e5e7eb; }
.top { display:flex; justify-content:space-between; align-items:center; padding:14px 28px; border-bottom:1px solid #1f2937; }
.brand { display:flex; gap:14px; align-items:center; font-size:24px; font-weight:700; color:#fff; }
.logo { display:inline-grid; border:2px solid currentColor; padding:2px 7px 4px; line-height:1; font-weight:700; letter-spacing:.04em; }
.logo-top { font-size:11px; text-align:right; } .logo-zge { font-size:18px; border:2px solid currentColor; padding:0 4px; justify-self:start; margin-top:3px; }
.back { font-size:15px; font-weight:500; color:#9ca3af; margin-left:10px; }
.clock { font-size:34px; font-weight:700; color:#fff; text-align:right; } .clock small { display:block; font-size:16px; color:#9ca3af; font-weight:500; }
.sum { display:flex; gap:14px; padding:16px 28px; }
.s { flex:1; border-radius:16px; padding:14px 18px; display:flex; align-items:center; gap:14px; font-size:20px; font-weight:600; color:#fff; }
.s b { font-size:48px; line-height:1; }
.s.red { background:#7f1d1d; } .s.yellow { background:#78350f; } .s.green { background:#14532d; } .s.blue { background:#1e3a8a; } .s.purple { background:#581c87; }
.wall { display:grid; grid-template-columns:repeat(auto-fill, minmax(320px, 1fr)); gap:14px; padding:0 28px 28px; }
.t { border-radius:18px; padding:16px 18px; background:#111827; border-top:10px solid; min-height:180px; display:flex; flex-direction:column; gap:4px; }
.t.red { border-color:#ef4444; background:#2a1215; } .t.yellow { border-color:#f59e0b; background:#2a2010; } .t.green { border-color:#22c55e; }
.t.blink { animation:pulse 2s infinite; }
@keyframes pulse { 50% { box-shadow:0 0 0 5px rgba(239,68,68,.5); } }
@media (prefers-reduced-motion: reduce) { .t.blink { animation:none; box-shadow:0 0 0 5px rgba(239,68,68,.5); } }
.lab { font-size:16px; font-weight:800; letter-spacing:.06em; text-transform:uppercase; }
.t.red .lab { color:#fca5a5; } .t.yellow .lab { color:#fcd34d; } .t.green .lab { color:#86efac; }
.n { font-size:26px; font-weight:800; color:#fff; } .tw { color:#9ca3af; font-size:17px; } .st { font-size:20px; margin-top:6px; color:#f3f4f6; }
.nd { display:inline-block; margin-top:8px; padding:4px 12px; border-radius:999px; background:#ffedd5; color:#9a3412; font-size:18px; font-weight:800; }
.progress { display:flex; align-items:center; gap:8px; margin-top:4px; } .progress small { color:#9ca3af; font-size:15px; }
.bar { display:inline-block; flex:1; height:8px; border-radius:4px; background:#374151; overflow:hidden; } .bar span { display:block; height:100%; background:#22c55e; }
.ft { margin-top:auto; display:flex; justify-content:space-between; align-items:center; font-size:17px; color:#d1d5db; padding-top:8px; }
.ft b { font-size:30px; color:#fff; } .ft small { color:#9ca3af; font-size:14px; }
.av { display:inline-grid; place-items:center; width:32px; height:32px; border-radius:50%; background:var(--p); color:#fff; font-size:16px; font-weight:700; vertical-align:middle; }
.empty { font-size:28px; text-align:center; color:#9ca3af; padding:80px 0; }
`;

// Stałe napisane w kodzie (bez danych od użytkownika), więc wstawiamy je bez zamiany znaków.
const TRUSTED_STYLES = new SafeHtml(STYLES);
