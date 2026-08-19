import { randomBytes } from "node:crypto";
import {
  getApartmentDef,
  getCarDef,
  getPhoneDef,
  migrateCatalogItemId,
  type ApartmentId,
  type CarDef,
  type CarModelId,
  type CatalogOrigin,
  type PhoneDef,
  type PhoneModelId,
} from "./economyCatalog.js";
import {
  formatVehiclePlate,
  isValidVehiclePlateParts,
  vehiclePlateKey,
  type VehiclePlateParts,
} from "./economyLicensePlate.js";
import { computePlatePrestige } from "./economyPlatePrestige.js";
import type { EconomyUser, HousingKind } from "./userStore.js";

export interface OwnedPhoneRecord {
  uid: string;
  id: PhoneModelId;
}

export interface OwnedCarRecord {
  uid: string;
  id: CarModelId;
  plate?: VehiclePlateParts;
}

export interface UnattachedPlateRecord extends VehiclePlateParts {}

export interface OwnedApartmentRecord {
  uid: string;
  id: ApartmentId;
  purchasedAtMs: number;
}

const UID_RE = /^[a-zA-Z0-9]{2,16}$/;

export function newAssetUid(): string {
  return randomBytes(4).toString("hex");
}

function asUid(raw: unknown, fallback: string): string {
  return typeof raw === "string" && UID_RE.test(raw) ? raw : fallback;
}

function asPhoneId(raw: unknown): PhoneModelId | undefined {
  if (typeof raw !== "string") return undefined;
  return getPhoneDef(migrateCatalogItemId(raw))?.id;
}

function asCarId(raw: unknown): CarModelId | undefined {
  if (typeof raw !== "string") return undefined;
  return getCarDef(migrateCatalogItemId(raw))?.id;
}

function asAptId(raw: unknown): ApartmentId | undefined {
  if (typeof raw !== "string") return undefined;
  return getApartmentDef(migrateCatalogItemId(raw))?.id;
}

export function parseStoredPlate(raw: unknown): VehiclePlateParts | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const parts: VehiclePlateParts = {
    l1: String(o.l1 ?? "").toUpperCase(),
    digits: String(o.digits ?? ""),
    l2: String(o.l2 ?? "").toUpperCase(),
    region: String(o.region ?? ""),
  };
  return isValidVehiclePlateParts(parts) ? parts : undefined;
}

function parsePhoneRecords(raw: unknown): OwnedPhoneRecord[] {
  if (!Array.isArray(raw)) return [];
  const out: OwnedPhoneRecord[] = [];
  for (let i = 0; i < raw.length; i++) {
    const rec = raw[i];
    if (!rec || typeof rec !== "object") continue;
    const id = asPhoneId((rec as { id?: unknown }).id);
    if (!id) continue;
    out.push({ uid: asUid((rec as { uid?: unknown }).uid, `legP${i}`), id });
  }
  return out;
}

function parseCarRecords(raw: unknown): OwnedCarRecord[] {
  if (!Array.isArray(raw)) return [];
  const out: OwnedCarRecord[] = [];
  for (let i = 0; i < raw.length; i++) {
    const rec = raw[i];
    if (!rec || typeof rec !== "object") continue;
    const id = asCarId((rec as { id?: unknown }).id);
    if (!id) continue;
    const plate = parseStoredPlate((rec as { plate?: unknown }).plate);
    out.push({ uid: asUid((rec as { uid?: unknown }).uid, `legC${i}`), id, plate });
  }
  return out;
}

function parseUnattachedPlates(raw: unknown): UnattachedPlateRecord[] {
  if (!Array.isArray(raw)) return [];
  const out: UnattachedPlateRecord[] = [];
  for (const rec of raw) {
    const plate = parseStoredPlate(rec);
    if (plate) out.push(plate);
  }
  return out;
}

function parseApartmentRecords(raw: unknown): OwnedApartmentRecord[] {
  if (!Array.isArray(raw)) return [];
  const out: OwnedApartmentRecord[] = [];
  for (let i = 0; i < raw.length; i++) {
    const rec = raw[i];
    if (!rec || typeof rec !== "object") continue;
    const id = asAptId((rec as { id?: unknown }).id);
    if (!id) continue;
    const purchasedAtMs = Number.isFinite((rec as { purchasedAtMs?: unknown }).purchasedAtMs)
      ? Math.max(0, Math.floor((rec as { purchasedAtMs: number }).purchasedAtMs))
      : Date.now();
    out.push({ uid: asUid((rec as { uid?: unknown }).uid, `legA${i}`), id, purchasedAtMs });
  }
  return out;
}

