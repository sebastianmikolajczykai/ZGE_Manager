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
    const script = page.slice(page.indexOf('<script>'), page.indexOf('</script>', page.indexOf('<script>')));
    expect(style).toContain('"Segoe UI"');
    expect(style).not.toContain('&quot;');
    expect(script).toContain('&&');
    expect(script).not.toMatch(/&amp;|&#39;|&quot;/);
  });

  it('an expanded fold (steps, history) does not stop the auto-refresh, only open undo/reject forms do', () => {
    const script = page.slice(page.indexOf('<script>'), page.indexOf('</script>', page.indexOf('<script>')));
    expect(script).toContain('details[open]:not(.fold)');
  });

  it('remembers which folds were open, so the 60-second refresh does not close them', () => {
    const script = page.slice(page.indexOf('<script>'), page.indexOf('</script>', page.indexOf('<script>')));
    expect(script).toContain('localStorage');
    expect(script).toContain('data-fold');
  });

  it('is checked: an invalid refresh time is refused', () => {
    expect(() => layout('x', html``, 0)).toThrow('Nieprawidłowy czas odświeżania');
  });

  it('makes the − / + buttons change the number next to them within its min and max', () => {
    const script = page.slice(page.indexOf('<script>'), page.indexOf('</script>', page.indexOf('<script>')));
    expect(script).toContain('[data-step]');
    expect(script).toContain("getAttribute('min')");
    expect(script).toContain("getAttribute('max')");
  });

  it('does not reload the list while something is typed in the search box', () => {
    const script = page.slice(page.indexOf('<script>'), page.indexOf('</script>', page.indexOf('<script>')));
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

describe('layout: okienko „Czy na pewno?”', () => {
  const withConfirm = layout('Tablica', html`<p>treść</p>`, 60, undefined, true).toString();
  const without = layout('Tablica', html`<p>treść</p>`, 60, undefined, false).toString();

  it('has a centred confirmation window with "Tak" and "Anuluj" when switched on', () => {
    const dialog = withConfirm.slice(withConfirm.indexOf('<dialog'), withConfirm.indexOf('</dialog>'));
    expect(dialog).toContain('Czy na pewno?');
    expect(dialog).toMatch(/<button[^>]*value="tak"[^>]*>\s*Tak, zapisz/);
    expect(dialog).toMatch(/<button[^>]*value="anuluj"[^>]*>\s*Anuluj/);
  });

  it('asks only for clicks on a card (orders, offers, payments), not on the settings screen', () => {
    const script = withConfirm.slice(
      withConfirm.indexOf('<script>'),
      withConfirm.indexOf('</script>', withConfirm.indexOf('<script>')),
    );
    expect(script).toContain('.detail form.people');
  });

  it('when switched off, still asks for forms that undo several entries at once', () => {
    expect(without).toContain('<dialog id="potwierdz"');
    expect(without).toContain('data-all="0"');
    expect(withConfirm).toContain('data-all="1"');
    const script = without.slice(
      without.indexOf('<script>'),
      without.indexOf('</script>', without.indexOf('<script>')),
    );
    expect(script).toContain('.detail form.people[data-confirm]');
  });

  it('does not reload the page while the question is open', () => {
    const script = withConfirm.slice(
      withConfirm.indexOf('<script>'),
      withConfirm.indexOf('</script>', withConfirm.indexOf('<script>')),
    );
    expect(script).toContain('dialog[open]');
  });

  it('when switched off in Ustawienia, a normal click on a person does not ask', () => {
    // okienko istnieje, ale skrypt pyta tylko formularze z data-confirm (cofanie kilku wpisów)
    expect(without).toContain('data-all="0"');
    const script = without.slice(
      without.indexOf('<script>'),
      without.indexOf('</script>', without.indexOf('<script>')),
    );
    expect(script).toContain("askAll ? '.detail form.people' : '.detail form.people[data-confirm]'");
  });
});
