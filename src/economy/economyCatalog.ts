/** Тариф сим-карты доставки: один платёж на 30 суток (с баланса сим). */
export const COURIER_SIM_MONTHLY_FEE_RUB = 1_000;
export const COURIER_SIM_MONTHLY_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

/** Одноразовый множитель старых балансов при первом запуске v3. */
export const ECONOMY_LEGACY_BALANCE_MULT = 25;

export type PhoneModelId = "phone_budget" | "phone_10k" | "phone_40k" | "phone_70k" | "phone_100k";

export interface PhoneDef {
  id: PhoneModelId;
  label: string;
  priceRub: number;
  meetsCourierMinimum: boolean;
  prestigeDelta: number;
}

export const PHONE_MODELS: PhoneDef[] = [
  { id: "phone_budget", label: "Бюджетный", priceRub: 5_000, meetsCourierMinimum: true, prestigeDelta: 0 },
  { id: "phone_10k", label: "Стандарт", priceRub: 10_000, meetsCourierMinimum: true, prestigeDelta: 2 },
  { id: "phone_40k", label: "Комфорт", priceRub: 40_000, meetsCourierMinimum: true, prestigeDelta: 8 },
  { id: "phone_70k", label: "Премиум", priceRub: 70_000, meetsCourierMinimum: true, prestigeDelta: 14 },
  { id: "phone_100k", label: "Флагман", priceRub: 100_000, meetsCourierMinimum: true, prestigeDelta: 20 },
];

export function getPhoneDef(id: string | undefined): PhoneDef | undefined {
  if (!id) return undefined;
  return PHONE_MODELS.find((p) => p.id === id);
}

export type CarModelId = "car_scooter" | "car_used" | "car_500k" | "car_1m" | "car_3m" | "car_5m" | "car_10m";

export interface CarDef {
  id: CarModelId;
  label: string;
  priceRub: number;
  prestigeDelta: number;
  speedKmh: number;
  /** КД смены доставки: от 2 ч (подержанный) до 1 ч (топ). */
  courierShiftCdMs: number;
}

const H = 60 * 60 * 1000;

export const CAR_MODELS: CarDef[] = [
  {
    id: "car_scooter",
    label: "Скутер",
    priceRub: 80_000,
    prestigeDelta: 40,
    speedKmh: 55,
    courierShiftCdMs: Math.round(2.5 * H),
  },
  { id: "car_used", label: "Подержанный", priceRub: 300_000, prestigeDelta: 0, speedKmh: 90, courierShiftCdMs: 2 * H },
  { id: "car_500k", label: "Класс 500 тыс.", priceRub: 500_000, prestigeDelta: 120, speedKmh: 110, courierShiftCdMs: Math.round(1.8 * H) },
  { id: "car_1m", label: "Миллионник", priceRub: 1_000_000, prestigeDelta: 320, speedKmh: 130, courierShiftCdMs: Math.round(1.6 * H) },
  { id: "car_3m", label: "Бизнес-класс", priceRub: 3_000_000, prestigeDelta: 900, speedKmh: 160, courierShiftCdMs: Math.round(1.35 * H) },
  { id: "car_5m", label: "Премиум", priceRub: 5_000_000, prestigeDelta: 1_600, speedKmh: 190, courierShiftCdMs: Math.round(1.15 * H) },
  { id: "car_10m", label: "Топ-сегмент", priceRub: 10_000_000, prestigeDelta: 3_200, speedKmh: 220, courierShiftCdMs: 1 * H },
];

export function getCarDef(id: string | undefined): CarDef | undefined {
  if (!id) return undefined;
  return CAR_MODELS.find((c) => c.id === id);
}

/** Один календарный день в мс (жильё, аренда). */
export const MS_PER_DAY = 86400000;

/** Коммуналка и прочие «месячные» циклы — 30 суток. */
export const HOUSING_CALENDAR_MONTH_MS = 30 * MS_PER_DAY;

/** @deprecated имя оставлено для совместимости импортов — то же, что календарный месяц коммуналки */
export const HOUSING_RENT_PERIOD_MS = HOUSING_CALENDAR_MONTH_MS;

/** Пакет «30 суток сразу» — дешевле посуточного эквивалента. */
export const HOUSING_RENT_MONTH_PKG_RUB = 40_000;
export const HOUSING_RENT_MONTH_PKG_MS = 30 * MS_PER_DAY;

