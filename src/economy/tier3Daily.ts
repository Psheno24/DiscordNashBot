import type { Client } from "discord.js";
import { getGuildConfig, patchGuildConfig } from "../guildConfig/store.js";
import { applyUnregisteredVehiclePenalty } from "./economyLicensePlate.js";
import { feedNetPrestigeRubBonus, feedPrestigeDomesticBonusSuffix } from "./economyFeedBonus.js";
import { appendFeedEvent } from "./feedStore.js";
import { processHousingMskMidnightForUser } from "./economyHousing.js";
import {
  getLastCompletedMidnightTickYmd,
  isEconomyMskMidnightTickDue,
  setLastCompletedMidnightTickYmd,
} from "./midnightTickStore.js";
import { isMskMonday, msUntilNextMskMidnight, mskTodayYmd } from "./mskCalendar.js";
import { addToTreasury, getSolePropWeeklyCapitalTaxPercent, withholdLegalIncomeTax } from "./taxTreasury.js";
import { getEconomyUser, listEconomyUsers, patchEconomyUser } from "./userStore.js";
import { listOwnedPets } from "./economyAssets.js";
import { solePropMidnightPatch } from "./tier3SolePropMsk.js";
import {
  computeTier3PassiveRubDetailed,
  computeTier3StreakAfterMskDay,
  getTier3JobDef,
  isTier3JobId,
  mskTickTodayYmd,
  tier3PromotionRank,
  type Tier3JobId,
} from "./tier3Jobs.js";
import { processPetMskMidnightForUser } from "./economyAnimals.js";
import { tier3RankTitle } from "./tier3RankTitles.js";

/**
 * Суточный тик: стрик календарных дней на тир-3 работе и суточный пассивный оклад (по архетипу).
 * Идемпотентно по полю `economyLastMskYmd` на пользователя.
 */
function processWeeklySolePropCapitalTax(guildId: string, todayYmd: string, nowMs: number): void {
  if (!isMskMonday(nowMs)) return;
  const cfg = getGuildConfig(guildId);
  if (cfg.solePropWeeklyTaxLastMskYmd === todayYmd) return;
  const pct = getSolePropWeeklyCapitalTaxPercent(guildId);
  let treasuryAdd = 0;
  if (pct > 0) {
    for (const { userId } of listEconomyUsers(guildId)) {
      const u = getEconomyUser(guildId, userId);
      if (u.jobId !== "soleProp") continue;
      const cap = u.solePropCapitalRub ?? 0;
      if (cap <= 0) continue;
      const tax = Math.min(cap, Math.floor((cap * pct) / 100));
      if (tax <= 0) continue;
      patchEconomyUser(guildId, userId, { solePropCapitalRub: cap - tax });
      treasuryAdd += tax;
    }
    if (treasuryAdd > 0) addToTreasury(guildId, treasuryAdd);
  }
  patchGuildConfig(guildId, { solePropWeeklyTaxLastMskYmd: todayYmd });
}

export async function processEconomyMskMidnightTick(client: Client): Promise<void> {
  const today = mskTickTodayYmd();
  const now = Date.now();
  for (const guild of client.guilds.cache.values()) {
    const entries = listEconomyUsers(guild.id);
    for (const { userId } of entries) {
      processHousingMskMidnightForUser(guild.id, userId, today, now);
      const member = await guild.members.fetch(userId).catch(() => null);
      const mention = member ? member.toString() : `Пользователь ${userId}`;
      processPetMskMidnightForUser(guild.id, userId, today, now, mention);
    }
    processWeeklySolePropCapitalTax(guild.id, today, now);
    for (const { userId } of entries) {
      let u = getEconomyUser(guild.id, userId);
      if (u.economyLastMskYmd === today) continue;
      if (!u.jobId || !isTier3JobId(u.jobId)) continue;

      const jobId = u.jobId;
      const def = getTier3JobDef(jobId);
      const streakOut = computeTier3StreakAfterMskDay({
        jobId,
        lastMskYmd: u.economyLastMskYmd,
        todayYmd: today,
        prevStreak: u.jobMskDayStreak ?? 0,
        prevAnchorJobId: u.jobMskStreakAnchorJobId,
      });

      const solePropMskPatch = jobId === "soleProp" ? solePropMidnightPatch(u, today, now) : {};
      u = { ...u, ...solePropMskPatch };

      const rankBefore = tier3PromotionRank(u.jobMskDayStreak ?? 0);
      const passiveOut = computeTier3PassiveRubDetailed({
        guildId: guild.id,
        jobId,
        def,
        streakDays: streakOut.nextStreak,
        solePropCapitalRub: u.solePropCapitalRub ?? 0,
        solePropRiskDial: u.solePropRiskDial ?? 0,
        prestigePoints: u.prestigePoints ?? 0,
        solePropPassiveEffMult: u.solePropPassiveEffMult,
        solePropPassiveTempMult: u.solePropPassiveTempMult,
      });
      let passive = applyUnregisteredVehiclePenalty(u, passiveOut.total);
      const rankAfter = tier3PromotionRank(streakOut.nextStreak);

      let creditPassive = passive;
      if (passive > 0 && (def.archetype === "legal" || def.archetype === "ip")) {
        const { netRub } = withholdLegalIncomeTax(guild.id, passive);
        creditPassive = netRub;
      }

      const rublesNext = u.rubles + creditPassive;
      patchEconomyUser(guild.id, userId, {
        economyLastMskYmd: today,
        jobMskDayStreak: streakOut.nextStreak,
        jobMskStreakAnchorJobId: streakOut.nextAnchorJobId,
        rubles: rublesNext,
        ...solePropMskPatch,
      });

      const member = await guild.members.fetch(userId).catch(() => null);
      const mention = member ? member.toString() : `Пользователь ${userId}`;

      if (passive > 0) {
        const netPrestigeRub = feedNetPrestigeRubBonus(passive, passiveOut.prestigeRubBonus, creditPassive);
        const feedRubMain = Math.max(0, creditPassive - netPrestigeRub);
        appendFeedEvent({
          ts: Date.now(),
          guildId: guild.id,
          type: "job:passive",
          actorUserId: userId,
          text: `${mention}: суточный оклад **${def.title}** — **+${feedRubMain.toLocaleString("ru-RU")}** ₽${feedPrestigeDomesticBonusSuffix({ prestigeRub: netPrestigeRub })}`,
        });
      }

      if (rankAfter > rankBefore) {
        appendFeedEvent({
          ts: Date.now(),
          guildId: guild.id,
          type: "job:passive",
          actorUserId: userId,
          text: `${mention}: **повышение** на **${def.title}** — **${tier3RankTitle(jobId as Tier3JobId, rankAfter)}**`,
        });
      }
    }
  }
}

