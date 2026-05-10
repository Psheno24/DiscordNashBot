import type { Client } from "discord.js";
import { appendFeedEvent } from "./feedStore.js";
import { processHousingMskMidnightForUser } from "./economyHousing.js";
import { msUntilNextMskMidnight } from "./mskCalendar.js";
import { getEconomyUser, listEconomyUsers, patchEconomyUser } from "./userStore.js";
import {
  computeTier3PassiveRub,
  computeTier3StreakAfterMskDay,
  getTier3JobDef,
  isTier3JobId,
  mskTickTodayYmd,
  tier3PromotionRank,
} from "./tier3Jobs.js";

/**
 * Полночь по МСК: стрик календарных дней на тир-3 работе и ночной пассив (по архетипу).
 * Идемпотентно по полю `economyLastMskYmd` на пользователя.
 */
export async function processEconomyMskMidnightTick(client: Client): Promise<void> {
  const today = mskTickTodayYmd();
  const now = Date.now();
  for (const guild of client.guilds.cache.values()) {
    const entries = listEconomyUsers(guild.id);
    for (const { userId } of entries) {
      processHousingMskMidnightForUser(guild.id, userId, today, now);
    }
    for (const { userId } of entries) {
      const u = getEconomyUser(guild.id, userId);
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

      const rankBefore = tier3PromotionRank(u.jobMskDayStreak ?? 0);
      const passive = computeTier3PassiveRub({
        jobId,
        def,
        streakDays: streakOut.nextStreak,
        solePropCapitalRub: u.solePropCapitalRub ?? 0,
        solePropRiskDial: u.solePropRiskDial ?? 0,
        prestigePoints: u.prestigePoints ?? 0,
      });
      const rankAfter = tier3PromotionRank(streakOut.nextStreak);

      const rublesNext = u.rubles + passive;
      patchEconomyUser(guild.id, userId, {
        economyLastMskYmd: today,
        jobMskDayStreak: streakOut.nextStreak,
        jobMskStreakAnchorJobId: streakOut.nextAnchorJobId,
        rubles: rublesNext,
      });

      const member = await guild.members.fetch(userId).catch(() => null);
      const mention = member ? member.toString() : `Пользователь ${userId}`;

      if (passive > 0) {
        appendFeedEvent({
          ts: Date.now(),
          guildId: guild.id,
          type: "job:passive",
          actorUserId: userId,
          text: `${mention}: пассив **${def.title}** — **+${Math.floor(passive)}** ₽ (стрик **${streakOut.nextStreak}** дн., должность **${rankAfter}**).`,
        });
      }

      if (rankAfter > rankBefore) {
        appendFeedEvent({
          ts: Date.now(),
          guildId: guild.id,
          type: "job:passive",
          actorUserId: userId,
          text: `${mention}: **повышение** на **${def.title}** — должность **${rankAfter}** (каждые 30 дней стажа).`,
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
