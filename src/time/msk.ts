/**
 * Фиксированный сдвиг UTC+3 (без перехода на летнее время) — календарный день для голоса/ставок.
 */
export const MSK_OFFSET_MS = 3 * 60 * 60 * 1000;

/** Календарный день по UTC+3 (YYYY-MM-DD) — для сброса дневных счётчиков. */
export function mskCalendarDayKey(ts: number): string {
  const d = new Date(ts + MSK_OFFSET_MS);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}
