import {
  APARTMENT_MODELS,
  CAR_MODELS,
  COURIER_SIM_MONTHLY_FEE_RUB,
  PHONE_MODELS,
  PET_MODELS,
  courierBikeRentPriceRub,
  housingRentPlanPriceRub,
} from "./economyCatalog.js";
import {
  SHOP_PLATE_CHANGE_DIGITS_BASE_RUB,
  SHOP_PLATE_CHANGE_LETTERS_BASE_RUB,
  SHOP_PLATE_CHANGE_REGION_BASE_RUB,
  SHOP_PLATE_REGISTER_BASE_RUB,
} from "./economyLicensePlate.js";
import {
  SHOP_SIM_CHANGE_LAST_BASE_RUB,
  SHOP_SIM_CHANGE_MID_BASE_RUB,
  SHOP_SIM_CHANGE_OPERATOR_BASE_RUB,
  SHOP_SIM_REGISTER_BASE_RUB,
  SHOP_SIM_START_BALANCE_RUB,
} from "./economySimNumber.js";
import { PROFILE_COLOR_CHANGE_PRICE_RUB } from "./profileThemes.js";
import { getGuildConfig, updateGuildConfig, type ShopPriceOverride } from "../guildConfig/store.js";
import { findCustomPriceSource } from "./shopCatalog.js";

export type ShopPriceGroup = "phone" | "car" | "apt" | "aptu" | "pet" | "petu" | "svc";

/** Что делать с базой, если инфляция магазина для этой цены выключена. */
export type ShopPricePlain = "plain" | "income";

export interface ShopPriceDef {
  id: string;
  group: ShopPriceGroup;
  label: string;
  defaultRub: number;
  defaultInflation: boolean;
  whenNoInflation: ShopPricePlain;
}

export const SHOP_PRICE_GROUPS: { id: ShopPriceGroup; label: string }[] = [
  { id: "phone", label: "Телефоны" },
  { id: "car", label: "Авто" },
  { id: "apt", label: "Квартиры" },
  { id: "aptu", label: "ЖКХ" },
  { id: "pet", label: "Животные" },
  { id: "petu", label: "Содержание" },
  { id: "svc", label: "Услуги" },
];

function svc(
  id: string,
  label: string,
  defaultRub: number,
  defaultInflation: boolean,
): ShopPriceDef {
  return { id, group: "svc", label, defaultRub, defaultInflation, whenNoInflation: "plain" };
}

const SERVICE_PRICES: ShopPriceDef[] = [
  svc("rent:day", "Аренда · 1 сутки", housingRentPlanPriceRub("day"), true),
  svc("rent:week", "Аренда · 7 суток", housingRentPlanPriceRub("week"), true),
  svc("rent:month", "Аренда · 30 суток", housingRentPlanPriceRub("month"), true),
  svc("bike:1", "Электровел · 1 день", courierBikeRentPriceRub(1), true),
  svc("bike:3", "Электровел · 3 дня", courierBikeRentPriceRub(3), true),
  svc("bike:7", "Электровел · 7 дней", courierBikeRentPriceRub(7), true),
  svc("plate:reg", "Госномер · оформить", SHOP_PLATE_REGISTER_BASE_RUB, true),
  svc("plate:dig", "Госномер · цифры", SHOP_PLATE_CHANGE_DIGITS_BASE_RUB, true),
  svc("plate:let", "Госномер · буквы", SHOP_PLATE_CHANGE_LETTERS_BASE_RUB, true),
  svc("plate:rgn", "Госномер · регион", SHOP_PLATE_CHANGE_REGION_BASE_RUB, true),
  svc("sim:reg", "Сим · оформить", SHOP_SIM_REGISTER_BASE_RUB, false),
  svc("sim:op", "Сим · оператор", SHOP_SIM_CHANGE_OPERATOR_BASE_RUB, true),
  svc("sim:mid", "Сим · середина номера", SHOP_SIM_CHANGE_MID_BASE_RUB, true),
  svc("sim:last", "Сим · хвост номера", SHOP_SIM_CHANGE_LAST_BASE_RUB, true),
  svc("sim:start", "Сим · стартовый баланс", SHOP_SIM_START_BALANCE_RUB, false),
  svc("sim:month", "Сим · тариф 30 суток", COURIER_SIM_MONTHLY_FEE_RUB, false),
  svc("lottery:ticket", "Лотерея · билет", 1_000, false),
  svc("frame:color", "Оформление · смена рамки", PROFILE_COLOR_CHANGE_PRICE_RUB, false),
  svc("voice:join", "Фраза входа · покупка", 10_000_000, false),
  svc("voice:month", "Фраза входа · в месяц", 0, false),
];

