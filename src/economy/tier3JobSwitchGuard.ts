import type { EconomyUser, JobId } from "./userStore.js";

/** Пауза после перехода **с любой работы на ИП** или **с ИП на другую**. */
export const IP_SWITCH_CD_MS = 7 * 24 * 60 * 60 * 1000;

/** @deprecated alias */
export const OFFICE_IP_SWITCH_CD_MS = IP_SWITCH_CD_MS;

export function isIpSwitchTransition(from: JobId | undefined, to: JobId): boolean {
  if (!from) return false;
  if (from === to) return false;
  return from === "soleProp" || to === "soleProp";
}

export function ipSwitchMsLeft(u: EconomyUser, nowMs: number = Date.now()): number {
  const ready = u.tier3OfficeIpSwitchReadyAt ?? 0;
  if (!Number.isFinite(ready) || ready <= 0) return 0;
  return Math.max(0, ready - nowMs);
}

/** Нельзя устроиться на эту работу, пока не истекла пауза после прошлого перехода с/на ИП. */
export function ipSwitchBlocksTarget(u: EconomyUser, targetJobId: JobId, nowMs: number = Date.now()): boolean {
  if (ipSwitchMsLeft(u, nowMs) <= 0) return false;
  const locked = u.tier3OfficeIpSwitchLockedTo;
  if (!locked) return false;
  return locked === targetJobId;
}

export function ipSwitchOnCooldown(
  u: EconomyUser,
  from: JobId | undefined,
  to: JobId,
  nowMs: number = Date.now(),
): boolean {
  if (isIpSwitchTransition(from, to)) return ipSwitchBlocksTarget(u, to, nowMs);
  if (!from) return ipSwitchBlocksTarget(u, to, nowMs);
  return false;
}

/** После успешного перехода с/на ИП — запустить паузу на прошлую сторону. */
export function ipSwitchCooldownPatch(
  from: JobId | undefined,
  to: JobId,
  nowMs: number = Date.now(),
): Partial<EconomyUser> {
  if (!isIpSwitchTransition(from, to) || !from) return {};
  const lockedJobId: JobId = from === "soleProp" ? "soleProp" : from;
  return {
    tier3OfficeIpSwitchReadyAt: nowMs + IP_SWITCH_CD_MS,
    tier3OfficeIpSwitchLockedTo: lockedJobId,
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
    `Эту работу можно взять через **${cd}**. ` +
    `После каждого перехода **на ИП** или **с ИП** действует пауза **${days} сут** на возврат к прошлой стороне.`
  );
}

/** @deprecated */
export const officeIpSwitchMsLeft = ipSwitchMsLeft;
/** @deprecated */
export const officeIpSwitchOnCooldown = ipSwitchOnCooldown;
/** @deprecated */
export const officeIpSwitchCooldownPatch = ipSwitchCooldownPatch;
/** @deprecated */
export const officeIpSwitchCooldownMessage = ipSwitchCooldownMessage;
