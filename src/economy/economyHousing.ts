import { appendFeedEvent } from "./feedStore.js";
import { getApartmentDef, HOUSING_RENT_MONTHLY_RUB, HOUSING_RENT_PERIOD_MS, HOUSING_RENT_PRESTIGE_ONE_TIME } from "./economyCatalog.js";
import { getEconomyUser, patchEconomyUser } from "./userStore.js";

/** Списание аренды / коммуналки в полночь МСК (по полю housingLastMskYmd). */
export function processHousingMskMidnightForUser(guildId: string, userId: string, todayYmd: string, nowMs: number): void {
  const u = getEconomyUser(guildId, userId);
  if (u.housingKind !== "rent" && u.housingKind !== "owned") return;
  if (u.housingLastMskYmd === todayYmd) return;

  const mark: { housingLastMskYmd: string } = { housingLastMskYmd: todayYmd };

  if (u.housingKind === "rent" && u.housingRentNextDueMs != null && nowMs >= u.housingRentNextDueMs) {
    if (u.rubles >= HOUSING_RENT_MONTHLY_RUB) {
      patchEconomyUser(guildId, userId, {
        rubles: u.rubles - HOUSING_RENT_MONTHLY_RUB,
        housingRentNextDueMs: u.housingRentNextDueMs + HOUSING_RENT_PERIOD_MS,
        ...mark,
      });
      appendFeedEvent({
        ts: nowMs,
        guildId,
        type: "job:passive",
        actorUserId: userId,
        text: `Аренда жилья: **−${HOUSING_RENT_MONTHLY_RUB.toLocaleString("ru-RU")}** ₽ (продлено на 30 дней).`,
      });
    } else {
      const p = u.prestigePoints ?? 0;
      const lost = u.housingRentPrestigeGranted ? HOUSING_RENT_PRESTIGE_ONE_TIME : 0;
      patchEconomyUser(guildId, userId, {
        housingKind: "none",
        housingRentNextDueMs: undefined,
        housingRentPrestigeGranted: false,
        prestigePoints: Math.max(0, p - lost),
        ...mark,
      });
      appendFeedEvent({
        ts: nowMs,
        guildId,
        type: "job:passive",
        actorUserId: userId,
        text: `**Аренда прекращена** (не хватило ₽).${lost ? ` Престиж **−${lost}**.` : ""}`,
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
        housingUtilityNextDueMs: u.housingUtilityNextDueMs + HOUSING_RENT_PERIOD_MS,
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
