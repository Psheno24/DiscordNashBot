import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

interface Entry {
  threadId: string;
  messageId: string;
}

interface StoreShape {
  /** guildId -> userId -> entry */
  guilds: Record<string, Record<string, Entry>>;
}

const storePath = () => {
  const dir = join(process.cwd(), "data");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return join(dir, "voice-ladder-userpanels.json");
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

export function getUserVoicePanel(guildId: string, userId: string): Entry | undefined {
  return readStore().guilds[guildId]?.[userId];
}

export function setUserVoicePanel(guildId: string, userId: string, entry: Entry) {
  const s = readStore();
  if (!s.guilds[guildId]) s.guilds[guildId] = {};
  s.guilds[guildId]![userId] = entry;
  writeStore(s);
}

