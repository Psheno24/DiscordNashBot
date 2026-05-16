/** Тариф сим-карты доставки: один платёж на 30 суток (с баланса сим). */
export const COURIER_SIM_MONTHLY_FEE_RUB = 1_000;
export const COURIER_SIM_MONTHLY_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

export type PhoneModelId = "phone_budget" | "phone_10k" | "phone_40k" | "phone_70k" | "phone_100k";

export interface PhoneDef {
  id: PhoneModelId;
  label: string;
  priceRub: number;
  meetsCourierMinimum: boolean;
  prestigeDelta: number;
}

export const PHONE_MODELS: PhoneDef[] = [
  { id: "phone_budget", label: "Кнопочник «Элта»", priceRub: 5_000, meetsCourierMinimum: true, prestigeDelta: 0 },
  { id: "phone_10k", label: "Redmi A3", priceRub: 10_000, meetsCourierMinimum: true, prestigeDelta: 2 },
  { id: "phone_40k", label: "Samsung Galaxy A55", priceRub: 40_000, meetsCourierMinimum: true, prestigeDelta: 8 },
  { id: "phone_70k", label: "Google Pixel 10 Pro", priceRub: 70_000, meetsCourierMinimum: true, prestigeDelta: 14 },
  { id: "phone_100k", label: "iPhone 17 Pro Max", priceRub: 100_000, meetsCourierMinimum: true, prestigeDelta: 20 },
];

/** Выкуп текущего телефона при апгрейде (доля от цены модели). */
export const PHONE_TRADE_IN_RATE = 0.5;

export function getPhoneDef(id: string | undefined): PhoneDef | undefined {
  if (!id) return undefined;
  return PHONE_MODELS.find((p) => p.id === id);
}

export function phoneTradeInRub(cur: PhoneDef | undefined): number {
  if (!cur) return 0;
  return Math.floor(cur.priceRub * PHONE_TRADE_IN_RATE);
}

/** Стоимость покупки/апгрейда телефона с учётом выкупа текущего. */
export function shopPhonePurchaseCostRub(cur: PhoneDef | undefined, next: PhoneDef, hasPhone: boolean): number {
  const tradeIn = hasPhone && cur ? phoneTradeInRub(cur) : 0;
  return Math.max(0, next.priceRub - tradeIn);
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
    label: "Иж Планета-5",
    priceRub: 80_000,
    prestigeDelta: 40,
    speedKmh: 55,
    courierShiftCdMs: Math.round(2.5 * H),
  },
  { id: "car_used", label: "Жигули ВАЗ-2107", priceRub: 300_000, prestigeDelta: 80, speedKmh: 90, courierShiftCdMs: 2 * H },
  { id: "car_500k", label: "Lada Granta", priceRub: 500_000, prestigeDelta: 120, speedKmh: 110, courierShiftCdMs: Math.round(1.8 * H) },
  { id: "car_1m", label: "Toyota Corolla", priceRub: 1_000_000, prestigeDelta: 320, speedKmh: 130, courierShiftCdMs: Math.round(1.6 * H) },
  { id: "car_3m", label: "BMW 3 Series", priceRub: 3_000_000, prestigeDelta: 900, speedKmh: 160, courierShiftCdMs: Math.round(1.35 * H) },
  { id: "car_5m", label: "Mercedes E-Class", priceRub: 5_000_000, prestigeDelta: 1_600, speedKmh: 190, courierShiftCdMs: Math.round(1.15 * H) },
  { id: "car_10m", label: "Porsche 911", priceRub: 10_000_000, prestigeDelta: 3_200, speedKmh: 220, courierShiftCdMs: 1 * H },
];

/** Выкуп текущего авто при апгрейде (доля от цены модели). */
export const CAR_TRADE_IN_RATE = 0.75;

export function getCarDef(id: string | undefined): CarDef | undefined {
  if (!id) return undefined;
  return CAR_MODELS.find((c) => c.id === id);
}

export function carTradeInRub(cur: CarDef | undefined): number {
  if (!cur) return 0;
  return Math.floor(cur.priceRub * CAR_TRADE_IN_RATE);
}

