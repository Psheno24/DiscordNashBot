import { appendFeedEvent } from "./feedStore.js";
import {
  getApartmentDef,
  HOUSING_CALENDAR_MONTH_MS,
  HOUSING_RENT_PRESTIGE_ONE_TIME,
  housingRentPlanPeriodMs,
  housingRentPlanPriceRub,
  type HousingRentPlan,
} from "./economyCatalog.js";
import { getEconomyUser, patchEconomyUser, type EconomyUser } from "./userStore.js";
import { isTier3JobId, tier3PatchWhenJobChanges } from "./tier3Jobs.js";

/** Пропорциональный возврат ₽ за неиспользованное время текущей оплаченной аренды (для покупки квартиры и т.п.). */
export function housingRentUnusedRefundRub(u: EconomyUser, nowMs: number = Date.now()): number {
  if (u.housingKind !== "rent" || u.housingRentNextDueMs == null) return 0;
  const remainingMs = u.housingRentNextDueMs - nowMs;
  if (remainingMs <= 0) return 0;

  const chainStart = u.housingRentChainStartedAtMs;
  const totalPaid = u.housingRentTotalPaidRub;
  if (chainStart != null && totalPaid != null && totalPaid > 0) {
    const totalMs = u.housingRentNextDueMs - chainStart;
    if (totalMs > 0) return Math.floor((totalPaid * remainingMs) / totalMs);
  }

  const paidRub = u.housingRentLastPaidRub;
  const periodMs = u.housingRentLastPeriodMs;
  if (paidRub != null && periodMs != null && periodMs > 0) {
    const segStart = u.housingRentNextDueMs - periodMs;
    const overlapStart = Math.max(nowMs, segStart);
    const refundMs = u.housingRentNextDueMs - overlapStart;
    if (refundMs <= 0) return 0;
    return Math.floor((paidRub * refundMs) / periodMs);
  }

  const plan = u.housingRentPlan ?? "month";
  const pr = housingRentPlanPriceRub(plan);
  const pm = housingRentPlanPeriodMs(plan);
  if (pm <= 0) return 0;
  return Math.floor((pr * remainingMs) / pm);
}

const TIER2_JOB_IDS = new Set(["dispatcher", "assembler", "expediter"]);

export function jobRequiresHousingForEmployment(jobId: string | undefined): boolean {
  if (!jobId) return false;
  return TIER2_JOB_IDS.has(jobId) || isTier3JobId(jobId);
}

/** Сброс работы тир 2+ при потере жилья или съезде (вместе с полями тир-3). */
export function economyUserClearTier2PlusJobPatch(u: EconomyUser): Partial<EconomyUser> {
  if (!jobRequiresHousingForEmployment(u.jobId)) return {};
  return {
    jobId: undefined,
    jobChosenAt: undefined,
    lastWorkAtByJob: undefined,
    ...tier3PatchWhenJobChanges(u, undefined),
  };
}

/** Списание аренды / коммуналки в начале календарного дня (по полю housingLastMskYmd). */
export function processHousingMskMidnightForUser(guildId: string, userId: string, todayYmd: string, nowMs: number): void {
  const u = getEconomyUser(guildId, userId);
  if (u.housingKind !== "rent" && u.housingKind !== "owned") return;
  if (u.housingLastMskYmd === todayYmd) return;

  const mark: { housingLastMskYmd: string } = { housingLastMskYmd: todayYmd };

  if (u.housingKind === "rent" && u.housingRentNextDueMs != null && nowMs >= u.housingRentNextDueMs) {
    const plan: HousingRentPlan = u.housingRentRenewalPlan ?? u.housingRentPlan ?? "month";
    const renewRub = housingRentPlanPriceRub(plan);
    const renewMs = housingRentPlanPeriodMs(plan);
    if (u.rubles >= renewRub) {
      patchEconomyUser(guildId, userId, {
        rubles: u.rubles - renewRub,
        housingRentNextDueMs: u.housingRentNextDueMs + renewMs,
        housingRentPlan: plan,
        housingRentRenewalPlan: undefined,
        housingRentLastPaidRub: renewRub,
        housingRentLastPeriodMs: renewMs,
        housingRentTotalPaidRub: (u.housingRentTotalPaidRub ?? 0) + renewRub,
        ...mark,
      });
      appendFeedEvent({
        ts: nowMs,
        guildId,
        type: "job:passive",
        actorUserId: userId,
        text: `Аренда жилья: **−${renewRub.toLocaleString("ru-RU")}** ₽ (продлено по текущему пакету).`,
      });
    } else {
      const p = u.prestigePoints ?? 0;
      const lost = u.housingRentPrestigeGranted ? HOUSING_RENT_PRESTIGE_ONE_TIME : 0;
      const quit = economyUserClearTier2PlusJobPatch(u);
      patchEconomyUser(guildId, userId, {
        housingKind: "none",
        housingRentNextDueMs: undefined,
        housingRentPlan: undefined,
        housingRentRenewalPlan: undefined,
        housingRentLastPaidRub: undefined,
        housingRentLastPeriodMs: undefined,
        housingRentChainStartedAtMs: undefined,
        housingRentTotalPaidRub: undefined,
        housingRentPrestigeGranted: false,
        prestigePoints: Math.max(0, p - lost),
        ...quit,
        ...mark,
      });
      appendFeedEvent({
        ts: nowMs,
        guildId,
        type: "job:passive",
        actorUserId: userId,
        text: `**Аренда прекращена** (не хватило ₽).${lost ? ` Престиж **−${lost}**.` : ""}${
          Object.keys(quit).length ? " Работа **тир 2+** сброшена — нужно снова оформить жильё." : ""
        }`,
      });
    }
    return;
  }

  if (u.housingKind === "owned" && u.ownedApartmentId && u.housingUtilityNextDueMs != null && nowMs >= u.housingUtilityNextDueMs) {
    const apt = getApartmentDef(u.ownedApartmentId);
    const util = apt?.monthlyUtilityRub ?? 0;
    if (util > 0 && u.rubles >= util) {
      patchEconomyUser(guildId, userId, {
        rubles: u.rubles - util,
        housingUtilityNextDueMs: u.housingUtilityNextDueMs + HOUSING_CALENDAR_MONTH_MS,
        ...mark,
      });
      appendFeedEvent({
        ts: nowMs,
        guildId,
        type: "job:passive",
        actorUserId: userId,
        text: `Коммуналка (**${apt?.label ?? "квартира"}**): **−${util.toLocaleString("ru-RU")}** ₽.`,
      });
    } else if (util > 0) {
      patchEconomyUser(guildId, userId, { ...mark });
      appendFeedEvent({
        ts: nowMs,
        guildId,
        type: "job:passive",
        actorUserId: userId,
        text: `**Коммуналка не списана** — недостаточно ₽.`,
      });
    } else {
      patchEconomyUser(guildId, userId, { ...mark });
    }
    return;
  }

  patchEconomyUser(guildId, userId, { ...mark });
}
