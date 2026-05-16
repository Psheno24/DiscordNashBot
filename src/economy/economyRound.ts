/** Округление сумм экономики (₽): цены в магазине, зарплаты, штрафы. */
export function roundEconomyPrice(rub: number): number {
  const n = Math.max(0, Math.floor(rub));
  if (n < 100) return Math.round(n / 100) * 100;
  if (n < 1_000) return Math.round(n / 50) * 50;
  if (n < 10_000) return Math.round(n / 100) * 100;
  if (n < 100_000) return Math.round(n / 500) * 500;
  if (n < 1_000_000) return Math.round(n / 1_000) * 1_000;
  return Math.round(n / 10_000) * 10_000;
}
