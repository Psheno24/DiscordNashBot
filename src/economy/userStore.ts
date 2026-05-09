import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type FocusPreset = "role" | "balance" | "money";

export type JobId =
  | "courier"
  | "waiter"
  | "watchman"
  | "dispatcher"
  | "assembler"
  | "expediter";

const PERSISTED_JOB_IDS: readonly JobId[] = [
  "courier",
  "waiter",
  "watchman",
  "dispatcher",
  "assembler",
  "expediter",
] as const;
export type SkillId = "communication" | "logistics" | "discipline";

/** Потолок уровня навыка; тир-3 можно строить на комбо в духе 40+/60+/80+ при том же счётчике. */
export const ECONOMY_SKILL_MAX = 99;

export interface EconomyUser {
  psTotal: number;
  rubles: number;
  focus: FocusPreset;
  /** Ключ дня в формате YYYY-MM-DD для дневных лимитов/коэффициентов */
  voiceDay?: string;
  /** Минуты голоса, уже учтённые сегодня для расчёта PS (diminishing returns) */
  voiceMinutesToday?: number;

  jobId?: JobId;
  jobChosenAt?: number;
  /** Последний выход на смену (unix ms) */
  lastWorkAt?: number;

  /** День, когда была оплачена симка курьера (UTC YYYY-MM-DD) */
  courierSimShiftsLeft?: number;
  /** Сколько смен курьера осталось с активным электровелом (снижение КД). */
  courierBikeShiftsLeft?: number;

  /** Навыки: skillId → уровень (1..ECONOMY_SKILL_MAX). Отсутствует = 0. */
  skills?: Partial<Record<SkillId, number>>;
  /** Последняя тренировка навыков (unix ms) */
  lastTrainAt?: number;

  /** Опыт работы: jobId → кол-во смен на этой работе */
  jobExp?: Partial<Record<string, number>>;
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
  const rawSkills = u?.skills ?? {};
  const skills: Partial<Record<SkillId, number>> = {};
  for (const k of ["communication", "logistics", "discipline"] as const) {
    const v = (rawSkills as any)?.[k];
    if (Number.isFinite(v) && v > 0) skills[k] = Math.min(ECONOMY_SKILL_MAX, Math.floor(v));
  }

  const rawJobExp = (u as any)?.jobExp ?? {};
  const jobExp: Partial<Record<string, number>> = {};
  for (const [k, v] of Object.entries(rawJobExp)) {
    if (typeof k !== "string") continue;
    if (!Number.isFinite(v) || (v as number) <= 0) continue;
    jobExp[k] = Math.floor(v as number);
  }

  return {
    psTotal: Math.max(0, Math.floor(u?.psTotal ?? 0)),
    rubles: Math.max(0, Math.floor(u?.rubles ?? 0)),
    focus: (u?.focus ?? "balance") as FocusPreset,
    voiceDay: typeof u?.voiceDay === "string" ? u.voiceDay : undefined,
    voiceMinutesToday: Number.isFinite(u?.voiceMinutesToday) ? Math.max(0, Math.floor(u!.voiceMinutesToday!)) : undefined,
    jobId:
      typeof u?.jobId === "string" && (PERSISTED_JOB_IDS as readonly string[]).includes(u.jobId)
        ? (u.jobId as JobId)
        : undefined,
    jobChosenAt: Number.isFinite(u?.jobChosenAt) ? Math.max(0, Math.floor(u!.jobChosenAt!)) : undefined,
    lastWorkAt: Number.isFinite(u?.lastWorkAt) ? Math.max(0, Math.floor(u!.lastWorkAt!)) : undefined,
    courierSimShiftsLeft: Number.isFinite(u?.courierSimShiftsLeft) ? Math.max(0, Math.floor(u!.courierSimShiftsLeft!)) : undefined,
    courierBikeShiftsLeft: Number.isFinite(u?.courierBikeShiftsLeft) ? Math.max(0, Math.floor(u!.courierBikeShiftsLeft!)) : undefined,
    skills,
    lastTrainAt: Number.isFinite(u?.lastTrainAt) ? Math.max(0, Math.floor(u!.lastTrainAt!)) : undefined,
    jobExp,
  };
}

export function getEconomyUser(guildId: string, userId: string): EconomyUser {
  const s = readStore();
  const raw = s.guilds[guildId]?.[userId];
  return normalizeUser(raw);
}

export function listEconomyUsers(guildId: string): Array<{ userId: string; user: EconomyUser }> {
  const s = readStore();
  const g = s.guilds[guildId] ?? {};
  return Object.entries(g).map(([userId, u]) => ({ userId, user: normalizeUser(u) }));
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

