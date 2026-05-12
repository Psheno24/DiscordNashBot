/** Календарные даты в часовом поясе Europe/Moscow (МСК, UTC+3). */

export function mskTodayYmd(nowMs: number = Date.now()): string {
  return new Date(nowMs).toLocaleDateString("sv-SE", { timeZone: "Europe/Moscow" });
}

/** Начало следующего календарного дня по МСК (полночь → следующий день), unix ms. */
export function mskNextMidnightUtcMs(afterMs: number = Date.now()): number {
  const todayYmd = mskTodayYmd(afterMs);
  const todayStart = Date.parse(`${todayYmd}T00:00:00+03:00`);
  const next = todayStart + 24 * 60 * 60 * 1000;
  if (afterMs < todayStart) return todayStart;
  return next;
}

export function msUntilNextMskMidnight(nowMs: number = Date.now()): number {
  const next = mskNextMidnightUtcMs(nowMs);
  return Math.max(15_000, next - nowMs);
}

/** Предыдущий календарный день относительно строки todayYmd (МСК). */
export function mskPreviousDayYmd(todayYmd: string): string {
  const noon = Date.parse(`${todayYmd}T12:00:00+03:00`);
  const prev = new Date(noon - 24 * 60 * 60 * 1000);
  return prev.toLocaleDateString("sv-SE", { timeZone: "Europe/Moscow" });
}

/** День недели по календарной дате МСК: 0 = вс, 1 = пн, … 6 = сб. */
export function mskCalendarWeekdaySun0(nowMs: number = Date.now()): number {
  const ymd = mskTodayYmd(nowMs);
  return new Date(`${ymd}T12:00:00+03:00`).getUTCDay();
}

export function isMskMonday(nowMs: number = Date.now()): boolean {
  return mskCalendarWeekdaySun0(nowMs) === 1;
}
