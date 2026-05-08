import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type FocusPreset = "role" | "balance" | "money";

export interface EconomyUser {
  psTotal: number;
  rubles: number;
  focus: FocusPreset;
  /** Ключ дня в формате YYYY-MM-DD для дневных лимитов/коэффициентов */
  voiceDay?: string;
  /** Минуты голоса, уже учтённые сегодня для расчёта PS (diminishing returns) */
  voiceMinutesToday?: number;
}

interface StoreShape {
  guilds: Record<string, Record<string, EconomyUser>>;
}

const storePath = () => {
  const dir = join(process.cwd(), "data");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return join(dir, "economy-users.json");
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

function normalizeUser(u: Partial<EconomyUser> | undefined): EconomyUser {
  return {
    psTotal: Math.max(0, Math.floor(u?.psTotal ?? 0)),
    rubles: Math.max(0, Math.floor(u?.rubles ?? 0)),
    focus: (u?.focus ?? "balance") as FocusPreset,
    voiceDay: typeof u?.voiceDay === "string" ? u.voiceDay : undefined,
    voiceMinutesToday: Number.isFinite(u?.voiceMinutesToday) ? Math.max(0, Math.floor(u!.voiceMinutesToday!)) : undefined,
  };
}

export function getEconomyUser(guildId: string, userId: string): EconomyUser {
  const s = readStore();
  const raw = s.guilds[guildId]?.[userId];
  return normalizeUser(raw);
}

export function setEconomyUser(guildId: string, userId: string, next: EconomyUser): EconomyUser {
  const s = readStore();
  if (!s.guilds[guildId]) s.guilds[guildId] = {};
  const norm = normalizeUser(next);
  s.guilds[guildId]![userId] = norm;
  writeStore(s);
  return norm;
}

export function patchEconomyUser(guildId: string, userId: string, patch: Partial<EconomyUser>): EconomyUser {
  const cur = getEconomyUser(guildId, userId);
  return setEconomyUser(guildId, userId, { ...cur, ...patch });
}

