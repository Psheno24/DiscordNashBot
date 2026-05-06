import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface GuildConfig {
  welcomeChannelId?: string;
  neuroControlChannelId?: string;
  voiceLadderChannelId?: string;
}

interface StoreShape {
  guilds: Record<string, GuildConfig>;
}

const storePath = () => {
  const dir = join(process.cwd(), "data");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return join(dir, "guild-config.json");
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

export function getGuildConfig(guildId: string): GuildConfig {
  return readStore().guilds[guildId] ?? {};
}

export function setGuildConfig(guildId: string, next: GuildConfig) {
  const s = readStore();
  s.guilds[guildId] = next;
  writeStore(s);
}

export function patchGuildConfig(guildId: string, patch: Partial<GuildConfig>): GuildConfig {
  const cur = getGuildConfig(guildId);
  const next: GuildConfig = { ...cur, ...patch };
  setGuildConfig(guildId, next);
  return next;
}

