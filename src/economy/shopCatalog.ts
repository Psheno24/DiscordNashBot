import { randomBytes } from "node:crypto";
import {
  getGuildConfig,
  listGuildConfigs,
  updateGuildConfig,
  type ShopCatalogItem,
  type ShopCatalogKind,
} from "../guildConfig/store.js";
import {
  APARTMENT_MODELS,
  CAR_MODELS,
  PET_MODELS,
  PHONE_MODELS,
  type ApartmentDef,
  type CarDef,
  type CatalogOrigin,
  type PetDef,
  type PhoneDef,
} from "./economyCatalog.js";
import { withCatalogStatDeltas } from "./economyStatPoints.js";

export const SHOP_CUSTOM_LIMIT = 8;

const CUSTOM_ID_RE = /^c(ph|cr|ap|pt)_[a-f0-9]{8}$/;

export const SHOP_MENU_DEFS: { id: string; fallback: string; group: string }[] = [
  { id: "term.profile", fallback: "Профиль", group: "Терминал" },
  { id: "term.work", fallback: "Работа", group: "Терминал" },
  { id: "term.shop", fallback: "Магазин", group: "Терминал" },
  { id: "term.skills", fallback: "Навыки", group: "Терминал" },
  { id: "term.players", fallback: "Игроки", group: "Терминал" },
  { id: "term.rent", fallback: "Аренда", group: "Терминал" },
  { id: "hub.phone", fallback: "Телефон", group: "Магазин" },
  { id: "hub.car", fallback: "Авто", group: "Магазин" },
  { id: "hub.house", fallback: "Жильё", group: "Магазин" },
  { id: "hub.animals", fallback: "Животные", group: "Магазин" },
  { id: "hub.lottery", fallback: "Лотерея", group: "Магазин" },
  { id: "hub.appearance", fallback: "Оформление", group: "Магазин" },
  { id: "hub.voice", fallback: "Фраза входа", group: "Магазин" },
  { id: "phone.soviet", fallback: "Советское", group: "Телефон" },
  { id: "phone.foreign", fallback: "Заморское", group: "Телефон" },
  { id: "phone.sim", fallback: "Сим-карта", group: "Телефон" },
  { id: "car.soviet", fallback: "Советское", group: "Авто" },
  { id: "car.foreign", fallback: "Заморское", group: "Авто" },
  { id: "car.plate", fallback: "Госномер", group: "Авто" },
  { id: "house.soviet", fallback: "Советское", group: "Жильё" },
  { id: "house.foreign", fallback: "Заморское", group: "Жильё" },
  { id: "house.rent", fallback: "Аренда", group: "Жильё" },
];

export function isCustomCatalogId(id: string): boolean {
  return CUSTOM_ID_RE.test(id);
}

function catalogOf(guildId: string) {
  return getGuildConfig(guildId).shopCatalog;
}

function hiddenSet(guildId: string | undefined): Set<string> {
  if (!guildId) return new Set();
  return new Set(catalogOf(guildId)?.hidden ?? []);
}

function labelOverride(id: string, guildId?: string): string | undefined {
  if (guildId) {
    const label = catalogOf(guildId)?.labels?.[id];
    return label && label.length > 0 ? label : undefined;
  }
  for (const { config } of listGuildConfigs()) {
    const label = config.shopCatalog?.labels?.[id];
    if (label && label.length > 0) return label;
  }
  return undefined;
}

function withLabel<T extends { id: string; label: string }>(item: T, guildId?: string): T {
  const label = labelOverride(item.id, guildId);
  if (!label || label === item.label) return item;
  return { ...item, label };
}

function customItems(kind: ShopCatalogKind, guildId?: string): ShopCatalogItem[] {
  const take = (items: ShopCatalogItem[] | undefined) => (items ?? []).filter((item) => item.kind === kind && item.label && item.priceRub >= 0);
  if (guildId) return take(catalogOf(guildId)?.custom);
  const out: ShopCatalogItem[] = [];
  for (const { config } of listGuildConfigs()) out.push(...take(config.shopCatalog?.custom));
  return out;
}

