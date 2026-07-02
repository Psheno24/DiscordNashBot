/** Суточный «бюджет» КД без понижения выплаты (сумма КД завершённых смен за календарные сутки). */
export const SHIFT_PAY_FREE_CD_MS = 12 * 60 * 60 * 1000;
/** Дополнительный КД с понижением ×0,65 (после free — ещё 4 ч). */
export const SHIFT_PAY_MID_CD_MS = 16 * 60 * 60 * 1000;
/** Роли с КД смены **6 ч и больше** — лимит не действует. */
export const SHIFT_PAY_MIN_APPLY_CD_MS = 6 * 60 * 60 * 1000;

export function shiftPayCoeffApplies(shiftCooldownMs: number): boolean {
  return shiftCooldownMs > 0 && shiftCooldownMs < SHIFT_PAY_MIN_APPLY_CD_MS;
}

/** Множитель к выплате по накопленному КД **до** текущей смены. */
export function shiftPayCoeffFromAccMs(accCdMsBeforeShift: number): number {
  if (accCdMsBeforeShift < SHIFT_PAY_FREE_CD_MS) return 1;
  if (accCdMsBeforeShift < SHIFT_PAY_MID_CD_MS) return 0.65;
  return 0.35;
}

/** Применить суточный коэффициент к gross выплаты за смену (до налога и штрафа за номер). */
export function applyShiftPayCoeffToGrossRub(
  grossRub: number,
  accCdMsBeforeShift: number,
): { grossRub: number; coeff: number } {
  const g = Math.floor(grossRub);
  if (g <= 0) return { grossRub: g, coeff: 1 };
  const coeff = shiftPayCoeffFromAccMs(accCdMsBeforeShift);
  if (coeff >= 1 - 1e-9) return { grossRub: g, coeff: 1 };
  return { grossRub: Math.floor(g * coeff), coeff };
}

export function formatAccCdHours(accMs: number): string {
  const h = accMs / (60 * 60 * 1000);
  if (Math.abs(h - Math.round(h)) < 0.05) return String(Math.round(h));
  return h.toLocaleString("ru-RU", { maximumFractionDigits: 1 });
}

export function shiftPayCoeffEmbedBlock(): string {
  return "Лимит КД за сутки: после **12 ч** суммарного КД выплата **×0,65**, после **16 ч** — **×0,35** (роли с КД < 6 ч).";
}

/** Для карточек ролей с КД ≥ 6 ч. */
export function shiftPayCoeffExemptEmbedLine(): string {
  return "Лимит КД за сутки: **не действует** (КД ≥ 6 ч).";
}
