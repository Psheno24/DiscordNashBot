import { solePropPrestigeIncomeMult } from "./economyCatalog.js";
import type { EconomyUser, JobId, SkillId } from "./userStore.js";
import { mskPreviousDayYmd, mskTodayYmd } from "./mskCalendar.js";

export type Tier3Archetype = "legal" | "illegal" | "ip";

export const TIER3_JOB_IDS = ["officeAnalyst", "shadowFixer", "soleProp"] as const;
export type Tier3JobId = (typeof TIER3_JOB_IDS)[number];

export function isTier3JobId(id: string): id is Tier3JobId {
  return (TIER3_JOB_IDS as readonly string[]).includes(id);
}

export function isTier3JobIdAsJob(id: JobId): boolean {
  return isTier3JobId(id);
}

export type Tier3JobDef = {
  id: Tier3JobId;
  title: string;
  baseCooldownMs: number;
  basePayoutRub: number;
  description: string;
  /** Все три навыка обязательны. */
  reqSkills: Record<SkillId, number>;
  archetype: Tier3Archetype;
  /** Базовый ежедневный оклад (легал); для нелегала не используется; для ИП — часть формулы. */
  passiveBaseRub: number;
};

/** Легал / нелегал / ИП: тир-3 сильнее тир-2 по суммарному доходу (долгая прокачка навыков). */
export const JOBS_TIER3: Tier3JobDef[] = [
  {
    id: "officeAnalyst",
    title: "Офис · аналитик",
    baseCooldownMs: 12 * 60 * 60 * 1000,
    basePayoutRub: 2_100,
    description: [
      "**Легальный** тир-3: основной доход — **ежедневный оклад** (зачисление полночь МСК); смены — заметное дополнение. Стаж **30 дней** → ранг и **выше оклад**.",
      "**Смена:** стабильный оклад + надбавки; **3%** шанс **служебного штрафа** (риск ниже, чем у «Схем» или **развлекательного центра**, но есть).",
      "**Отчёт** и **совещание** (КД **24 ч** каждое) — бонус **10–30%** от ориентира **ежедневного оклада**.",
    ].join("\n"),
    reqSkills: { communication: 30, logistics: 28, discipline: 35 },
    archetype: "legal",
    passiveBaseRub: 13_200,
  },
  {
    id: "shadowFixer",
    title: "Схемы · посредник",
    baseCooldownMs: 3.5 * 60 * 60 * 1000,
    basePayoutRub: 0,
    description: [
      "**Нелегальный** тир-3: **короткий КД** смены, доход **рандом** (тяжёлый минус возможен, высокий потолок при удаче).",
      "**Ежедневного оклада нет.** **Связь** и **куратор** (КД **24 ч** каждое): мелкий бонус к ₽ и шанс ускорить стаж к **повышению**.",
    ].join("\n"),
    reqSkills: { communication: 42, logistics: 38, discipline: 48 },
    archetype: "illegal",
    passiveBaseRub: 0,
  },
  {
    id: "soleProp",
    title: "ИП · услуги",
    baseCooldownMs: 8 * 60 * 60 * 1000,
    basePayoutRub: 0,
    description: [
      "**ИП** тир-3: доход **ежедневным окладом** (полночь МСК) от **баланса бизнеса** (до **500 000 000** ₽); **престиж** усиливает оклад; оборот на бизнесе даёт **ощутимый** прирост.",
      "**Реклама** (риск/доход с баланса бизнеса, лимит суммы растёт с рангом), **персонал** (КД **7 дн.**), **контроль** (КД **сутки**). Пополнение и вывод баланса бизнеса — кнопками **в бизнес** / **на счёт**.",
    ].join("\n"),
    reqSkills: { communication: 55, logistics: 52, discipline: 60 },
    archetype: "ip",
    passiveBaseRub: 520,
  },
];

export function getTier3JobDef(id: Tier3JobId): Tier3JobDef {
  const d = JOBS_TIER3.find((j) => j.id === id);
  if (!d) throw new Error(`unknown tier3 job: ${id}`);
  return d;
}

export const TIER3_PROMOTION_EVERY_DAYS = 30;
export const TIER3_MAX_PROMOTION_RANK = 15;

export function tier3PromotionRank(streakDays: number): number {
  return Math.min(TIER3_MAX_PROMOTION_RANK, Math.floor(Math.max(0, streakDays) / TIER3_PROMOTION_EVERY_DAYS));
}

export const TIER3_SIDE_GIG_CD_MS = 24 * 60 * 60 * 1000;
export const TIER3_BOSS_CD_MS = 24 * 60 * 60 * 1000;
export const SOLE_PROP_STAFF_CD_MS = 7 * 24 * 60 * 60 * 1000;
export const SOLE_PROP_AD_CD_MS = 24 * 60 * 60 * 1000;
export const SOLE_PROP_CONTROL_CD_MS = 24 * 60 * 60 * 1000;
export const SOLE_PROP_CAP_MAX = 500_000_000;
export const SOLE_PROP_RISK_MIN = -2;
export const SOLE_PROP_RISK_MAX = 2;

