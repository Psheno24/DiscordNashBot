import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

interface StoreShape {
  guilds: Record<string, Record<string, number>>;
}

const filePath = () => {
  const dir = join(process.cwd(), "data");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return join(dir, "voice-time.json");
};

function readStore(): StoreShape {
  const p = filePath();
  if (!existsSync(p)) return { guilds: {} };
  try {
    return JSON.parse(readFileSync(p, "utf-8")) as StoreShape;
  } catch {
    return { guilds: {} };
  }
}

export function addVoiceSeconds(guildId: string, userId: string, deltaSeconds: number): number {
  if (deltaSeconds <= 0) return getVoiceSeconds(guildId, userId);
  const s = readStore();
  if (!s.guilds[guildId]) s.guilds[guildId] = {};
  const prev = s.guilds[guildId][userId] ?? 0;
  const next = prev + deltaSeconds;
  s.guilds[guildId][userId] = next;
  writeFileSync(filePath(), JSON.stringify(s, null, 2), "utf-8");
  return next;
}

export function getVoiceSeconds(guildId: string, userId: string): number {
  const s = readStore();
  return s.guilds[guildId]?.[userId] ?? 0;
}
