import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  housingRentPlanPeriodMs,
  housingRentPlanPriceRub,
  type HousingRentPlan,
} from "./economyCatalog.js";
import {
  assetHousingMirrors,
  assetPhoneCarMirrors,
  normalizeOwnedAssets,
  statsFromOwnedAssets,
  type OwnedApartmentRecord,
  type OwnedCarRecord,
  type OwnedPetRecord,
  type OwnedPhoneRecord,
  type UnattachedPlateRecord,
} from "./economyAssets.js";
import { migrateLegacySim5ToParts, parseSimNumberParts } from "./economySimNumber.js";
import { computeSimPrestige } from "./economySimPrestige.js";
import { nextHousingUtilityDueMs } from "./economyMacro.js";
import { SHIFT_PAY_FREE_CD_MS, SHIFT_PAY_MID_CD_MS } from "./shiftPayCoeff.js";
import { writeJsonAtomicSync } from "../storage/atomicJson.js";

export type { OwnedApartmentRecord, OwnedCarRecord, OwnedPetRecord, OwnedPhoneRecord, UnattachedPlateRecord };

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

/** Макс. капитал ИП в обороте (₽), синхронно с `SOLE_PROP_CAP_MAX` в tier3Jobs). */
export const ECONOMY_SOLE_PROP_CAP_RUB = 500_000_000;

export type HousingKind = "none" | "rent" | "owned";

export interface EconomyUser {
  psTotal: number;
  rubles: number;
  /** Ключ дня в формате YYYY-MM-DD для дневных лимитов/коэффициентов */
  voiceDay?: string;
  /** Минуты голоса, уже учтённые сегодня для расчёта PS (diminishing returns) */
  voiceMinutesToday?: number;

  jobId?: JobId;
  jobChosenAt?: number;
  /** Последний выход на смену по каждой профессии — КД считается от смены на **этой** работе. */
  lastWorkAtByJob?: Partial<Record<JobId, number>>;

  /** Календарный день (YYYY-MM-DD), для которого считается `workShiftCdAccMs`. */
  workShiftMskYmd?: string;
  /** Сумма КД (мс) завершённых смен за текущие календарные сутки — лимит выплаты по накопленному КД. */
  workShiftCdAccMs?: number;

  /** Итог последней завершённой смены (для Telegram и краткого статуса). */
  lastShiftSummary?: {
    walletRub: number;
    ps: number;
    treasuryRub: number;
    /** Доля престижа в зачислении (нетто, после налога). */
    prestigeRub: number;
    atMs: number;
  };

  /** Куплен телефон в магазине (нужен на доставке). Зеркало `ownedPhones`. */
  hasPhone?: boolean;
  /** Модель «основного» телефона (зеркало первого в `ownedPhones`). */
  phoneModelId?: string;
  /** Все купленные телефоны. */
  ownedPhones?: OwnedPhoneRecord[];
  /** Накопленный престиж (заморские покупки). */
  prestigePoints?: number;
  /** Быт (советские покупки). */
  domesticPoints?: number;
  /** Основное авто (зеркало лучшего для доставки из `ownedCars`). */
  ownedCarId?: string;
  /** Все купленные автомобили (номер — на конкретной машине). */
  ownedCars?: OwnedCarRecord[];
  /** Госномера без авто. Престижа не дают. */
  unattachedPlates?: UnattachedPlateRecord[];
  /** Госномер (формат «А 123 ВС | 77 RUS») — зеркало первого прикреплённого. */
  vehiclePlateL1?: string;
  vehiclePlateDigits?: string;
  vehiclePlateL2?: string;
  vehiclePlateRegion?: string;
  /** Суммарный престиж прикреплённых госномеров. */
  vehiclePlatePrestige?: number;

  /** Советское жильё: нет / аренда / своя квартира. */
  housingKind?: HousingKind;
  /** Следующее списание аренды (unix ms). */
  housingRentNextDueMs?: number;
  /** Пакет продления: посуточно / неделя / месяц (для авто-списания в начале календарного дня). */
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
  /** Купленная советская квартира (зеркало лучшей из `ownedApartments`). */
  ownedApartmentId?: string;
  /** Когда куплена текущая советская квартира (unix ms) — для выкупа при переезде. */
  ownedApartmentPurchasedAtMs?: number;
  /** Все купленные квартиры (советские и заморские). */
  ownedApartments?: OwnedApartmentRecord[];
  /** Следующее списание ЖКХ советского жилья — полночь 1-го числа месяца (МСК), unix ms. */
  housingUtilityNextDueMs?: number;
  /** Последняя обработка советского жилья по суточному тику (YYYY-MM-DD). */
  housingLastMskYmd?: string;