export function randInt(min: number, max: number): number {
  const a = Math.ceil(min);
  const b = Math.floor(max);
  if (b <= a) return a;
  return Math.floor(a + Math.random() * (b - a + 1));
}

function passiveMultFromRank(rank: number): number {
  return 1 + 0.08 * rank;
}

/** Ночное начисление (один раз за сутки по МСК). */
export function computeTier3PassiveRub(input: {
  jobId: Tier3JobId;
  def: Tier3JobDef;
  streakDays: number;
  solePropCapitalRub: number;
  solePropRiskDial: number;
  prestigePoints?: number;
  solePropPassiveEffMult?: number;
  solePropPassiveTempMult?: number;
}): number {
  const rank = tier3PromotionRank(input.streakDays);
  const mult = passiveMultFromRank(rank);

  if (input.def.archetype === "illegal") return 0;

  if (input.def.archetype === "legal") {
    return Math.max(0, Math.floor(input.def.passiveBaseRub * mult));
  }

  // ip: линейный сдвиг от риска; случайный джиттер только при dial >= 1
  const cap = Math.max(0, Math.min(SOLE_PROP_CAP_MAX, input.solePropCapitalRub));
  const dial = Math.min(SOLE_PROP_RISK_MAX, Math.max(SOLE_PROP_RISK_MIN, input.solePropRiskDial));
  const prestigeMult = solePropPrestigeIncomeMult(input.prestigePoints ?? 0);
  /** ₽ за единицу капитала на балансе бизнеса (MVP: ощутимый рост с вложений). */
  const solePropCapPerRubNight = 0.0175;
  const base = input.def.passiveBaseRub + cap * solePropCapPerRubNight;
  let riskJitter = 1 + dial * 0.06;
  if (dial >= 1) {
    riskJitter += (randInt(-10, 10) / 100) * dial;
  }
  const effM = Math.min(1, Math.max(0.3, input.solePropPassiveEffMult ?? 1));
  const tmpM = Math.min(1.35, Math.max(1, input.solePropPassiveTempMult ?? 1));
  return Math.max(0, Math.floor(base * mult * riskJitter * prestigeMult * effM * tmpM));
}

export type Tier3StreakTickResult = {
  nextStreak: number;
  nextAnchorJobId: JobId;
};

/** Обновление стрика за «сегодня» МСК (вызов ровно один раз в сутки на пользователя). */
export function computeTier3StreakAfterMskDay(input: {
  jobId: JobId;
  lastMskYmd?: string;
  todayYmd: string;
  prevStreak: number;
  prevAnchorJobId?: JobId;
}): Tier3StreakTickResult {
  const yesterdayYmd = mskPreviousDayYmd(input.todayYmd);
  let nextStreak = 1;
  if (
    input.lastMskYmd === yesterdayYmd &&
    input.prevAnchorJobId === input.jobId &&
    input.prevStreak > 0
  ) {
    nextStreak = input.prevStreak + 1;
  }
  return { nextStreak, nextAnchorJobId: input.jobId };
}

export function mskTickTodayYmd(nowMs: number = Date.now()): string {
  return mskTodayYmd(nowMs);
}

/** Сброс стрика/КД и возврат капитала ИП при смене или уходе с работы. */
export function tier3PatchWhenJobChanges(prevUser: EconomyUser, nextJobId: JobId | undefined): Partial<EconomyUser> {
  const patch: Partial<EconomyUser> = {};
  const prev = prevUser.jobId;
  const cap = prevUser.solePropCapitalRub ?? 0;

  if (prev === "soleProp" && prev !== nextJobId) {
    if (cap > 0) patch.rubles = prevUser.rubles + cap;
    patch.solePropCapitalRub = undefined;
    patch.solePropRiskDial = undefined;
    patch.solePropControlMskYmd = undefined;
    patch.solePropMissedControlStreak = undefined;
    patch.solePropControlConsecDays = undefined;
    patch.solePropPassiveEffMult = undefined;
    patch.solePropPassiveTempMult = undefined;
    patch.solePropPassiveTempUntilMs = undefined;
    patch.solePropAdvertReadyAt = undefined;
    patch.solePropStaffReadyAt = undefined;
    patch.solePropControlReadyAt = undefined;
    patch.lastWorkAt = undefined;
  }

  const leavingTier3Slot = Boolean(prev && isTier3JobId(prev) && prev !== nextJobId);
  const nextIsTier3 = Boolean(nextJobId && isTier3JobId(nextJobId));

  if (leavingTier3Slot || !nextIsTier3) {
    patch.economyLastMskYmd = undefined;
    patch.jobMskDayStreak = undefined;
    patch.jobMskStreakAnchorJobId = undefined;
    patch.tier3SideGigReadyAt = undefined;
    patch.tier3BossReadyAt = undefined;
  }

  if (nextIsTier3 && prev !== nextJobId) {
    patch.jobMskDayStreak = 0;
    patch.economyLastMskYmd = undefined;
    patch.jobMskStreakAnchorJobId = undefined;
  }

  if (nextJobId === "soleProp" && prev !== "soleProp") {
    patch.lastWorkAt = undefined;
  }

  return patch;
}
