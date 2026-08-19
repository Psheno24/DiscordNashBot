import type { GuildMember } from "discord.js";
import {
  APARTMENT_SELL_REFUND_RATE,
  apartmentTradeInRate,
  CAR_SELL_REFUND_RATE,
  CAR_TRADE_IN_RATE,
  getApartmentDef,
  getCarDef,
  getPhoneDef,
  PHONE_SELL_REFUND_RATE,
  PHONE_TRADE_IN_RATE,
} from "./economyCatalog.js";
import {
  carPlateParts,
  collectUserPlateKeys,
  findOwnedApartment,
  findOwnedCar,
  findOwnedPhone,
  listOwnedApartments,
  listOwnedApartmentsByOrigin,
  listOwnedCars,
  listOwnedPhones,
  listUnattachedPlates,
  newAssetUid,
  userHasAnyCar,
} from "./economyAssets.js";
import { cancelRentAndBikeOnAssetPurchase } from "./economyHousingUtil.js";
import { economyUserClearTier2PlusJobPatch, housingRentUnusedRefundRub } from "./economyHousing.js";
import {
  SHOP_PLATE_CHANGE_DIGITS_BASE_RUB,
  SHOP_PLATE_CHANGE_LETTERS_BASE_RUB,
  SHOP_PLATE_CHANGE_REGION_BASE_RUB,
  SHOP_PLATE_REGISTER_BASE_RUB,
  formatVehiclePlate,
  rollUniqueVehiclePlateDigits,
  rollUniqueVehiclePlateLetters,
  rollUniqueVehiclePlateParts,
  rollUniqueVehiclePlateRegion,
  vehiclePlateKey,
  type VehiclePlateParts,
} from "./economyLicensePlate.js";
import { buildPlateUpgradeTips, computePlatePrestige, type PlateShopLastRoll } from "./economyPlatePrestige.js";
import {
  inflatedCatalogApartmentPrice,
  inflatedCatalogCarPrice,
  inflatedCatalogPhonePrice,
  nextHousingUtilityDueMs,
  scaledShopPrice,
} from "./economyMacro.js";
import { remitShopPurchaseVatToTreasury } from "./taxTreasury.js";
import { getEconomyUser, listEconomyUsers, updateEconomyUser, type EconomyUser } from "./userStore.js";

function fmt(n: number): string {
  return n.toLocaleString("ru-RU");
}

function shopShortageReply(have: number, need: number): string {
  const lack = Math.max(0, need - have);
  return `Не хватает **${fmt(lack)}** ₽ (на счёте **${fmt(have)}**, к оплате **${fmt(need)}**).`;
}

function asUidList(uids: string | string[]): string[] {
  const list = Array.isArray(uids) ? uids : [uids];
  return [...new Set(list.filter((u) => u.length > 0))];
}

function inflatedPlateShopPrice(guildId: string, baseRub: number): number {
  return scaledShopPrice(guildId, baseRub);
}

function applyNet(rubles: number, net: number): number {
  return Math.max(0, rubles - net);
}

function guildTakenVehiclePlateKeys(guildId: string, exceptKey?: string): Set<string> {
  const taken = new Set<string>();
  for (const { user } of listEconomyUsers(guildId)) {
    for (const k of collectUserPlateKeys(user, exceptKey)) taken.add(k);
  }
  return taken;
}

function plateLastRoll(
  action: string,
  plate: string,
  breakdown: ReturnType<typeof computePlatePrestige>,
  prestigeDelta: number,
  upgradeTips?: string[],
): PlateShopLastRoll {
  if (upgradeTips?.length) breakdown.upgradeTips = upgradeTips;
  return { action, plate, breakdown, prestigeDelta };
}

function applyCarPlate(
  cars: NonNullable<EconomyUser["ownedCars"]>,
  carUid: string,
  plate: VehiclePlateParts | undefined,
): NonNullable<EconomyUser["ownedCars"]> {
  return cars.map((c) => (c.uid === carUid ? { ...c, plate } : c));
}

