import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  APARTMENT_MODELS,
  CAR_MODELS,
  ECONOMY_LEGACY_BALANCE_MULT,
  PHONE_MODELS,
  housingRentPlanPeriodMs,
  housingRentPlanPriceRub,
  type HousingRentPlan,
} from "./economyCatalog.js";

export type FocusPreset = "role" | "balance" | "money";

export type JobId =
  | "courier"
  | "waiter"
  | "watchman"
  | "dispatcher"
  | "assembler"
  | "expediter"
  | "officeAnalyst"
  | "shadowFixer"
  | "soleProp";

const PERSISTED_JOB_IDS: readonly JobId[] = [
  "courier",
  "waiter",
  "watchman",
  "dispatcher",
  "assembler",
  "expediter",
  "officeAnalyst",
  "shadowFixer",
  "soleProp",
] as const;
export type SkillId = "communication" | "logistics" | "discipline";

/** Потолок уровня навыка; тир-3 можно строить на комбо в духе 40+/60+/80+ при том же счётчике. */
export const ECONOMY_SKILL_MAX = 99;

const VALID_PHONE_ID = new Set(PHONE_MODELS.map((p) => p.id));
const VALID_CAR_ID = new Set(CAR_MODELS.map((c) => c.id));
const VALID_APT_ID = new Set(APARTMENT_MODELS.map((a) => a.id));

/** Макс. капитал ИП в обороте (₽), синхронно с `SOLE_PROP_CAP_MAX` в tier3Jobs). */
export const ECONOMY_SOLE_PROP_CAP_RUB = 500_000_000;

export type HousingKind = "none" | "rent" | "owned";

export interface EconomyUser {
  psTotal: number;
  rubles: number;
  focus: FocusPreset;
  /** Ключ дня в формате YYYY-MM-DD для дневных лимитов/коэффициентов */
  voiceDay?: string;
  /** Минуты голоса, уже учтённые сегодня для расчёта PS (diminishing returns) */
  voiceMinutesToday?: number;

  jobId?: JobId;
  jobChosenAt?: number;
  /** Последний выход на смену (unix ms) */
  lastWorkAt?: number;

  /** Куплен телефон в магазине (нужен на доставке). */
  hasPhone?: boolean;
  /** Модель телефона (влияет на престиж при покупке/апгрейде). */
  phoneModelId?: string;
  /** Накопленный престиж (телефон, авто, жильё, аренда). */
  prestigePoints?: number;
  /** Купленный автомобиль — снимает аренду вела с UI и укорачивает КД смены доставки. */
  ownedCarId?: string;

  /** Одноразовая миграция балансов v2 → v3 (×ECONOMY_LEGACY_BALANCE_MULT). */
  economyV3BalanceScaled?: boolean;

  /** Жильё: нет / аренда / своя квартира. */
  housingKind?: HousingKind;
  /** Следующее списание аренды (unix ms). */
  housingRentNextDueMs?: number;
  /** Пакет продления: посуточно / неделя / месяц (для авто-списания в полночь МСК). */
  housingRentPlan?: HousingRentPlan;
  /** После окончания текущей оплаченной аренды следующее автосписание этим пакетом (подтверждённый выбор). */
  housingRentRenewalPlan?: HousingRentPlan;
  /** Последняя оплата аренды (₽) — для возврата недожитых дней при покупке квартиры. */
  housingRentLastPaidRub?: number;
  /** Период последней оплаты (мс). */
  housingRentLastPeriodMs?: number;
  /** Начало текущей непрерывной оплаченной аренды (для пропорционального возврата при нескольких продлениях). */
  housingRentChainStartedAtMs?: number;
  /** Сумма всех оплат по текущей цепочке аренды (₽). */
  housingRentTotalPaidRub?: number;
  /** Выдан ли одноразовый престиж за текущую аренду. */
  housingRentPrestigeGranted?: boolean;
  /** Купленная квартира (если housingKind === "owned"). */
  ownedApartmentId?: string;
  /** Следующее списание коммуналки (unix ms). */
  housingUtilityNextDueMs?: number;
  /** Последняя обработка жилья по полуночи МСК (YYYY-MM-DD). */
  housingLastMskYmd?: string;

  /** 5-значный номер симки (после покупки новой — старый уходит в пул магазина). */
  courierSimNumber?: string;
  /** Баланс симки (пополнение в магазине); тариф доставки списывается отсюда. */
  simBalanceRub?: number;
  /** До какого момента оплачен месячный тариф сим для доставки (+30 суток после оплаты). */
  courierPhonePaidUntilMs?: number;
  /** До какого момента активна аренда электровела (снижение КД смены; не нужна при наличии авто). */
  courierBikeUntilMs?: number;

