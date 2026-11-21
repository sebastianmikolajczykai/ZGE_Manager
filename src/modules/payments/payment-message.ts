/** Dane zlecenia potrzebne do wiadomości (bez danych osobowych klienta: treść ich nie zawiera). */
export interface MessageOrder {
  town: string;
  plot: string | null;
  pricePln: number | null;
}

/** Dane firmy z Ustawień; pusty tekst = nie wpisano. */
export interface MessageSettings {
  bankAccount: string;
  reviewLink: string;
}

const GROSZE_PER_PLN = 100;
const THOUSANDS = /\B(?=(\d{3})+(?!\d))/g;

/**
 * SMS do klienta po oddaniu pracy (krok „Zapłata”), składany z danych zlecenia i Ustawień.
 * Null, gdy w Ustawieniach brak numeru konta (bez niego wiadomość nie ma sensu).
 * Program niczego nie wysyła: tekst tylko się kopiuje.
 */
export function paymentMessage(
  order: MessageOrder,
  workTypeName: string,
  settings: MessageSettings,
): string | null {
  if (settings.bankAccount === '') return null;
  const work = `pracy „${workTypeName}” (${order.town}${order.plot ? `, dz. ${order.plot}` : ''})`;
  const opening =
    order.pricePln === null
      ? `Dzień dobry, informujemy o zakończeniu ${work}.`
      : `Dzień dobry, w związku z zakończeniem ${work} kwota do zapłaty to ${formatAmount(order.pricePln)}, tak jak się umawialiśmy.`;
  const thanks =
    settings.reviewLink === ''
      ? 'Z góry dziękujemy.'
      : `Z góry dziękujemy i bylibyśmy bardzo wdzięczni za opinię: ${settings.reviewLink}`;
  return `${opening} Prosimy o przelew na konto: ${settings.bankAccount}. ${thanks}`;
}

/** Kwota jak w piśmie: „2 900,00 zł” (zwykłe spacje, żeby SMS wyglądał tak samo w każdym telefonie). */
export function formatAmount(pln: number): string {
  const grosze = Math.round(pln * GROSZE_PER_PLN);
  const whole = String(Math.floor(grosze / GROSZE_PER_PLN)).replace(THOUSANDS, ' ');
  const rest = String(grosze % GROSZE_PER_PLN).padStart(2, '0');
  return `${whole},${rest} zł`;
}