function plateFromLegacyUser(u: Record<string, unknown>): VehiclePlateParts | undefined {
  const parts: VehiclePlateParts = {
    l1: String(u.vehiclePlateL1 ?? "").toUpperCase(),
    digits: String(u.vehiclePlateDigits ?? ""),
    l2: String(u.vehiclePlateL2 ?? "").toUpperCase(),
    region: String(u.vehiclePlateRegion ?? ""),
  };
  return isValidVehiclePlateParts(parts) ? parts : undefined;
}

export type NormalizedAssets = {
  ownedPhones: OwnedPhoneRecord[];
  ownedCars: OwnedCarRecord[];
  unattachedPlates: UnattachedPlateRecord[];
  ownedApartments: OwnedApartmentRecord[];
};

/** Миграция старых одиночных полей → массивы; повторный вызов идемпотентен. */
export function normalizeOwnedAssets(raw: unknown): NormalizedAssets {
  const u = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  const phones: OwnedPhoneRecord[] = Array.isArray(u.ownedPhones)
    ? parsePhoneRecords(u.ownedPhones)
    : (() => {
        const phoneId = asPhoneId(u.phoneModelId);
        return u.hasPhone === true && phoneId ? [{ uid: "legP0", id: phoneId }] : [];
      })();

  const cars: OwnedCarRecord[] = Array.isArray(u.ownedCars)
    ? parseCarRecords(u.ownedCars)
    : (() => {
        const carId = asCarId(u.ownedCarId);
        return carId ? [{ uid: "legC0", id: carId, plate: plateFromLegacyUser(u) }] : [];
      })();

  const unattachedPlates = Array.isArray(u.unattachedPlates) ? parseUnattachedPlates(u.unattachedPlates) : [];

  const apts: OwnedApartmentRecord[] = Array.isArray(u.ownedApartments)
    ? parseApartmentRecords(u.ownedApartments)
    : (() => {
        const out: OwnedApartmentRecord[] = [];
        const sovId = asAptId(u.ownedApartmentId);
        if (sovId && getApartmentDef(sovId)?.origin === "soviet") {
          const purchasedAtMs = Number.isFinite(u.ownedApartmentPurchasedAtMs)
            ? Math.max(0, Math.floor(u.ownedApartmentPurchasedAtMs as number))
            : Date.now();
          out.push({ uid: "legAS", id: sovId, purchasedAtMs });
        }
        const forId = asAptId(u.ownedForeignApartmentId);
        if (forId && getApartmentDef(forId)?.origin === "foreign") {
          const purchasedAtMs = Number.isFinite(u.ownedForeignApartmentPurchasedAtMs)
            ? Math.max(0, Math.floor(u.ownedForeignApartmentPurchasedAtMs as number))
            : Date.now();
          out.push({ uid: "legAF", id: forId, purchasedAtMs });
        }
        return out;
      })();

  return {
    ownedPhones: phones,
    ownedCars: cars,
    unattachedPlates,
    ownedApartments: apts,
  };
}

export function listOwnedPhones(u: EconomyUser): OwnedPhoneRecord[] {
  return u.ownedPhones ?? [];
}

export function listOwnedCars(u: EconomyUser): OwnedCarRecord[] {
  return u.ownedCars ?? [];
}

export function listUnattachedPlates(u: EconomyUser): UnattachedPlateRecord[] {
  return u.unattachedPlates ?? [];
}

export function listOwnedApartments(u: EconomyUser): OwnedApartmentRecord[] {
  return u.ownedApartments ?? [];
}

export function listOwnedApartmentsByOrigin(u: EconomyUser, origin: CatalogOrigin): OwnedApartmentRecord[] {
  return listOwnedApartments(u).filter((a) => getApartmentDef(a.id)?.origin === origin);
}

export function listOwnedPhonesByOrigin(u: EconomyUser, origin: CatalogOrigin): OwnedPhoneRecord[] {
  return listOwnedPhones(u).filter((p) => getPhoneDef(p.id)?.origin === origin);
}

export function listOwnedCarsByOrigin(u: EconomyUser, origin: CatalogOrigin): OwnedCarRecord[] {
  return listOwnedCars(u).filter((c) => getCarDef(c.id)?.origin === origin);
}

export function findOwnedPhone(u: EconomyUser, uid: string): OwnedPhoneRecord | undefined {
  return listOwnedPhones(u).find((p) => p.uid === uid);
}

export function findOwnedCar(u: EconomyUser, uid: string): OwnedCarRecord | undefined {
  return listOwnedCars(u).find((c) => c.uid === uid);
}

export function findOwnedApartment(u: EconomyUser, uid: string): OwnedApartmentRecord | undefined {
  return listOwnedApartments(u).find((a) => a.uid === uid);
}

export function userHasAnyPhone(u: EconomyUser): boolean {
  return listOwnedPhones(u).length > 0;
}

export function userHasAnyCar(u: EconomyUser): boolean {
  return listOwnedCars(u).some((c) => Boolean(getCarDef(c.id)));
}

