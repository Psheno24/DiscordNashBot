import { createJsonStore } from "../storage/jsonStore.js";

interface StoreShape {
  guilds: Record<string, Record<string, number>>;
}

const voiceTimeJson = createJsonStore<StoreShape>({
  fileName: "voice-time.json",
  empty: () => ({ guilds: {} }),
});

export function addVoiceSeconds(guildId: string, userId: string, deltaSeconds: number): number {
  if (deltaSeconds <= 0) return getVoiceSeconds(guildId, userId);
  const s = voiceTimeJson.read();
  if (!s.guilds[guildId]) s.guilds[guildId] = {};
  const prev = s.guilds[guildId]![userId] ?? 0;
  const next = prev + deltaSeconds;
  s.guilds[guildId]![userId] = next;
  voiceTimeJson.write(s);
  return next;
}

export function getVoiceSeconds(guildId: string, userId: string): number {
  return voiceTimeJson.read().guilds[guildId]?.[userId] ?? 0;
}
