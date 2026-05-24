import { roundEconomyPrice } from "./economyRound.js";

export type CatalogOrigin = "soviet" | "foreign";

/** Базовая цена ₽, дающая 1 единицу быта/престижа (после округления как у цен). */
export const STAT_POINTS_RUB_PER_POINT = 500;

/**
 * Очки быта/престижа от цены покупки (базовая цена из каталога).
 * Сначала округление цены как в магазине, затем 1 очко = STAT_POINTS_RUB_PER_POINT ₽.
 */
export function statPointsFromPriceRub(priceRub: number): number {
  const n = Math.max(0, priceRub);
  if (n <= 0) return 0;
  const priced = roundEconomyPrice(n);
  return Math.floor(priced / STAT_POINTS_RUB_PER_POINT);
}

export function catalogItemStatDeltas(
  priceRub: number,
  origin: CatalogOrigin,
): { prestigeDelta: number; domesticDelta: number } {
  const pts = statPointsFromPriceRub(priceRub);
  if (origin === "soviet") return { prestigeDelta: 0, domesticDelta: pts };
  return { prestigeDelta: pts, domesticDelta: 0 };
}

export function withCatalogStatDeltas<T extends { priceRub: number; origin: CatalogOrigin }>(
  item: T,
): T & { prestigeDelta: number; domesticDelta: number } {
  return { ...item, ...catalogItemStatDeltas(item.priceRub, item.origin) };
}