export function userHasAnyPlate(u: EconomyUser): boolean {
  if (listUnattachedPlates(u).length > 0) return true;
  return listOwnedCars(u).some((c) => Boolean(c.plate && isValidVehiclePlateParts(c.plate)));
}

export function userCanOpenPlateShop(u: EconomyUser): boolean {
  return userHasAnyCar(u) || userHasAnyPlate(u);
}

export function carPlateParts(car: OwnedCarRecord): VehiclePlateParts | undefined {
  return car.plate && isValidVehiclePlateParts(car.plate) ? car.plate : undefined;
}

export function listAttachedPlates(u: EconomyUser): VehiclePlateParts[] {
  const out: VehiclePlateParts[] = [];
  for (const car of listOwnedCars(u)) {
    const p = carPlateParts(car);
    if (p) out.push(p);
  }
  return out;
}

export function listAllUserPlates(u: EconomyUser): VehiclePlateParts[] {
  return [...listAttachedPlates(u), ...listUnattachedPlates(u)];
}

export function collectUserPlateKeys(u: EconomyUser, exceptKey?: string): Set<string> {
  const keys = new Set<string>();
  for (const p of listAllUserPlates(u)) {
    const k = vehiclePlateKey(p);
    if (exceptKey && k === exceptKey) continue;
    keys.add(k);
  }
  return keys;
}

export function attachedPlatePrestigeTotal(u: EconomyUser): number {
  let n = 0;
  for (const p of listAttachedPlates(u)) n += computePlatePrestige(p).total;
  return n;
}

/** Штраф −10%: есть авто, но ни на одном нет прикреплённого номера. */
export function anyCarMissingPlate(u: EconomyUser): boolean {
  const cars = listOwnedCars(u).filter((c) => Boolean(getCarDef(c.id)));
  if (cars.length === 0) return false;
  return cars.some((c) => !carPlateParts(c));
}

export function allCarsMissingPlate(u: EconomyUser): boolean {
  const cars = listOwnedCars(u).filter((c) => Boolean(getCarDef(c.id)));
  if (cars.length === 0) return false;
  return cars.every((c) => !carPlateParts(c));
}

export function bestCourierCar(u: EconomyUser): { rec: OwnedCarRecord; def: CarDef } | undefined {
  let best: { rec: OwnedCarRecord; def: CarDef } | undefined;
  for (const rec of listOwnedCars(u)) {
    const def = getCarDef(rec.id);
    if (!def) continue;
    if (!best || def.courierShiftCdMs < best.def.courierShiftCdMs) best = { rec, def };
  }
  return best;
}

export function primaryPhone(u: EconomyUser): { rec: OwnedPhoneRecord; def: PhoneDef } | undefined {
  const rec = listOwnedPhones(u)[0];
  if (!rec) return undefined;
  const def = getPhoneDef(rec.id);
  if (!def) return undefined;
  return { rec, def };
}

function sovietAptOrderIndex(id: string): number {
  const order = ["apt_sov_room", "apt_sov_studio", "apt_sov_1br", "apt_sov_2br", "apt_sov_3br", "apt_sov_pent", "apt_sov_dacha", "apt_sov_estate"];
  return order.indexOf(id);
}

function foreignAptOrderIndex(id: string): number {
  const order = ["apt_for_paris", "apt_for_berlin", "apt_for_london", "apt_for_dubai", "apt_for_ny", "apt_for_monaco", "apt_for_singapore", "apt_for_estate"];
  return order.indexOf(id);
}

export function maxSovietAptIndex(u: EconomyUser): number {
  let max = -1;
  for (const a of listOwnedApartmentsByOrigin(u, "soviet")) {
    max = Math.max(max, sovietAptOrderIndex(a.id));
  }
  return max;
}

export function maxForeignAptIndex(u: EconomyUser): number {
  let max = -1;
  for (const a of listOwnedApartmentsByOrigin(u, "foreign")) {
    max = Math.max(max, foreignAptOrderIndex(a.id));
  }
  return max;
}

export function bestApartmentOfOrigin(u: EconomyUser, origin: CatalogOrigin): OwnedApartmentRecord | undefined {
  const list = listOwnedApartmentsByOrigin(u, origin);
  if (list.length === 0) return undefined;
  const idx = origin === "soviet" ? sovietAptOrderIndex : foreignAptOrderIndex;
  return [...list].sort((a, b) => idx(b.id) - idx(a.id))[0];
}

