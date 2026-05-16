import { getGuildConfig, patchGuildConfig } from "../guildConfig/store.js";
import type { JobId } from "./userStore.js";

let onTreasuryMutated: ((guildId: string) => void) | undefined;

/** Вызывается после изменения `treasuryRubles` (пополнение или списание). */
export function setOnTreasuryMutated(cb: ((guildId: string) => void) | undefined): void {
  onTreasuryMutated = cb;
}

/** Все профессии с «легальным» доходом на личный счёт, кроме нелегала тир-3. */
export function isLegalTaxableJob(jobId: JobId): boolean {
  return jobId !== "shadowFixer";
}

function clampPercent0_100(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.min(100, Math.max(0, Math.round(x * 100) / 100));
}

export function getLegalIncomeTaxPercent(guildId: string): number {
  const v = getGuildConfig(guildId).legalIncomeTaxPercent;
  if (v == null || !Number.isFinite(v)) return 0;
  return clampPercent0_100(v);
}

export function getSolePropWithdrawFeePercent(guildId: string): number {
  const v = getGuildConfig(guildId).solePropWithdrawFeePercent;
  if (v == null || !Number.isFinite(v)) return 0;
  return clampPercent0_100(v);
}

export function getSolePropWeeklyCapitalTaxPercent(guildId: string): number {
  const v = getGuildConfig(guildId).solePropWeeklyCapitalTaxPercent;
  if (v == null || !Number.isFinite(v)) return 0;
  return clampPercent0_100(v);
}

export function addToTreasury(guildId: string, amountRub: number): void {
  const a = Math.floor(amountRub);
  if (a <= 0) return;
  const cur = getGuildConfig(guildId).treasuryRubles ?? 0;
  patchGuildConfig(guildId, { treasuryRubles: Math.round((cur + a) * 100) / 100 });
  onTreasuryMutated?.(guildId);
}

export type SpendTreasuryResult = { ok: true } | { ok: false; balance: number };

/** Списать целые ₽ из казны (для выдачи админом и т.п.). */
export function trySpendTreasuryRub(guildId: string, amountRub: number): SpendTreasuryResult {
  const a = Math.floor(amountRub);
  const curRaw = getGuildConfig(guildId).treasuryRubles ?? 0;
  const cur = Number.isFinite(curRaw) ? curRaw : 0;
  if (a <= 0) return { ok: false, balance: Math.round(cur * 100) / 100 };
  if (cur < a) return { ok: false, balance: Math.round(cur * 100) / 100 };
  patchGuildConfig(guildId, { treasuryRubles: Math.round((cur - a) * 100) / 100 });
  onTreasuryMutated?.(guildId);
  return { ok: true };
}

const DEFAULT_SHOP_VAT_PERCENT = 22;

export function getShopVatPercent(guildId: string): number {
  const v = getGuildConfig(guildId).shopVatPercent;
  if (v == null || !Number.isFinite(v)) return DEFAULT_SHOP_VAT_PERCENT;
  return clampPercent0_100(v);
}

/** @deprecated используйте getShopVatPercent(guildId) */
export const SHOP_VAT_PERCENT = DEFAULT_SHOP_VAT_PERCENT;

export function shopPurchaseVatRub(guildId: string, grossRub: number): number {
  const g = Math.floor(grossRub);
  if (g <= 0) return 0;
  const pct = getShopVatPercent(guildId);
  return Math.min(g, Math.floor((g * pct) / 100));
}

/** Зачисляет НДС в казну; возвращает фактически зачисленный НДС. */
export function remitShopPurchaseVatToTreasury(guildId: string, grossRub: number): number {
  const vat = shopPurchaseVatRub(guildId, grossRub);
  if (vat > 0) addToTreasury(guildId, vat);
  return vat;
}

/**
 * Удержание подоходного налога с суммы, зачисляемой на личный счёт с легальной работы.
 * Налог идёт в казну страны (настройки гильдии).
 */
export function withholdLegalIncomeTax(guildId: string, grossRub: number): { netRub: number; taxRub: number } {
  const g = Math.floor(grossRub);
  if (g <= 0) return { netRub: g, taxRub: 0 };
  const pct = getLegalIncomeTaxPercent(guildId);
  if (pct <= 0) return { netRub: g, taxRub: 0 };
  const taxRub = Math.min(g, Math.floor((g * pct) / 100));
  const netRub = g - taxRub;
  if (taxRub > 0) addToTreasury(guildId, taxRub);
  return { netRub, taxRub };
}

/** Комиссия при выводе с баланса ИП на личный счёт: списывается с выводимой суммы, в казну. */
export function solePropWithdrawWithFee(
  guildId: string,
  withdrawAmountRub: number,
): { toPersonalRub: number; feeToTreasuryRub: number } {
  const w = Math.floor(withdrawAmountRub);
  if (w <= 0) return { toPersonalRub: 0, feeToTreasuryRub: 0 };
  const pct = getSolePropWithdrawFeePercent(guildId);
  if (pct <= 0) return { toPersonalRub: w, feeToTreasuryRub: 0 };
  const fee = Math.min(w, Math.floor((w * pct) / 100));
  return { toPersonalRub: w - fee, feeToTreasuryRub: fee };
}
