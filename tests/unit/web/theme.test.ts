import { describe, it, expect } from 'vitest';
import { layout } from '../../../src/web/views.js';
import { html } from '../../../src/web/html.js';
import { THEME_STORAGE_KEY } from '../../../src/web/theme.js';

describe('tryb jasny i ciemny', () => {
  const page = layout('Tablica', html`<p>treść</p>`).toString();
  const head = page.slice(0, page.indexOf('<body>'));
  const themeScript = head.slice(head.indexOf('<script id="motyw-skrypt">'), head.indexOf('</script>'));
  const menu = page.slice(page.indexOf('<aside'), page.indexOf('</aside>'));

  it('starts in the light mode: the page itself does not set the dark theme', () => {
    expect(page).toMatch(/<html lang="pl">/);
    expect(page).not.toContain('<html lang="pl" data-theme');
  });

  it('has a "Tryb ciemny" switch in the side menu that says whether it is on', () => {
    expect(menu).toMatch(/<button[^>]*type="button"[^>]*id="motyw"[^>]*aria-pressed="false"/);
    expect(menu).toContain('Tryb ciemny');
  });

  it('applies the remembered choice in <head>, before the page is drawn (no white flash)', () => {
    expect(themeScript).toContain(`'${THEME_STORAGE_KEY}'`);
    expect(themeScript).toContain('localStorage.getItem(');
    expect(themeScript).toContain('data-theme');
    expect(themeScript).not.toMatch(/&amp;|&#39;|&quot;/);
  });

  it('a blocked browser storage (private window) does not break the page', () => {
    expect(themeScript).toMatch(/try\s*\{/);
  });

  it('has dark colours for the whole app: background, cards, text and form fields', () => {
    const style = page.slice(page.indexOf('<style>'), page.indexOf('</style>'));
    expect(style).toContain(':root[data-theme="dark"]');
    expect(style).toContain('color-scheme:dark');
    for (const variable of ['--bg:', '--card:', '--ink:', '--muted:', '--line:'])
      expect(style.slice(style.indexOf(':root[data-theme="dark"]'))).toContain(variable);
  });

  it('keeps the orange "Uzupełnij datę pomiaru" label the same in both modes', () => {
    const style = page.slice(page.indexOf('<style>'), page.indexOf('</style>'));
    expect(style).not.toMatch(/data-theme="dark"\][^{]*\.missing-date/);
  });
});
