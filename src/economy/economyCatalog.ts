import { roundEconomyPrice } from "./economyRound.js";
import { withCatalogStatDeltas, type CatalogOrigin } from "./economyStatPoints.js";

export type { CatalogOrigin };


/** Тариф сим-карты доставки: один платёж на 30 суток (с баланса сим). */
export const COURIER_SIM_MONTHLY_FEE_RUB = 1_000;
export const COURIER_SIM_MONTHLY_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

export type PhoneModelId =
  | "phone_sov_elta"
  | "phone_sov_nokia"
  | "phone_sov_electronics"
  | "phone_sov_gamma"
  | "phone_sov_neva"
  | "phone_for_xiaomi"
  | "phone_for_samsung"
  | "phone_for_pixel"
  | "phone_for_iphone"
  | "phone_for_signature";

export interface PhoneDef {
  id: PhoneModelId;
  label: string;
  priceRub: number;
  origin: CatalogOrigin;
  prestigeDelta: number;
  domesticDelta: number;
  meetsCourierMinimum: boolean;
}

const PHONE_MODELS_BASE = [
  {
    id: "phone_sov_elta",
    label: "Кнопочник «Элта»",
    priceRub: 4_500,
    origin: "soviet",
    meetsCourierMinimum: true,
  },
  {
    id: "phone_sov_nokia",
    label: "«Нокиа» 3310 (параллель)",
    priceRub: 8_500,
    origin: "soviet",
    meetsCourierMinimum: true,
  },
  {
    id: "phone_sov_electronics",
    label: "«Электроника» С-25",
    priceRub: 18_000,
    origin: "soviet",
    meetsCourierMinimum: true,
  },
  {
    id: "phone_sov_gamma",
    label: "«Гамма» смартфон",
    priceRub: 32_000,
    origin: "soviet",
    meetsCourierMinimum: true,
  },
  {
    id: "phone_sov_neva",
    label: "«Нева» 9М (флагман СССР)",
    priceRub: 52_000,
    origin: "soviet",
    meetsCourierMinimum: true,
  },
  {
    id: "phone_for_xiaomi",
    label: "Redmi Note (Китай)",
    priceRub: 14_000,
    origin: "foreign",
    meetsCourierMinimum: true,
  },
  {
    id: "phone_for_samsung",
    label: "Samsung Galaxy (Корея)",
    priceRub: 48_000,
    origin: "foreign",
    meetsCourierMinimum: true,
  },
  {
    id: "phone_for_pixel",
    label: "Google Pixel (США)",
    priceRub: 82_000,
    origin: "foreign",
    meetsCourierMinimum: true,
  },
  {
    id: "phone_for_iphone",
    label: "iPhone Pro (США)",
    priceRub: 125_000,
    origin: "foreign",
    meetsCourierMinimum: true,
  },
  {
    id: "phone_for_signature",
    label: "Vertu Signature (Великобритания)",
    priceRub: 220_000,
    origin: "foreign",
    meetsCourierMinimum: true,
  },
];

export const PHONE_MODELS = PHONE_MODELS_BASE.map((item) =>
  withCatalogStatDeltas({ ...item, origin: item.origin as CatalogOrigin }),
) as PhoneDef[];

export const PHONE_TRADE_IN_RATE = 0.5;
/** Возврат при продаже телефона без замены (доля каталожной цены). */
export const PHONE_SELL_REFUND_RATE = PHONE_TRADE_IN_RATE;

export function getPhoneDef(id: string | undefined): PhoneDef | undefined {
  if (!id) return undefined;
  return PHONE_MODELS.find((p) => p.id === id);
}

export function phonesByOrigin(origin: CatalogOrigin): PhoneDef[] {
  return PHONE_MODELS.filter((p) => p.origin === origin);
}

export function phoneTradeInRub(cur: PhoneDef | undefined): number {
  if (!cur) return 0;
  return Math.floor(cur.priceRub * PHONE_TRADE_IN_RATE);
}

export function shopPhonePurchaseCostRub(cur: PhoneDef | undefined, next: PhoneDef, hasPhone: boolean): number {
  const tradeIn = hasPhone && cur ? phoneTradeInRub(cur) : 0;
  return Math.max(0, next.priceRub - tradeIn);
}

