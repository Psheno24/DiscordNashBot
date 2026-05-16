import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const LOTTERY_TICKET_PRICE_RUB = 1_000;
export const LOTTERY_MIN_JACKPOT_RUB = 100_000;

export type LotteryTicketEntry = {
  orderId: string;
  userId: string;
  boughtAt: number;
};

export interface GuildLotteryState {
  /** Период розыгрыша: календарный день МСК до 21:00 (YYYY-MM-DD). */
  periodMskYmd: string;
  jackpotRub: number;
  tickets: LotteryTicketEntry[];
  ticketsSold: number;
}

interface StoreShape {
  guilds: Record<string, GuildLotteryState>;
}

const storePath = () => {
  const dir = join(process.cwd(), "data");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return join(dir, "economy-lottery.json");
};

function readStore(): StoreShape {
  const p = storePath();
  if (!existsSync(p)) return { guilds: {} };
  try {
    return JSON.parse(readFileSync(p, "utf-8")) as StoreShape;
  } catch {
    return { guilds: {} };
  }
}

function writeStore(s: StoreShape) {
  writeFileSync(storePath(), JSON.stringify(s, null, 2), "utf-8");
}

function defaultState(periodMskYmd: string): GuildLotteryState {
  return {
    periodMskYmd,
    jackpotRub: LOTTERY_MIN_JACKPOT_RUB,
    tickets: [],
    ticketsSold: 0,
  };
}

export function getLotteryState(guildId: string, periodMskYmd: string): GuildLotteryState {
  const s = readStore();
  const cur = s.guilds[guildId];
  if (!cur || cur.periodMskYmd !== periodMskYmd) return defaultState(periodMskYmd);
  return { ...cur, tickets: [...cur.tickets] };
}

export function saveLotteryState(guildId: string, state: GuildLotteryState): void {
  const s = readStore();
  s.guilds[guildId] = state;
  writeStore(s);
}

export function addLotteryTickets(
  guildId: string,
  periodMskYmd: string,
  userId: string,
  count: number,
  nowMs: number = Date.now(),
): GuildLotteryState {
  const st = getLotteryState(guildId, periodMskYmd);
  const spend = count * LOTTERY_TICKET_PRICE_RUB;
  st.jackpotRub += spend;
  st.ticketsSold += count;
  for (let i = 0; i < count; i++) {
    st.tickets.push({ orderId: `${userId}:${nowMs}:${i}:${Math.random().toString(36).slice(2, 8)}`, userId, boughtAt: nowMs });
  }
  saveLotteryState(guildId, st);
  return st;
}

export function ensureJackpotFloor(jackpotRub: number): number {
  return Math.max(LOTTERY_MIN_JACKPOT_RUB, Math.floor(jackpotRub));
}
