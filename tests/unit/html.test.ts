import { describe, it, expect } from 'vitest';
import { html, escapeHtml } from '../../src/web/html.js';

describe('html template', () => {
  it('escapes inserted text', () => {
    expect(html`<b>${'<i>"x" & \'y\'</i>'}</b>`.value).toBe(
      '<b>&lt;i&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/i&gt;</b>',
    );
  });

  it('does not double-escape nested safe fragments and joins lists', () => {
    const items = ['a', 'b'].map((x) => html`<li>${x}</li>`);
    const out = html`<ul>
      ${items}
    </ul>`.value;
    expect(out.replace(/\s+/g, '')).toBe('<ul><li>a</li><li>b</li></ul>');
  });

  it('skips null, undefined and false', () => {
    expect(html`${null}${undefined}${false}${0}`.value).toBe('0');
  });

  it('escapeHtml leaves plain text unchanged', () => {
    expect(escapeHtml('Nowy Sącz')).toBe('Nowy Sącz');
  });
});