  /** Навыки: skillId → уровень (1..ECONOMY_SKILL_MAX). Отсутствует = 0. */
  skills?: Partial<Record<SkillId, number>>;
  /** Последняя тренировка навыков (unix ms) */
  lastTrainAt?: number;

  /** Опыт работы: jobId → кол-во смен на этой работе */
  jobExp?: Partial<Record<string, number>>;

  /** Последняя обработанная дата экономики по МСК (YYYY-MM-DD) — оклад/стрик тир-3. */
  economyLastMskYmd?: string;
  /** Подряд полных МСК-дней на текущей тир-3 работе (сброс при смене работы). */
  jobMskDayStreak?: number;
  /** jobId, с которым накоплен стрик на момент последнего тика. */
  jobMskStreakAnchorJobId?: JobId;

  /** До какого unix ms доступна подработка (тир-3). */
  tier3SideGigReadyAt?: number;
  /** До какого unix ms доступен «разговор с начальником» (тир-3). */
  tier3BossReadyAt?: number;

  /**
   * Баланс бизнеса ИП (₽): реклама, пополнения/вывод; ежедневный оклад считается от него.
   * При уходе с soleProp возвращается на основной счёт.
   */
  solePropCapitalRub?: number;
  /** Ползунок риска ИП (−2…+2), влияет на ежедневный оклад (скрытый UI, по умолчанию 0). */
  solePropRiskDial?: number;
  /** Последний МСК-день, когда нажали «Контроль» (YYYY-MM-DD). */
  solePropControlMskYmd?: string;
  /** Подряд МСК-дней без «Контроля» (для шанса просадки). */
  solePropMissedControlStreak?: number;
  /** Подряд МСК-дней с контролем (для восстановления множителя). */
  solePropControlConsecDays?: number;
  /** Множитель эффективности ежедневного оклада ИП (0.3…1.0). */
  solePropPassiveEffMult?: number;
  /** Временный множитель оклада после «Персонал» (1.0…1.3). */
  solePropPassiveTempMult?: number;
  /** До какого unix ms действует временный множитель. */
  solePropPassiveTempUntilMs?: number;
  /** КД «Реклама» ИП. */
  solePropAdvertReadyAt?: number;
  /** КД «Персонал» ИП. */
  solePropStaffReadyAt?: number;
  /** КД «Контроль» ИП. */
  solePropControlReadyAt?: number;
}

interface StoreShape {
  guilds: Record<string, Record<string, EconomyUser>>;
}

const storePath = () => {
  const dir = join(process.cwd(), "data");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return join(dir, "economy-users.json");
};

function readStore(): StoreShape {
  const p = storePath();
  if (!existsSync(p)) return { guilds: {} };
  try {
    return JSON.parse(readFileSync(p, "utf-8")) as StoreShape;
  } catch {
    return { guilds: {} };
  }
}

function writeStore(s: StoreShape) {
  writeFileSync(storePath(), JSON.stringify(s, null, 2), "utf-8");
}

function stableLegacySimDigits(userId: string): string {
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h << 5) - h + userId.charCodeAt(i);
  const n = 10000 + (Math.abs(h | 0) % 90000);
  return String(n);
}

function normalizeHousingKind(v: unknown): HousingKind | undefined {
  if (v === "rent" || v === "owned" || v === "none") return v;
  return undefined;
}

function normalizeHousingRentPlan(v: unknown): HousingRentPlan | undefined {
  if (v === "day" || v === "week" || v === "month") return v;
  return undefined;
}

