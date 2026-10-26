import { mskPreviousDayYmd } from "./mskCalendar.js";
import type { EconomyUser } from "./userStore.js";

/** Дней контроля подряд до первой попытки восстановления. */
export const SOLE_PROP_CONTROL_RECOVER_UNLOCK_DAYS = 3;
/** Базовый шанс +0.1 к эффективности после разблокировки. */
export const SOLE_PROP_CONTROL_RECOVER_BASE = 0.3;
/** +к шансу за каждую неудачную попытку подряд (пока стрик контроля жив). */
export const SOLE_PROP_CONTROL_RECOVER_STEP = 0.1;

/** Шанс восстановления эффективности контролем (0.3 + 0.1×неудач, потолок 1). */
export function solePropControlRecoverChance(failStreak: number): number {
  const fails = Math.max(0, Math.floor(failStreak));
  return Math.min(1, SOLE_PROP_CONTROL_RECOVER_BASE + SOLE_PROP_CONTROL_RECOVER_STEP * fails);
}

/** Суточный тик ИП: просадка без «Контроля», восстановление при серии контролей, сброс временного буста оклада. */
export function solePropMidnightPatch(u: EconomyUser, todayYmd: string, nowMs: number): Partial<EconomyUser> {
  const patch: Partial<EconomyUser> = {};
  const yesterday = mskPreviousDayYmd(todayYmd);
  let eff = clampEff(u.solePropPassiveEffMult ?? 1);
  let missed = u.solePropMissedControlStreak ?? 0;
  let consec = u.solePropControlConsecDays ?? 0;
  let recoverFails = u.solePropControlRecoverFails ?? 0;

  let tempM = u.solePropPassiveTempMult ?? 1;
  let tempUntil = u.solePropPassiveTempUntilMs;
  if (tempUntil != null && nowMs >= tempUntil) {
    tempM = 1;
    tempUntil = undefined;
  }

  const controlledYesterday = u.solePropControlMskYmd === yesterday;

  if (controlledYesterday) {
    missed = 0;
    consec = consec + 1;
    if (consec >= SOLE_PROP_CONTROL_RECOVER_UNLOCK_DAYS && eff < 1 - 1e-9) {
      const chance = solePropControlRecoverChance(recoverFails);
      if (Math.random() < chance) {
        eff = Math.min(1, round1(eff + 0.1));
        recoverFails = 0;
      } else {
        recoverFails = recoverFails + 1;
      }
    } else if (eff >= 1 - 1e-9) {
      recoverFails = 0;
    }
  } else {
    missed = missed + 1;
    consec = 0;
    recoverFails = 0;
    const p = Math.min(0.78, 0.035 * Math.pow(1.38, missed));
    if (Math.random() < p) {
      eff = Math.max(0.3, round1(eff - 0.1));
    }
  }

  patch.solePropMissedControlStreak = missed;
  patch.solePropControlConsecDays = consec;
  patch.solePropControlRecoverFails = recoverFails;
  patch.solePropPassiveEffMult = eff;
  patch.solePropPassiveTempMult = tempM;
  patch.solePropPassiveTempUntilMs = tempUntil;
  return patch;
}

function clampEff(v: number): number {
  return Math.min(1, Math.max(0.3, round1(v)));
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}
