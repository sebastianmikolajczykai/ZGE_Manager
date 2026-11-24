/**
 * Nazwa zlecenia na listach (Tablica, monitor, Niezapłacone, kalendarz): numer z biura, np. „125 podział”.
 * Starsze zlecenia bez numeru pokazują się jak dotąd, po imieniu i nazwisku klienta.
 */
export function orderLabel(order: { orderNumber: string | null; clientName: string }): string {
  return order.orderNumber ?? order.clientName;
}