function findCustom(id: string, kind: ShopCatalogKind, guildId?: string): ShopCatalogItem | undefined {
  return customItems(kind, guildId).find((item) => item.id === id);
}

function originOf(item: ShopCatalogItem): CatalogOrigin {
  return item.origin === "foreign" ? "foreign" : "soviet";
}

function phoneFromCustom(item: ShopCatalogItem): PhoneDef {
  return withCatalogStatDeltas({
    id: item.id,
    label: item.label,
    priceRub: item.priceRub,
    origin: originOf(item),
    meetsCourierMinimum: item.meetsCourierMinimum !== false,
  });
}

function carFromCustom(item: ShopCatalogItem): CarDef {
  const speed = clamp(item.speedKmh ?? defaultCarSpeed(item.priceRub), 10, 400);
  const hours = clamp(item.courierShiftHours ?? defaultCarHours(item.priceRub), 0.25, 48);
  return withCatalogStatDeltas({
    id: item.id,
    label: item.label,
    priceRub: item.priceRub,
    origin: originOf(item),
    speedKmh: Math.round(speed),
    courierShiftCdMs: Math.round(hours * 60 * 60 * 1000),
  });
}

function aptFromCustom(item: ShopCatalogItem): ApartmentDef {
  return withCatalogStatDeltas({
    id: item.id,
    label: item.label,
    priceRub: item.priceRub,
    origin: originOf(item),
    monthlyUtilityRub: Math.max(0, Math.floor(item.monthlyUtilityRub ?? 0)),
  });
}

