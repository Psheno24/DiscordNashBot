import { appendFeedEvent } from "./feedStore.js";
import { getEconomyUser, patchEconomyUser, type FocusPreset } from "./userStore.js";

function dayKey(ts: number): string {
  // UTC day key; для локального можно будет поменять позже
  const d = new Date(ts);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function focusShares(f: FocusPreset): { psShare: number; rubShare: number } {
  if (f === "role") return { psShare: 1.0, rubShare: 0.0 };
  if (f === "money") return { psShare: 0.4, rubShare: 0.6 };
  return { psShare: 0.7, rubShare: 0.3 };
}

function psFromMinutesWithDiminishing(alreadyToday: number, addMinutes: number): number {
  // 0–180: 1.0 СР/мин, 180–360: 0.5, 360+: 0.2
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

function rubFromMinutesWithDiminishing(alreadyToday: number, addMinutes: number): number {
  // 0–180: 1.0 ₽/мин, 180–360: 0.5, 360+: 0.2
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
  const key = dayKey(now);
  const already = u.voiceDay === key ? (u.voiceMinutesToday ?? 0) : 0;

  const { psShare, rubShare } = focusShares(u.focus);
  const psRaw = psFromMinutesWithDiminishing(already, minutes);
  const psAdded = Math.floor(psRaw * psShare);

  // ₽ начисляем с diminishing returns по минутам/сутки (как и для СР),
  // и дополнительно умножаем на долю фокуса.
  const rubRaw = rubFromMinutesWithDiminishing(already, minutes);
  const rubAdded = Math.floor(rubRaw * rubShare);

  const nextMinutesToday = already + minutes;
  patchEconomyUser(guildId, userId, {
    psTotal: u.psTotal + psAdded,
    rubles: u.rubles + rubAdded,
    voiceDay: key,
    voiceMinutesToday: nextMinutesToday,
  });

  if (psAdded > 0 || rubAdded > 0) {
    const who = args.actorMention ?? `<@${userId}>`;
    const parts: string[] = [];
    if (psAdded > 0) parts.push(`+${psAdded.toLocaleString("ru-RU")} СР`);
    if (rubAdded > 0) parts.push(`+${rubAdded.toLocaleString("ru-RU")} ₽`);
    appendFeedEvent({
      ts: now,
      guildId,
      type: "voice:earn",
      actorUserId: userId,
      text: `${who} получил за голос: ${parts.join(", ")}.`,
    });
  }

  return { psAdded, rubAdded, minutesCounted: minutes };
}

