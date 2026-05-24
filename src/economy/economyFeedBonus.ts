import { domesticVoicePsMult } from "./economyModifiers.js";

function feedNum(n: number): string {
  return Math.floor(n).toLocaleString("ru-RU");
}

/** Суффикс для ленты: `(+**N** ₽ за престиж, +**M** СР за быт)` — только ненулевые части, в этом порядке. */
export function feedPrestigeDomesticBonusSuffix(bonus: {
  prestigeRub?: number;
  domesticPs?: number;
}): string {
  const parts: string[] = [];
  const pr = bonus.prestigeRub ?? 0;
  const dp = bonus.domesticPs ?? 0;
  if (pr > 0) parts.push(`+**${feedNum(pr)}** ₽ за престиж`);
  if (dp > 0) parts.push(`+**${feedNum(dp)}** СР за быт`);
  if (parts.length === 0) return "";
  return ` (${parts.join(", ")})`;
}

/**
 * Доля престижа в сумме, зачисленной на счёт (после налога),
 * если grossTotal и grossPrestigeBonus посчитаны до налога.
 */
export function feedNetPrestigeRubBonus(
  grossTotal: number,
  grossPrestigeBonus: number,
  netCredited: number,
): number {
  if (grossPrestigeBonus <= 0 || grossTotal <= 0 || netCredited <= 0) return 0;
  return Math.min(netCredited, Math.max(0, Math.floor((netCredited * grossPrestigeBonus) / grossTotal)));
}

/** Доп. СР с голоса только от быта (без быта множитель = 1). */
export function voiceDomesticPsBonus(psRaw: number, domesticPoints: number): number {
  const d = Math.max(0, domesticPoints);
  if (d <= 0) return 0;
  const psBase = Math.floor(psRaw);
  const psWithDomestic = Math.floor(psRaw * domesticVoicePsMult(d));
  return Math.max(0, psWithDomestic - psBase);
}
