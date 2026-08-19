import { getPetDef } from "./economyCatalog.js";
import { applyUnregisteredVehiclePenalty } from "./economyLicensePlate.js";
import { listOwnedPets } from "./economyAssets.js";
import { scaledEconomyExpense, scaledEconomyPsIncome } from "./economyMacro.js";
import { appendFeedEvent } from "./feedStore.js";
import { getEconomyUser, patchEconomyUser, updateEconomyUser } from "./userStore.js";

function fmt(n: number): string {
  return n.toLocaleString("ru-RU");
}

/** Суточный уход за всеми питомцами (полночь МСК). */
export function processPetMskMidnightForUser(
  guildId: string,
  userId: string,
  todayYmd: string,
  nowMs: number,
  mention: string,
): void {
  const u = getEconomyUser(guildId, userId);
  const pets = listOwnedPets(u);
  if (pets.length === 0) return;
  if (u.petLastMskYmd === todayYmd) return;

  const mark = { petLastMskYmd: todayYmd };
  let spent = 0;
  let psGain = 0;
  const paid: string[] = [];
  const paused: string[] = [];

  updateEconomyUser(guildId, userId, (cur) => {
    let rubles = cur.rubles;
    let psTotal = cur.psTotal;
    const nextPets = listOwnedPets(cur).map((rec) => {
      const pet = getPetDef(rec.id);
      if (!pet) return rec;
      const upkeep = scaledEconomyExpense(guildId, pet.dailyUpkeepRub);
      if (rubles < upkeep) {
        paused.push(pet.label);
        return { ...rec, pausedNoFunds: true };
      }
      rubles -= upkeep;
      spent += upkeep;
      const psAdd = applyUnregisteredVehiclePenalty(cur, scaledEconomyPsIncome(guildId, pet.dailyPsRub));
      psTotal += psAdd;
      psGain += psAdd;
      paid.push(pet.label);
      return { ...rec, pausedNoFunds: undefined };
    });
    return { ...cur, ...mark, rubles, psTotal, ownedPets: nextPets };
  });

  if (paid.length === 0 && paused.length === 0) {
    patchEconomyUser(guildId, userId, mark);
    return;
  }

  const parts: string[] = [];
  if (spent > 0 || psGain > 0) parts.push(`**−${fmt(spent)}** ₽, **+${fmt(psGain)}** СР`);
  if (paused.length > 0) parts.push(`пауза без ₽: **${paused.join(", ")}**`);
  appendFeedEvent({
    ts: nowMs,
    guildId,
    type: "job:passive",
    actorUserId: userId,
    text: `${mention}: питомцы — ${parts.join(" · ")}.`,
  });
}
