import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type BetStatus = "open" | "resolved" | "cancelled";

export interface BetOption {
  id: string;
  label: string;
  /** Коэффициент (например 1.8). Выплата = ставка * odds (включая тело). */
  odds: number;
}

export interface PlacedBet {
  optionId: string;
  amount: number;
  ts: number;
}

export interface BetEvent {
  id: string;
  guildId: string;
  title: string;
  options: BetOption[];
  createdByUserId: string;
  createdAt: number;
  closesAt: number;
  status: BetStatus;
  winningOptionId?: string;
  /** channelId/messageId где опубликовано */
  channelId?: string;
  messageId?: string;
  bets: Record<string, PlacedBet>;
}

interface StoreShape {
  guilds: Record<string, Record<string, BetEvent>>;
}

const storePath = () => {
  const dir = join(process.cwd(), "data");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return join(dir, "bets.json");
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

export function getBetEvent(guildId: string, eventId: string): BetEvent | undefined {
  const s = readStore();
  return s.guilds[guildId]?.[eventId];
}

export function listBetEvents(guildId: string): BetEvent[] {
  const s = readStore();
  return Object.values(s.guilds[guildId] ?? {});
}

export function upsertBetEvent(ev: BetEvent): BetEvent {
  const s = readStore();
  if (!s.guilds[ev.guildId]) s.guilds[ev.guildId] = {};
  s.guilds[ev.guildId]![ev.id] = ev;
  writeStore(s);
  return ev;
}