export type CarModelId =
  | "car_sov_moped"
  | "car_sov_vaz"
  | "car_sov_lada"
  | "car_sov_uaz"
  | "car_sov_volga"
  | "car_for_corolla"
  | "car_for_audi"
  | "car_for_bmw"
  | "car_for_mercedes"
  | "car_for_porsche";

export interface CarDef {
  id: CarModelId;
  label: string;
  priceRub: number;
  origin: CatalogOrigin;
  prestigeDelta: number;
  domesticDelta: number;
  speedKmh: number;
  courierShiftCdMs: number;
}

const H = 60 * 60 * 1000;

const CAR_MODELS_BASE = [
  {
    id: "car_sov_moped",
    label: "Иж Планета-5",
    priceRub: 75_000,
    origin: "soviet",
    speedKmh: 55,
    courierShiftCdMs: Math.round(2.5 * H),
  },
  {
    id: "car_sov_vaz",
    label: "Жигули ВАЗ-2107",
    priceRub: 280_000,
    origin: "soviet",
    speedKmh: 90,
    courierShiftCdMs: 2 * H,
  },
  {
    id: "car_sov_lada",
    label: "Lada Granta",
    priceRub: 480_000,
    origin: "soviet",
    speedKmh: 110,
    courierShiftCdMs: Math.round(1.85 * H),
  },
  {
    id: "car_sov_uaz",
    label: "УАЗ «Патриот»",
    priceRub: 720_000,
    origin: "soviet",
    speedKmh: 120,
    courierShiftCdMs: Math.round(1.7 * H),
  },
  {
    id: "car_sov_volga",
    label: "ГАЗ-24 «Волга»",
    priceRub: 950_000,
    origin: "soviet",
    speedKmh: 135,
    courierShiftCdMs: Math.round(1.55 * H),
  },
  {
    id: "car_for_corolla",
    label: "Toyota Corolla (Япония)",
    priceRub: 1_150_000,
    origin: "foreign",
    speedKmh: 130,
    courierShiftCdMs: Math.round(1.6 * H),
  },
  {
    id: "car_for_audi",
    label: "Audi A6 (Германия)",
    priceRub: 2_800_000,
    origin: "foreign",
    speedKmh: 155,
    courierShiftCdMs: Math.round(1.4 * H),
  },
  {
    id: "car_for_bmw",
    label: "BMW 5 Series (Германия)",
    priceRub: 4_200_000,
    origin: "foreign",
    speedKmh: 170,
    courierShiftCdMs: Math.round(1.25 * H),
  },
  {
    id: "car_for_mercedes",
    label: "Mercedes E-Class (Германия)",
    priceRub: 6_500_000,
    origin: "foreign",
    speedKmh: 190,
    courierShiftCdMs: Math.round(1.12 * H),
  },
  {
    id: "car_for_porsche",
    label: "Porsche 911 (Германия)",
    priceRub: 12_500_000,
    origin: "foreign",
    speedKmh: 220,
    courierShiftCdMs: 1 * H,
  },
];

export const CAR_MODELS = CAR_MODELS_BASE.map((item) =>
  withCatalogStatDeltas({ ...item, origin: item.origin as CatalogOrigin }),
) as CarDef[];

export const CAR_TRADE_IN_RATE = 0.75;
export const CAR_SELL_REFUND_RATE = 0.45;

export function getCarDef(id: string | undefined): CarDef | undefined {
  if (!id) return undefined;
  return CAR_MODELS.find((c) => c.id === id);
}

export function carsByOrigin(origin: CatalogOrigin): CarDef[] {
  return CAR_MODELS.filter((c) => c.origin === origin);
}

export function carTradeInRub(cur: CarDef | undefined): number {
  if (!cur) return 0;
  return Math.floor(cur.priceRub * CAR_TRADE_IN_RATE);
}

export function shopCarPurchaseCostRub(cur: CarDef | undefined, next: CarDef): number {
  const tradeIn = cur ? carTradeInRub(cur) : 0;
  return Math.max(0, next.priceRub - tradeIn);
}

