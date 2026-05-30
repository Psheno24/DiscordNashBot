import type { EconomyUser } from "./userStore.js";

/** Код оператора (**900–999**). */
export const SIM_OPERATOR_MIN = 900;
export const SIM_OPERATOR_MAX = 999;

export const SHOP_SIM_REGISTER_BASE_RUB = 100;
export const SHOP_SIM_CHANGE_OPERATOR_BASE_RUB = 5_000;
export const SHOP_SIM_CHANGE_MID_BASE_RUB = 3_000;
export const SHOP_SIM_CHANGE_LAST_BASE_RUB = 2_000;
export const SHOP_SIM_START_BALANCE_RUB = 50;

export interface SimNumberParts {
  operator: string;
  mid: string;
  last: string;
}

const MAX_UNIQUE_SIM_ATTEMPTS = 200;

function randInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

export function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

export function rollRandomSimOperator(): string {
  return String(randInt(SIM_OPERATOR_MIN, SIM_OPERATOR_MAX));
}

export function rollRandomSimMid(): string {
  return String(randInt(0, 999)).padStart(3, "0");
}

export function rollRandomSimLast(): string {
  return String(randInt(0, 9999)).padStart(4, "0");
}

export function rollRandomSimNumberParts(): SimNumberParts {
  return {
    operator: rollRandomSimOperator(),
    mid: rollRandomSimMid(),
    last: rollRandomSimLast(),
  };
}

export function isValidSimNumberParts(p: SimNumberParts): boolean {
  const op = Number(p.operator);
  if (!/^\d{3}$/.test(p.operator) || op < SIM_OPERATOR_MIN || op > SIM_OPERATOR_MAX) return false;
  if (!/^\d{3}$/.test(p.mid)) return false;
  if (!/^\d{4}$/.test(p.last)) return false;
  return true;
}

/** Канонический ключ для сравнения полного совпадения номера. */
export function simNumberKey(parts: SimNumberParts): string {
  return `${parts.operator}|${parts.mid}|${parts.last}`;
}

/** Отображение: **+7 9XX-XXX-XX-XX**. */
export function formatSimNumber(parts: SimNumberParts): string {
  const a = parts.last.slice(0, 2);
  const b = parts.last.slice(2, 4);
  return `+7 ${parts.operator}-${parts.mid}-${a}-${b}`;
}

/** Все 10 цифр после **+7** (код + абонентская часть). */
export function simFullDigits(parts: SimNumberParts): string {
  return `${parts.operator}${parts.mid}${parts.last}`;
}

export function simNumberPartsToPatch(
  parts: SimNumberParts,
): Pick<EconomyUser, "courierSimOperator" | "courierSimMid" | "courierSimLast"> {
  return {
    courierSimOperator: parts.operator,
    courierSimMid: parts.mid,
    courierSimLast: parts.last,
  };
}

/**
 * Старый 5-значный номер → **+7 9XX-XXd-DD-DD** (напр. **12345** → **+7 947-671-23-45**):
 * случайный код **9XX**, середина **??** + первая цифра старого номера, конец — оставшиеся **4** цифры.
 */
export function migrateLegacySim5ToParts(legacy5: string, stableSeed?: string): SimNumberParts {
  let h = 0;
  const seed = stableSeed ?? legacy5;
  for (let i = 0; i < seed.length; i++) h = (h << 5) - h + seed.charCodeAt(i);
  const abs = Math.abs(h | 0);
  const operator = String(SIM_OPERATOR_MIN + ((abs >>> 8) % (SIM_OPERATOR_MAX - SIM_OPERATOR_MIN + 1)));
  const rand2 = String(abs % 100).padStart(2, "0");
  return {
    operator,
    mid: rand2 + legacy5[0],
    last: legacy5.slice(1, 5),
  };
}

function isLegacySim5(digits: string | undefined): boolean {
  return typeof digits === "string" && /^\d{5}$/.test(digits) && digits !== "00000";
}

export function parseSimNumberParts(u: EconomyUser, opts?: { migrateSeed?: string }): SimNumberParts | undefined {
  const op = u.courierSimOperator;
  const mid = u.courierSimMid;
  const last = u.courierSimLast;
  if (op && mid && last) {
    const parts = { operator: op, mid, last };
    if (isValidSimNumberParts(parts)) return parts;
  }
  if (isLegacySim5(u.courierSimNumber)) {
    const seed = opts?.migrateSeed ?? u.courierSimNumber!;
    return migrateLegacySim5ToParts(u.courierSimNumber!, seed);
  }
  return undefined;
}

export function userHasSimNumber(u: EconomyUser): boolean {
  return parseSimNumberParts(u) !== undefined;
}

export function formatSimNumberFromUser(u: EconomyUser): string | undefined {
  const p = parseSimNumberParts(u);
  return p ? formatSimNumber(p) : undefined;
}

export function rollUniqueSimOperator(
  takenKeys: ReadonlySet<string>,
  fixed: Pick<SimNumberParts, "mid" | "last">,
): string {
  for (let i = 0; i < MAX_UNIQUE_SIM_ATTEMPTS; i++) {
    const operator = rollRandomSimOperator();
    if (!takenKeys.has(simNumberKey({ operator, ...fixed }))) return operator;
  }
  for (let v = SIM_OPERATOR_MIN; v <= SIM_OPERATOR_MAX; v++) {
    const operator = String(v);
    if (!takenKeys.has(simNumberKey({ operator, ...fixed }))) return operator;
  }
  return rollRandomSimOperator();
}

export function rollUniqueSimMid(takenKeys: ReadonlySet<string>, fixed: Pick<SimNumberParts, "operator" | "last">): string {
  for (let i = 0; i < MAX_UNIQUE_SIM_ATTEMPTS; i++) {
    const mid = rollRandomSimMid();
    if (!takenKeys.has(simNumberKey({ ...fixed, mid }))) return mid;
  }
  for (let v = 0; v <= 999; v++) {
    const mid = String(v).padStart(3, "0");
    if (!takenKeys.has(simNumberKey({ ...fixed, mid }))) return mid;
  }
  return rollRandomSimMid();
}

export function rollUniqueSimLast(
  takenKeys: ReadonlySet<string>,
  fixed: Pick<SimNumberParts, "operator" | "mid">,
): string {
  for (let i = 0; i < MAX_UNIQUE_SIM_ATTEMPTS; i++) {
    const last = rollRandomSimLast();
    if (!takenKeys.has(simNumberKey({ ...fixed, last }))) return last;
  }
  for (let v = 0; v <= 9999; v++) {
    const last = String(v).padStart(4, "0");
    if (!takenKeys.has(simNumberKey({ ...fixed, last }))) return last;
  }
  return rollRandomSimLast();
}

export function rollUniqueSimNumberParts(takenKeys: ReadonlySet<string>): SimNumberParts {
  for (let i = 0; i < MAX_UNIQUE_SIM_ATTEMPTS; i++) {
    const parts = rollRandomSimNumberParts();
    if (!takenKeys.has(simNumberKey(parts))) return parts;
  }
  return rollRandomSimNumberParts();
}
