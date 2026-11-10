import { createJsonStore } from "../storage/jsonStore.js";

export type FeedEventType =
  | "voice:earn"
  | "bet:created"
  | "bet:placed"
  | "bet:updated"
  | "bet:resolved"
  | "job:shift"
  | "job:promotion"
  | "job:passive"
  | "skill:tier"
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

const feedStore = createJsonStore<StoreShape>({
  fileName: "economy-feed.json",
  empty: () => ({ guilds: {} }),
});

export function listFeedEvents(guildId: string): FeedEvent[] {
  return feedStore.read().guilds[guildId] ?? [];
}

export function appendFeedEvent(ev: FeedEvent, max = 50): FeedEvent[] {
  const s = feedStore.read();
  if (!s.guilds[ev.guildId]) s.guilds[ev.guildId] = [];
  const arr = s.guilds[ev.guildId]!;
  arr.push(ev);
  while (arr.length > max) arr.shift();
  feedStore.write(s);
  return arr;
}