export function purchasePhoneFull(member: GuildMember, pid: string): { ok: true } | { ok: false; reply: string } {
  const defP = getPhoneDef(pid);
  if (!defP) return { ok: false, reply: "Неизвестная модель." };
  const cost = inflatedCatalogPhonePrice(member.guild.id, defP.id);
  const u = getEconomyUser(member.guild.id, member.id);
  if (u.rubles < cost) return { ok: false, reply: shopShortageReply(u.rubles, cost) };
  let applied = false;
  updateEconomyUser(member.guild.id, member.id, (curU) => {
    if (curU.rubles < cost) return curU;
    applied = true;
    return {
      ...curU,
      rubles: curU.rubles - cost,
      ownedPhones: [...listOwnedPhones(curU), { uid: newAssetUid(), id: defP.id }],
    };
  });
  if (!applied) return { ok: false, reply: shopShortageReply(getEconomyUser(member.guild.id, member.id).rubles, cost) };
  remitShopPurchaseVatToTreasury(member.guild.id, cost);
  return { ok: true };
}

export function purchasePhoneTrade(
  member: GuildMember,
  pid: string,
  uids: string | string[],
): { ok: true } | { ok: false; reply: string } {
  const defP = getPhoneDef(pid);
  if (!defP) return { ok: false, reply: "Неизвестная модель." };
  const uidList = asUidList(uids);
  if (uidList.length === 0) return { ok: false, reply: "Выберите хотя бы один телефон." };
  const u = getEconomyUser(member.guild.id, member.id);
  let credit = 0;
  for (const uid of uidList) {
    const rec = findOwnedPhone(u, uid);
    const cur = rec ? getPhoneDef(rec.id) : undefined;
    if (!rec || !cur) return { ok: false, reply: "Этот телефон уже не у вас." };
    if (cur.origin !== defP.origin) return { ok: false, reply: "Обмен только в той же ветке (советское/заморское)." };
    credit += Math.floor(inflatedCatalogPhonePrice(member.guild.id, cur.id) * PHONE_TRADE_IN_RATE);
  }
  const full = inflatedCatalogPhonePrice(member.guild.id, defP.id);
  const net = full - credit;
  if (net > 0 && u.rubles < net) return { ok: false, reply: shopShortageReply(u.rubles, net) };
  const drop = new Set(uidList);
  let applied = false;
  updateEconomyUser(member.guild.id, member.id, (curU) => {
    if (net > 0 && curU.rubles < net) return curU;
    if (uidList.some((uid) => !findOwnedPhone(curU, uid))) return curU;
    applied = true;
    return {
      ...curU,
      rubles: applyNet(curU.rubles, net),
      ownedPhones: [...listOwnedPhones(curU).filter((p) => !drop.has(p.uid)), { uid: newAssetUid(), id: defP.id }],
    };
  });
  if (!applied) return { ok: false, reply: shopShortageReply(getEconomyUser(member.guild.id, member.id).rubles, Math.max(0, net)) };
  if (net > 0) remitShopPurchaseVatToTreasury(member.guild.id, net);
  return { ok: true };
}

export function purchaseCarFull(member: GuildMember, cid: string): { ok: true } | { ok: false; reply: string } {
  const defC = getCarDef(cid);
  if (!defC) return { ok: false, reply: "Неизвестное авто." };
  const cost = inflatedCatalogCarPrice(member.guild.id, defC.id);
  const u = getEconomyUser(member.guild.id, member.id);
  if (u.rubles < cost) return { ok: false, reply: shopShortageReply(u.rubles, cost) };
  let applied = false;
  updateEconomyUser(member.guild.id, member.id, (curU) => {
    if (curU.rubles < cost) return curU;
    applied = true;
    return {
      ...curU,
      rubles: curU.rubles - cost,
      ownedCars: [...listOwnedCars(curU), { uid: newAssetUid(), id: defC.id }],
      ...cancelRentAndBikeOnAssetPurchase(curU),
    };
  });
  if (!applied) return { ok: false, reply: shopShortageReply(getEconomyUser(member.guild.id, member.id).rubles, cost) };
  remitShopPurchaseVatToTreasury(member.guild.id, cost);
  return { ok: true };
}

