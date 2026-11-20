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

  it('uses the ZGE colours: black header and green from geodezja-zge.pl', () => {
    expect(page).toContain('--brand:#189400');
    expect(page).toContain('--header:#000');
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
});
