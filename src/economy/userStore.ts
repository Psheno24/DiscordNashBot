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

  /** Куплен телефон в магазине (нужен курьеру). */
  hasPhone?: boolean;
  /** 5-значный номер симки (после покупки новой — старый уходит в пул магазина). */
  courierSimNumber?: string;
  /** «Баланс» симки (пополнение в магазине); часть уходит на связь за смену. */
  simBalanceRub?: number;
  /** До какого момента оплачена линия после последней оплаты при старте смены курьера (+24 ч). */
  courierPhonePaidUntilMs?: number;
  /** До какого момента активна аренда электровела (снижение КД смены). */
  courierBikeUntilMs?: number;

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

function stableLegacySimDigits(userId: string): string {
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h << 5) - h + userId.charCodeAt(i);
  const n = 10000 + (Math.abs(h | 0) % 90000);
  return String(n);
}

function normalizeUser(u: Partial<EconomyUser> | undefined, userIdForMigration?: string): EconomyUser {
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

  const legacySimShifts = Number.isFinite((u as any)?.courierSimShiftsLeft) ? Math.max(0, Math.floor((u as any).courierSimShiftsLeft)) : 0;
  const legacyBikeShifts = Number.isFinite((u as any)?.courierBikeShiftsLeft) ? Math.max(0, Math.floor((u as any).courierBikeShiftsLeft)) : 0;

  let hasPhone = (u as any)?.hasPhone === true ? true : undefined;
  let courierSimNumber =
    typeof (u as any)?.courierSimNumber === "string" && /^\d{5}$/.test((u as any).courierSimNumber)
      ? (u as any).courierSimNumber
      : undefined;
  let simBalanceRub = Number.isFinite((u as any)?.simBalanceRub) ? Math.max(0, Math.floor((u as any).simBalanceRub)) : undefined;
  let courierPhonePaidUntilMs = Number.isFinite((u as any)?.courierPhonePaidUntilMs)
    ? Math.max(0, Math.floor((u as any).courierPhonePaidUntilMs))
    : undefined;
  let courierBikeUntilMs = Number.isFinite((u as any)?.courierBikeUntilMs)
    ? Math.max(0, Math.floor((u as any).courierBikeUntilMs))
    : undefined;

  // Одноразовая логика поверх старых полей «смен сим/вела» (без записи в JSON до следующего patch).
  if (!hasPhone && (legacySimShifts > 0 || legacyBikeShifts > 0)) hasPhone = true;
  if (!courierSimNumber && legacySimShifts > 0) {
    courierSimNumber = stableLegacySimDigits(userIdForMigration ?? "legacy");
  }
  if (simBalanceRub == null && legacySimShifts > 0) simBalanceRub = Math.min(120, legacySimShifts * 12);
  if (!courierPhonePaidUntilMs && legacySimShifts > 0) courierPhonePaidUntilMs = Date.now() + 24 * 60 * 60 * 1000;
  if (!courierBikeUntilMs && legacyBikeShifts > 0) courierBikeUntilMs = Date.now() + legacyBikeShifts * 3 * 60 * 60 * 1000;

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
    hasPhone,
    courierSimNumber,
    simBalanceRub,
    courierPhonePaidUntilMs,
    courierBikeUntilMs,
    skills,
    lastTrainAt: Number.isFinite(u?.lastTrainAt) ? Math.max(0, Math.floor(u!.lastTrainAt!)) : undefined,
    jobExp,
  };
}

export function getEconomyUser(guildId: string, userId: string): EconomyUser {
  const s = readStore();
  const raw = s.guilds[guildId]?.[userId];
  return normalizeUser(raw, userId);
}

export function listEconomyUsers(guildId: string): Array<{ userId: string; user: EconomyUser }> {
  const s = readStore();
  const g = s.guilds[guildId] ?? {};
  return Object.entries(g).map(([userId, u]) => ({ userId, user: normalizeUser(u, userId) }));
}

export function setEconomyUser(guildId: string, userId: string, next: EconomyUser): EconomyUser {
  const s = readStore();
  if (!s.guilds[guildId]) s.guilds[guildId] = {};
  const norm = normalizeUser(next, userId);
  s.guilds[guildId]![userId] = norm;
  writeStore(s);
  return norm;
}

export function patchEconomyUser(guildId: string, userId: string, patch: Partial<EconomyUser>): EconomyUser {
  const cur = getEconomyUser(guildId, userId);
  return setEconomyUser(guildId, userId, { ...cur, ...patch });
}