const MIDNIGHT_TICK_POLL_MS = 30_000;
const MIDNIGHT_TICK_NEAR_MS = 120_000;

async function executeEconomyMskMidnightTick(client: Client, onTick?: () => Promise<void>): Promise<void> {
  await processEconomyMskMidnightTick(client);
  if (onTick) await onTick();
}

/** Если state-файла ещё нет, но все пользователи уже обработаны за сегодня — не гонять тяжёлый тик заново. */
export function seedMidnightTickStateIfAlreadyCurrent(client: Client, nowMs: number = Date.now()): void {
  if (getLastCompletedMidnightTickYmd()) return;
  const today = mskTodayYmd(nowMs);
  const todayStart = Date.parse(`${today}T00:00:00+03:00`);
  if (nowMs < todayStart + 1000) return;

  for (const guild of client.guilds.cache.values()) {
    if (isMskMonday(nowMs)) {
      const cfg = getGuildConfig(guild.id);
      if (cfg.solePropWeeklyTaxLastMskYmd !== today) {
        for (const { userId } of listEconomyUsers(guild.id)) {
          if (getEconomyUser(guild.id, userId).jobId === "soleProp") return;
        }
      }
    }
    for (const { userId } of listEconomyUsers(guild.id)) {
      const u = getEconomyUser(guild.id, userId);
      if ((u.housingKind === "rent" || u.housingKind === "owned") && u.housingLastMskYmd !== today) return;
      if (u.housingForeignKind === "owned" && u.ownedForeignApartmentId && u.housingForeignLastMskYmd !== today) {
        return;
      }
      if ((listOwnedPets(u).length > 0 || u.ownedPetId) && u.petLastMskYmd !== today) return;
      if (u.jobId && isTier3JobId(u.jobId) && u.economyLastMskYmd !== today) return;
    }
  }
  setLastCompletedMidnightTickYmd(today);
  console.log(`economy daily tick: state seeded for ${today} (already current)`);
}

function midnightTickPollDelayMs(nowMs: number = Date.now()): number {
  if (isEconomyMskMidnightTickDue(nowMs)) return MIDNIGHT_TICK_POLL_MS;
  const until = msUntilNextMskMidnight(nowMs);
  if (until <= MIDNIGHT_TICK_NEAR_MS) return MIDNIGHT_TICK_POLL_MS;
  return Math.min(until, 60_000);
}

/** Догоняющий тик при старте бота, если полночь МСК уже прошла, а суточные начисления не отработали. */
export async function ensureEconomyMskMidnightCatchUp(client: Client, onTick?: () => Promise<void>): Promise<void> {
  if (!isEconomyMskMidnightTickDue()) {
    const today = mskTodayYmd();
    const last = getLastCompletedMidnightTickYmd();
    console.log(`economy daily catch-up: skip (${last ?? "never"} → ${today})`);
    return;
  }
  try {
    const today = mskTodayYmd();
    console.log(`economy daily catch-up: running for ${today}`);
    await executeEconomyMskMidnightTick(client, onTick);
    setLastCompletedMidnightTickYmd(today);
    console.log(`economy daily catch-up: completed for ${today}`);
  } catch (e) {
    console.error("economy daily catch-up:", e);
  }
}

/** Планировщик с опросом (как лотерея): не полагается на один setTimeout на ~24 ч. */
export function scheduleEconomyMskMidnightTick(client: Client, onTick?: () => Promise<void>): void {
  const run = async () => {
    if (isEconomyMskMidnightTickDue()) {
      const today = mskTodayYmd();
      try {
        console.log(`economy daily tick: running for ${today}`);
        await executeEconomyMskMidnightTick(client, onTick);
        setLastCompletedMidnightTickYmd(today);
        console.log(`economy daily tick: completed for ${today}`);
      } catch (e) {
        console.error("economy daily tick:", e);
      }
    }
    setTimeout(() => void run(), midnightTickPollDelayMs());
  };
  setTimeout(() => void run(), midnightTickPollDelayMs());
}
