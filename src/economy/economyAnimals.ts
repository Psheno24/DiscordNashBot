import { getPetDef } from "./economyCatalog.js";
import { applyUnregisteredVehiclePenalty } from "./economyLicensePlate.js";
import { scaledEconomyExpense, scaledEconomyPsIncome } from "./economyMacro.js";
import { appendFeedEvent } from "./feedStore.js";
import { getEconomyUser, patchEconomyUser, updateEconomyUser } from "./userStore.js";

/** Суточный уход за питомцем (полночь МСК). */
export function processPetMskMidnightForUser(
  guildId: string,
  userId: string,
  todayYmd: string,
  nowMs: number,
  mention: string,
): void {
  const u = getEconomyUser(guildId, userId);
  if (!u.ownedPetId) return;
  if (u.petLastMskYmd === todayYmd) return;

  const pet = getPetDef(u.ownedPetId);
  if (!pet) {
    patchEconomyUser(guildId, userId, { ownedPetId: undefined, petLastMskYmd: todayYmd });
    return;
  }

  const mark = { petLastMskYmd: todayYmd };
  const upkeep = scaledEconomyExpense(guildId, pet.dailyUpkeepRub);

  if (u.rubles < upkeep) {
    patchEconomyUser(guildId, userId, {
      ...mark,
      petPausedNoFunds: true,
    });
    appendFeedEvent({
      ts: nowMs,
      guildId,
      type: "job:passive",
      actorUserId: userId,
      text: `${mention}: **${pet.label}** — нет ₽ на содержание (**${upkeep.toLocaleString("ru-RU")}** ₽/сутки), бонус СР **приостановлен**.`,
    });
    return;
  }

  const psAdd = applyUnregisteredVehiclePenalty(u, scaledEconomyPsIncome(guildId, pet.dailyPsRub));
  updateEconomyUser(guildId, userId, (cur) => ({
    ...cur,
    ...mark,
    rubles: cur.rubles - upkeep,
    psTotal: cur.psTotal + psAdd,
    petPausedNoFunds: false,
  }));
  appendFeedEvent({
    ts: nowMs,
    guildId,
    type: "job:passive",
    actorUserId: userId,
    text: `${mention}: **${pet.label}** — **−${upkeep.toLocaleString("ru-RU")}** ₽, **+${psAdd.toLocaleString("ru-RU")}** СР.`,
  });
}
