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

export function formatAccCdHours(accMs: number): string {
  const h = accMs / (60 * 60 * 1000);
  if (Math.abs(h - Math.round(h)) < 0.05) return String(Math.round(h));
  return h.toLocaleString("ru-RU", { maximumFractionDigits: 1 });
}

export function shiftPayCoeffEmbedBlock(): string {
  return (
    "**Коэффициент к выплате за смену** (сумма **КД** завершённых смен за **текущие календарные сутки**): " +
    "пока накоплено **менее 12 ч** — **×1**; затем до **16 ч** — **×0,65**; далее — **×0,35**. " +
    "Считается **фактический КД** каждой смены (вело, авто и т.д.). **Не действует**, если КД этой роли **6 ч и больше**."
  );
}

/** Для карточек ролей с КД ≥ 6 ч. */
export function shiftPayCoeffExemptEmbedLine(): string {
  return "**Лимит по КД за сутки:** для этой роли **не действует** (КД смены **6 ч и больше**).";
}