export const MS_PER_DAY = 86400000;
export const HOUSING_CALENDAR_MONTH_MS = 30 * MS_PER_DAY;
export const HOUSING_RENT_PERIOD_MS = HOUSING_CALENDAR_MONTH_MS;
export const HOUSING_RENT_MONTH_PKG_RUB = 100_000;
export const HOUSING_RENT_MONTH_PKG_MS = 30 * MS_PER_DAY;
export const HOUSING_RENT_DAILY_MONTH_EQUIV_RUB = 175_000;
export const HOUSING_RENT_DAY_PKG_MS = MS_PER_DAY;
export const HOUSING_RENT_WEEK_PKG_MS = 7 * MS_PER_DAY;
export const COURIER_BIKE_MONTH_EQUIV_RUB = 30_000;

export type HousingRentPlan = "day" | "week" | "month";

function housingRentPlanPriceRubRaw(plan: HousingRentPlan): number {
  if (plan === "day") return Math.ceil(HOUSING_RENT_DAILY_MONTH_EQUIV_RUB / 30);
  if (plan === "week") {
    return Math.round(((HOUSING_RENT_MONTH_PKG_RUB / 30 + HOUSING_RENT_DAILY_MONTH_EQUIV_RUB / 30) / 2) * 7);
  }
  return HOUSING_RENT_MONTH_PKG_RUB;
}

export function housingRentPlanPriceRub(plan: HousingRentPlan): number {
  return roundEconomyPrice(housingRentPlanPriceRubRaw(plan));
}

export const HOUSING_RENT_DAY_PKG_RUB = housingRentPlanPriceRub("day");
export const HOUSING_RENT_WEEK_PKG_RUB = housingRentPlanPriceRub("week");

export function courierBikeRentPriceRub(days: 1 | 3 | 7): number {
  return roundEconomyPrice((COURIER_BIKE_MONTH_EQUIV_RUB * days) / 30);
}

export function housingRentPlanPeriodMs(plan: HousingRentPlan): number {
  if (plan === "day") return HOUSING_RENT_DAY_PKG_MS;
  if (plan === "week") return HOUSING_RENT_WEEK_PKG_MS;
  return HOUSING_RENT_MONTH_PKG_MS;
}

export const APARTMENT_SELL_REFUND_RATE = 0.45;
export const APARTMENT_TRADE_IN_RATE = 0.9;
export const APARTMENT_TRADE_IN_RATE_AFTER_MONTH = 1.2;
export const APARTMENT_TRADE_IN_MONTH_MS = HOUSING_CALENDAR_MONTH_MS;

export type ApartmentId =
  | "apt_sov_room"
  | "apt_sov_studio"
  | "apt_sov_1br"
  | "apt_sov_2br"
  | "apt_sov_3br"
  | "apt_sov_pent"
  | "apt_sov_dacha"
  | "apt_sov_estate"
  | "apt_for_paris"
  | "apt_for_berlin"
  | "apt_for_london"
  | "apt_for_dubai"
  | "apt_for_ny"
  | "apt_for_monaco"
  | "apt_for_singapore"
  | "apt_for_estate";

export interface ApartmentDef {
  id: ApartmentId;
  label: string;
  priceRub: number;
  origin: CatalogOrigin;
  prestigeDelta: number;
  domesticDelta: number;
  monthlyUtilityRub: number;
}

