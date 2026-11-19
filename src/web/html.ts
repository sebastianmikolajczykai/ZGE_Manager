/** Fragment HTML, który jest już bezpieczny (nie będzie ponownie zamieniany). */
export class SafeHtml {
  constructor(readonly value: string) {}
}

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => ESCAPES[ch] ?? ch);
}

type Part = SafeHtml | string | number | null | undefined | false | readonly Part[];

function render(part: Part): string {
  if (part === null || part === undefined || part === false) return '';
  if (part instanceof SafeHtml) return part.value;
  if (Array.isArray(part)) return part.map(render).join('');
  return escapeHtml(String(part));
}

/** Szablon HTML: każda wstawiana wartość jest zabezpieczana przed wstrzyknięciem kodu. */
export function html(strings: TemplateStringsArray, ...values: Part[]): SafeHtml {
  return new SafeHtml(
    strings.reduce((out, s, i) => out + s + (i < values.length ? render(values[i]) : ''), ''),
  );
}