/** Стоимость покупки/апгрейда авто с учётом выкупа текущего. */
export function shopCarPurchaseCostRub(cur: CarDef | undefined, next: CarDef): number {
  const tradeIn = cur ? carTradeInRub(cur) : 0;
  return Math.max(0, next.priceRub - tradeIn);
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

/** Выкуп квартиры при переезде на более дорогую (до месяца владения). */
export const APARTMENT_TRADE_IN_RATE = 0.9;
/** Выкуп после месяца владения («выросла цена на жильё»). */
export const APARTMENT_TRADE_IN_RATE_AFTER_MONTH = 1.2;
/** Срок владения для повышенного выкупа — календарные 30 суток. */
export const APARTMENT_TRADE_IN_MONTH_MS = HOUSING_CALENDAR_MONTH_MS;

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
  {
    id: "apt_2m",
    label: "Комната в общежитии (Капотня)",
    priceRub: 550_000,
    prestigeDelta: 1_200,
    monthlyUtilityRub: 3_500,
  },
  { id: "apt_1m", label: "Студия (Марьино)", priceRub: 1_000_000, prestigeDelta: 4_500, monthlyUtilityRub: 9_000 },
  { id: "apt_5m", label: "Однушка (Бутово)", priceRub: 5_000_000, prestigeDelta: 11_000, monthlyUtilityRub: 14_000 },
  { id: "apt_12m", label: "Двушка (Строгино)", priceRub: 12_000_000, prestigeDelta: 28_000, monthlyUtilityRub: 18_000 },
  { id: "apt_25m", label: "Трёшка (Хамовники)", priceRub: 25_000_000, prestigeDelta: 62_000, monthlyUtilityRub: 22_000 },
  {
    id: "apt_45m",
    label: "Четырёхкомнатная квартира (Патриаршие)",
    priceRub: 45_000_000,
    prestigeDelta: 120_000,
    monthlyUtilityRub: 28_000,
  },
  { id: "apt_70m", label: "Пентхаус (Москва-Сити)", priceRub: 70_000_000, prestigeDelta: 200_000, monthlyUtilityRub: 34_000 },
  {
    id: "apt_100m",
    label: "Резиденция (Рублёво-Успенское)",
    priceRub: 100_000_000,
    prestigeDelta: 320_000,
    monthlyUtilityRub: 40_000,
  },
];

export function getApartmentDef(id: string | undefined): ApartmentDef | undefined {
  if (!id) return undefined;
  return APARTMENT_MODELS.find((a) => a.id === id);
}

export function apartmentTradeInRate(purchasedAtMs: number | undefined, nowMs: number = Date.now()): number {
  if (purchasedAtMs != null && nowMs - purchasedAtMs >= APARTMENT_TRADE_IN_MONTH_MS) {
    return APARTMENT_TRADE_IN_RATE_AFTER_MONTH;
  }
  return APARTMENT_TRADE_IN_RATE;
}

export function apartmentTradeInRub(
  cur: ApartmentDef,
  purchasedAtMs: number | undefined,
  nowMs: number = Date.now(),
): number {
  return Math.floor(cur.priceRub * apartmentTradeInRate(purchasedAtMs, nowMs));
}

/** Стоимость покупки/переезда с учётом выкупа своей квартиры (без возврата аренды). */
export function shopApartmentPurchaseCostRub(
  cur: ApartmentDef | undefined,
  next: ApartmentDef,
  purchasedAtMs: number | undefined,
  nowMs: number = Date.now(),
): number {
  const tradeIn = cur ? apartmentTradeInRub(cur, purchasedAtMs, nowMs) : 0;
  return Math.max(0, next.priceRub - tradeIn);
}

/** Множитель дохода ИП от престижа (суточный пассивный оклад и смена). */
export function solePropPrestigeIncomeMult(prestige: number): number {
  const p = Math.max(0, prestige);
  return 1 + Math.min(0.55, Math.sqrt(p) / 850);
}
