import type { EconomyUser, SkillId } from "./userStore.js";

/** Числовой потолок навыка до ранга «Грандмастер». */
export const ECONOMY_SKILL_MAX = 999;

export const ALL_SKILL_IDS: SkillId[] = ["communication", "logistics", "discipline"];

/** Группы рангов: по 100 уровней, внутри — подранги 1–10 по 10 очков. */
export const SKILL_TIER_GROUPS = [
  { name: "Новичок", min: 0, max: 99 },
  { name: "Ученик", min: 100, max: 199 },
  { name: "Любитель", min: 200, max: 299 },
  { name: "Профессионал", min: 300, max: 399 },
  { name: "Подмастерье", min: 400, max: 499 },
  { name: "Опытный", min: 500, max: 599 },
  { name: "Искусный", min: 600, max: 699 },
  { name: "Ремесленник", min: 700, max: 799 },
  { name: "Мастер", min: 800, max: 899 },
  { name: "Гуру", min: 900, max: 999 },
] as const;

export type SkillTierGroupName = (typeof SKILL_TIER_GROUPS)[number]["name"];

export type SkillRankDisplay = {
  /** Числовой уровень 0..999 (без грандмастера). */
  level: number;
  /** Уровень грандмастера после 999; 0 = ещё не грандмастер. */
  grandmaster: number;
  groupName: SkillTierGroupName | "Грандмастер";
  subRank: number;
  progress: number;
  /** Для UI прокачки: «Новичок 3 (7/10)». */
  trainingLabel: string;
  /** Для требований работ: «Новичок 3». */
  reqLabel: string;
};

export function skillName(id: SkillId): string {
  if (id === "communication") return "Коммуникация";
  if (id === "logistics") return "Логистика";
  return "Дисциплина";
}

export function getSkillLevel(u: EconomyUser, skill: SkillId): number {
  return Math.max(0, Math.floor(u.skills?.[skill] ?? 0));
}

export function getSkillGrandmasterLevel(u: EconomyUser, skill: SkillId): number {
  return Math.max(0, Math.floor(u.skillGrandmaster?.[skill] ?? 0));
}

export function skillRankFromParts(level: number, grandmaster = 0): SkillRankDisplay {
  const lvl = Math.max(0, Math.min(ECONOMY_SKILL_MAX, Math.floor(level)));
  const gm = Math.max(0, Math.floor(grandmaster));

  if (gm > 0 || lvl >= ECONOMY_SKILL_MAX) {
    const gmLevel = gm > 0 ? gm : 0;
    const label = gmLevel > 0 ? `Грандмастер ${gmLevel}` : `Гуру 10 (10/10)`;
    return {
      level: lvl,
      grandmaster: gmLevel,
      groupName: "Грандмастер",
      subRank: gmLevel,
      progress: 0,
      trainingLabel: label,
      reqLabel: label,
    };
  }

  const group = SKILL_TIER_GROUPS.find((g) => lvl >= g.min && lvl <= g.max) ?? SKILL_TIER_GROUPS[0];
  const subRank = Math.floor((lvl - group.min) / 10) + 1;
  const progress = lvl % 10;
  const reqLabel = `${group.name} ${subRank}`;
  const trainingLabel = `${reqLabel} (${progress}/10)`;

  return {
    level: lvl,
    grandmaster: 0,
    groupName: group.name,
    subRank,
    progress,
    trainingLabel,
    reqLabel,
  };
}

export function skillRankFromUser(u: EconomyUser, skill: SkillId): SkillRankDisplay {
  return skillRankFromParts(getSkillLevel(u, skill), getSkillGrandmasterLevel(u, skill));
}

export function skillRankFromLevel(level: number): SkillRankDisplay {
  return skillRankFromParts(level, 0);
}

/** Подпись ранга для требований работ: «Новичок 5». */
export function formatSkillRankReq(level: number): string {
  return `«${skillRankFromLevel(level).reqLabel}»`;
}

