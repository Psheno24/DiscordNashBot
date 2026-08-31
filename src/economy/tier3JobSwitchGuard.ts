import type { EconomyUser, JobId } from "./userStore.js";

/** Пауза на повторное оформление ИП после ухода с soleProp. */
export const IP_SWITCH_CD_MS = 7 * 24 * 60 * 60 * 1000;

/** @deprecated alias */
export const OFFICE_IP_SWITCH_CD_MS = IP_SWITCH_CD_MS;

export function isIpLeaveTransition(from: JobId | undefined, to: JobId): boolean {
  return from === "soleProp" && to !== "soleProp";
}

export function ipSwitchMsLeft(u: EconomyUser, nowMs: number = Date.now()): number {
  const ready = u.tier3OfficeIpSwitchReadyAt ?? 0;
  if (!Number.isFinite(ready) || ready <= 0) return 0;
  return Math.max(0, ready - nowMs);
}

/** Нельзя снова оформить ИП, пока не истекла пауза после ухода с soleProp. */
export function ipSwitchBlocksTarget(u: EconomyUser, targetJobId: JobId, nowMs: number = Date.now()): boolean {
  if (targetJobId !== "soleProp") return false;
  return ipSwitchMsLeft(u, nowMs) > 0;
}

export function ipSwitchOnCooldown(
  u: EconomyUser,
  _from: JobId | undefined,
  to: JobId,
  nowMs: number = Date.now(),
): boolean {
  return ipSwitchBlocksTarget(u, to, nowMs);
}

/** После ухода с ИП — запустить паузу только на повторное оформление soleProp. */
export function ipSwitchCooldownPatch(
  from: JobId | undefined,
  to: JobId,
  nowMs: number = Date.now(),
): Partial<EconomyUser> {
  if (!isIpLeaveTransition(from, to)) return {};
  return {
    tier3OfficeIpSwitchReadyAt: nowMs + IP_SWITCH_CD_MS,
    tier3OfficeIpSwitchLockedTo: "soleProp",
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

export function ipSwitchCooldownMessage(msLeft: number): string {
  const cd = formatCooldownMs(msLeft);
  const days = IP_SWITCH_CD_MS / (24 * 60 * 60 * 1000);
  return (
    `Оформить **ИП** снова можно через **${cd}**. ` +
    `После ухода с ИП действует пауза **${days} сут** — при переходе **на** ИП уходить можно сразу.`
  );
}