export function purchaseCarTrade(
  member: GuildMember,
  cid: string,
  uids: string | string[],
): { ok: true } | { ok: false; reply: string } {
  const defC = getCarDef(cid);
  if (!defC) return { ok: false, reply: "Неизвестное авто." };
  const uidList = asUidList(uids);
  if (uidList.length === 0) return { ok: false, reply: "Выберите хотя бы одно авто." };
  const u = getEconomyUser(member.guild.id, member.id);
  let credit = 0;
  for (const uid of uidList) {
    const rec = findOwnedCar(u, uid);
    const cur = rec ? getCarDef(rec.id) : undefined;
    if (!rec || !cur) return { ok: false, reply: "Этого авто уже нет." };
    if (cur.origin !== defC.origin) return { ok: false, reply: "Обмен только в той же ветке (советское/заморское)." };
    credit += Math.floor(inflatedCatalogCarPrice(member.guild.id, cur.id) * CAR_TRADE_IN_RATE);
  }
  const full = inflatedCatalogCarPrice(member.guild.id, defC.id);
  const net = full - credit;
  if (net > 0 && u.rubles < net) return { ok: false, reply: shopShortageReply(u.rubles, net) };
  const drop = new Set(uidList);
  let applied = false;
  updateEconomyUser(member.guild.id, member.id, (curU) => {
    if (net > 0 && curU.rubles < net) return curU;
    if (uidList.some((uid) => !findOwnedCar(curU, uid))) return curU;
    applied = true;
    const unattached = [...listUnattachedPlates(curU)];
    for (const uid of uidList) {
      const old = findOwnedCar(curU, uid);
      const plate = old ? carPlateParts(old) : undefined;
      if (plate) unattached.push(plate);
    }
    return {
      ...curU,
      rubles: applyNet(curU.rubles, net),
      ownedCars: [...listOwnedCars(curU).filter((c) => !drop.has(c.uid)), { uid: newAssetUid(), id: defC.id }],
      unattachedPlates: unattached,
      ...cancelRentAndBikeOnAssetPurchase(curU),
    };
  });
  if (!applied) return { ok: false, reply: shopShortageReply(getEconomyUser(member.guild.id, member.id).rubles, Math.max(0, net)) };
  if (net > 0) remitShopPurchaseVatToTreasury(member.guild.id, net);
  return { ok: true };
}

export function purchaseApartmentFull(
  member: GuildMember,
  aid: string,
): { ok: true; refund: number } | { ok: false; reply: string } {
  const defA = getApartmentDef(aid);
  if (!defA) return { ok: false, reply: "Неизвестная квартира." };
  const u = getEconomyUser(member.guild.id, member.id);
  const now = Date.now();
  const gid = member.guild.id;
  const cost = inflatedCatalogApartmentPrice(gid, defA.id);
  const rentRefund = defA.origin === "soviet" && (u.housingKind ?? "none") === "rent" ? housingRentUnusedRefundRub(u, now, gid) : 0;
  if (u.rubles + rentRefund < cost) {
    return { ok: false, reply: shopShortageReply(u.rubles + rentRefund, cost) };
  }
  let applied = false;
  updateEconomyUser(member.guild.id, member.id, (curU) => {
    if (curU.rubles + rentRefund < cost) return curU;
    applied = true;
    const patch = defA.origin === "soviet" ? cancelRentAndBikeOnAssetPurchase(curU) : { courierBikeUntilMs: undefined };
    return {
      ...curU,
      rubles: curU.rubles + rentRefund - cost,
      ownedApartments: [...listOwnedApartments(curU), { uid: newAssetUid(), id: defA.id, purchasedAtMs: now }],
      housingUtilityNextDueMs: defA.origin === "soviet" ? nextHousingUtilityDueMs(now) : curU.housingUtilityNextDueMs,
      housingForeignUtilityNextDueMs:
        defA.origin === "foreign" ? nextHousingUtilityDueMs(now) : curU.housingForeignUtilityNextDueMs,
      ...patch,
    };
  });
  if (!applied) {
    const later = getEconomyUser(member.guild.id, member.id);
    const laterRefund =
      defA.origin === "soviet" && (later.housingKind ?? "none") === "rent" ? housingRentUnusedRefundRub(later, Date.now(), gid) : 0;
    return { ok: false, reply: shopShortageReply(later.rubles + laterRefund, cost) };
  }
  remitShopPurchaseVatToTreasury(gid, cost);
  return { ok: true, refund: rentRefund };
}