  /** Заморское жильё: только своё (без аренды). */
  housingForeignKind?: "owned";
  ownedForeignApartmentId?: string;
  ownedForeignApartmentPurchasedAtMs?: number;
  housingForeignUtilityNextDueMs?: number;
  housingForeignLastMskYmd?: string;

  /** Купленные питомцы (по одному каждого типа). */
  ownedPets?: OwnedPetRecord[];
  /** Зеркало: id первого питомца (совместимость). */
  ownedPetId?: string;
  petLastMskYmd?: string;
  /** Зеркало: хотя бы у одного питомца нет ₽ на содержание. */
  petPausedNoFunds?: boolean;

  /** @deprecated Старый 5-значный номер; мигрируется в courierSimOperator/Mid/Last. */
  courierSimNumber?: string;
  /** Код оператора сим (**900–999**). */
  courierSimOperator?: string;
  /** Первые 3 цифры абонентской части. */
  courierSimMid?: string;
  /** Последние 4 цифры абонентской части. */
  courierSimLast?: string;
  /** Престиж, уже учтённый в prestigePoints от текущего номера симки. */
  courierSimPrestige?: number;
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

  /** Последняя обработанная календарная дата экономики (YYYY-MM-DD) — суточный оклад/стрик тир-3. */
  economyLastMskYmd?: string;
  /** Подряд полных календарных дней на текущей тир-3 работе (сброс при смене работы). */
  jobMskDayStreak?: number;
  /** jobId, с которым накоплен стрик на момент последнего тика. */
  jobMskStreakAnchorJobId?: JobId;

  /** До какого unix ms доступна подработка (тир-3). */
  tier3SideGigReadyAt?: number;
  /** До какого unix ms доступен «разговор с начальником» (тир-3). */
  tier3BossReadyAt?: number;

  /**
   * Баланс бизнеса ИП (₽): реклама, пополнения/вывод; суточный пассивный оклад считается от него.
   * При уходе с soleProp возвращается на основной счёт.
   */
  solePropCapitalRub?: number;
  /** Ползунок риска ИП (−2…+2), влияет на суточный оклад (скрытый UI, по умолчанию 0). */
  solePropRiskDial?: number;
  /** Последний календарный день, когда нажали «Контроль» (YYYY-MM-DD). */
  solePropControlMskYmd?: string;
  /** Подряд календарных дней без «Контроля» (для шанса просадки). */
  solePropMissedControlStreak?: number;
  /** Подряд календарных дней с контролем (для восстановления множителя). */
  solePropControlConsecDays?: number;
  /** Множитель эффективности суточного оклада ИП (0.3…1.0). */
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

