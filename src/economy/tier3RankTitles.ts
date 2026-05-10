import type { Tier3JobId } from "./tier3Jobs.js";

/** Ранг 0…15 — по `tier3PromotionRank` (каждые 30 дней стажа). */
const OFFICE_RANK_TITLES: readonly string[] = [
  "Стажёр-аналитик",
  "Младший аналитик",
  "Аналитик",
  "Ведущий аналитик",
  "Старший аналитик",
  "Руководитель аналитической группы",
  "Заместитель руководителя направления",
  "Руководитель направления",
  "Директор по аналитике",
  "Директор департамента",
  "Исполнительный директор по данным",
  "Директор по стратегии",
  "Операционный директор (COO)",
  "Член правления",
  "Управляющий директор",
  "Управляющий партнёр",
];

const SHADOW_RANK_TITLES: readonly string[] = [
  "Наблюдатель",
  "Связной",
  "Исполнитель поручений",
  "Посредник",
  "Координатор сделок",
  "Куратор маршрута",
  "Держатель площадки",
  "Администратор потока",
  "Арбитраж схемы",
  "Старший посредник",
  "Управляющий цепочкой",
  "Куратор направления",
  "Теневой менеджер",
  "Архитектор схем",
  "Смотрящий по интересам",
  "Закреплённый куратор",
];

function clampRank(rank: number): number {
  return Math.min(15, Math.max(0, Math.floor(rank)));
}

/** Название должности по рангу (офис / схемы). ИП — без грейдов. */
export function tier3RankTitle(jobId: Tier3JobId, rank: number): string {
  const r = clampRank(rank);
  if (jobId === "officeAnalyst") return OFFICE_RANK_TITLES[r] ?? OFFICE_RANK_TITLES[0];
  if (jobId === "shadowFixer") return SHADOW_RANK_TITLES[r] ?? SHADOW_RANK_TITLES[0];
  return "ИП · владелец бизнеса";
}