function buildCatalog(): ShopPriceDef[] {
  const out: ShopPriceDef[] = [];
  for (const p of PHONE_MODELS) {
    out.push({
      id: `phone:${p.id}`,
      group: "phone",
      label: p.label,
      defaultRub: p.priceRub,
      defaultInflation: true,
      whenNoInflation: "plain",
    });
  }
  for (const c of CAR_MODELS) {
    out.push({
      id: `car:${c.id}`,
      group: "car",
      label: c.label,
      defaultRub: c.priceRub,
      defaultInflation: true,
      whenNoInflation: "plain",
    });
  }
  for (const a of APARTMENT_MODELS) {
    out.push({
      id: `apt:${a.id}`,
      group: "apt",
      label: a.label,
      defaultRub: a.priceRub,
      defaultInflation: true,
      whenNoInflation: "plain",
    });
    out.push({
      id: `aptu:${a.id}`,
      group: "aptu",
      label: a.label,
      defaultRub: a.monthlyUtilityRub,
      defaultInflation: true,
      whenNoInflation: "plain",
    });
  }
  for (const p of PET_MODELS) {
    out.push({
      id: `pet:${p.id}`,
      group: "pet",
      label: p.label,
      defaultRub: p.purchaseRub,
      defaultInflation: true,
      whenNoInflation: "plain",
    });
    out.push({
      id: `petu:${p.id}`,
      group: "petu",
      label: p.label,
      defaultRub: p.dailyUpkeepRub,
      defaultInflation: false,
      whenNoInflation: "income",
    });
  }
  out.push(...SERVICE_PRICES);
  return out;
}

const ALL_PRICES = buildCatalog();
const BY_ID = new Map(ALL_PRICES.map((p) => [p.id, p]));

export function listShopPriceGroups(): { id: ShopPriceGroup; label: string }[] {
  return SHOP_PRICE_GROUPS;
}

function customPriceDef(id: string): ShopPriceDef | undefined {
  const src = findCustomPriceSource(id);
  if (!src) return undefined;
  return {
    id,
    group: src.group,
    label: src.label,
    defaultRub: src.rub,
    defaultInflation: src.inflation,
    whenNoInflation: src.income ? "income" : "plain",
  };
}

export function listShopPrices(group: ShopPriceGroup, guildId?: string): ShopPriceDef[] {
  const built = ALL_PRICES.filter((p) => p.group === group);
  if (!guildId) return built;
  const extra: ShopPriceDef[] = [];
  const prefix =
    group === "phone" ? "phone:" : group === "car" ? "car:" : group === "apt" ? "apt:" : group === "aptu" ? "aptu:" : group === "pet" ? "pet:" : group === "petu" ? "petu:" : "";
  if (!prefix) return built;
  const cfg = getGuildConfig(guildId).shopCatalog?.custom ?? [];
  for (const item of cfg) {
    const id = `${prefix}${item.id}`;
    const def = customPriceDef(id);
    if (def?.group === group) extra.push(def);
  }
  return [...built, ...extra];
}

export function getShopPriceDef(id: string): ShopPriceDef | undefined {
  return BY_ID.get(id) ?? customPriceDef(id);
}

export function isShopPriceGroup(id: string): id is ShopPriceGroup {
  return SHOP_PRICE_GROUPS.some((g) => g.id === id);
}

function overrideOf(guildId: string, id: string): ShopPriceOverride | undefined {
  return getGuildConfig(guildId).shopPrices?.[id];
}

/** База до инфляции. Нет правки — цена из кода. */
export function shopPriceBase(guildId: string, id: string): number {
  const def = getShopPriceDef(id);
  const rub = overrideOf(guildId, id)?.rub;
  if (rub != null && Number.isFinite(rub) && rub >= 0) return Math.floor(rub);
  return def?.defaultRub ?? 0;
}

export function shopPriceInflationOn(guildId: string, id: string): boolean {
  const def = getShopPriceDef(id);
  const flag = overrideOf(guildId, id)?.inflation;
  if (typeof flag === "boolean") return flag;
  return def?.defaultInflation ?? false;
}

export function shopPriceIsOverridden(guildId: string, id: string): boolean {
  const o = overrideOf(guildId, id);
  return o != null && (o.rub != null || typeof o.inflation === "boolean");
}

/** `rub`/`inflation` = null сбрасывает это поле к умолчанию. */
export function setShopPriceOverride(
  guildId: string,
  id: string,
  patch: { rub?: number | null; inflation?: boolean | null },
): void {
  if (!getShopPriceDef(id)) return;
  updateGuildConfig(guildId, (cur) => {
    const shopPrices = { ...(cur.shopPrices ?? {}) };
    const prev = shopPrices[id] ?? {};
    const next: ShopPriceOverride = { ...prev };
    if (patch.rub === null) delete next.rub;
    else if (patch.rub != null) next.rub = Math.floor(patch.rub);
    if (patch.inflation === null) delete next.inflation;
    else if (typeof patch.inflation === "boolean") next.inflation = patch.inflation;
    if (next.rub == null && typeof next.inflation !== "boolean") delete shopPrices[id];
    else shopPrices[id] = next;
    return { ...cur, shopPrices: Object.keys(shopPrices).length ? shopPrices : undefined };
  });
}
