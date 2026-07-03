import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { mskTodayYmd } from "./mskCalendar.js";

interface MidnightTickState {
  /** YYYY-MM-DD — последний успешно завершённый суточный тик (МСК). */
  lastCompletedMskYmd?: string;
}

const storePath = () => {
  const dir = join(process.cwd(), "data");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return join(dir, "economy-midnight-tick.json");
};

function readState(): MidnightTickState {
  const p = storePath();
  if (!existsSync(p)) return {};
  try {
    return JSON.parse(readFileSync(p, "utf-8")) as MidnightTickState;
  } catch {
    return {};
  }
}

function writeState(state: MidnightTickState): void {
  writeFileSync(storePath(), JSON.stringify(state, null, 2), "utf-8");
}

export function getLastCompletedMidnightTickYmd(): string | undefined {
  const ymd = readState().lastCompletedMskYmd;
  if (typeof ymd === "string" && /^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd;
  return undefined;
}

export function setLastCompletedMidnightTickYmd(ymd: string): void {
  writeState({ lastCompletedMskYmd: ymd });
}

/** Суточный тик нужен, если полночь МСК для сегодня уже наступила, а тик ещё не завершён. */
export function isEconomyMskMidnightTickDue(nowMs: number = Date.now()): boolean {
  const today = mskTodayYmd(nowMs);
  const todayStart = Date.parse(`${today}T00:00:00+03:00`);
  if (nowMs < todayStart + 1000) return false;
  return getLastCompletedMidnightTickYmd() !== today;
}
