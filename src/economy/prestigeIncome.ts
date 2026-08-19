import {
  APARTMENT_MODELS,
  CAR_MODELS,
  PHONE_MODELS,
} from "./economyCatalog.js";
import { computePlatePrestige } from "./economyPlatePrestige.js";
import { type VehiclePlateParts } from "./economyLicensePlate.js";
import type { EconomyUser } from "./userStore.js";

/** Полный набор вершин (Vertu, порш, поместье, лучший номер) → множитель ₽ ровно ×2. */
export const PRESTIGE_INCOME_PINNACLE_MULT = 2;

/** АМР 777 77 — лучшая связка в таблицах (статус ×2,0 к Москве 77). */
export const PINNACLE_VEHICLE_PLATE: VehiclePlateParts = {
  l1: "А",
  digits: "777",
  l2: "МР",
  region: "77",
};

export const PINNACLE_PLATE_PRESTIGE = computePlatePrestige(PINNACLE_VEHICLE_PLATE).total;

function maxForeignPrestige(items: readonly { origin: string; prestigeDelta: number }[]): number {
  let m = 0;
  for (const it of items) {
    if (it.origin === "foreign" && it.prestigeDelta > m) m = it.prestigeDelta;
  }
  return m;
}

/** Сумма престижа четырёх вершин: телефон + авто + жильё + госномер. */
export function pinnaclePrestigeForIncome(): number {
  return (
    maxForeignPrestige(PHONE_MODELS) +
    maxForeignPrestige(CAR_MODELS) +
    maxForeignPrestige(APARTMENT_MODELS) +
    PINNACLE_PLATE_PRESTIGE
  );
}

/**
 * Линейно от очков престижа: 0 → ×1, сумма вершин → ×2.
 * Телефон даёт мало, машина больше, жильё сильно больше, номер — сколько даёт таблица.
 */
export function prestigeIncomeMultFromPoints(prestige: number): number {
  const cap = pinnaclePrestigeForIncome();
  const p = Math.max(0, prestige);
  if (cap <= 0 || p <= 0) return 1;
  const fill = Math.min(1, p / cap);
  return 1 + fill * (PRESTIGE_INCOME_PINNACLE_MULT - 1);
}

export function prestigeIncomeMultFromUser(u: EconomyUser): number {
  return prestigeIncomeMultFromPoints(u.prestigePoints ?? 0);
}

function fmtPts(n: number): string {
  return Math.floor(Math.max(0, n)).toLocaleString("ru-RU");
}

export function formatPrestigeIncomeSlotsLine(u: EconomyUser): string {
  const pts = Math.max(0, u.prestigePoints ?? 0);
  const cap = pinnaclePrestigeForIncome();
  const m = prestigeIncomeMultFromPoints(pts);
  return `×${m.toFixed(2)} · ${fmtPts(pts)} / ${fmtPts(cap)}`;
}
