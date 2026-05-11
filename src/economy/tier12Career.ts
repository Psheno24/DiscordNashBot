import type { JobId } from "./userStore.js";

/** Сутки в мс — для расчёта «смен за эквивалент месяца». */
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Макс. ранг (включительно): **0…4** — пять должностей, дальше только надбавка не растёт. */
export const TIER12_MAX_RANK = 4;

/** Дней «месяца» в формуле шага (как у пользователя: × 30). */
export const TIER12_MONTH_EQUIV_DAYS = 30;

const TIER12_JOB_IDS = ["courier", "waiter", "watchman", "dispatcher", "assembler", "expediter"] as const;
export type Tier12JobId = (typeof TIER12_JOB_IDS)[number];

export function isTier12JobId(id: JobId): id is Tier12JobId {
  return (TIER12_JOB_IDS as readonly string[]).includes(id);
}

const TIER1: ReadonlySet<JobId> = new Set<Tier12JobId>(["courier", "waiter", "watchman"]);

function tier12Tier(jobId: Tier12JobId): 1 | 2 {
  return TIER1.has(jobId) ? 1 : 2;
}

/** Множитель к выплате за смену по рангу (ранг **0** → **×1**). Тир 1: до **+20%**, тир 2: до **+25%**. */
export function tier12RankIncomeMult(jobId: Tier12JobId, rank: number): number {
  const r = Math.min(TIER12_MAX_RANK, Math.max(0, rank));
  if (tier12Tier(jobId) === 1) {
    const add = [0, 0.05, 0.1, 0.15, 0.2][r] ?? 0;
    return 1 + add;
  }
  const add = [0, 0.06, 0.12, 0.18, 0.25][r] ?? 0;
  return 1 + add;
}

/** Смен за один «ранг»: ⌈24ч / штатное КД⌉ × 30 (штатное КД вакансии; у доставки **не** учитывается укороченный КД от авто/вела). */
export function tier12ShiftsPerRank(baseCooldownMs: number): number {
  const perDay = Math.max(1, Math.ceil(MS_PER_DAY / Math.max(1, baseCooldownMs)));
  return perDay * TIER12_MONTH_EQUIV_DAYS;
}

export function tier12RankFromShifts(totalShifts: number, baseCooldownMs: number): number {
  const spr = tier12ShiftsPerRank(baseCooldownMs);
  return Math.min(TIER12_MAX_RANK, Math.floor(Math.max(0, totalShifts) / spr));
}

const TITLES: Record<Tier12JobId, [string, string, string, string, string]> = {
  courier: ["Стажёр доставки", "Курьер", "Опытный курьер", "Старший маршрута", "Ведущий курьер"],
  waiter: ["Помощник зала", "Официант", "Старший смены", "Метрдотель (зам.)", "Шеф зала"],
  watchman: ["Стажёр кладбища", "Сторож", "Постовой", "Старший поста", "Начальник смены"],
  dispatcher: ["Помощник оператора", "Оператор колл-центра", "Ведущий линии", "Супервайзер", "Руководитель смены"],
  assembler: ["Помощник склада", "Сборщик", "Опытный сборщик", "Бригадир линии", "Старший склада"],
  expediter: ["Помощник площадки", "Экспедитор", "Опытный экспедитор", "Старший смены", "Ведущий площадки"],
};

export function tier12RankTitle(jobId: Tier12JobId, rank: number): string {
  const r = Math.min(TIER12_MAX_RANK, Math.max(0, rank));
  return TITLES[jobId][r];
}

/** Следующий порог смен для повышения ранга (exclusive upper bound style: «до N смен ранг k»). */
export function tier12ShiftsForNextRank(totalShifts: number, baseCooldownMs: number): number | null {
  const spr = tier12ShiftsPerRank(baseCooldownMs);
  const rank = tier12RankFromShifts(totalShifts, baseCooldownMs);
  if (rank >= TIER12_MAX_RANK) return null;
  return (rank + 1) * spr;
}

/** Две строки для эмбеда: должность и прогресс смен; надбавка от ранга. */
export function tier12CareerEmbedLines(jobId: Tier12JobId, shiftsTotal: number, baseCooldownMs: number): string[] {
  const rank = tier12RankFromShifts(shiftsTotal, baseCooldownMs);
  const title = tier12RankTitle(jobId, rank);
  const mult = tier12RankIncomeMult(jobId, rank);
  const nextAt = tier12ShiftsForNextRank(shiftsTotal, baseCooldownMs);
  const progress =
    nextAt == null
      ? `**${title}** (ранг **${rank}**, **макс.**) · смен **${shiftsTotal}**`
      : `**${title}** (ранг **${rank}**) · смен **${shiftsTotal}** / **${nextAt}** до следующей`;
  const bonusLine = `**Множитель от ранга к выплате:** **×${mult.toFixed(2)}**`;
  return [progress, bonusLine];
}