export function purchaseApartmentTrade(
  member: GuildMember,
  aid: string,
  uids: string | string[],
): { ok: true; refund: number } | { ok: false; reply: string } {
  const defA = getApartmentDef(aid);
  if (!defA) return { ok: false, reply: "Неизвестная квартира." };
  const uidList = asUidList(uids);
  if (uidList.length === 0) return { ok: false, reply: "Выберите хотя бы одно жильё." };
  const u = getEconomyUser(member.guild.id, member.id);
  const now = Date.now();
  const gid = member.guild.id;
  let credit = 0;
  for (const uid of uidList) {
    const rec = findOwnedApartment(u, uid);
    const cur = rec ? getApartmentDef(rec.id) : undefined;
    if (!rec || !cur) return { ok: false, reply: "Этого жилья уже нет." };
    if (cur.origin !== defA.origin) return { ok: false, reply: "Обмен только в той же ветке (советское/заморское)." };
    const rate = apartmentTradeInRate(rec.purchasedAtMs, now);
    credit += Math.floor(inflatedCatalogApartmentPrice(gid, cur.id) * rate);
  }
  const full = inflatedCatalogApartmentPrice(gid, defA.id);
  const net = full - credit;
  if (net > 0 && u.rubles < net) return { ok: false, reply: shopShortageReply(u.rubles, net) };
  const drop = new Set(uidList);
  let applied = false;
  updateEconomyUser(member.guild.id, member.id, (curU) => {
    if (net > 0 && curU.rubles < net) return curU;
    if (uidList.some((uid) => !findOwnedApartment(curU, uid))) return curU;
    applied = true;
    return {
      ...curU,
      rubles: applyNet(curU.rubles, net),
      ownedApartments: [
        ...listOwnedApartments(curU).filter((a) => !drop.has(a.uid)),
        { uid: newAssetUid(), id: defA.id, purchasedAtMs: now },
      ],
    };
  });
  if (!applied) return { ok: false, reply: shopShortageReply(getEconomyUser(member.guild.id, member.id).rubles, Math.max(0, net)) };
  if (net > 0) remitShopPurchaseVatToTreasury(gid, net);
  return { ok: true, refund: 0 };
}

export function sellOwnedPhone(
  member: GuildMember,
  uid?: string,
): { ok: true; refund: number } | { ok: false; reply: string } {
  const u = getEconomyUser(member.guild.id, member.id);
  const rec = uid ? findOwnedPhone(u, uid) : listOwnedPhones(u)[0];
  const cur = rec ? getPhoneDef(rec.id) : undefined;
  if (!rec || !cur) return { ok: false, reply: "Нет **телефона** для продажи." };
  const refund = Math.floor(inflatedCatalogPhonePrice(member.guild.id, cur.id) * PHONE_SELL_REFUND_RATE);
  updateEconomyUser(member.guild.id, member.id, (curU) => ({
    ...curU,
    rubles: curU.rubles + refund,
    ownedPhones: listOwnedPhones(curU).filter((p) => p.uid !== rec.uid),
  }));
  return { ok: true, refund };
}

export function sellOwnedCar(
  member: GuildMember,
  uid?: string,
): { ok: true; refund: number } | { ok: false; reply: string } {
  const u = getEconomyUser(member.guild.id, member.id);
  const rec = uid ? findOwnedCar(u, uid) : listOwnedCars(u)[0];
  const cur = rec ? getCarDef(rec.id) : undefined;
  if (!rec || !cur) return { ok: false, reply: "Нет **авто** для продажи." };
  const refund = Math.floor(inflatedCatalogCarPrice(member.guild.id, cur.id) * CAR_SELL_REFUND_RATE);
  updateEconomyUser(member.guild.id, member.id, (curU) => {
    const old = findOwnedCar(curU, rec.uid);
    const unattached = [...listUnattachedPlates(curU)];
    const plate = old ? carPlateParts(old) : undefined;
    if (plate) unattached.push(plate);
    return {
      ...curU,
      rubles: curU.rubles + refund,
      ownedCars: listOwnedCars(curU).filter((c) => c.uid !== rec.uid),
      unattachedPlates: unattached,
    };
  });
  return { ok: true, refund };
}