export function statsFromOwnedAssets(assets: NormalizedAssets): { prestigePoints: number; domesticPoints: number } {
  let prestigePoints = 0;
  let domesticPoints = 0;
  for (const p of assets.ownedPhones) {
    const def = getPhoneDef(p.id);
    if (!def) continue;
    prestigePoints += def.prestigeDelta;
    domesticPoints += def.domesticDelta;
  }
  for (const c of assets.ownedCars) {
    const def = getCarDef(c.id);
    if (!def) continue;
    prestigePoints += def.prestigeDelta;
    domesticPoints += def.domesticDelta;
  }
  for (const a of assets.ownedApartments) {
    const def = getApartmentDef(a.id);
    if (!def) continue;
    prestigePoints += def.prestigeDelta;
    domesticPoints += def.domesticDelta;
  }
  for (const c of assets.ownedCars) {
    if (c.plate && isValidVehiclePlateParts(c.plate)) {
      prestigePoints += computePlatePrestige(c.plate).total;
    }
  }
  return { prestigePoints, domesticPoints };
}

export function assetHousingMirrors(assets: NormalizedAssets): {
  housingKind: HousingKind;
  ownedApartmentId?: ApartmentId;
  ownedApartmentPurchasedAtMs?: number;
  housingForeignKind?: "owned";
  ownedForeignApartmentId?: ApartmentId;
  ownedForeignApartmentPurchasedAtMs?: number;
} {
  const sov = [...assets.ownedApartments].filter((a) => getApartmentDef(a.id)?.origin === "soviet");
  const frn = [...assets.ownedApartments].filter((a) => getApartmentDef(a.id)?.origin === "foreign");
  const bestSov = sov.sort((a, b) => sovietAptOrderIndex(b.id) - sovietAptOrderIndex(a.id))[0];
  const bestFrn = frn.sort((a, b) => foreignAptOrderIndex(b.id) - foreignAptOrderIndex(a.id))[0];
  return {
    housingKind: bestSov ? "owned" : "none",
    ownedApartmentId: bestSov?.id,
    ownedApartmentPurchasedAtMs: bestSov?.purchasedAtMs,
    housingForeignKind: bestFrn ? "owned" : undefined,
    ownedForeignApartmentId: bestFrn?.id,
    ownedForeignApartmentPurchasedAtMs: bestFrn?.purchasedAtMs,
  };
}

export function assetPhoneCarMirrors(assets: NormalizedAssets): {
  hasPhone?: boolean;
  phoneModelId?: PhoneModelId;
  ownedCarId?: CarModelId;
  vehiclePlateL1?: string;
  vehiclePlateDigits?: string;
  vehiclePlateL2?: string;
  vehiclePlateRegion?: string;
  vehiclePlatePrestige?: number;
} {
  const phone = assets.ownedPhones[0];
  let bestCar: OwnedCarRecord | undefined;
  let bestCd = Infinity;
  for (const rec of assets.ownedCars) {
    const def = getCarDef(rec.id);
    if (!def) continue;
    if (def.courierShiftCdMs < bestCd) {
      bestCd = def.courierShiftCdMs;
      bestCar = rec;
    }
  }
  const attached = assets.ownedCars.map((c) => c.plate).filter((p): p is VehiclePlateParts => Boolean(p && isValidVehiclePlateParts(p)));
  const firstPlate = attached[0];
  const platePrestige = attached.reduce((n, p) => n + computePlatePrestige(p).total, 0);
  return {
    hasPhone: phone ? true : undefined,
    phoneModelId: phone?.id,
    ownedCarId: bestCar?.id,
    vehiclePlateL1: firstPlate?.l1,
    vehiclePlateDigits: firstPlate?.digits,
    vehiclePlateL2: firstPlate?.l2,
    vehiclePlateRegion: firstPlate?.region,
    vehiclePlatePrestige: firstPlate ? platePrestige : undefined,
  };
}

export function encodePlateKey(p: VehiclePlateParts): string {
  return `${p.l1}~${p.digits}~${p.l2}~${p.region}`;
}

export function decodePlateKey(s: string): VehiclePlateParts | undefined {
  const parts = s.split("~");
  if (parts.length !== 4) return undefined;
  const plate: VehiclePlateParts = { l1: parts[0]!, digits: parts[1]!, l2: parts[2]!, region: parts[3]! };
  return isValidVehiclePlateParts(plate) ? plate : undefined;
}

export function formatCarWithPlateLine(car: OwnedCarRecord, opts?: { markdown?: boolean }): string {
  const def = getCarDef(car.id);
  const label = def?.label ?? car.id;
  const plate = carPlateParts(car);
  const md = opts?.markdown !== false;
  const name = md ? `**${label}**` : label;
  if (!plate) return md ? `${name} — госномер **нет**` : `${name} — госномер нет`;
  const pf = formatVehiclePlate(plate);
  return md ? `${name} — **${pf}**` : `${name} — ${pf}`;
}

export function shortCarLabel(car: OwnedCarRecord): string {
  const def = getCarDef(car.id);
  const label = def?.label ?? "авто";
  return label.length > 18 ? `${label.slice(0, 16)}…` : label;
}
