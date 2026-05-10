import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type BetStatus = "open" | "closed" | "resolved" | "cancelled";

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
  /** Коэффициент на момент приёма ставки (не меняется при редактировании линии). */
  oddsAtPlacement: number;
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
  /** После решения события — удалить сообщение в ленте после этого времени (unix ms). */
  resolvedDeleteFeedMessageAtMs?: number;
  /** userId → список ставок (можно несколько на событие). */
  bets: Record<string, PlacedBet[]>;
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

/** Миграция: один объект → массив; дополняем oddsAtPlacement из текущих опций. */
export function normalizeBetEvent(ev: BetEvent): BetEvent {
  const bets: Record<string, PlacedBet[]> = {};
  const raw = ev.bets as unknown as Record<string, PlacedBet | PlacedBet[] | undefined>;
  for (const uid of Object.keys(raw ?? {})) {
    const v = raw[uid];
    const arr = Array.isArray(v) ? v : v ? [v] : [];
    bets[uid] = arr.map((b) => ({
      optionId: b.optionId,
      amount: Math.max(0, Math.floor(b.amount)),
      ts: b.ts,
      oddsAtPlacement:
        typeof (b as PlacedBet).oddsAtPlacement === "number" && Number.isFinite((b as PlacedBet).oddsAtPlacement)
          ? (b as PlacedBet).oddsAtPlacement
          : ev.options.find((o) => o.id === b.optionId)?.odds ?? 1,
    }));
  }
  return { ...ev, bets };
}

export function getBetEvent(guildId: string, eventId: string): BetEvent | undefined {
  const s = readStore();
  const ev = s.guilds[guildId]?.[eventId];
  return ev ? normalizeBetEvent(ev as BetEvent) : undefined;
}

export function listBetEvents(guildId: string): BetEvent[] {
  const s = readStore();
  return Object.values(s.guilds[guildId] ?? {}).map((e) => normalizeBetEvent(e as BetEvent));
}

export function upsertBetEvent(ev: BetEvent): BetEvent {
  const s = readStore();
  if (!s.guilds[ev.guildId]) s.guilds[ev.guildId] = {};
  s.guilds[ev.guildId]![ev.id] = ev;
  writeStore(s);
  return ev;
}