function normalizeUser(u: Partial<EconomyUser> | undefined, userIdForMigration?: string): EconomyUser {
  const rawSkills = u?.skills ?? {};
  const skills: Partial<Record<SkillId, number>> = {};
  for (const k of ["communication", "logistics", "discipline"] as const) {
    const v = (rawSkills as any)?.[k];
    if (Number.isFinite(v) && v > 0) skills[k] = Math.min(ECONOMY_SKILL_MAX, Math.floor(v));
  }

  const rawJobExp = (u as any)?.jobExp ?? {};
  const jobExp: Partial<Record<string, number>> = {};
  for (const [k, v] of Object.entries(rawJobExp)) {
    if (typeof k !== "string") continue;
    if (!Number.isFinite(v) || (v as number) <= 0) continue;
    jobExp[k] = Math.floor(v as number);
  }

  const economyLastMskYmd =
    typeof (u as any)?.economyLastMskYmd === "string" && /^\d{4}-\d{2}-\d{2}$/.test((u as any).economyLastMskYmd)
      ? (u as any).economyLastMskYmd
      : undefined;
  const jobMskDayStreak = Number.isFinite((u as any)?.jobMskDayStreak)
    ? Math.max(0, Math.floor((u as any).jobMskDayStreak))
    : undefined;
  const jobMskStreakAnchorJobId =
    typeof (u as any)?.jobMskStreakAnchorJobId === "string" &&
    (PERSISTED_JOB_IDS as readonly string[]).includes((u as any).jobMskStreakAnchorJobId)
      ? ((u as any).jobMskStreakAnchorJobId as JobId)
      : undefined;
  const tier3SideGigReadyAt = Number.isFinite((u as any)?.tier3SideGigReadyAt)
    ? Math.max(0, Math.floor((u as any).tier3SideGigReadyAt))
    : undefined;
  const tier3BossReadyAt = Number.isFinite((u as any)?.tier3BossReadyAt)
    ? Math.max(0, Math.floor((u as any).tier3BossReadyAt))
    : undefined;
  const solePropCapitalRub = Number.isFinite((u as any)?.solePropCapitalRub)
    ? Math.min(ECONOMY_SOLE_PROP_CAP_RUB, Math.max(0, Math.floor((u as any).solePropCapitalRub)))
    : undefined;
  let solePropRiskDial: number | undefined;
  if (Number.isFinite((u as any)?.solePropRiskDial)) {
    solePropRiskDial = Math.min(2, Math.max(-2, Math.floor((u as any).solePropRiskDial)));
  }

  const solePropControlMskYmd =
    typeof (u as any)?.solePropControlMskYmd === "string" && /^\d{4}-\d{2}-\d{2}$/.test((u as any).solePropControlMskYmd)
      ? (u as any).solePropControlMskYmd
      : undefined;
  const solePropMissedControlStreak = Number.isFinite((u as any)?.solePropMissedControlStreak)
    ? Math.max(0, Math.floor((u as any).solePropMissedControlStreak))
    : undefined;
  const solePropControlConsecDays = Number.isFinite((u as any)?.solePropControlConsecDays)
    ? Math.max(0, Math.floor((u as any).solePropControlConsecDays))
    : undefined;
  let solePropPassiveEffMult: number | undefined;
  if (Number.isFinite((u as any)?.solePropPassiveEffMult)) {
    solePropPassiveEffMult = Math.min(1, Math.max(0.3, Math.round((u as any).solePropPassiveEffMult * 10) / 10));
  }
  let solePropPassiveTempMult: number | undefined;
  if (Number.isFinite((u as any)?.solePropPassiveTempMult)) {
    solePropPassiveTempMult = Math.min(1.35, Math.max(1, Math.round((u as any).solePropPassiveTempMult * 100) / 100));
  }
  const solePropPassiveTempUntilMs = Number.isFinite((u as any)?.solePropPassiveTempUntilMs)
    ? Math.max(0, Math.floor((u as any).solePropPassiveTempUntilMs))
    : undefined;
  const solePropAdvertReadyAt = Number.isFinite((u as any)?.solePropAdvertReadyAt)
    ? Math.max(0, Math.floor((u as any).solePropAdvertReadyAt))
    : undefined;
  const solePropStaffReadyAt = Number.isFinite((u as any)?.solePropStaffReadyAt)
    ? Math.max(0, Math.floor((u as any).solePropStaffReadyAt))
    : undefined;
  const solePropControlReadyAt = Number.isFinite((u as any)?.solePropControlReadyAt)
    ? Math.max(0, Math.floor((u as any).solePropControlReadyAt))
    : undefined;

  const legacySimShifts = Number.isFinite((u as any)?.courierSimShiftsLeft) ? Math.max(0, Math.floor((u as any).courierSimShiftsLeft)) : 0;
  const legacyBikeShifts = Number.isFinite((u as any)?.courierBikeShiftsLeft) ? Math.max(0, Math.floor((u as any).courierBikeShiftsLeft)) : 0;

  let hasPhone = (u as any)?.hasPhone === true ? true : undefined;
  let phoneModelId =
    typeof (u as any)?.phoneModelId === "string" && VALID_PHONE_ID.has((u as any).phoneModelId) ? (u as any).phoneModelId : undefined;
  let prestigePoints = Number.isFinite((u as any)?.prestigePoints) ? Math.max(0, Math.floor((u as any).prestigePoints)) : undefined;
  let ownedCarId =
    typeof (u as any)?.ownedCarId === "string" && VALID_CAR_ID.has((u as any).ownedCarId) ? (u as any).ownedCarId : undefined;
  const economyV3BalanceScaled = (u as any)?.economyV3BalanceScaled === true ? true : undefined;

  let housingKind = normalizeHousingKind((u as any)?.housingKind) ?? "none";
  const housingRentNextDueMs = Number.isFinite((u as any)?.housingRentNextDueMs)
    ? Math.max(0, Math.floor((u as any).housingRentNextDueMs))
    : undefined;
  const housingRentPlan = normalizeHousingRentPlan((u as any)?.housingRentPlan);
  const housingRentRenewalPlan = normalizeHousingRentPlan((u as any)?.housingRentRenewalPlan);
  const housingRentLastPaidRub = Number.isFinite((u as any)?.housingRentLastPaidRub)
    ? Math.max(0, Math.floor((u as any).housingRentLastPaidRub))
    : undefined;
  const housingRentLastPeriodMs = Number.isFinite((u as any)?.housingRentLastPeriodMs)
    ? Math.max(0, Math.floor((u as any).housingRentLastPeriodMs))
    : undefined;
  let housingRentChainStartedAtMs = Number.isFinite((u as any)?.housingRentChainStartedAtMs)
    ? Math.max(0, Math.floor((u as any).housingRentChainStartedAtMs))
    : undefined;
  let housingRentTotalPaidRub = Number.isFinite((u as any)?.housingRentTotalPaidRub)
    ? Math.max(0, Math.floor((u as any).housingRentTotalPaidRub))
    : undefined;
  const housingRentPrestigeGranted = (u as any)?.housingRentPrestigeGranted === true ? true : undefined;
  let ownedApartmentId =
    typeof (u as any)?.ownedApartmentId === "string" && VALID_APT_ID.has((u as any).ownedApartmentId)
      ? (u as any).ownedApartmentId
      : undefined;
  const housingUtilityNextDueMs = Number.isFinite((u as any)?.housingUtilityNextDueMs)
    ? Math.max(0, Math.floor((u as any).housingUtilityNextDueMs))
    : undefined;
  const housingLastMskYmd =
    typeof (u as any)?.housingLastMskYmd === "string" && /^\d{4}-\d{2}-\d{2}$/.test((u as any).housingLastMskYmd)
      ? (u as any).housingLastMskYmd
      : undefined;

  let courierSimNumber =
    typeof (u as any)?.courierSimNumber === "string" && /^\d{5}$/.test((u as any).courierSimNumber)
      ? (u as any).courierSimNumber
      : undefined;
  let simBalanceRub = Number.isFinite((u as any)?.simBalanceRub) ? Math.max(0, Math.floor((u as any).simBalanceRub)) : undefined;
  let courierPhonePaidUntilMs = Number.isFinite((u as any)?.courierPhonePaidUntilMs)
    ? Math.max(0, Math.floor((u as any).courierPhonePaidUntilMs))
    : undefined;
  let courierBikeUntilMs = Number.isFinite((u as any)?.courierBikeUntilMs)
    ? Math.max(0, Math.floor((u as any).courierBikeUntilMs))
    : undefined;

  // Одноразовая логика поверх старых полей «смен сим/вела» (без записи в JSON до следующего patch).
  if (!hasPhone && (legacySimShifts > 0 || legacyBikeShifts > 0)) hasPhone = true;
  if (!phoneModelId && hasPhone) phoneModelId = "phone_budget";
  if (!courierSimNumber && legacySimShifts > 0) {
    courierSimNumber = stableLegacySimDigits(userIdForMigration ?? "legacy");
  }
  if (simBalanceRub == null && legacySimShifts > 0) simBalanceRub = Math.min(120, legacySimShifts * 12);
  if (!courierPhonePaidUntilMs && legacySimShifts > 0) courierPhonePaidUntilMs = Date.now() + 24 * 60 * 60 * 1000;
  if (!courierBikeUntilMs && legacyBikeShifts > 0) courierBikeUntilMs = Date.now() + legacyBikeShifts * 3 * 60 * 60 * 1000;

  if (ownedCarId) {
    courierBikeUntilMs = undefined;
  }

  if (housingKind === "owned" && !ownedApartmentId) {
    housingKind = "none";
  }

  if (housingKind === "rent" && housingRentNextDueMs != null && (housingRentChainStartedAtMs == null || housingRentTotalPaidRub == null)) {
    const p = housingRentPlan ?? "month";
    const periodMs =
      housingRentLastPeriodMs != null && housingRentLastPeriodMs > 0 ? housingRentLastPeriodMs : housingRentPlanPeriodMs(p);
    const paidGuess =
      housingRentLastPaidRub != null && housingRentLastPaidRub > 0 ? housingRentLastPaidRub : housingRentPlanPriceRub(p);
    housingRentChainStartedAtMs = housingRentNextDueMs - periodMs;
    housingRentTotalPaidRub = paidGuess;
  }

  const out: EconomyUser = {
    psTotal: Math.max(0, Math.floor(u?.psTotal ?? 0)),
    rubles: Math.max(0, Math.round((Number.isFinite(Number(u?.rubles)) ? Number(u!.rubles) : 0) * 100) / 100),
    focus: (u?.focus ?? "balance") as FocusPreset,
    voiceDay: typeof u?.voiceDay === "string" ? u.voiceDay : undefined,
    voiceMinutesToday: Number.isFinite(u?.voiceMinutesToday) ? Math.max(0, Math.floor(u!.voiceMinutesToday!)) : undefined,
    jobId:
      typeof u?.jobId === "string" && (PERSISTED_JOB_IDS as readonly string[]).includes(u.jobId)
        ? (u.jobId as JobId)
        : undefined,
    jobChosenAt: Number.isFinite(u?.jobChosenAt) ? Math.max(0, Math.floor(u!.jobChosenAt!)) : undefined,
    lastWorkAt: Number.isFinite(u?.lastWorkAt) ? Math.max(0, Math.floor(u!.lastWorkAt!)) : undefined,
    hasPhone,
    phoneModelId,
    prestigePoints,
    ownedCarId,
    economyV3BalanceScaled,
    housingKind: housingKind === "none" ? undefined : housingKind,
    housingRentNextDueMs,
    housingRentPlan,
    housingRentRenewalPlan,
    housingRentLastPaidRub,
    housingRentLastPeriodMs,
    housingRentChainStartedAtMs,
    housingRentTotalPaidRub,
    housingRentPrestigeGranted,
    ownedApartmentId,
    housingUtilityNextDueMs,
    housingLastMskYmd,
    courierSimNumber,
    simBalanceRub,
    courierPhonePaidUntilMs,
    courierBikeUntilMs,
    skills,
    lastTrainAt: Number.isFinite(u?.lastTrainAt) ? Math.max(0, Math.floor(u!.lastTrainAt!)) : undefined,
    jobExp,
    economyLastMskYmd,
    jobMskDayStreak,
    jobMskStreakAnchorJobId,
    tier3SideGigReadyAt,
    tier3BossReadyAt,
    solePropCapitalRub,
    solePropRiskDial,
    solePropControlMskYmd,
    solePropMissedControlStreak,
    solePropControlConsecDays,
    solePropPassiveEffMult,
    solePropPassiveTempMult,
    solePropPassiveTempUntilMs,
    solePropAdvertReadyAt,
    solePropStaffReadyAt,
    solePropControlReadyAt,
  };

  return out;
}