export function sellOwnedApartment(
  member: GuildMember,
  uid: string,
): { ok: true; refund: number } | { ok: false; reply: string } {
  const u = getEconomyUser(member.guild.id, member.id);
  const rec = findOwnedApartment(u, uid);
  const cur = rec ? getApartmentDef(rec.id) : undefined;
  if (!rec || !cur) return { ok: false, reply: "Жильё не найдено." };
  const refund = Math.floor(inflatedCatalogApartmentPrice(member.guild.id, cur.id) * APARTMENT_SELL_REFUND_RATE);
  const remaining = listOwnedApartments(u).filter((a) => a.uid !== rec.uid);
  const rentOk =
    u.housingKind === "rent" && u.housingRentNextDueMs != null && Date.now() < u.housingRentNextDueMs;
  const stillHoused = remaining.some((a) => Boolean(getApartmentDef(a.id))) || rentOk;
  const quitJob = !stillHoused
    ? economyUserClearTier2PlusJobPatch({
        ...u,
        ownedApartments: remaining,
        ownedApartmentId: undefined,
        ownedForeignApartmentId: undefined,
        housingKind: "none",
        housingForeignKind: undefined,
      })
    : {};
  updateEconomyUser(member.guild.id, member.id, (curU) => ({
    ...curU,
    rubles: curU.rubles + refund,
    ownedApartments: listOwnedApartments(curU).filter((a) => a.uid !== rec.uid),
    ...quitJob,
  }));
  return { ok: true, refund };
}

export function sellSovietApartment(member: GuildMember): { ok: true; refund: number } | { ok: false; reply: string } {
  const rec = listOwnedApartmentsByOrigin(getEconomyUser(member.guild.id, member.id), "soviet")[0];
  if (!rec) return { ok: false, reply: "Продать можно только **советскую** квартиру." };
  return sellOwnedApartment(member, rec.uid);
}

export function sellForeignApartment(member: GuildMember): { ok: true; refund: number } | { ok: false; reply: string } {
  const rec = listOwnedApartmentsByOrigin(getEconomyUser(member.guild.id, member.id), "foreign")[0];
  if (!rec) return { ok: false, reply: "Нет **заморского** жилья." };
  return sellOwnedApartment(member, rec.uid);
}

export function syncVehiclePlatePrestige(_member: GuildMember): void {
  /* престиж пересчитывается в normalizeUser из прикреплённых номеров */
}

function mutateCarPlate(
  member: GuildMember,
  carUid: string,
  nextPlate: VehiclePlateParts,
  cost: number,
  action: string,
): { ok: true; plate: string; lastRoll: PlateShopLastRoll } | { ok: false; reply: string } {
  const u = getEconomyUser(member.guild.id, member.id);
  const car = findOwnedCar(u, carUid);
  if (!car) return { ok: false, reply: "Авто не найдено." };
  if (u.rubles < cost) return { ok: false, reply: shopShortageReply(u.rubles, cost) };
  const except = carPlateParts(car) ? vehiclePlateKey(carPlateParts(car)!) : undefined;
  const taken = guildTakenVehiclePlateKeys(member.guild.id, except);
  if (taken.has(vehiclePlateKey(nextPlate))) {
    return { ok: false, reply: "Такой госномер уже занят." };
  }
  const before = carPlateParts(car) ? computePlatePrestige(carPlateParts(car)!).total : 0;
  const breakdown = computePlatePrestige(nextPlate);
  let applied = false;
  updateEconomyUser(member.guild.id, member.id, (cur) => {
    if (cur.rubles < cost) return cur;
    if (!findOwnedCar(cur, carUid)) return cur;
    applied = true;
    return {
      ...cur,
      rubles: cur.rubles - cost,
      ownedCars: applyCarPlate(listOwnedCars(cur), carUid, nextPlate),
    };
  });
  if (!applied) return { ok: false, reply: shopShortageReply(getEconomyUser(member.guild.id, member.id).rubles, cost) };
  remitShopPurchaseVatToTreasury(member.guild.id, cost);
  const plate = formatVehiclePlate(nextPlate);
  const tips = buildPlateUpgradeTips(nextPlate, taken);
  return {
    ok: true,
    plate,
    lastRoll: plateLastRoll(action, plate, breakdown, breakdown.total - before, tips),
  };
}

