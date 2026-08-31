import { mskTodayYmd } from "./mskCalendar.js";
import { lastWorkAtForJob, type EconomyUser } from "./userStore.js";

/** Была ли смена офиса в указанный календарный день (МСК). */
export function hadOfficeShiftOnMskDay(u: EconomyUser, ymd: string = mskTodayYmd()): boolean {
  const last = lastWorkAtForJob(u, "officeAnalyst");
  if (!last) return false;
  return mskTodayYmd(last) === ymd;
}

/** Получен ли сегодня (МСK) суточный оклад ИП. */
export function receivedSolePropPassiveOnMskDay(u: EconomyUser, ymd: string = mskTodayYmd()): boolean {
  return u.solePropPassivePaidMskYmd === ymd;
}

export type Tier3CrossJobBlock =
  | { kind: "office_shift_blocks_ip" }
  | { kind: "ip_passive_blocks_office" };

export function tier3CrossJobSwitchBlock(
  u: EconomyUser,
  targetJobId: "officeAnalyst" | "soleProp",
  nowMs: number = Date.now(),
): Tier3CrossJobBlock | null {
  const today = mskTodayYmd(nowMs);
  if (targetJobId === "soleProp" && hadOfficeShiftOnMskDay(u, today)) {
    return { kind: "office_shift_blocks_ip" };
  }
  if (targetJobId === "officeAnalyst" && receivedSolePropPassiveOnMskDay(u, today)) {
    return { kind: "ip_passive_blocks_office" };
  }
  return null;
}

export function tier3CrossJobSwitchBlockMessage(block: Tier3CrossJobBlock): string {
  if (block.kind === "office_shift_blocks_ip") {
    return (
      "Сегодня уже была **смена в офисе** — устроиться на **ИП** можно **завтра** (смена и суточный оклад ИП в один день не суммируются)."
    );
  }
  return (
    "Сегодня уже начислен **суточный оклад ИП** — устроиться в **офис** можно **завтра** (оклад ИП и смены офиса в один день не суммируются)."
  );
}
