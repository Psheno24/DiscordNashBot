import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type FeedEventType =
  | "voice:earn"
  | "bet:created"
  | "bet:placed"
  | "bet:updated"
  | "bet:resolved"
  | "job:shift"
  | "job:passive"
  | "admin:budget";

export interface FeedEvent {
  ts: number;
  guildId: string;
  type: FeedEventType;
  actorUserId?: string;
  text: string;
}

interface StoreShape {
  /** guildId → events (oldest..newest) */
  guilds: Record<string, FeedEvent[]>;
}

const storePath = () => {
  const dir = join(process.cwd(), "data");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return join(dir, "economy-feed.json");
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

export function listFeedEvents(guildId: string): FeedEvent[] {
  const s = readStore();
  return s.guilds[guildId] ?? [];
}

export function appendFeedEvent(ev: FeedEvent, max = 50): FeedEvent[] {
  const s = readStore();
  if (!s.guilds[ev.guildId]) s.guilds[ev.guildId] = [];
  const arr = s.guilds[ev.guildId]!;
  arr.push(ev);
  while (arr.length > max) arr.shift();
  writeStore(s);
  return arr;
}

