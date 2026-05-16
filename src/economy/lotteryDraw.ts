import type { Client, Guild } from "discord.js";
import { appendFeedEvent } from "./feedStore.js";
import {
  ensureJackpotFloor,
  getLotteryState,
  LOTTERY_MIN_JACKPOT_RUB,
  LOTTERY_TICKET_PRICE_RUB,
  saveLotteryState,
  type GuildLotteryState,
  type LotteryTicketEntry,
} from "./lotteryStore.js";
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

export function msUntilNextLotteryDrawMsk(nowMs: number = Date.now()): number {
  const period = lotteryPeriodMskYmd(nowMs);
  const drawAt = Date.parse(`${period}T21:00:00+03:00`);
  const target = drawAt > nowMs ? drawAt : Date.parse(`${mskTodayYmd(nowMs + 86400000)}T21:00:00+03:00`);
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

export function runLotteryDrawForGuild(guild: Guild, periodYmd: string, nowMs: number = Date.now()): string[] {
  const st = getLotteryState(guild.id, periodYmd);
  if (!st.tickets.length) {
    saveLotteryState(guild.id, {
      periodMskYmd: lotteryPeriodMskYmd(nowMs + 60_000),
      jackpotRub: ensureJackpotFloor(st.jackpotRub),
      tickets: [],
      ticketsSold: 0,
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

  const feedLines: string[] = [];
  for (const [userId, total] of byUser) {
    const u = getEconomyUser(guild.id, userId);
    patchEconomyUser(guild.id, userId, { rubles: u.rubles + total });
    feedLines.push(`<@${userId}>: лотерея **+${total.toLocaleString("ru-RU")}** ₽`);
  }

  const nextPeriod = lotteryPeriodMskYmd(nowMs + 60_000);
  const nextJackpot = ensureJackpotFloor(jackpot);
  saveLotteryState(guild.id, {
    periodMskYmd: nextPeriod,
    jackpotRub: nextJackpot,
    tickets: [],
    ticketsSold: 0,
  });

  if (feedLines.length) {
    appendFeedEvent({
      ts: nowMs,
      guildId: guild.id,
      type: "job:shift",
      text: `**Розыгрыш лотереи** (${periodYmd}, 21:00 МСК): ${feedLines.join(" · ")}. Джекпот на следующий период: **${nextJackpot.toLocaleString("ru-RU")}** ₽`,
    });
  } else {
    appendFeedEvent({
      ts: nowMs,
      guildId: guild.id,
      type: "job:shift",
      text: `**Розыгрыш лотереи** (${periodYmd}, 21:00 МСК): без выигрышей. Джекпот: **${nextJackpot.toLocaleString("ru-RU")}** ₽`,
    });
  }

  return feedLines;
}

const drawnPeriods = new Set<string>();

export function scheduleLotteryDrawTick(client: Client): void {
  const run = async () => {
    try {
      const now = Date.now();
      const parts = new Intl.DateTimeFormat("sv-SE", {
        timeZone: "Europe/Moscow",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
        .formatToParts(now)
        .reduce<Record<string, string>>((acc, p) => {
          if (p.type !== "literal") acc[p.type] = p.value;
          return acc;
        }, {});
      const hour = Number.parseInt(parts.hour ?? "0", 10);
      const minute = Number.parseInt(parts.minute ?? "0", 10);
      if (hour === 21 && minute === 0) {
        const period = lotteryPeriodMskYmd(now - 60_000);
        for (const guild of client.guilds.cache.values()) {
          const key = `${guild.id}:${period}`;
          if (drawnPeriods.has(key)) continue;
          drawnPeriods.add(key);
          runLotteryDrawForGuild(guild, period, now);
          if (drawnPeriods.size > 500) drawnPeriods.clear();
        }
      }
    } catch (e) {
      console.error("lottery draw tick:", e);
    }
    scheduleLotteryDrawTick(client);
  };
  const delay = msUntilNextLotteryDrawMsk();
  const msTo21 = delay;
  const checkIn = Math.min(msTo21, 60_000);
  setTimeout(run, checkIn);
}