const APARTMENT_MODELS_BASE = [
  {
    id: "apt_sov_room",
    label: "Комната в общежитии (Капотня)",
    priceRub: 520_000,
    origin: "soviet",
    monthlyUtilityRub: 5_000,
  },
  {
    id: "apt_sov_studio",
    label: "Студия (Марьино)",
    priceRub: 950_000,
    origin: "soviet",
    monthlyUtilityRub: 8_000,
  },
  {
    id: "apt_sov_1br",
    label: "Однушка (Бутово)",
    priceRub: 4_800_000,
    origin: "soviet",
    monthlyUtilityRub: 14_000,
  },
  {
    id: "apt_sov_2br",
    label: "Двушка (Строгино)",
    priceRub: 11_500_000,
    origin: "soviet",
    monthlyUtilityRub: 20_000,
  },
  {
    id: "apt_sov_3br",
    label: "Трёшка (Хамовники)",
    priceRub: 24_000_000,
    origin: "soviet",
    monthlyUtilityRub: 26_000,
  },
  {
    id: "apt_sov_pent",
    label: "Пентхаус (Москва-Сити)",
    priceRub: 52_000_000,
    origin: "soviet",
    monthlyUtilityRub: 32_000,
  },
  {
    id: "apt_sov_dacha",
    label: "Дача (Подмосковье)",
    priceRub: 72_000_000,
    origin: "soviet",
    monthlyUtilityRub: 38_000,
  },
  {
    id: "apt_sov_estate",
    label: "Резиденция (Рублёво-Успенское)",
    priceRub: 98_000_000,
    origin: "soviet",
    monthlyUtilityRub: 47_000,
  },
  {
    id: "apt_for_paris",
    label: "Студия (Париж)",
    priceRub: 1_350_000,
    origin: "foreign",
    monthlyUtilityRub: 11_000,
  },
  {
    id: "apt_for_berlin",
    label: "Лофт (Берлин)",
    priceRub: 6_200_000,
    origin: "foreign",
    monthlyUtilityRub: 17_000,
  },
  {
    id: "apt_for_london",
    label: "Квартира (Лондон)",
    priceRub: 14_500_000,
    origin: "foreign",
    monthlyUtilityRub: 23_000,
  },
  {
    id: "apt_for_dubai",
    label: "Апартаменты (Дубай)",
    priceRub: 32_000_000,
    origin: "foreign",
    monthlyUtilityRub: 29_000,
  },
  {
    id: "apt_for_ny",
    label: "Пентхаус (Нью-Йорк)",
    priceRub: 52_000_000,
    origin: "foreign",
    monthlyUtilityRub: 35_000,
  },
  {
    id: "apt_for_monaco",
    label: "Вилла (Монако)",
    priceRub: 78_000_000,
    origin: "foreign",
    monthlyUtilityRub: 41_000,
  },
  {
    id: "apt_for_singapore",
    label: "Резиденция (Сингапур)",
    priceRub: 92_000_000,
    origin: "foreign",
    monthlyUtilityRub: 44_000,
  },
  {
    id: "apt_for_estate",
    label: "Поместье (Швейцария)",
    priceRub: 115_000_000,
    origin: "foreign",
    monthlyUtilityRub: 50_000,
  },
];

export const APARTMENT_MODELS = APARTMENT_MODELS_BASE.map((item) =>
  withCatalogStatDeltas({ ...item, origin: item.origin as CatalogOrigin }),
) as ApartmentDef[];

export function getApartmentDef(id: string | undefined): ApartmentDef | undefined {
  if (!id) return undefined;
  return APARTMENT_MODELS.find((a) => a.id === id);
}

