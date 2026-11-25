import { CalendarApiError, type CalendarApi } from '../../../src/modules/calendar-sync/calendar-api.js';
import type { PlannedReminder } from '../../../src/modules/calendar-sync/reminder-plan.js';

/** Atrapa Kalendarza Google: trzyma wydarzenia w pamięci, może udawać brak internetu itp. */
export class FakeCalendar implements CalendarApi {
  calendars: string[] = [];
  events = new Map<string, PlannedReminder & { calendarId: string }>();
  failWith: CalendarApiError | null = null;
  calls: string[] = [];
  private next = 1;

  async createCalendar(name: string): Promise<string> {
    this.guard('createCalendar');
    this.calendars.push(name);
    return `cal-${this.calendars.length}`;
  }
  async insertEvent(calendarId: string, r: PlannedReminder): Promise<string> {
    this.guard('insert');
    if (!this.calendars.length) throw new CalendarApiError('not_found');
    const id = `ev-${this.next++}`;
    this.events.set(id, { ...r, calendarId });
    return id;
  }
  async updateEvent(calendarId: string, eventId: string, r: PlannedReminder): Promise<void> {
    this.guard('update');
    if (!this.events.has(eventId)) throw new CalendarApiError('not_found');
    this.events.set(eventId, { ...r, calendarId });
  }
  async deleteEvent(_calendarId: string, eventId: string): Promise<void> {
    this.guard('delete');
    if (!this.events.delete(eventId)) throw new CalendarApiError('not_found');
  }
  titles(): string[] {
    return [...this.events.values()].map((e) => `${e.title} @ ${e.date}`).sort();
  }
  private guard(call: string): void {
    this.calls.push(call);
    if (this.failWith) throw this.failWith;
  }
}
