import { getPetDef } from "./economyCatalog.js";
import { appendFeedEvent } from "./feedStore.js";
import { getEconomyUser, patchEconomyUser } from "./userStore.js";

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
  const upkeep = pet.dailyUpkeepRub;

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

  const psAdd = pet.dailyPsRub;
  patchEconomyUser(guildId, userId, {
    ...mark,
    rubles: u.rubles - upkeep,
    psTotal: u.psTotal + psAdd,
    petPausedNoFunds: false,
  });
  appendFeedEvent({
    ts: nowMs,
    guildId,
    type: "job:passive",
    actorUserId: userId,
    text: `${mention}: **${pet.label}** — **−${upkeep.toLocaleString("ru-RU")}** ₽, **+${psAdd.toLocaleString("ru-RU")}** СР.`,
  });
}
