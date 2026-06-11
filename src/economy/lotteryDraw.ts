import type { Client, Guild } from "discord.js";
import { appendFeedEvent } from "./feedStore.js";
import { appendLotteryDrawLog, type LotteryDrawReason, type LotteryDrawWinnerLog } from "./lotteryLogStore.js";
import {
  ensureJackpotFloor,
  getLotteryState,
  getStoredLotteryState,
  LOTTERY_TICKET_PRICE_RUB,
  saveLotteryState,
  type LotteryTicketEntry,
} from "./lotteryStore.js";
import { applyUnregisteredVehiclePenalty } from "./economyLicensePlate.js";
import { getEconomyUser, patchEconomyUser } from "./userStore.js";
import { mskTodayYmd } from "./mskCalendar.js";

/** Период лотереи: сутки до розыгрыша в 21:00 МСК (дата «сегодня» до 21:00, после — уже завтрашний период). */
export function lotteryPeriodMskYmd(nowMs: number = Date.now()): string {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  })
    .formatToParts(nowMs)
    .reduce<Record<string, string>>((acc, p) => {
      if (p.type !== "literal") acc[p.type] = p.value;
      return acc;
    }, {});
  const ymd = `${parts.year}-${parts.month}-${parts.day}`;
  const hour = Number.parseInt(parts.hour ?? "0", 10);
  if (hour < 21) return ymd;
  const noon = Date.parse(`${ymd}T12:00:00+03:00`);
  return new Date(noon + 86400000).toLocaleDateString("sv-SE", { timeZone: "Europe/Moscow" });
}

export function periodDrawAtMs(periodYmd: string): number {
  return Date.parse(`${periodYmd}T21:00:00+03:00`);
}

export function isPeriodDrawOverdue(periodYmd: string, nowMs: number = Date.now()): boolean {
  return nowMs >= periodDrawAtMs(periodYmd);
}

export function msUntilNextLotteryDrawMsk(nowMs: number = Date.now()): number {
  const period = lotteryPeriodMskYmd(nowMs);
  const drawAt = periodDrawAtMs(period);
  const target = drawAt > nowMs ? drawAt : periodDrawAtMs(mskTodayYmd(nowMs + 86400000));
  return Math.max(5_000, target - nowMs);
}

type DrawOutcome = {
  userId: string;
  rub: number;
  label: string;
};

function pickJackpotWinner(tickets: LotteryTicketEntry[]): { entry: LotteryTicketEntry; tier: "10" | "50" | "100" } | null {
  if (!tickets.length) return null;
  const r = Math.random() * 100;
  let tier: "10" | "50" | "100" | null = null;
  if (r < 2) tier = "100";
  else if (r < 10) tier = "50";
  else if (r < 25) tier = "10";
  if (!tier) return null;
  const idx = Math.floor(Math.random() * tickets.length);
  return { entry: tickets[idx]!, tier };
}

function rollPerTicketRefund(): number {
  const r = Math.random() * 100;
  if (r < 25) return LOTTERY_TICKET_PRICE_RUB;
  if (r < 75) return Math.floor(LOTTERY_TICKET_PRICE_RUB / 2);
  return 0;
}

function groupWinnersForLog(payouts: DrawOutcome[]): LotteryDrawWinnerLog[] {
  const byUser = new Map<string, { rub: number; labels: string[] }>();
  for (const p of payouts) {
    const cur = byUser.get(p.userId) ?? { rub: 0, labels: [] };
    cur.rub += p.rub;
    cur.labels.push(p.label);
    byUser.set(p.userId, cur);
  }
  return [...byUser.entries()]
    .map(([userId, v]) => ({ userId, rub: v.rub, labels: v.labels }))
    .sort((a, b) => b.rub - a.rub);
}

