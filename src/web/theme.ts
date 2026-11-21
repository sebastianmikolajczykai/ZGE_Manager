import { html, SafeHtml } from './html.js';

/**
 * Tryb jasny i ciemny. Wybór pamięta przeglądarka na tym komputerze (localStorage),
 * bez serwera. Domyślnie tryb jasny (styl C); ciemny włącza przełącznik w menu bocznym.
 * Ciemny tryb nadpisuje zmienne kolorów ze stylu C oraz kilka kolorów wpisanych na stałe.
 */

/** Klucz w pamięci przeglądarki; wartość „ciemny” = tryb ciemny, brak = jasny. */
export const THEME_STORAGE_KEY = 'zge-motyw';
const DARK_VALUE = 'ciemny';

/**
 * Skrypt w <head>: ustawia tryb jeszcze przed narysowaniem strony (bez białego mignięcia
 * przy odświeżaniu co minutę) i obsługuje kliknięcie przełącznika.
 */
const THEME_SCRIPT = `
(function () {
  var KEY = '${THEME_STORAGE_KEY}', DARK = '${DARK_VALUE}', root = document.documentElement;
  function apply(dark) {
    if (dark) root.setAttribute('data-theme', 'dark'); else root.removeAttribute('data-theme');
    var btn = document.getElementById('motyw');
    if (btn) btn.setAttribute('aria-pressed', dark ? 'true' : 'false');
  }
  var saved = null;
  try { saved = localStorage.getItem(KEY); } catch (e) { saved = null; }
  apply(saved === DARK);
  document.addEventListener('DOMContentLoaded', function () { apply(root.getAttribute('data-theme') === 'dark'); });
  document.addEventListener('click', function (e) {
    if (!e.target.closest || !e.target.closest('#motyw')) return;
    var dark = root.getAttribute('data-theme') !== 'dark';
    apply(dark);
    try { if (dark) localStorage.setItem(KEY, DARK); else localStorage.removeItem(KEY); } catch (err) { /* prywatne okno: wybór działa do zamknięcia strony */ }
  });
})();`;

// Stałe napisane w kodzie (bez danych od użytkownika), więc wstawiamy je bez zamiany znaków.
export const TRUSTED_THEME_SCRIPT = new SafeHtml(THEME_SCRIPT);

/** Przełącznik w menu bocznym; aria-pressed mówi czytnikom ekranu, czy tryb ciemny jest włączony. */
export function themeToggle(): SafeHtml {
  return html`<button type="button" class="theme-toggle" id="motyw" aria-pressed="false">
    <span class="ic" aria-hidden="true">🌙</span>Tryb ciemny<span class="switch" aria-hidden="true"></span>
  </button>`;
}

/**
 * Kolory trybu ciemnego. Kolory statusów (czerwony, żółty, zielony), pomarańczowa etykieta
 * „Uzupełnij datę pomiaru” i kolory osób zostają te same, zmienia się tło i tekst wokół nich.
 */
export const THEME_STYLES = `
/* Przełącznik trybu w menu bocznym */
.side .theme-toggle { margin-top:8px; display:flex; align-items:center; gap:10px; width:100%; padding:9px 12px; border-radius:10px; background:transparent; color:var(--side-ink); border:1px solid #1f6f43; font-size:15px; text-align:left; white-space:nowrap; }
.side .theme-toggle:hover { background:#16512f; }
.theme-toggle .switch { margin-left:auto; width:34px; height:20px; border-radius:999px; background:#1f6f43; position:relative; flex:none; }
.theme-toggle .switch::after { content:''; position:absolute; top:3px; left:3px; width:14px; height:14px; border-radius:50%; background:#d1fae5; transition:left .15s; }
.theme-toggle[aria-pressed="true"] .switch { background:var(--add); }
.theme-toggle[aria-pressed="true"] .switch::after { left:17px; background:#1f2937; }
/* Tryb ciemny: te same zmienne co w stylu C, ciemne tło i jasny tekst. */
:root[data-theme="dark"] { color-scheme:dark; --ink:#e5e7eb; --muted:#9ca3af; --line:#374151; --bg:#0d1512; --card:#18221e;
  --brand-dark:#4ade80; --side:#0a2416; --select:#60a5fa;
  --green:#14532d; --green-ink:#bbf7d0; --yellow:#422006; --yellow-ink:#fde68a; --red:#450a0a; --red-ink:#fca5a5;
  --shadow:0 1px 3px rgba(0,0,0,.6); }
:where([data-theme="dark"]) a { color:#93c5fd; }
[data-theme="dark"] input:not([type=checkbox]):not([type=radio]), [data-theme="dark"] select, [data-theme="dark"] textarea,
[data-theme="dark"] .step-btn, [data-theme="dark"] #osoba, [data-theme="dark"] .toolbar input[type=search] { background:#0f1915; color:var(--ink); border-color:#4b5563; }
[data-theme="dark"] .side nav a.add { color:#1f2937; }
[data-theme="dark"] .filter { background:#e5e7eb; color:#111827; }
[data-theme="dark"] .tile.yellow .ti { color:#fbbf24; } [data-theme="dark"] .tile.offers .ti, [data-theme="dark"] .stat.clients .ti { background:#1e3a8a; }
[data-theme="dark"] .tile.unpaid .ti { background:#4c1d95; } [data-theme="dark"] .tile.no-date .ti { background:#7c2d12; }
[data-theme="dark"] .stat.new .ti { background:#701a75; } [data-theme="dark"] .stat.progress .ti { background:#312e81; }
[data-theme="dark"] .c-red td { background:#2a1215; } [data-theme="dark"] .c-yellow td { background:#2a2010; }
[data-theme="dark"] .selected td { background:#172554 !important; }
[data-theme="dark"] tbody tr:hover td { filter:brightness(1.2); }
[data-theme="dark"] .blink td { animation-name:blink-dark; } @keyframes blink-dark { to { background:var(--card); } }
[data-theme="dark"] .chip-done, [data-theme="dark"] .status.done { background:#374151; color:var(--ink); }
[data-theme="dark"] .step.active { background:#12301f; } [data-theme="dark"] .card-red .step.active { background:#2a1215; }
[data-theme="dark"] .card-yellow .step.active { background:#2a2010; }
[data-theme="dark"] button.person { background:var(--card); } [data-theme="dark"] button.person:hover { background:var(--p); }
[data-theme="dark"] .undo-toggle { background:transparent; } [data-theme="dark"] .undo-toggle:hover, [data-theme="dark"] .undo[open] > .undo-toggle { background:var(--red); }
[data-theme="dark"] .order-buttons button { background:#374151; color:var(--ink); } [data-theme="dark"] .order-buttons button.danger { background:var(--red); color:var(--red-ink); }
[data-theme="dark"] .steps-editor td { background:var(--card) !important; }
[data-theme="dark"] .empty, [data-theme="dark"] .form-page, [data-theme="dark"] .summary { background:var(--card); }
[data-theme="dark"] .offer-call { background:#172554; } [data-theme="dark"] .offer-call textarea { border-color:#1e40af; }
[data-theme="dark"] dialog#potwierdz { background:var(--card); color:var(--ink); }
[data-theme="dark"] dialog#potwierdz::backdrop { background:rgba(0,0,0,.7); }
`;
