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

/** Надбавка **за единицу ранга** (ранг 0 → 0, ранг 3 → 3×step). */
const BONUS_STEP_TIER1_RUB = 110;
const BONUS_STEP_TIER2_RUB = 155;

const TIER1: ReadonlySet<JobId> = new Set<Tier12JobId>(["courier", "waiter", "watchman"]);

function tier12Tier(jobId: Tier12JobId): 1 | 2 {
  return TIER1.has(jobId) ? 1 : 2;
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

export function tier12RankFlatBonusRub(jobId: Tier12JobId, rank: number): number {
  if (rank <= 0) return 0;
  const step = tier12Tier(jobId) === 1 ? BONUS_STEP_TIER1_RUB : BONUS_STEP_TIER2_RUB;
  return rank * step;
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

export function tier12CareerDetailBlock(baseCooldownMs: number): string {
  const spr = tier12ShiftsPerRank(baseCooldownMs);
  const perDay = Math.max(1, Math.ceil(MS_PER_DAY / Math.max(1, baseCooldownMs)));
  return [
    "**Карьера (т1–т2):** счётчик **смен на этой профессии** сохраняется после **увольнения**.",
    `**Шаг ранга:** **${perDay}** смен ≈ **24** ч при штатном КД → за **${TIER12_MONTH_EQUIV_DAYS}** таких «дней» нужно **${spr}** смен на **этой** работе (**⌈24 ч / КД⌉ × ${TIER12_MONTH_EQUIV_DAYS}**). У **доставки** КД для формулы всегда **3** ч из вакансии (аренда авто ускоряет смены, но **не** ускоряет карьеру).`,
    `**Должности:** ранги **0–${TIER12_MAX_RANK}** (**${TIER12_MAX_RANK + 1}** ступеней), дальше — только макс. надбавка.`,
    `**Надбавка к сумме смены:** **ранг × ${BONUS_STEP_TIER1_RUB}** ₽ (тир **1**) или **× ${BONUS_STEP_TIER2_RUB}** ₽ (тир **2**); при ранге **0** надбавки нет.`,
  ].join("\n\n");
}

/** Строки для эмбеда: должность, прогресс, надбавка при текущем ранге (по числу смен `shiftsTotal`). */
export function tier12CareerEmbedLines(jobId: Tier12JobId, shiftsTotal: number, baseCooldownMs: number): string[] {
  const spr = tier12ShiftsPerRank(baseCooldownMs);
  const rank = tier12RankFromShifts(shiftsTotal, baseCooldownMs);
  const title = tier12RankTitle(jobId, rank);
  const bonus = tier12RankFlatBonusRub(jobId, rank);
  const nextAt = tier12ShiftsForNextRank(shiftsTotal, baseCooldownMs);
  const cdH = baseCooldownMs / (60 * 60 * 1000);
  const cdLabel = Number.isInteger(cdH) ? String(cdH) : String(cdH).replace(".", ",");
  const prog =
    nextAt == null
      ? `Карьера: **${title}** (ранг **${rank}**, **макс.**) · смен на профессии: **${shiftsTotal}** · надбавка к смене: **+${bonus}** ₽ · шаг: **${spr}** смен (**${cdLabel}** ч КД в вакансии).`
      : `Карьера: **${title}** (ранг **${rank}**) · смен **${shiftsTotal}** / **${nextAt}** до следующей · надбавка к смене: **+${bonus}** ₽ · шаг: **${spr}** смен (**${cdLabel}** ч КД).`;
  return [prog];
}