export function apartmentsByOrigin(origin: CatalogOrigin): ApartmentDef[] {
  return APARTMENT_MODELS.filter((a) => a.origin === origin);
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

export function shopApartmentPurchaseCostRub(
  cur: ApartmentDef | undefined,
  next: ApartmentDef,
  purchasedAtMs: number | undefined,
  nowMs: number = Date.now(),
): number {
  const tradeIn = cur ? apartmentTradeInRub(cur, purchasedAtMs, nowMs) : 0;
  return Math.max(0, next.priceRub - tradeIn);
}

/** Дельта престижа/быта при смене вещи (магазин). */
export function statDeltasOnReplace(
  cur: { origin: CatalogOrigin; prestigeDelta: number; domesticDelta: number } | undefined,
  next: { origin: CatalogOrigin; prestigeDelta: number; domesticDelta: number },
): { prestigeDelta: number; domesticDelta: number } {
  const pCur = cur?.prestigeDelta ?? 0;
  const dCur = cur?.domesticDelta ?? 0;
  return {
    prestigeDelta: next.prestigeDelta - pCur,
    domesticDelta: next.domesticDelta - dCur,
  };
}

export function patchStatsFromShop(
  prestige: number,
  domestic: number,
  delta: { prestigeDelta: number; domesticDelta: number },
): { prestigePoints: number; domesticPoints: number } {
  return {
    prestigePoints: Math.max(0, prestige + delta.prestigeDelta),
    domesticPoints: Math.max(0, domestic + delta.domesticDelta),
  };
}

// ——— Животные ———

export type PetId =
  | "pet_hamster"
  | "pet_cat"
  | "pet_dog"
  | "pet_parrot"
  | "pet_goat"
  | "pet_horse"
  | "pet_tiger"
  | "pet_lion";

export interface PetDef {
  id: PetId;
  label: string;
  purchaseRub: number;
  dailyUpkeepRub: number;
  dailyPsRub: number;
  /** Минимальный id советской квартиры по порядку в APARTMENT_MODELS soviet, -1 = нет. */
  minSovietAptIndex: number;
  /** Минимальный id заморской квартиры по порядку foreign, -1 = нет. */
  minForeignAptIndex: number;
  requiresPhone: boolean;
}

const SOVIET_APT_ORDER = APARTMENT_MODELS.filter((a) => a.origin === "soviet").map((a) => a.id);
const FOREIGN_APT_ORDER = APARTMENT_MODELS.filter((a) => a.origin === "foreign").map((a) => a.id);

export const PET_MODELS: PetDef[] = [
  {
    id: "pet_hamster",
    label: "Хомяк",
    purchaseRub: 8_000,
    dailyUpkeepRub: 150,
    dailyPsRub: 8,
    minSovietAptIndex: -1,
    minForeignAptIndex: -1,
    requiresPhone: false,
  },
  {
    id: "pet_cat",
    label: "Кошка",
    purchaseRub: 28_000,
    dailyUpkeepRub: 350,
    dailyPsRub: 22,
    minSovietAptIndex: -1,
    minForeignAptIndex: -1,
    requiresPhone: false,
  },
  {
    id: "pet_dog",
    label: "Собака",
    purchaseRub: 52_000,
    dailyUpkeepRub: 700,
    dailyPsRub: 45,
    minSovietAptIndex: -1,
    minForeignAptIndex: -1,
    requiresPhone: true,
  },
  {
    id: "pet_parrot",
    label: "Попугай",
    purchaseRub: 95_000,
    dailyUpkeepRub: 1_200,
    dailyPsRub: 72,
    minSovietAptIndex: -1,
    minForeignAptIndex: -1,
    requiresPhone: false,
  },
  {
    id: "pet_goat",
    label: "Коза",
    purchaseRub: 185_000,
    dailyUpkeepRub: 4_000,
    dailyPsRub: 155,
    minSovietAptIndex: 2,
    minForeignAptIndex: -1,
    requiresPhone: false,
  },
  {
    id: "pet_horse",
    label: "Лошадь",
    purchaseRub: 420_000,
    dailyUpkeepRub: 9_000,
    dailyPsRub: 320,
    minSovietAptIndex: 3,
    minForeignAptIndex: 0,
    requiresPhone: false,
  },
  {
    id: "pet_tiger",
    label: "Тигр (вольер)",
    purchaseRub: 1_250_000,
    dailyUpkeepRub: 22_000,
    dailyPsRub: 750,
    minSovietAptIndex: 5,
    minForeignAptIndex: 3,
    requiresPhone: false,
  },
  {
    id: "pet_lion",
    label: "Лев",
    purchaseRub: 2_800_000,
    dailyUpkeepRub: 45_000,
    dailyPsRub: 1_400,
    minSovietAptIndex: 7,
    minForeignAptIndex: 7,
    requiresPhone: false,
  },
];

export const PET_TRADE_IN_RATE = 0.5;

export function getPetDef(id: string | undefined): PetDef | undefined {
  if (!id) return undefined;
  return PET_MODELS.find((p) => p.id === id);
}

export function petTradeInRub(cur: PetDef | undefined): number {
  if (!cur) return 0;
  return Math.floor(cur.purchaseRub * PET_TRADE_IN_RATE);
}

export function petPurchaseCostRub(cur: PetDef | undefined, next: PetDef): number {
  const tradeIn = cur ? petTradeInRub(cur) : 0;
  return Math.max(0, next.purchaseRub - tradeIn);
}

function sovietAptTierIndex(aptId: string | undefined): number {
  if (!aptId) return -1;
  return SOVIET_APT_ORDER.indexOf(aptId as ApartmentId);
}

function foreignAptTierIndex(aptId: string | undefined): number {
  if (!aptId) return -1;
  return FOREIGN_APT_ORDER.indexOf(aptId as ApartmentId);
}

function apartmentLabelBySovietIndex(idx: number): string | undefined {
  if (idx < 0) return undefined;
  const id = SOVIET_APT_ORDER[idx];
  return id ? getApartmentDef(id)?.label : undefined;
}

function apartmentLabelByForeignIndex(idx: number): string | undefined {
  if (idx < 0) return undefined;
  const id = FOREIGN_APT_ORDER[idx];
  return id ? getApartmentDef(id)?.label : undefined;
}

/** Краткое описание требований питомца для витрины магазина. */
export function petRequirementsLine(pet: PetDef): string {
  const parts: string[] = [];
  if (pet.requiresPhone) parts.push("**телефон** (любой)");

  const sovLbl = apartmentLabelBySovietIndex(pet.minSovietAptIndex);
  const forLbl = apartmentLabelByForeignIndex(pet.minForeignAptIndex);
  if (sovLbl && forLbl) {
    parts.push(`своя кв. **${sovLbl}** (сов.) **или** **${forLbl}** (зам.)`);
  } else if (sovLbl) {
    parts.push(`своя кв. (сов.) **${sovLbl}** или выше`);
  } else if (forLbl) {
    parts.push(`своя кв. (зам.) **${forLbl}** или выше`);
  }

  if (parts.length === 0) return "без особых требований";
  return parts.join(" · ");
}

export function petOwnershipBlockReason(u: {
  hasPhone?: boolean;
  housingKind?: string;
  ownedApartmentId?: string;
  ownedForeignApartmentId?: string;
  housingForeignKind?: string;
}, pet: PetDef): string | null {
  if (pet.requiresPhone && !u.hasPhone) return "Нужен **телефон** (любой).";
  const sovIdx = sovietAptTierIndex(u.ownedApartmentId);
  const forIdx = foreignAptTierIndex(u.ownedForeignApartmentId);
  const hasSov = u.housingKind === "owned" && sovIdx >= 0;
  const hasFor = u.housingForeignKind === "owned" && forIdx >= 0;

  if (pet.id === "pet_lion") {
    if (hasSov && sovIdx >= pet.minSovietAptIndex) return null;
    if (hasFor && forIdx >= pet.minForeignAptIndex) return null;
    return "Нужна **резиденция (сов.)** или **поместье (зам.)**.";
  }

  if (pet.minSovietAptIndex >= 0 && hasSov && sovIdx >= pet.minSovietAptIndex) return null;
  if (pet.minForeignAptIndex >= 0 && hasFor && forIdx >= pet.minForeignAptIndex) return null;

  if (pet.minSovietAptIndex >= 0 || pet.minForeignAptIndex >= 0) {
    return "Не подходит **жильё** для этого питомца.";
  }
  return null;
}

/** Миграция старых id каталога → новые. */
export const LEGACY_CATALOG_ID_MAP: Record<string, string> = {
  phone_budget: "phone_sov_elta",
  phone_10k: "phone_for_xiaomi",
  phone_40k: "phone_for_samsung",
  phone_70k: "phone_for_pixel",
  phone_100k: "phone_for_iphone",
  car_scooter: "car_sov_moped",
  car_used: "car_sov_vaz",
  car_500k: "car_sov_lada",
  car_1m: "car_for_corolla",
  car_3m: "car_for_bmw",
  car_5m: "car_for_mercedes",
  car_10m: "car_for_porsche",
  apt_2m: "apt_sov_room",
  apt_1m: "apt_sov_studio",
  apt_5m: "apt_sov_1br",
  apt_12m: "apt_sov_2br",
  apt_25m: "apt_sov_3br",
  apt_45m: "apt_sov_pent",
  apt_70m: "apt_for_dubai",
  apt_100m: "apt_sov_estate",
};

export function migrateCatalogItemId(id: string | undefined): string | undefined {
  if (!id) return undefined;
  return LEGACY_CATALOG_ID_MAP[id] ?? id;
}
