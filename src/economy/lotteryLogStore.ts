import { createJsonStore } from "../storage/jsonStore.js";

export type LotteryDrawReason = "scheduled" | "catch-up" | "startup";

export type LotteryDrawWinnerLog = {
  userId: string;
  rub: number;
  labels: string[];
};

export type LotteryDrawLogEntry = {
  ts: number;
  guildId: string;
  periodMskYmd: string;
  reason: LotteryDrawReason;
  ticketsSold: number;
  jackpotBefore: number;
  jackpotAfter: number;
  winners: LotteryDrawWinnerLog[];
};

interface StoreShape {
  guilds: Record<string, LotteryDrawLogEntry[]>;
}

const lotteryLogJson = createJsonStore<StoreShape>({
  fileName: "economy-lottery-logs.json",
  empty: () => ({ guilds: {} }),
});

function readStore(): StoreShape {
  return lotteryLogJson.read();
}

function writeStore(s: StoreShape) {
  lotteryLogJson.write(s);
}

export function listLotteryDrawLogs(guildId: string): LotteryDrawLogEntry[] {
  const s = readStore();
  return s.guilds[guildId] ?? [];
}

export function appendLotteryDrawLog(entry: LotteryDrawLogEntry, max = 40): void {
  const s = readStore();
  if (!s.guilds[entry.guildId]) s.guilds[entry.guildId] = [];
  const arr = s.guilds[entry.guildId]!;
  arr.unshift(entry);
  while (arr.length > max) arr.pop();
  writeStore(s);
}
