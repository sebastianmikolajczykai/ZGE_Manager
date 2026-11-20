import { describe, it, expect } from 'vitest';
import { layout } from '../../../src/web/views.js';
import { html } from '../../../src/web/html.js';

describe('layout (wygląd w stylu ZGE)', () => {
  const page = layout('Tablica', html`<p>treść</p>`).toString();

  it('shows the ZGE logo mark (GEODEZJA / ZGE) named for screen readers', () => {
    expect(page).toMatch(/class="logo"[^>]*aria-label="Geodezja-ZGE"/);
    expect(page).toContain('GEODEZJA');
    expect(page).toContain('>ZGE<');
  });

  it('uses the ZGE green (geodezja-zge.pl) and the dark green side menu of design C', () => {
    expect(page).toContain('--brand:#189400');
    expect(page).toContain('--side:#0f3d24');
  });

  it('keeps CSS and the auto-refresh script unescaped (otherwise the browser ignores them)', () => {
    const style = page.slice(page.indexOf('<style>'), page.indexOf('</style>'));
    const script = page.slice(page.indexOf('<script>'), page.indexOf('</script>'));
    expect(style).toContain('"Segoe UI"');
    expect(style).not.toContain('&quot;');
    expect(script).toContain('&&');
    expect(script).not.toMatch(/&amp;|&#39;|&quot;/);
  });

  it('an expanded fold (steps, history) does not stop the auto-refresh, only open undo/reject forms do', () => {
    const script = page.slice(page.indexOf('<script>'), page.indexOf('</script>'));
    expect(script).toContain('details[open]:not(.fold)');
  });

  it('remembers which folds were open, so the 60-second refresh does not close them', () => {
    const script = page.slice(page.indexOf('<script>'), page.indexOf('</script>'));
    expect(script).toContain('localStorage');
    expect(script).toContain('data-fold');
  });

  it('is checked: an invalid refresh time is refused', () => {
    expect(() => layout('x', html``, 0)).toThrow('Nieprawidłowy czas odświeżania');
  });

  it('does not reload the list while something is typed in the search box', () => {
    const script = page.slice(page.indexOf('<script>'), page.indexOf('</script>'));
    expect(script).toContain("getElementById('szukaj')");
  });
});

describe('layout: menu boczne (styl C)', () => {
  const page = layout('Tablica', html`<p>treść</p>`, 60, { offersToCall: 2, unpaidToRemind: 0 }).toString();
  const menu = page.slice(page.indexOf('<aside'), page.indexOf('</aside>'));

  it('has the side menu with all screens and the yellow "+ Dodaj zlecenie" button', () => {
    for (const href of ['/', '/oferty', '/niezaplacone', '/ustawienia'])
      expect(menu).toContain(`href="${href}"`);
    expect(menu).toMatch(/class="add"[^>]*>\s*\+ Dodaj zlecenie/);
  });

  it('shows how many offers wait for a call, and no badge when nothing waits', () => {
    expect(menu).toMatch(/href="\/oferty"[\s\S]*?class="badge"[^>]*>2</);
    expect(menu.slice(menu.indexOf('href="/niezaplacone"'))).not.toMatch(
      /^[^\n]*?class="badge"[^<]*<\/span>\s*<\/a>/,
    );
    expect(menu).not.toContain('>0<');
  });

  it('keeps icons and badges out of link names (screen readers and tests read "Oferty")', () => {
    expect(menu).toMatch(/<span class="ic" aria-hidden="true">/);
    expect(menu).toMatch(/class="badge" aria-hidden="true"/);
  });
});
