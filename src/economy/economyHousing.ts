import { inflatedApartmentUtilityRub, inflatedHousingRentPrice, nextHousingUtilityDueMs } from "./economyMacro.js";
import { appendFeedEvent } from "./feedStore.js";
import {
  housingRentPlanPeriodMs,
  housingRentPlanPriceRub,
  type HousingRentPlan,
} from "./economyCatalog.js";
import { isMskFirstCalendarDay } from "./mskCalendar.js";
import { getEconomyUser, patchEconomyUser, type EconomyUser } from "./userStore.js";
import { remitShopPurchaseVatToTreasury } from "./taxTreasury.js";
import { isTier3JobId, tier3PatchWhenJobChanges } from "./tier3Jobs.js";

export { nextHousingUtilityDueMs } from "./economyMacro.js";

/** Пропорциональный возврат ₽ за неиспользованное время текущей оплаченной аренды (для покупки квартиры и т.п.). */
export function housingRentUnusedRefundRub(u: EconomyUser, nowMs: number = Date.now(), guildId?: string): number {
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
  const pr = guildId ? inflatedHousingRentPrice(guildId, plan) : housingRentPlanPriceRub(plan);
  const pm = housingRentPlanPeriodMs(plan);
  if (pm <= 0) return 0;
  return Math.floor((pr * remainingMs) / pm);
}

const TIER2_JOB_IDS = new Set(["dispatcher", "assembler", "expediter"]);

export function jobRequiresHousingForEmployment(jobId: string | undefined): boolean {
  if (!jobId) return false;
  return TIER2_JOB_IDS.has(jobId) || isTier3JobId(jobId);
}

export function userHasActiveHousing(u: EconomyUser, nowMs: number = Date.now()): boolean {
  if (u.housingKind === "rent" && u.housingRentNextDueMs != null && nowMs < u.housingRentNextDueMs) return true;
  if (u.housingKind === "owned" && u.ownedApartmentId) return true;
  if (u.housingForeignKind === "owned" && u.ownedForeignApartmentId) return true;
  return false;
}

/** Сброс работы тир 2+ при потере жилья или съезде (вместе с полями тир-3). */
export function economyUserClearTier2PlusJobPatch(u: EconomyUser): Partial<EconomyUser> {
  if (!jobRequiresHousingForEmployment(u.jobId)) return {};
  if (userHasActiveHousing(u)) return {};
  return {
    jobId: undefined,
    jobChosenAt: undefined,
    lastWorkAtByJob: undefined,
    ...tier3PatchWhenJobChanges(u, undefined),
  };
}

function processForeignUtility(
  guildId: string,
  userId: string,
  u: EconomyUser,
  todayYmd: string,
  nowMs: number,
): void {
  if (u.housingForeignKind !== "owned" || !u.ownedForeignApartmentId) return;
  if (u.housingForeignLastMskYmd === todayYmd) return;

  const mark = { housingForeignLastMskYmd: todayYmd };
  if (
    isMskFirstCalendarDay(nowMs) &&
    u.housingForeignUtilityNextDueMs != null &&
    nowMs >= u.housingForeignUtilityNextDueMs
  ) {
    const util = inflatedApartmentUtilityRub(guildId, u.ownedForeignApartmentId);
    if (util > 0 && u.rubles >= util) {
      patchEconomyUser(guildId, userId, {
        rubles: u.rubles - util,
        housingForeignUtilityNextDueMs: nextHousingUtilityDueMs(nowMs),
        ...mark,
      });
      remitShopPurchaseVatToTreasury(guildId, util);
    } else if (util > 0) {
      patchEconomyUser(guildId, userId, { ...mark });
    } else {
      patchEconomyUser(guildId, userId, { ...mark });
    }
    return;
  }
  patchEconomyUser(guildId, userId, { ...mark });
}

/** Списание аренды / ЖКХ в начале календарного дня (по полю housingLastMskYmd). ЖКХ — **1-е число** месяца (МСК). */
export function processHousingMskMidnightForUser(guildId: string, userId: string, todayYmd: string, nowMs: number): void {
  let u = getEconomyUser(guildId, userId);
  processForeignUtility(guildId, userId, u, todayYmd, nowMs);
  u = getEconomyUser(guildId, userId);

  const hasSoviet = u.housingKind === "rent" || u.housingKind === "owned";
  if (!hasSoviet) return;
  if (u.housingLastMskYmd === todayYmd) return;

  const mark: { housingLastMskYmd: string } = { housingLastMskYmd: todayYmd };

  if (u.housingKind === "rent" && u.housingRentNextDueMs != null && nowMs >= u.housingRentNextDueMs) {
    const plan: HousingRentPlan = u.housingRentRenewalPlan ?? u.housingRentPlan ?? "month";
    const renewRub = inflatedHousingRentPrice(guildId, plan);
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
      remitShopPurchaseVatToTreasury(guildId, renewRub);
      appendFeedEvent({
        ts: nowMs,
        guildId,
        type: "job:passive",
        actorUserId: userId,
        text: `Аренда жилья: **−${renewRub.toLocaleString("ru-RU")}** ₽ (продлено по текущему пакету).`,
      });
    } else {
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
        ...quit,
        ...mark,
      });
      appendFeedEvent({
        ts: nowMs,
        guildId,
        type: "job:passive",
        actorUserId: userId,
        text: `**Аренда прекращена** (не хватило ₽).${
          Object.keys(quit).length ? " Работа **тир 2+** сброшена — нужно снова оформить жильё." : ""
        }`,
      });
    }
    return;
  }

  if (
    u.housingKind === "owned" &&
    u.ownedApartmentId &&
    isMskFirstCalendarDay(nowMs) &&
    u.housingUtilityNextDueMs != null &&
    nowMs >= u.housingUtilityNextDueMs
  ) {
    const util = inflatedApartmentUtilityRub(guildId, u.ownedApartmentId);
    if (util > 0 && u.rubles >= util) {
      patchEconomyUser(guildId, userId, {
        rubles: u.rubles - util,
        housingUtilityNextDueMs: nextHousingUtilityDueMs(nowMs),
        ...mark,
      });
      remitShopPurchaseVatToTreasury(guildId, util);
    } else if (util > 0) {
      patchEconomyUser(guildId, userId, { ...mark });
    } else {
      patchEconomyUser(guildId, userId, { ...mark });
    }
    return;
  }

  patchEconomyUser(guildId, userId, { ...mark });
}