function applyV3BalanceMigration(raw: EconomyUser, userId: string): EconomyUser {
  const mult = ECONOMY_LEGACY_BALANCE_MULT;
  const migrated: Partial<EconomyUser> = {
    ...raw,
    rubles: Math.floor((raw.rubles ?? 0) * mult),
    simBalanceRub: Math.floor((raw.simBalanceRub ?? 0) * mult),
    solePropCapitalRub: Math.floor(((raw as any).solePropCapitalRub ?? 0) * mult),
    economyV3BalanceScaled: true,
    phoneModelId: (raw as any).phoneModelId ?? (raw.hasPhone ? "phone_budget" : undefined),
  };
  return normalizeUser(migrated, userId);
}

export function getEconomyUser(guildId: string, userId: string): EconomyUser {
  const s = readStore();
  const raw = s.guilds[guildId]?.[userId];
  if (raw && raw.economyV3BalanceScaled !== true) {
    const migrated = applyV3BalanceMigration(raw, userId);
    setEconomyUser(guildId, userId, migrated);
    return migrated;
  }
  return normalizeUser(raw, userId);
}

export function listEconomyUsers(guildId: string): Array<{ userId: string; user: EconomyUser }> {
  const s = readStore();
  const g = s.guilds[guildId] ?? {};
  return Object.keys(g).map((userId) => ({ userId, user: getEconomyUser(guildId, userId) }));
}

export function setEconomyUser(guildId: string, userId: string, next: EconomyUser): EconomyUser {
  const s = readStore();
  if (!s.guilds[guildId]) s.guilds[guildId] = {};
  const norm = normalizeUser(next, userId);
  s.guilds[guildId]![userId] = norm;
  writeStore(s);
  return norm;
}

export function patchEconomyUser(guildId: string, userId: string, patch: Partial<EconomyUser>): EconomyUser {
  const cur = getEconomyUser(guildId, userId);
  return setEconomyUser(guildId, userId, { ...cur, ...patch });
}