function petFromCustom(item: ShopCatalogItem): PetDef {
  return {
    id: item.id,
    label: item.label,
    purchaseRub: item.priceRub,
    dailyUpkeepRub: Math.max(0, Math.floor(item.dailyUpkeepRub ?? 0)),
    dailyPsRub: Math.max(0, Math.floor(item.dailyPsRub ?? 0)),
    minSovietAptIndex: -1,
    minForeignAptIndex: -1,
    requiresPhone: item.requiresPhone === true,
  };
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function defaultCarSpeed(priceRub: number): number {
  return Math.round(40 + Math.min(180, priceRub / 20_000));
}

function defaultCarHours(priceRub: number): number {
  return Math.max(1, Math.min(4, 3 - priceRub / 1_000_000));
}

export function resolvePhoneDef(id: string, guildId?: string): PhoneDef | undefined {
  const built = PHONE_MODELS.find((p) => p.id === id);
  if (built) return withLabel(built, guildId);
  const custom = findCustom(id, "phone", guildId) ?? (guildId ? findCustom(id, "phone") : undefined);
  return custom ? phoneFromCustom(custom) : undefined;
}

export function resolveCarDef(id: string, guildId?: string): CarDef | undefined {
  const built = CAR_MODELS.find((c) => c.id === id);
  if (built) return withLabel(built, guildId);
  const custom = findCustom(id, "car", guildId) ?? (guildId ? findCustom(id, "car") : undefined);
  return custom ? carFromCustom(custom) : undefined;
}

export function resolveApartmentDef(id: string, guildId?: string): ApartmentDef | undefined {
  const built = APARTMENT_MODELS.find((a) => a.id === id);
  if (built) return withLabel(built, guildId);
  const custom = findCustom(id, "apt", guildId) ?? (guildId ? findCustom(id, "apt") : undefined);
  return custom ? aptFromCustom(custom) : undefined;
}

export function resolvePetDef(id: string, guildId?: string): PetDef | undefined {
  const built = PET_MODELS.find((p) => p.id === id);
  if (built) return withLabel(built, guildId);
  const custom = findCustom(id, "pet", guildId) ?? (guildId ? findCustom(id, "pet") : undefined);
  return custom ? petFromCustom(custom) : undefined;
}

export function listPhonesForSale(origin: CatalogOrigin, guildId?: string): PhoneDef[] {
  const hidden = hiddenSet(guildId);
  const built = PHONE_MODELS.filter((p) => p.origin === origin && !hidden.has(p.id)).map((p) => withLabel(p, guildId));
  if (!guildId) return built;
  const extra = customItems("phone", guildId)
    .filter((item) => originOf(item) === origin && !hidden.has(item.id))
    .map(phoneFromCustom);
  return [...built, ...extra];
}

export function listCarsForSale(origin: CatalogOrigin, guildId?: string): CarDef[] {
  const hidden = hiddenSet(guildId);
  const built = CAR_MODELS.filter((c) => c.origin === origin && !hidden.has(c.id)).map((c) => withLabel(c, guildId));
  if (!guildId) return built;
  const extra = customItems("car", guildId)
    .filter((item) => originOf(item) === origin && !hidden.has(item.id))
    .map(carFromCustom);
  return [...built, ...extra];
}

export function listApartmentsForSale(origin: CatalogOrigin, guildId?: string): ApartmentDef[] {
  const hidden = hiddenSet(guildId);
  const built = APARTMENT_MODELS.filter((a) => a.origin === origin && !hidden.has(a.id)).map((a) => withLabel(a, guildId));
  if (!guildId) return built;
  const extra = customItems("apt", guildId)
    .filter((item) => originOf(item) === origin && !hidden.has(item.id))
    .map(aptFromCustom);
  return [...built, ...extra];
}

export function listPetsForSale(guildId?: string): PetDef[] {
  const hidden = hiddenSet(guildId);
  const built = PET_MODELS.filter((p) => !hidden.has(p.id)).map((p) => withLabel(p, guildId));
  if (!guildId) return built;
  const extra = customItems("pet", guildId)
    .filter((item) => !hidden.has(item.id))
    .map(petFromCustom);
  return [...built, ...extra];
}

/** Все позиции раздела для админки, включая скрытые. */
export function listCatalogAdminItems(guildId: string, kind: ShopCatalogKind): { id: string; label: string; custom: boolean; hidden: boolean }[] {
  const hidden = hiddenSet(guildId);
  const built =
    kind === "phone"
      ? PHONE_MODELS
      : kind === "car"
        ? CAR_MODELS
        : kind === "apt"
          ? APARTMENT_MODELS
          : PET_MODELS;
  const rows = built.map((item) => ({
    id: item.id,
    label: withLabel(item, guildId).label,
    custom: false,
    hidden: hidden.has(item.id),
  }));
  for (const item of customItems(kind, guildId)) {
    rows.push({ id: item.id, label: item.label, custom: true, hidden: hidden.has(item.id) });
  }
  return rows;
}

export function catalogItemHidden(guildId: string, id: string): boolean {
  return hiddenSet(guildId).has(id);
}

export function customItemOf(guildId: string, id: string): ShopCatalogItem | undefined {
  return (catalogOf(guildId)?.custom ?? []).find((item) => item.id === id);
}

export function menuLabel(guildId: string, id: string): string {
  const fallback = SHOP_MENU_DEFS.find((item) => item.id === id)?.fallback ?? id;
  const custom = catalogOf(guildId)?.menus?.[id]?.label;
  const text = (custom && custom.length > 0 ? custom : fallback).replace(/\s+/g, " ").trim();
  return text.slice(0, 80) || fallback;
}

export function menuHidden(guildId: string, id: string): boolean {
  return catalogOf(guildId)?.menus?.[id]?.hidden === true;
}

export interface CustomPriceSource {
  label: string;
  rub: number;
  group: "phone" | "car" | "apt" | "aptu" | "pet" | "petu";
  inflation: boolean;
  income: boolean;
}

export function findCustomPriceSource(priceId: string): CustomPriceSource | undefined {
  const split = priceId.split(":");
  if (split.length !== 2) return undefined;
  const [group, id] = split as [string, string];
  if (!isCustomCatalogId(id)) return undefined;
  const kind: ShopCatalogKind | undefined =
    group === "phone" ? "phone" : group === "car" ? "car" : group === "apt" || group === "aptu" ? "apt" : group === "pet" || group === "petu" ? "pet" : undefined;
  if (!kind) return undefined;
  const item = findCustom(id, kind);
  if (!item) return undefined;
  if (group === "aptu") {
    return { label: `${item.label} · ЖКХ`, rub: Math.max(0, Math.floor(item.monthlyUtilityRub ?? 0)), group: "aptu", inflation: true, income: false };
  }
  if (group === "petu") {
    return { label: `${item.label} · содержание`, rub: Math.max(0, Math.floor(item.dailyUpkeepRub ?? 0)), group: "petu", inflation: false, income: true };
  }
  return {
    label: item.label,
    rub: item.priceRub,
    group: group as CustomPriceSource["group"],
    inflation: true,
    income: false,
  };
}

function mutate(guildId: string, updater: (items: ShopCatalogItem[], hidden: string[], labels: Record<string, string>, menus: Record<string, { label?: string; hidden?: boolean }>, prices: Record<string, { rub?: number; inflation?: boolean }>) => void): void {
  updateGuildConfig(guildId, (cur) => {
    const items = [...(cur.shopCatalog?.custom ?? [])];
    const hidden = [...(cur.shopCatalog?.hidden ?? [])];
    const labels = { ...(cur.shopCatalog?.labels ?? {}) };
    const menus = { ...(cur.shopCatalog?.menus ?? {}) };
    const prices = { ...(cur.shopPrices ?? {}) };
    updater(items, hidden, labels, menus, prices);
    const shopCatalog = {
      custom: items.length ? items : undefined,
      hidden: hidden.length ? hidden : undefined,
      labels: Object.keys(labels).length ? labels : undefined,
      menus: Object.keys(menus).length ? menus : undefined,
    };
    const emptyCatalog = !shopCatalog.custom && !shopCatalog.hidden && !shopCatalog.labels && !shopCatalog.menus;
    return {
      ...cur,
      shopPrices: Object.keys(prices).length ? prices : undefined,
      shopCatalog: emptyCatalog ? undefined : shopCatalog,
    };
  });
}

export function setCatalogHidden(guildId: string, id: string, hidden: boolean): void {
  mutate(guildId, (_items, hiddenIds) => {
    const next = hiddenIds.filter((item) => item !== id);
    if (hidden) next.push(id);
    hiddenIds.splice(0, hiddenIds.length, ...next);
  });
}

export function setCatalogLabel(guildId: string, id: string, label: string | null): void {
  mutate(guildId, (items, _hidden, labels) => {
    const custom = items.find((item) => item.id === id);
    const text = label?.replace(/\s+/g, " ").trim().slice(0, 80) ?? "";
    if (custom) {
      if (text) custom.label = text;
      return;
    }
    if (!text) delete labels[id];
    else labels[id] = text;
  });
}

export function setMenuPatch(guildId: string, id: string, patch: { label?: string | null; hidden?: boolean }): void {
  if (!SHOP_MENU_DEFS.some((item) => item.id === id)) return;
  mutate(guildId, (_items, _hidden, _labels, menus) => {
    const prev = { ...(menus[id] ?? {}) };
    if (patch.label === null) delete prev.label;
    else if (typeof patch.label === "string") {
      const text = patch.label.replace(/\s+/g, " ").trim().slice(0, 80);
      if (text) prev.label = text;
      else delete prev.label;
    }
    if (typeof patch.hidden === "boolean") prev.hidden = patch.hidden;
    if (!prev.label && prev.hidden !== true) delete menus[id];
    else menus[id] = prev;
  });
}

function priceIdsOf(item: ShopCatalogItem): string[] {
  if (item.kind === "phone") return [`phone:${item.id}`];
  if (item.kind === "car") return [`car:${item.id}`];
  if (item.kind === "apt") return [`apt:${item.id}`, `aptu:${item.id}`];
  return [`pet:${item.id}`, `petu:${item.id}`];
}

export function removeCustomItem(guildId: string, id: string): boolean {
  const item = customItemOf(guildId, id);
  if (!item) return false;
  mutate(guildId, (items, hidden, labels, _menus, prices) => {
    const idx = items.findIndex((row) => row.id === id);
    if (idx >= 0) items.splice(idx, 1);
    const hideAt = hidden.indexOf(id);
    if (hideAt >= 0) hidden.splice(hideAt, 1);
    delete labels[id];
    for (const key of priceIdsOf(item)) delete prices[key];
  });
  return true;
}

export type AddCatalogResult = { ok: true; id: string } | { ok: false; reason: string };

export function addCustomItem(guildId: string, draft: Omit<ShopCatalogItem, "id">): AddCatalogResult {
  const label = draft.label.replace(/\s+/g, " ").trim().slice(0, 80);
  if (!label) return { ok: false, reason: "Нужно название." };
  if (!Number.isFinite(draft.priceRub) || draft.priceRub < 0 || draft.priceRub > 1_000_000_000_000) {
    return { ok: false, reason: "Цена — число от 0." };
  }
  const count = customItems(draft.kind, guildId).length;
  if (count >= SHOP_CUSTOM_LIMIT) return { ok: false, reason: `В этом разделе уже ${SHOP_CUSTOM_LIMIT} своих товаров.` };
  const prefix = draft.kind === "phone" ? "cph" : draft.kind === "car" ? "ccr" : draft.kind === "apt" ? "cap" : "cpt";
  const id = `${prefix}_${randomBytes(4).toString("hex")}`;
  const item: ShopCatalogItem = {
    id,
    kind: draft.kind,
    label,
    priceRub: Math.floor(draft.priceRub),
    origin: draft.kind === "pet" ? undefined : originOf(draft as ShopCatalogItem),
    meetsCourierMinimum: draft.kind === "phone" ? draft.meetsCourierMinimum !== false : undefined,
    speedKmh: draft.kind === "car" ? Math.round(clamp(draft.speedKmh ?? defaultCarSpeed(draft.priceRub), 10, 400)) : undefined,
    courierShiftHours: draft.kind === "car" ? Math.round(clamp(draft.courierShiftHours ?? defaultCarHours(draft.priceRub), 0.25, 48) * 100) / 100 : undefined,
    monthlyUtilityRub: draft.kind === "apt" ? Math.max(0, Math.floor(draft.monthlyUtilityRub ?? 0)) : undefined,
    dailyUpkeepRub: draft.kind === "pet" ? Math.max(0, Math.floor(draft.dailyUpkeepRub ?? 0)) : undefined,
    dailyPsRub: draft.kind === "pet" ? Math.max(0, Math.floor(draft.dailyPsRub ?? 0)) : undefined,
    requiresPhone: draft.kind === "pet" ? draft.requiresPhone === true : undefined,
  };
  mutate(guildId, (items) => {
    items.push(item);
  });
  return { ok: true, id };
}

export function updateCustomStats(
  guildId: string,
  id: string,
  patch: Partial<Pick<ShopCatalogItem, "priceRub" | "speedKmh" | "courierShiftHours" | "monthlyUtilityRub" | "dailyUpkeepRub" | "dailyPsRub" | "requiresPhone" | "origin">>,
): void {
  mutate(guildId, (items) => {
    const item = items.find((row) => row.id === id);
    if (!item) return;
    if (patch.priceRub != null && patch.priceRub >= 0) item.priceRub = Math.floor(patch.priceRub);
    if (patch.origin) item.origin = patch.origin;
    if (patch.speedKmh != null) item.speedKmh = Math.round(clamp(patch.speedKmh, 10, 400));
    if (patch.courierShiftHours != null) item.courierShiftHours = Math.round(clamp(patch.courierShiftHours, 0.25, 48) * 100) / 100;
    if (patch.monthlyUtilityRub != null) item.monthlyUtilityRub = Math.max(0, Math.floor(patch.monthlyUtilityRub));
    if (patch.dailyUpkeepRub != null) item.dailyUpkeepRub = Math.max(0, Math.floor(patch.dailyUpkeepRub));
    if (patch.dailyPsRub != null) item.dailyPsRub = Math.max(0, Math.floor(patch.dailyPsRub));
    if (typeof patch.requiresPhone === "boolean") item.requiresPhone = patch.requiresPhone;
  });
}
