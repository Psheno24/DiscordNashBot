import type { EconomyUser, JobId } from "./userStore.js";

/** Пауза между переходами **офис ↔ ИП** (в любую сторону). */
export const OFFICE_IP_SWITCH_CD_MS = 7 * 24 * 60 * 60 * 1000;

export type OfficeIpSwitchTarget = "officeAnalyst" | "soleProp";

export function isOfficeIpSwitch(from: JobId | undefined, to: JobId): boolean {
  if (!from) return false;
  return (from === "officeAnalyst" && to === "soleProp") || (from === "soleProp" && to === "officeAnalyst");
}

export function isOfficeIpJob(id: JobId): id is OfficeIpSwitchTarget {
  return id === "officeAnalyst" || id === "soleProp";
}

export function officeIpSwitchMsLeft(u: EconomyUser, nowMs: number = Date.now()): number {
  const ready = u.tier3OfficeIpSwitchReadyAt ?? 0;
  if (!Number.isFinite(ready) || ready <= 0) return 0;
  return Math.max(0, ready - nowMs);
}

/** Нельзя устроиться на эту работу, пока не истекла пауза после прошлого перехода. */
export function officeIpSwitchBlocksTarget(u: EconomyUser, targetJobId: JobId, nowMs: number = Date.now()): boolean {
  if (!isOfficeIpJob(targetJobId)) return false;
  if (officeIpSwitchMsLeft(u, nowMs) <= 0) return false;
  const locked = u.tier3OfficeIpSwitchLockedTo;
  if (locked !== "officeAnalyst" && locked !== "soleProp") return true;
  return locked === targetJobId;
}

export function officeIpSwitchOnCooldown(
  u: EconomyUser,
  from: JobId | undefined,
  to: JobId,
  nowMs: number = Date.now(),
): boolean {
  if (isOfficeIpSwitch(from, to)) return officeIpSwitchBlocksTarget(u, to, nowMs);
  if (!from && isOfficeIpJob(to)) return officeIpSwitchBlocksTarget(u, to, nowMs);
  return false;
}

/** После успешного перехода офис ↔ ИП — запустить паузу на обратную сторону. */
export function officeIpSwitchCooldownPatch(
  from: JobId | undefined,
  to: JobId,
  nowMs: number = Date.now(),
): Partial<EconomyUser> {
  if (!isOfficeIpSwitch(from, to)) return {};
  const lockedTo: OfficeIpSwitchTarget = from === "officeAnalyst" ? "officeAnalyst" : "soleProp";
  return {
    tier3OfficeIpSwitchReadyAt: nowMs + OFFICE_IP_SWITCH_CD_MS,
    tier3OfficeIpSwitchLockedTo: lockedTo,
  };
}

function formatCooldownMs(msLeft: number): string {
  const ms = Math.max(0, msLeft);
  const d = Math.floor(ms / (24 * 60 * 60 * 1000));
  const h = Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  const m = Math.ceil((ms % (60 * 60 * 1000)) / (60 * 1000));
  if (d > 0) return `${d} сут ${h} ч`;
  if (h > 0) return `${h} ч ${m} м`;
  return `${m} м`;
}

export function officeIpSwitchCooldownMessage(msLeft: number): string {
  const cd = formatCooldownMs(msLeft);
  const days = OFFICE_IP_SWITCH_CD_MS / (24 * 60 * 60 * 1000);
  return (
    `Переход между **офисом** и **ИП** будет доступен через **${cd}**. ` +
    `После каждой смены стороны действует пауза **${days} сут**.`
  );
}