/** Посуточно: как старые 70k за 30 дней, одни сутки. */
export const HOUSING_RENT_DAILY_MONTH_EQUIV_RUB = 70_000;
export const HOUSING_RENT_DAY_PKG_RUB = Math.ceil(HOUSING_RENT_DAILY_MONTH_EQUIV_RUB / 30);
export const HOUSING_RENT_DAY_PKG_MS = MS_PER_DAY;

/** Неделя: среднее между дневной ставкой «70k/30» и «40k/30» за сутки, ×7. */
export const HOUSING_RENT_WEEK_PKG_RUB = Math.round(
  ((HOUSING_RENT_MONTH_PKG_RUB / 30 + HOUSING_RENT_DAILY_MONTH_EQUIV_RUB / 30) / 2) * 7,
);
export const HOUSING_RENT_WEEK_PKG_MS = 7 * MS_PER_DAY;

export type HousingRentPlan = "day" | "week" | "month";

export function housingRentPlanPriceRub(plan: HousingRentPlan): number {
  if (plan === "day") return HOUSING_RENT_DAY_PKG_RUB;
  if (plan === "week") return HOUSING_RENT_WEEK_PKG_RUB;
  return HOUSING_RENT_MONTH_PKG_RUB;
}

export function housingRentPlanPeriodMs(plan: HousingRentPlan): number {
  if (plan === "day") return HOUSING_RENT_DAY_PKG_MS;
  if (plan === "week") return HOUSING_RENT_WEEK_PKG_MS;
  return HOUSING_RENT_MONTH_PKG_MS;
}

/** Престиж за то, что живёшь в аренде (один раз при заселении; снимается при съезде). */
export const HOUSING_RENT_PRESTIGE_ONE_TIME = 1_000;
/** Доля цены квартиры, возвращаемая при продаже (остальное — «потери на сделке»). */
export const APARTMENT_SELL_REFUND_RATE = 0.45;

export type ApartmentId = "apt_2m" | "apt_1m" | "apt_5m" | "apt_12m" | "apt_25m" | "apt_45m" | "apt_70m" | "apt_100m";

export interface ApartmentDef {
  id: ApartmentId;
  label: string;
  priceRub: number;
  prestigeDelta: number;
  monthlyUtilityRub: number;
}

export const APARTMENT_MODELS: ApartmentDef[] = [
  /** Первая собственность: достижимость с тир-2 + арендой за несколько месяцев (MVP баланса). */
  { id: "apt_2m", label: "Комната (первое жильё)", priceRub: 550_000, prestigeDelta: 1_200, monthlyUtilityRub: 3_500 },
  { id: "apt_1m", label: "Студия", priceRub: 1_000_000, prestigeDelta: 4_500, monthlyUtilityRub: 9_000 },
  { id: "apt_5m", label: "Однушка", priceRub: 5_000_000, prestigeDelta: 11_000, monthlyUtilityRub: 14_000 },
  { id: "apt_12m", label: "Двушка", priceRub: 12_000_000, prestigeDelta: 28_000, monthlyUtilityRub: 18_000 },
  { id: "apt_25m", label: "Улучшенная", priceRub: 25_000_000, prestigeDelta: 62_000, monthlyUtilityRub: 22_000 },
  { id: "apt_45m", label: "В центре", priceRub: 45_000_000, prestigeDelta: 120_000, monthlyUtilityRub: 28_000 },
  { id: "apt_70m", label: "Пентхаус", priceRub: 70_000_000, prestigeDelta: 200_000, monthlyUtilityRub: 34_000 },
  { id: "apt_100m", label: "Элитная резиденция", priceRub: 100_000_000, prestigeDelta: 320_000, monthlyUtilityRub: 40_000 },
];

export function getApartmentDef(id: string | undefined): ApartmentDef | undefined {
  if (!id) return undefined;
  return APARTMENT_MODELS.find((a) => a.id === id);
}

/** Множитель дохода ИП от престижа (суточный пассивный оклад и смена). */
export function solePropPrestigeIncomeMult(prestige: number): number {
  const p = Math.max(0, prestige);
  return 1 + Math.min(0.55, Math.sqrt(p) / 850);
}
