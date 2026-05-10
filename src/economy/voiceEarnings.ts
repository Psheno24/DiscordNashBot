import { mskCalendarDayKey } from "../time/msk.js";
import { appendFeedEvent } from "./feedStore.js";
import { getEconomyUser, patchEconomyUser, type FocusPreset } from "./userStore.js";

/** Два знака после запятой для баланса ₽ (голос и др. могут давать дробные начисления). */
function roundRubles(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.round(x * 100) / 100);
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

/**
 * ₽ за минуту в **первой** дневной зоне (0–180 мин), **до** доли фокуса.
 * Зоны 180–360 и 360+ те же коэффициенты, что у СР: ×0.5 и ×0.2 к этой ставке.
 * Ориентир: ~10к ₽ за **10 ч** с нуля при фокусе «деньги» (60% в ₽): 57×(180+90+48)×0.6 ≈ 10 043; дольше — больше по той же схеме.
 */
const VOICE_RUB_RUB_PER_MIN_ZONE1_BEFORE_FOCUS = 57;

/** ₽ за смену голосового времени до деления фокусом (та же разбивка по минутам дня, что у СР). */
function rubFromMinutesWithDiminishing(alreadyToday: number, addMinutes: number): number {
  const z = VOICE_RUB_RUB_PER_MIN_ZONE1_BEFORE_FOCUS;
  let gained = 0;
  let start = alreadyToday;
  let left = addMinutes;

  const take = (until: number, tierMul: number) => {
    if (left <= 0) return;
    if (start >= until) return;
    const chunk = Math.min(left, until - start);
    gained += chunk * z * tierMul;
    start += chunk;
    left -= chunk;
  };

  take(180, 1.0);
  take(360, 0.5);
  if (left > 0) gained += left * z * 0.2;

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

  const { psShare, rubShare } = focusShares(u.focus);
  const psRaw = psFromMinutesWithDiminishing(already, minutes);
  const psAdded = Math.floor(psRaw * psShare);

  const rubBeforeFocus = rubFromMinutesWithDiminishing(already, minutes);
  const rubAdded = rubBeforeFocus * rubShare;

  const nextMinutesToday = already + minutes;
  patchEconomyUser(guildId, userId, {
    psTotal: u.psTotal + psAdded,
    rubles: roundRubles(u.rubles + rubAdded),
    voiceDay: key,
    voiceMinutesToday: nextMinutesToday,
  });

  if (psAdded > 0 || rubAdded > 0) {
    const who = args.actorMention ?? `<@${userId}>`;
    const parts: string[] = [];
    if (psAdded > 0) parts.push(`+${psAdded.toLocaleString("ru-RU")} СР`);
    if (rubAdded > 0) {
      const ru = Number.isInteger(rubAdded) ? rubAdded.toLocaleString("ru-RU") : rubAdded.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
      parts.push(`+${ru} ₽`);
    }
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

