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
    lastWorkAt: undefined,
    ...tier3PatchWhenJobChanges(u, undefined),
  };
}

/** Списание аренды / коммуналки в полночь МСК (по полю housingLastMskYmd). */
export function processHousingMskMidnightForUser(guildId: string, userId: string, todayYmd: string, nowMs: number): void {
  const u = getEconomyUser(guildId, userId);
  if (u.housingKind !== "rent" && u.housingKind !== "owned") return;
  if (u.housingLastMskYmd === todayYmd) return;

  const mark: { housingLastMskYmd: string } = { housingLastMskYmd: todayYmd };

  if (u.housingKind === "rent" && u.housingRentNextDueMs != null && nowMs >= u.housingRentNextDueMs) {
    const plan: HousingRentPlan = u.housingRentPlan ?? "month";
    const renewRub = housingRentPlanPriceRub(plan);
    const renewMs = housingRentPlanPeriodMs(plan);
    if (u.rubles >= renewRub) {
      patchEconomyUser(guildId, userId, {
        rubles: u.rubles - renewRub,
        housingRentNextDueMs: u.housingRentNextDueMs + renewMs,
        housingRentPlan: plan,
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
