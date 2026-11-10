import { mskTodayYmd } from "./mskCalendar.js";
import { createJsonStore } from "../storage/jsonStore.js";

interface MidnightTickState {
  /** YYYY-MM-DD — последний успешно завершённый суточный тик (МСК). */
  lastCompletedMskYmd?: string;
}

const tickJson = createJsonStore<MidnightTickState>({
  fileName: "economy-midnight-tick.json",
  empty: () => ({}),
});

export function getLastCompletedMidnightTickYmd(): string | undefined {
  const ymd = tickJson.read().lastCompletedMskYmd;
  if (typeof ymd === "string" && /^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd;
  return undefined;
}

export function setLastCompletedMidnightTickYmd(ymd: string): void {
  tickJson.write({ lastCompletedMskYmd: ymd });
}

/** Суточный тик нужен, если полночь МСК для сегодня уже наступила, а тик ещё не завершён. */
export function isEconomyMskMidnightTickDue(nowMs: number = Date.now()): boolean {
  const today = mskTodayYmd(nowMs);
  const todayStart = Date.parse(`${today}T00:00:00+03:00`);
  if (nowMs < todayStart + 1000) return false;
  return getLastCompletedMidnightTickYmd() !== today;
}
