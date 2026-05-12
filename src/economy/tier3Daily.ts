import type { Client } from "discord.js";
import { getGuildConfig, patchGuildConfig } from "../guildConfig/store.js";
import { appendFeedEvent } from "./feedStore.js";
import { processHousingMskMidnightForUser } from "./economyHousing.js";
import { isMskMonday, msUntilNextMskMidnight } from "./mskCalendar.js";
import { addToTreasury, getSolePropWeeklyCapitalTaxPercent, withholdLegalIncomeTax } from "./taxTreasury.js";
import { getEconomyUser, listEconomyUsers, patchEconomyUser } from "./userStore.js";
import { solePropMidnightPatch } from "./tier3SolePropMsk.js";
import {
  computeTier3PassiveRub,
  computeTier3StreakAfterMskDay,
  getTier3JobDef,
  isTier3JobId,
  mskTickTodayYmd,
  tier3PromotionRank,
  type Tier3JobId,
} from "./tier3Jobs.js";
import { tier3RankTitle } from "./tier3RankTitles.js";

/**
 * Полночь по МСК: стрик календарных дней на тир-3 работе и ежедневный оклад (по архетипу).
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
      const passive = computeTier3PassiveRub({
        jobId,
        def,
        streakDays: streakOut.nextStreak,
        solePropCapitalRub: u.solePropCapitalRub ?? 0,
        solePropRiskDial: u.solePropRiskDial ?? 0,
        prestigePoints: u.prestigePoints ?? 0,
        solePropPassiveEffMult: u.solePropPassiveEffMult,
        solePropPassiveTempMult: u.solePropPassiveTempMult,
      });
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
        const taxRub = passive - creditPassive;
        const taxPart = taxRub > 0 ? ` (налог **${Math.floor(taxRub)}** ₽ → казна)` : "";
        appendFeedEvent({
          ts: Date.now(),
          guildId: guild.id,
          type: "job:passive",
          actorUserId: userId,
          text: `${mention}: ежедневный оклад **${def.title}** — **+${Math.floor(creditPassive)}** ₽ на счёт${taxPart} (стрик **${streakOut.nextStreak}** дн., **${tier3RankTitle(jobId as Tier3JobId, rankAfter)}**).`,
        });
      }

      if (rankAfter > rankBefore) {
        appendFeedEvent({
          ts: Date.now(),
          guildId: guild.id,
          type: "job:passive",
          actorUserId: userId,
          text: `${mention}: **повышение** на **${def.title}** — **${tier3RankTitle(jobId as Tier3JobId, rankAfter)}** (каждые 30 дней стажа).`,
        });
      }
    }
  }
}

export function scheduleEconomyMskMidnightTick(client: Client, onTick?: () => Promise<void>): void {
  const run = async () => {
    try {
      await processEconomyMskMidnightTick(client);
      if (onTick) await onTick();
    } catch (e) {
      console.error("economy MSK midnight tick:", e);
    }
    scheduleEconomyMskMidnightTick(client, onTick);
  };
  const delay = msUntilNextMskMidnight();
  setTimeout(run, delay);
}