/** Подпись для экрана навыков с прогрессом. */
export function formatSkillRankTraining(u: EconomyUser, skill: SkillId): string {
  const rank = skillRankFromUser(u, skill);
  if (rank.grandmaster > 0) return rank.trainingLabel;
  if (rank.level >= ECONOMY_SKILL_MAX && rank.grandmaster === 0) return `${rank.trainingLabel} · дальше **Грандмастер**`;
  return rank.trainingLabel;
}

export function minSkillLevel(u: EconomyUser): number {
  return Math.min(...ALL_SKILL_IDS.map((id) => getSkillLevel(u, id)));
}

/** Все навыки ≥ порога (100, 200, …). */
export function allSkillsAtLeast(u: EconomyUser, threshold: number): boolean {
  return ALL_SKILL_IDS.every((id) => getSkillLevel(u, id) >= threshold);
}

/**
 * Множитель дохода от синхронной прокачки всех навыков.
 * ×1.0 ниже 100; при min ≥ 100 → ×1.2; ≥ 200 → ×1.4; …; ≥ 900 → ×2.8.
 */
export function skillIncomeMultFromUser(u: EconomyUser): number {
  const min = minSkillLevel(u);
  if (min < 100) return 1;
  const tier = Math.floor(min / 100);
  return 1 + 0.2 * tier;
}

export function skillIncomeMultLabel(mult: number): string {
  if (mult <= 1 + 1e-9) return "×1";
  const step = Math.round((mult - 1) / 0.2);
  return `×${(1 + step * 0.2).toFixed(1).replace(/\.0$/, "")}`;
}

/** Пороги перехода на следующую группу рангов (100, 200, …). */
export const SKILL_MAJOR_TIER_THRESHOLDS = SKILL_TIER_GROUPS.slice(1).map((g) => g.min);

/** Если все навыки только что перешли порог — имя новой группы для ленты. */
export function detectAllSkillsMajorTierCrossing(before: EconomyUser, after: EconomyUser): SkillTierGroupName | null {
  for (let i = 0; i < SKILL_MAJOR_TIER_THRESHOLDS.length; i++) {
    const threshold = SKILL_MAJOR_TIER_THRESHOLDS[i];
    const group = SKILL_TIER_GROUPS[i + 1];
    if (!allSkillsAtLeast(before, threshold) && allSkillsAtLeast(after, threshold)) {
      return group.name;
    }
  }
  return null;
}

export function applySkillIncomeMult(rub: number, mult: number): number {
  if (rub <= 0 || mult <= 1 + 1e-9) return rub;
  return Math.floor(rub * mult);
}

export type JobSkillReq = { skill: SkillId; minLevel: number };

/** Основной навык = с максимальным старым порогом; уровень = сумма всех трёх старых. */
export function mergeLegacyJobSkillReq(old: Record<SkillId, number>): JobSkillReq {
  let main: SkillId = "discipline";
  let mainVal = 0;
  let sum = 0;
  for (const id of ALL_SKILL_IDS) {
    const v = old[id] ?? 0;
    sum += v;
    if (v > mainVal) {
      mainVal = v;
      main = id;
    }
  }
  return { skill: main, minLevel: sum };
}

/** Предупреждение при увольнении/смене, если по новым правилам не устроиться обратно. */
export function formatJobRehireWarning(jobTitle: string, missing: string[]): string {
  return [
    "Система навыков обновлена. После увольнения вернуться на **" + jobTitle + "** не получится:",
    ...missing.map((m) => `- ${m}`),
  ].join("\n");
}

export function meetsJobSkillReq(
  u: EconomyUser,
  req: JobSkillReq | undefined,
): { ok: boolean; missing: string[] } {
  if (!req || req.minLevel <= 0) return { ok: true, missing: [] };
  const have = getSkillLevel(u, req.skill);
  if (have >= req.minLevel) return { ok: true, missing: [] };
  const needLabel = formatSkillRankReq(req.minLevel);
  const haveLabel = formatSkillRankTraining(u, req.skill);
  return {
    ok: false,
    missing: [`${skillName(req.skill)} ${needLabel} (у вас ${haveLabel})`],
  };
}

export function formatJobSkillReqLine(req: JobSkillReq): string {
  return `${skillName(req.skill)} ${formatSkillRankReq(req.minLevel)}`;
}
