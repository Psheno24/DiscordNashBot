import { catalogMaxDomesticPoints, catalogMaxPrestigePoints } from "./economyCatalog.js";

/** Доля прироста ₽ за смену при полном заморском сете (относительно catalogMaxPrestigePoints). */
const PRESTIGE_SHIFT_BONUS_AT_MAX = 0.35;
/** Доля прироста суточного оклада ИП при полном престиже. */
const PRESTIGE_PASSIVE_BONUS_AT_MAX = 0.55;
/** Доля прироста СР с голоса при полном советском сете. */
const DOMESTIC_VOICE_BONUS_AT_MAX = 0.45;
/** Доля прироста СР за смену при полном быте (к базе по тиру). */
const DOMESTIC_SHIFT_BONUS_AT_MAX = 0.6;

function ratioToMax(value: number, max: number): number {
  if (max <= 0 || value <= 0) return 0;
  return Math.min(1, value / max);
}

/** Множитель ₽ за смену. При престиже 0 — ровно ×1 (бонуса нет). */
export function prestigeShiftIncomeMult(prestige: number): number {
  const p = Math.max(0, prestige);
  if (p <= 0) return 1;
  const max = catalogMaxPrestigePoints();
  if (max <= 0) return 1;
  return 1 + PRESTIGE_SHIFT_BONUS_AT_MAX * Math.sqrt(ratioToMax(p, max));
}

/** Множитель суточного оклада ИП / легального пассива. При престиже 0 — ×1. */
export function prestigePassiveIncomeMult(prestige: number): number {
  const p = Math.max(0, prestige);
  if (p <= 0) return 1;
  const max = catalogMaxPrestigePoints();
  if (max <= 0) return 1;
  return 1 + PRESTIGE_PASSIVE_BONUS_AT_MAX * Math.sqrt(ratioToMax(p, max));
}

/** Множитель СР с голоса. При быте 0 — ×1 (голос даёт базовые СР по зонам минут). */
export function domesticVoicePsMult(domestic: number): number {
  const d = Math.max(0, domestic);
  if (d <= 0) return 1;
  const max = catalogMaxDomesticPoints();
  if (max <= 0) return 1;
  return 1 + DOMESTIC_VOICE_BONUS_AT_MAX * Math.sqrt(ratioToMax(d, max));
}

/** Множитель СР за смену от быта. При быте 0 — не используется (см. shiftPsFromDomestic). */
export function domesticShiftPsMult(domestic: number): number {
  const d = Math.max(0, domestic);
  if (d <= 0) return 1;
  const max = catalogMaxDomesticPoints();
  if (max <= 0) return 1;
  return 1 + DOMESTIC_SHIFT_BONUS_AT_MAX * Math.sqrt(ratioToMax(d, max));
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