export function runLotteryDrawForGuild(
  guild: Guild,
  periodYmd: string,
  nowMs: number = Date.now(),
  reason: LotteryDrawReason = "scheduled",
): string[] {
  const st = getStoredLotteryState(guild.id);
  if (!st || st.periodMskYmd !== periodYmd) return [];

  const jackpotBefore = st.jackpotRub;

  if (!st.tickets.length) {
    const nextPeriod = lotteryPeriodMskYmd(nowMs + 60_000);
    const nextJackpot = ensureJackpotFloor(st.jackpotRub);
    saveLotteryState(guild.id, {
      periodMskYmd: nextPeriod,
      jackpotRub: nextJackpot,
      tickets: [],
      ticketsSold: 0,
    });
    appendLotteryDrawLog({
      ts: nowMs,
      guildId: guild.id,
      periodMskYmd: periodYmd,
      reason,
      ticketsSold: 0,
      jackpotBefore,
      jackpotAfter: nextJackpot,
      winners: [],
    });
    return [];
  }

  let jackpot = st.jackpotRub;
  const payouts: DrawOutcome[] = [];
  const jackpotPick = pickJackpotWinner(st.tickets);
  if (jackpotPick) {
    let prize = 0;
    let label = "";
    if (jackpotPick.tier === "10") {
      prize = Math.floor(jackpot * 0.1);
      label = "10% джекпота";
    } else if (jackpotPick.tier === "50") {
      prize = Math.floor(jackpot * 0.5);
      label = "50% джекпота";
    } else {
      prize = Math.floor(jackpot);
      label = "весь джекпот";
    }
    jackpot -= prize;
    payouts.push({ userId: jackpotPick.entry.userId, rub: prize, label });
  }

  for (const t of st.tickets) {
    const refund = rollPerTicketRefund();
    if (refund > 0) {
      jackpot -= refund;
      payouts.push({ userId: t.userId, rub: refund, label: refund === LOTTERY_TICKET_PRICE_RUB ? "возврат билета" : "половина билета" });
    }
  }

  const byUser = new Map<string, number>();
  for (const p of payouts) {
    byUser.set(p.userId, (byUser.get(p.userId) ?? 0) + p.rub);
  }

  const feedWinners: { userId: string; credit: number }[] = [];
  for (const [userId, total] of byUser) {
    const u = getEconomyUser(guild.id, userId);
    const credit = applyUnregisteredVehiclePenalty(u, total);
    patchEconomyUser(guild.id, userId, { rubles: u.rubles + credit });
    feedWinners.push({ userId, credit });
  }
  feedWinners.sort((a, b) => b.credit - a.credit);

  const nextPeriod = lotteryPeriodMskYmd(nowMs + 60_000);
  const nextJackpot = ensureJackpotFloor(jackpot);
  saveLotteryState(guild.id, {
    periodMskYmd: nextPeriod,
    jackpotRub: nextJackpot,
    tickets: [],
    ticketsSold: 0,
  });

  appendLotteryDrawLog({
    ts: nowMs,
    guildId: guild.id,
    periodMskYmd: periodYmd,
    reason,
    ticketsSold: st.ticketsSold,
    jackpotBefore,
    jackpotAfter: nextJackpot,
    winners: groupWinnersForLog(payouts),
  });

  const jackpotLine = `**Джекпот** → **${nextJackpot.toLocaleString("ru-RU")}** ₽`;
  const header = `**Розыгрыш лотереи** (${periodYmd}, 21:00 МСК)`;

  if (feedWinners.length) {
    const winnerLines = feedWinners.map(
      (w) => `<@${w.userId}> — **+${w.credit.toLocaleString("ru-RU")}** ₽`,
    );
    appendFeedEvent({
      ts: nowMs,
      guildId: guild.id,
      type: "job:shift",
      text: [header, ...winnerLines, "", jackpotLine].join("\n"),
    });
  } else {
    appendFeedEvent({
      ts: nowMs,
      guildId: guild.id,
      type: "job:shift",
      text: [header, "Без выигрышей.", "", jackpotLine].join("\n"),
    });
  }

  return feedWinners.map((w) => `<@${w.userId}>: лотерея **+${w.credit.toLocaleString("ru-RU")}** ₽`);
}

const MAX_CATCHUP_DRAWS = 12;

export function ensureDueLotteryDraws(guild: Guild, nowMs: number = Date.now(), reason: LotteryDrawReason = "catch-up"): void {
  for (let i = 0; i < MAX_CATCHUP_DRAWS; i++) {
    const st = getStoredLotteryState(guild.id);
    if (!st || !isPeriodDrawOverdue(st.periodMskYmd, nowMs)) return;
    runLotteryDrawForGuild(guild, st.periodMskYmd, nowMs, reason);
  }
  console.warn(`lottery: catch-up limit reached for guild ${guild.id}`);
}

export function ensureDueLotteryDrawsAllGuilds(client: Client, nowMs: number = Date.now(), reason: LotteryDrawReason = "scheduled"): void {
  for (const guild of client.guilds.cache.values()) {
    try {
      ensureDueLotteryDraws(guild, nowMs, reason);
    } catch (e) {
      console.error(`lottery draw guild ${guild.id}:`, e);
    }
  }
}


export function scheduleLotteryDrawTick(client: Client): void {
  const run = async () => {
    try {
      ensureDueLotteryDrawsAllGuilds(client, Date.now(), "scheduled");
    } catch (e) {
      console.error("lottery draw tick:", e);
    }
    scheduleLotteryDrawTick(client);
  };
  const delay = msUntilNextLotteryDrawMsk();
  const checkIn = Math.min(delay, 30_000);
  setTimeout(run, checkIn);
}
