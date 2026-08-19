import { prestigeIncomeMultFromPoints } from "./prestigeIncome.js";

/** Доля прироста СР с голоса при log1p(STAT_LOG_REF) быта. */
const DOMESTIC_VOICE_BONUS_AT_REF = 0.45;
/** Доля прироста СР за смену при log1p(STAT_LOG_REF) быта. */
const DOMESTIC_SHIFT_BONUS_AT_REF = 0.6;

/**
 * Опорная величина в log-формуле быта: при domestic = REF бонус равен константе выше.
 */
const STAT_LOG_REF = 150_000;

function statLogMultiplier(points: number, ref: number, bonusAtRef: number): number {
  const p = Math.max(0, points);
  if (p <= 0 || ref <= 0 || bonusAtRef <= 0) return 1;
  const bonus = bonusAtRef * (Math.log1p(p / ref) / Math.log1p(1));
  return 1 + bonus;
}

/** Множитель ₽ за смену и суточный оклад. При престиже 0 — ×1; вершины покупок — ×2. */
export function prestigeShiftIncomeMult(prestige: number): number {
  return prestigeIncomeMultFromPoints(prestige);
}

/** То же, что `prestigeShiftIncomeMult` (оклад офиса / ИП). */
export function prestigePassiveIncomeMult(prestige: number): number {
  return prestigeIncomeMultFromPoints(prestige);
}

/** Множитель СР с голоса. При быте 0 — ×1 (голос даёт базовые СР по зонам минут). */
export function domesticVoicePsMult(domestic: number): number {
  return statLogMultiplier(domestic, STAT_LOG_REF, DOMESTIC_VOICE_BONUS_AT_REF);
}

/** Множитель СР за смену от быта. При быте 0 — не используется (см. shiftPsFromDomestic). */
export function domesticShiftPsMult(domestic: number): number {
  return statLogMultiplier(domestic, STAT_LOG_REF, DOMESTIC_SHIFT_BONUS_AT_REF);
}

/** Применить престиж к ₽: `prestigeIncomeMult` от очков престижа (1 = нет бонуса). */
export function applyPrestigeToShiftRub(jobTotalRub: number, prestigeIncomeMult: number): number {
  if (jobTotalRub <= 0 || prestigeIncomeMult <= 1) return jobTotalRub;
  return Math.floor(jobTotalRub * prestigeIncomeMult);
}

/** Базовый СР за смену (по тиру работы). */
export function baseShiftPsForJob(jobId: string): number {
  if (jobId === "courier" || jobId === "waiter" || jobId === "watchman") return 22;
  if (jobId === "dispatcher" || jobId === "assembler" || jobId === "expediter") return 38;
  if (jobId === "officeAnalyst") return 72;
  return 0;
}

/** СР за смену от быта. При быте 0 — **0** (СР только с голоса и питомцев). */
export function shiftPsFromDomestic(jobId: string, domestic: number): number {
  const d = Math.max(0, domestic);
  if (d <= 0) return 0;
  const base = baseShiftPsForJob(jobId);
  if (base <= 0) return 0;
  return Math.max(0, Math.floor(base * domesticShiftPsMult(d)));
}

export function shiftPsApplies(jobId: string): boolean {
  return jobId !== "shadowFixer" && jobId !== "soleProp";
}
