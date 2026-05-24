/** Доля прироста ₽ за смену при log1p(STAT_LOG_REF) очков престижа. */
const PRESTIGE_SHIFT_BONUS_AT_REF = 0.35;
/** Доля прироста суточного оклада ИП при log1p(STAT_LOG_REF) престижа. */
const PRESTIGE_PASSIVE_BONUS_AT_REF = 0.55;
/** Доля прироста СР с голоса при log1p(STAT_LOG_REF) быта. */
const DOMESTIC_VOICE_BONUS_AT_REF = 0.45;
/** Доля прироста СР за смену при log1p(STAT_LOG_REF) быта. */
const DOMESTIC_SHIFT_BONUS_AT_REF = 0.6;

/**
 * Опорная величина очков в log-формуле: при prestige/domestic = REF бонус ≈ половина от «эталонного» AT_REF.
 * Без потолка по каталогу — новые товары и дорогие покупки усиливают эффект с убывающей отдачей.
 */
const STAT_LOG_REF = 150_000;

function statLogMultiplier(points: number, ref: number, bonusAtRef: number): number {
  const p = Math.max(0, points);
  if (p <= 0 || ref <= 0 || bonusAtRef <= 0) return 1;
  const bonus = bonusAtRef * (Math.log1p(p / ref) / Math.log1p(1));
  return 1 + bonus;
}

/** Множитель ₽ за смену. При престиже 0 — ровно ×1 (бонуса нет). */
export function prestigeShiftIncomeMult(prestige: number): number {
  return statLogMultiplier(prestige, STAT_LOG_REF, PRESTIGE_SHIFT_BONUS_AT_REF);
}

/** Множитель суточного оклада ИП / легального пассива. При престиже 0 — ×1. */
export function prestigePassiveIncomeMult(prestige: number): number {
  return statLogMultiplier(prestige, STAT_LOG_REF, PRESTIGE_PASSIVE_BONUS_AT_REF);
}

/** Множитель СР с голоса. При быте 0 — ×1 (голос даёт базовые СР по зонам минут). */
export function domesticVoicePsMult(domestic: number): number {
  return statLogMultiplier(domestic, STAT_LOG_REF, DOMESTIC_VOICE_BONUS_AT_REF);
}

/** Множитель СР за смену от быта. При быте 0 — не используется (см. shiftPsFromDomestic). */
export function domesticShiftPsMult(domestic: number): number {
  return statLogMultiplier(domestic, STAT_LOG_REF, DOMESTIC_SHIFT_BONUS_AT_REF);
}

/** Применить престиж: только при prestige > 0; минусы не усиливаются. */
export function applyPrestigeToShiftRub(jobTotalRub: number, prestige: number): number {
  if (jobTotalRub <= 0 || (prestige ?? 0) <= 0) return jobTotalRub;
  return Math.floor(jobTotalRub * prestigeShiftIncomeMult(prestige));
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
