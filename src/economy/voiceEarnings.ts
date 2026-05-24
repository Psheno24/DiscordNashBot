import { mskCalendarDayKey } from "../time/msk.js";
import { feedPrestigeDomesticBonusSuffix, voiceDomesticPsBonus } from "./economyFeedBonus.js";
import { domesticVoicePsMult } from "./economyModifiers.js";
import { appendFeedEvent } from "./feedStore.js";
import { getEconomyUser, patchEconomyUser } from "./userStore.js";

function psFromMinutesWithDiminishing(alreadyToday: number, addMinutes: number): number {
  let gained = 0;
  let start = alreadyToday;
  let left = addMinutes;

  const take = (until: number, rate: number) => {
    if (left <= 0) return;
    if (start >= until) return;
    const chunk = Math.min(left, until - start);
    gained += chunk * rate;
    start += chunk;
    left -= chunk;
  };

  take(180, 1.0);
  take(360, 0.5);
  if (left > 0) gained += left * 0.2;

  return gained;
}

export function applyVoiceEarnings(args: {
  guildId: string;
  userId: string;
  deltaSeconds: number;
  nowTs?: number;
  actorMention?: string;
}): { psAdded: number; rubAdded: number; minutesCounted: number } {
  const { guildId, userId, deltaSeconds } = args;
  const now = args.nowTs ?? Date.now();
  const minutes = Math.floor(deltaSeconds / 60);
  if (minutes <= 0) return { psAdded: 0, rubAdded: 0, minutesCounted: 0 };

  const u = getEconomyUser(guildId, userId);
  const key = mskCalendarDayKey(now);
  const already = u.voiceDay === key ? (u.voiceMinutesToday ?? 0) : 0;

  const psRaw = psFromMinutesWithDiminishing(already, minutes);
  const bytMult = domesticVoicePsMult(u.domesticPoints ?? 0);
  const psAdded = Math.floor(psRaw * bytMult);

  const nextMinutesToday = already + minutes;
  patchEconomyUser(guildId, userId, {
    psTotal: u.psTotal + psAdded,
    voiceDay: key,
    voiceMinutesToday: nextMinutesToday,
  });

  if (psAdded > 0) {
    const who = args.actorMention ?? `<@${userId}>`;
    const domesticBonus = voiceDomesticPsBonus(psRaw, u.domesticPoints ?? 0);
    const psMain = domesticBonus > 0 ? Math.floor(psRaw) : psAdded;
    appendFeedEvent({
      ts: now,
      guildId,
      type: "voice:earn",
      actorUserId: userId,
      text: `${who} получил за голос: **+${psMain.toLocaleString("ru-RU")}** СР${feedPrestigeDomesticBonusSuffix({ domesticPs: domesticBonus })}.`,
    });
  }

  return { psAdded, rubAdded: 0, minutesCounted: minutes };
}
