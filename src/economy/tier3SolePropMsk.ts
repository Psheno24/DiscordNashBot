import { mskPreviousDayYmd } from "./mskCalendar.js";
import type { EconomyUser } from "./userStore.js";

/** Полночь МСК: просадка без «Контроля», восстановление при серии контролей, сброс временного буста оклада. */
export function solePropMidnightPatch(u: EconomyUser, todayYmd: string, nowMs: number): Partial<EconomyUser> {
  const patch: Partial<EconomyUser> = {};
  const yesterday = mskPreviousDayYmd(todayYmd);
  let eff = clampEff(u.solePropPassiveEffMult ?? 1);
  let missed = u.solePropMissedControlStreak ?? 0;
  let consec = u.solePropControlConsecDays ?? 0;

  let tempM = u.solePropPassiveTempMult ?? 1;
  let tempUntil = u.solePropPassiveTempUntilMs;
  if (tempUntil != null && nowMs >= tempUntil) {
    tempM = 1;
    tempUntil = undefined;
  }

  const controlledYesterday = u.solePropControlMskYmd === yesterday;

  if (controlledYesterday) {
    missed = 0;
    const nextConsec = consec + 1;
    if (nextConsec >= 3 && eff < 1 - 1e-9) {
      if (Math.random() < 0.42) {
        eff = Math.min(1, round1(eff + 0.1));
      }
      consec = 0;
    } else {
      consec = nextConsec;
    }
  } else {
    missed = missed + 1;
    consec = 0;
    const p = Math.min(0.78, 0.035 * Math.pow(1.38, missed));
    if (Math.random() < p) {
      eff = Math.max(0.3, round1(eff - 0.1));
    }
  }

  patch.solePropMissedControlStreak = missed;
  patch.solePropControlConsecDays = consec;
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