export function registerVehiclePlateForCar(
  member: GuildMember,
  carUid: string,
): { ok: true; plate: string; lastRoll: PlateShopLastRoll } | { ok: false; reply: string } {
  const u = getEconomyUser(member.guild.id, member.id);
  if (!userHasAnyCar(u)) return { ok: false, reply: "Сначала купите **авто**." };
  const car = findOwnedCar(u, carUid);
  if (!car) return { ok: false, reply: "Авто не найдено." };
  if (carPlateParts(car)) return { ok: false, reply: "На этом авто госномер **уже есть**. Снимите его, чтобы оформить новый." };
  const cost = inflatedPlateShopPrice(member.guild.id, SHOP_PLATE_REGISTER_BASE_RUB);
  if (u.rubles < cost) return { ok: false, reply: shopShortageReply(u.rubles, cost) };
  const taken = guildTakenVehiclePlateKeys(member.guild.id);
  const parts = rollUniqueVehiclePlateParts(taken);
  return mutateCarPlate(member, carUid, parts, cost, "Оформлен госномер");
}

export function changeVehiclePlateDigitsForCar(
  member: GuildMember,
  carUid: string,
): { ok: true; plate: string; lastRoll: PlateShopLastRoll } | { ok: false; reply: string } {
  const car = findOwnedCar(getEconomyUser(member.guild.id, member.id), carUid);
  const cur = car ? carPlateParts(car) : undefined;
  if (!cur) return { ok: false, reply: "Сначала **оформите** или прикрепите госномер." };
  const cost = inflatedPlateShopPrice(member.guild.id, SHOP_PLATE_CHANGE_DIGITS_BASE_RUB);
  const except = vehiclePlateKey(cur);
  const taken = guildTakenVehiclePlateKeys(member.guild.id, except);
  const next = { ...cur, digits: rollUniqueVehiclePlateDigits(taken, { l1: cur.l1, l2: cur.l2, region: cur.region }) };
  return mutateCarPlate(member, carUid, next, cost, "Новые цифры");
}

export function changeVehiclePlateLettersForCar(
  member: GuildMember,
  carUid: string,
): { ok: true; plate: string; lastRoll: PlateShopLastRoll } | { ok: false; reply: string } {
  const car = findOwnedCar(getEconomyUser(member.guild.id, member.id), carUid);
  const cur = car ? carPlateParts(car) : undefined;
  if (!cur) return { ok: false, reply: "Сначала **оформите** или прикрепите госномер." };
  const cost = inflatedPlateShopPrice(member.guild.id, SHOP_PLATE_CHANGE_LETTERS_BASE_RUB);
  const except = vehiclePlateKey(cur);
  const taken = guildTakenVehiclePlateKeys(member.guild.id, except);
  const next = { ...cur, ...rollUniqueVehiclePlateLetters(taken, { digits: cur.digits, region: cur.region }) };
  return mutateCarPlate(member, carUid, next, cost, "Новые буквы");
}

export function changeVehiclePlateRegionForCar(
  member: GuildMember,
  carUid: string,
): { ok: true; plate: string; lastRoll: PlateShopLastRoll } | { ok: false; reply: string } {
  const car = findOwnedCar(getEconomyUser(member.guild.id, member.id), carUid);
  const cur = car ? carPlateParts(car) : undefined;
  if (!cur) return { ok: false, reply: "Сначала **оформите** или прикрепите госномер." };
  const cost = inflatedPlateShopPrice(member.guild.id, SHOP_PLATE_CHANGE_REGION_BASE_RUB);
  const except = vehiclePlateKey(cur);
  const taken = guildTakenVehiclePlateKeys(member.guild.id, except);
  const next = { ...cur, region: rollUniqueVehiclePlateRegion(taken, { l1: cur.l1, digits: cur.digits, l2: cur.l2 }) };
  return mutateCarPlate(member, carUid, next, cost, "Новый регион");
}