  /** Цвет рамки карточки (магазин → оформление). */
  profileCardColor?: string;
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
  writeJsonAtomicSync(storePath(), s);
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

function normalizeLastWorkAtByJob(
  rawMap: unknown,
  legacyLastWorkAt: number | undefined,
  legacyJobId: JobId | undefined,
): Partial<Record<JobId, number>> | undefined {
  const out: Partial<Record<JobId, number>> = {};
  if (rawMap && typeof rawMap === "object") {
    for (const id of PERSISTED_JOB_IDS) {
      const v = (rawMap as Record<string, unknown>)[id];
      if (Number.isFinite(v) && (v as number) > 0) out[id] = Math.max(0, Math.floor(v as number));
    }
  }
  if (legacyLastWorkAt != null && legacyLastWorkAt > 0 && legacyJobId) {
    out[legacyJobId] = Math.max(out[legacyJobId] ?? 0, legacyLastWorkAt);
  }
  return Object.keys(out).length ? out : undefined;
}

/** Unix ms последней смены на указанной работе (для КД между сменами). */
export function lastWorkAtForJob(u: EconomyUser, jobId: JobId): number {
  const t = u.lastWorkAtByJob?.[jobId];
  return Number.isFinite(t) && (t as number) > 0 ? Math.floor(t as number) : 0;
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

  const workShiftMskYmd =
    typeof (u as any)?.workShiftMskYmd === "string" && /^\d{4}-\d{2}-\d{2}$/.test((u as any).workShiftMskYmd)
      ? (u as any).workShiftMskYmd
      : undefined;
  let workShiftCdAccMs = Number.isFinite((u as any)?.workShiftCdAccMs)
    ? Math.max(0, Math.floor((u as any).workShiftCdAccMs))
    : undefined;
  if (workShiftCdAccMs == null && Number.isFinite((u as any)?.workShiftsToday)) {
    const n = Math.max(0, Math.floor((u as any).workShiftsToday));
    workShiftCdAccMs = n > 0 ? Math.min(n * SHIFT_PAY_FREE_CD_MS, SHIFT_PAY_MID_CD_MS) : 0;
  }

  let lastShiftSummary: EconomyUser["lastShiftSummary"];
  const rawLs = (u as any)?.lastShiftSummary;
  if (rawLs && typeof rawLs === "object") {
    const walletRub = Number.isFinite(rawLs.walletRub) ? Math.round(rawLs.walletRub * 100) / 100 : NaN;
    const ps = Number.isFinite(rawLs.ps) ? Math.max(0, Math.floor(rawLs.ps)) : NaN;
    const treasuryRub = Number.isFinite(rawLs.treasuryRub) ? Math.max(0, Math.round(rawLs.treasuryRub * 100) / 100) : NaN;
    const prestigeRub = Number.isFinite(rawLs.prestigeRub) ? Math.max(0, Math.floor(rawLs.prestigeRub)) : 0;
    const atMs = Number.isFinite(rawLs.atMs) ? Math.max(0, Math.floor(rawLs.atMs)) : NaN;
    if (Number.isFinite(walletRub) && Number.isFinite(ps) && Number.isFinite(treasuryRub) && Number.isFinite(atMs)) {
      lastShiftSummary = { walletRub, ps, treasuryRub, prestigeRub, atMs };
    }
  }

  const legacySimShifts = Number.isFinite((u as any)?.courierSimShiftsLeft) ? Math.max(0, Math.floor((u as any).courierSimShiftsLeft)) : 0;
  const legacyBikeShifts = Number.isFinite((u as any)?.courierBikeShiftsLeft) ? Math.max(0, Math.floor((u as any).courierBikeShiftsLeft)) : 0;

  const rawForAssets = { ...(u as any) };
  if (rawForAssets.hasPhone !== true && (legacySimShifts > 0 || legacyBikeShifts > 0)) rawForAssets.hasPhone = true;
  if (!rawForAssets.phoneModelId && rawForAssets.hasPhone === true) rawForAssets.phoneModelId = "phone_sov_elta";
  const assets = normalizeOwnedAssets(rawForAssets);
  const phoneCarMirrors = assetPhoneCarMirrors(assets);
  const aptMirrors = assetHousingMirrors(assets);
  let hasPhone = phoneCarMirrors.hasPhone;
  let phoneModelId = phoneCarMirrors.phoneModelId;
  let ownedCarId = phoneCarMirrors.ownedCarId;
  let vehiclePlateL1 = phoneCarMirrors.vehiclePlateL1;
  let vehiclePlateDigits = phoneCarMirrors.vehiclePlateDigits;
  let vehiclePlateL2 = phoneCarMirrors.vehiclePlateL2;
  let vehiclePlateRegion = phoneCarMirrors.vehiclePlateRegion;
  let vehiclePlatePrestige = phoneCarMirrors.vehiclePlatePrestige;

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
  let ownedApartmentId = aptMirrors.ownedApartmentId;
  let ownedApartmentPurchasedAtMs = aptMirrors.ownedApartmentPurchasedAtMs;
  let ownedForeignApartmentId = aptMirrors.ownedForeignApartmentId;
  const ownedForeignApartmentPurchasedAtMs = aptMirrors.ownedForeignApartmentPurchasedAtMs;
  let housingForeignKind = aptMirrors.housingForeignKind;
  if (ownedApartmentId) housingKind = "owned";
  else if (housingKind === "owned") housingKind = "none";
  let housingUtilityNextDueMs = Number.isFinite((u as any)?.housingUtilityNextDueMs)
    ? Math.max(0, Math.floor((u as any).housingUtilityNextDueMs))
    : undefined;
  const housingLastMskYmd =
    typeof (u as any)?.housingLastMskYmd === "string" && /^\d{4}-\d{2}-\d{2}$/.test((u as any).housingLastMskYmd)
      ? (u as any).housingLastMskYmd
      : undefined;

  let courierSimOperator =
    typeof (u as any)?.courierSimOperator === "string" ? String((u as any).courierSimOperator) : undefined;
  let courierSimMid = typeof (u as any)?.courierSimMid === "string" ? String((u as any).courierSimMid) : undefined;
  let courierSimLast = typeof (u as any)?.courierSimLast === "string" ? String((u as any).courierSimLast) : undefined;
  let courierSimNumber =
    typeof (u as any)?.courierSimNumber === "string" ? String((u as any).courierSimNumber) : undefined;

  const rawSimForParse = {
    courierSimOperator,
    courierSimMid,
    courierSimLast,
    courierSimNumber,
  } as EconomyUser;
  let simParts = parseSimNumberParts(rawSimForParse, { migrateSeed: userIdForMigration ?? "legacy" });
  if (simParts) {
    courierSimOperator = simParts.operator;
    courierSimMid = simParts.mid;
    courierSimLast = simParts.last;
    courierSimNumber = undefined;
  } else {
    courierSimOperator = undefined;
    courierSimMid = undefined;
    courierSimLast = undefined;
    courierSimNumber = undefined;
  }
  let simBalanceRub = Number.isFinite((u as any)?.simBalanceRub) ? Math.max(0, Math.floor((u as any).simBalanceRub)) : undefined;
  let courierPhonePaidUntilMs = Number.isFinite((u as any)?.courierPhonePaidUntilMs)
    ? Math.max(0, Math.floor((u as any).courierPhonePaidUntilMs))
    : undefined;
  let courierBikeUntilMs = Number.isFinite((u as any)?.courierBikeUntilMs)
    ? Math.max(0, Math.floor((u as any).courierBikeUntilMs))
    : undefined;

  if (!simParts && legacySimShifts > 0) {
    const legacy5 = stableLegacySimDigits(userIdForMigration ?? "legacy");
    simParts = migrateLegacySim5ToParts(legacy5, userIdForMigration ?? "legacy");
    if (simParts) {
      courierSimOperator = simParts.operator;
      courierSimMid = simParts.mid;
      courierSimLast = simParts.last;
      courierSimNumber = undefined;
    }
  }
  if (simBalanceRub == null && legacySimShifts > 0) simBalanceRub = Math.min(120, legacySimShifts * 12);
  if (!courierPhonePaidUntilMs && legacySimShifts > 0) courierPhonePaidUntilMs = Date.now() + 24 * 60 * 60 * 1000;
  if (!courierBikeUntilMs && legacyBikeShifts > 0) courierBikeUntilMs = Date.now() + legacyBikeShifts * 3 * 60 * 60 * 1000;

  if (ownedCarId || assets.ownedCars.length > 0) {
    courierBikeUntilMs = undefined;
  }

  let housingForeignUtilityNextDueMs = Number.isFinite((u as any)?.housingForeignUtilityNextDueMs)
    ? Math.max(0, Math.floor((u as any).housingForeignUtilityNextDueMs))
    : undefined;

  if (housingKind === "owned" && ownedApartmentId && housingUtilityNextDueMs == null) {
    housingUtilityNextDueMs = nextHousingUtilityDueMs(Date.now());
  }
  if (housingForeignKind === "owned" && ownedForeignApartmentId && housingForeignUtilityNextDueMs == null) {
    housingForeignUtilityNextDueMs = nextHousingUtilityDueMs(Date.now());
  }

  const housingForeignLastMskYmd =
    typeof (u as any)?.housingForeignLastMskYmd === "string" && /^\d{4}-\d{2}-\d{2}$/.test((u as any).housingForeignLastMskYmd)
      ? (u as any).housingForeignLastMskYmd
      : undefined;

  const ownedPets = assets.ownedPets;
  const ownedPetId = ownedPets[0]?.id;
  const petLastMskYmd =
    typeof (u as any)?.petLastMskYmd === "string" && /^\d{4}-\d{2}-\d{2}$/.test((u as any).petLastMskYmd)
      ? (u as any).petLastMskYmd
      : undefined;
  const petPausedNoFunds = ownedPets.some((p) => p.pausedNoFunds === true) ? true : undefined;

  const stats = statsFromOwnedAssets(assets);
  let prestigePoints = stats.prestigePoints;
  const domesticPoints = stats.domesticPoints;

  let courierSimPrestige: number | undefined;
  if (simParts) {
    courierSimPrestige = computeSimPrestige(simParts).total;
    prestigePoints += courierSimPrestige;
  } else {
    courierSimPrestige = undefined;
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

  const parsedJobId =
    typeof u?.jobId === "string" && (PERSISTED_JOB_IDS as readonly string[]).includes(u.jobId) ? (u.jobId as JobId) : undefined;
  const legacyLastWorkAt = Number.isFinite((u as any)?.lastWorkAt) ? Math.max(0, Math.floor((u as any).lastWorkAt)) : undefined;
  const lastWorkAtByJob = normalizeLastWorkAtByJob((u as any)?.lastWorkAtByJob, legacyLastWorkAt, parsedJobId);

  const out: EconomyUser = {
    psTotal: Math.max(0, Math.floor(u?.psTotal ?? 0)),
    rubles: Math.max(0, Math.round((Number.isFinite(Number(u?.rubles)) ? Number(u!.rubles) : 0) * 100) / 100),
    voiceDay: typeof u?.voiceDay === "string" ? u.voiceDay : undefined,
    voiceMinutesToday: Number.isFinite(u?.voiceMinutesToday) ? Math.max(0, Math.floor(u!.voiceMinutesToday!)) : undefined,
    jobId: parsedJobId,
    jobChosenAt: Number.isFinite(u?.jobChosenAt) ? Math.max(0, Math.floor(u!.jobChosenAt!)) : undefined,
    lastWorkAtByJob,
    hasPhone,
    phoneModelId,
    ownedPhones: assets.ownedPhones,
    prestigePoints,
    domesticPoints,
    ownedCarId,
    ownedCars: assets.ownedCars,
    unattachedPlates: assets.unattachedPlates,
    vehiclePlateL1,
    vehiclePlateDigits,
    vehiclePlateL2,
    vehiclePlateRegion,
    vehiclePlatePrestige,
    housingKind: housingKind === "none" ? undefined : housingKind,
    housingRentNextDueMs,
    housingRentPlan,
    housingRentRenewalPlan,
    housingRentLastPaidRub,
    housingRentLastPeriodMs,
    housingRentChainStartedAtMs,
    housingRentTotalPaidRub,
    ownedApartmentId,
    ownedApartmentPurchasedAtMs,
    ownedApartments: assets.ownedApartments,
    housingUtilityNextDueMs,
    housingLastMskYmd,
    housingForeignKind,
    ownedForeignApartmentId,
    ownedForeignApartmentPurchasedAtMs,
    housingForeignUtilityNextDueMs,
    housingForeignLastMskYmd,
    ownedPets,
    ownedPetId,
    petLastMskYmd,
    petPausedNoFunds,
    courierSimNumber,
    courierSimOperator,
    courierSimMid,
    courierSimLast,
    courierSimPrestige,
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
    workShiftMskYmd,
    workShiftCdAccMs,
    lastShiftSummary,
    profileCardColor:
      typeof (u as any)?.profileCardColor === "string" && (u as any).profileCardColor.length > 0
        ? (u as any).profileCardColor
        : undefined,
  };

  return out;
}

export function getEconomyUser(guildId: string, userId: string): EconomyUser {
  const s = readStore();
  const raw = s.guilds[guildId]?.[userId];
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
  return updateEconomyUser(guildId, userId, (cur) => ({ ...cur, ...patch }));
}

export function updateEconomyUser(
  guildId: string,
  userId: string,
  updater: (current: EconomyUser) => EconomyUser,
): EconomyUser {
  const s = readStore();
  if (!s.guilds[guildId]) s.guilds[guildId] = {};
  const current = normalizeUser(s.guilds[guildId]![userId], userId);
  const next = normalizeUser(updater(current), userId);
  s.guilds[guildId]![userId] = next;
  writeStore(s);
  return next;
}

export function addEconomyUserRubles(guildId: string, userId: string, deltaRub: number): EconomyUser {
  return updateEconomyUser(guildId, userId, (cur) => ({ ...cur, rubles: cur.rubles + deltaRub }));
}

export type SpendEconomyUserRublesResult = { ok: true; next: EconomyUser } | { ok: false; balance: number };

export function trySpendEconomyUserRubles(guildId: string, userId: string, amountRub: number): SpendEconomyUserRublesResult {
  const spend = Math.floor(amountRub);
  if (!Number.isFinite(spend) || spend <= 0) {
    return { ok: false, balance: getEconomyUser(guildId, userId).rubles };
  }
  const s = readStore();
  if (!s.guilds[guildId]) s.guilds[guildId] = {};
  const current = normalizeUser(s.guilds[guildId]![userId], userId);
  if (current.rubles < spend) {
    return { ok: false, balance: current.rubles };
  }
  const next = normalizeUser({ ...current, rubles: current.rubles - spend }, userId);
  s.guilds[guildId]![userId] = next;
  writeStore(s);
  return { ok: true, next };
}
