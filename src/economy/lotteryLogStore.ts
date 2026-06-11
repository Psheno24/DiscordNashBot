import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

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

const storePath = () => {
  const dir = join(process.cwd(), "data");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return join(dir, "economy-lottery-logs.json");
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