export function detachVehiclePlateFromCar(
  member: GuildMember,
  carUid: string,
): { ok: true; plate: string } | { ok: false; reply: string } {
  const u = getEconomyUser(member.guild.id, member.id);
  const car = findOwnedCar(u, carUid);
  const plate = car ? carPlateParts(car) : undefined;
  if (!car || !plate) return { ok: false, reply: "На этом авто нет госномера." };
  updateEconomyUser(member.guild.id, member.id, (cur) => {
    const old = findOwnedCar(cur, carUid);
    const p = old ? carPlateParts(old) : undefined;
    if (!p) return cur;
    return {
      ...cur,
      ownedCars: applyCarPlate(listOwnedCars(cur), carUid, undefined),
      unattachedPlates: [...listUnattachedPlates(cur), p],
    };
  });
  return { ok: true, plate: formatVehiclePlate(plate) };
}

export function attachVehiclePlateToCar(
  member: GuildMember,
  carUid: string,
  parts: VehiclePlateParts,
): { ok: true; plate: string } | { ok: false; reply: string } {
  const u = getEconomyUser(member.guild.id, member.id);
  const car = findOwnedCar(u, carUid);
  if (!car) return { ok: false, reply: "Авто не найдено." };
  if (carPlateParts(car)) return { ok: false, reply: "Сначала **снимите** текущий номер." };
  const key = vehiclePlateKey(parts);
  const have = listUnattachedPlates(u).some((p) => vehiclePlateKey(p) === key);
  if (!have) return { ok: false, reply: "Этого номера нет в неприкрепленных." };
  updateEconomyUser(member.guild.id, member.id, (cur) => {
    const old = findOwnedCar(cur, carUid);
    if (!old || carPlateParts(old)) return cur;
    const idx = listUnattachedPlates(cur).findIndex((p) => vehiclePlateKey(p) === key);
    if (idx < 0) return cur;
    const nextUn = [...listUnattachedPlates(cur)];
    nextUn.splice(idx, 1);
    return {
      ...cur,
      ownedCars: applyCarPlate(listOwnedCars(cur), carUid, parts),
      unattachedPlates: nextUn,
    };
  });
  return { ok: true, plate: formatVehiclePlate(parts) };
}

/** Совместимость со старыми вызовами панели: полная покупка. */
export function purchasePhone(member: GuildMember, pid: string): { ok: true } | { ok: false; reply: string } {
  return purchasePhoneFull(member, pid);
}

export function purchaseCar(member: GuildMember, cid: string): { ok: true } | { ok: false; reply: string } {
  return purchaseCarFull(member, cid);
}

export function purchaseApartment(member: GuildMember, aid: string): { ok: true; refund: number } | { ok: false; reply: string } {
  return purchaseApartmentFull(member, aid);
}

export function registerVehiclePlate(
  member: GuildMember,
): { ok: true; plate: string; lastRoll: PlateShopLastRoll } | { ok: false; reply: string } {
  const car = listOwnedCars(getEconomyUser(member.guild.id, member.id)).find((c) => !carPlateParts(c));
  if (!car) return { ok: false, reply: "Выберите авто без номера." };
  return registerVehiclePlateForCar(member, car.uid);
}

export function changeVehiclePlateDigits(member: GuildMember) {
  const car = listOwnedCars(getEconomyUser(member.guild.id, member.id)).find((c) => carPlateParts(c));
  if (!car) return { ok: false as const, reply: "Сначала **оформите** госномер." };
  return changeVehiclePlateDigitsForCar(member, car.uid);
}

export function changeVehiclePlateLetters(member: GuildMember) {
  const car = listOwnedCars(getEconomyUser(member.guild.id, member.id)).find((c) => carPlateParts(c));
  if (!car) return { ok: false as const, reply: "Сначала **оформите** госномер." };
  return changeVehiclePlateLettersForCar(member, car.uid);
}

export function changeVehiclePlateRegion(member: GuildMember) {
  const car = listOwnedCars(getEconomyUser(member.guild.id, member.id)).find((c) => carPlateParts(c));
  if (!car) return { ok: false as const, reply: "Сначала **оформите** госномер." };
  return changeVehiclePlateRegionForCar(member, car.uid);
}
