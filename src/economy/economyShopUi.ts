import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type ButtonInteraction,
  type GuildMember,
} from "discord.js";
import {
  APARTMENT_SELL_REFUND_RATE,
  APARTMENT_TRADE_IN_RATE,
  APARTMENT_TRADE_IN_RATE_AFTER_MONTH,
  CAR_SELL_REFUND_RATE,
  CAR_TRADE_IN_RATE,
  HOUSING_CALENDAR_MONTH_MS,
  MS_PER_DAY,
  PET_MODELS,
  PHONE_SELL_REFUND_RATE,
  PHONE_TRADE_IN_RATE,
  apartmentShopShortLabel,
  apartmentTradeInRate,
  apartmentsByOrigin,
  carsByOrigin,
  getApartmentDef,
  getCarDef,
  getPetDef,
  getPhoneDef,
  housingRentPlanPeriodMs,
  patchStatsFromShop,
  petOwnershipBlockReason,
  petRequirementsLine,
  phonesByOrigin,
  statDeltasOnReplace,
  type CatalogOrigin,
  type HousingRentPlan,
} from "./economyCatalog.js";
import {
  SHOP_CAR_PLATE_HINT_LINES,
  SHOP_PLATE_CHANGE_DIGITS_BASE_RUB,
  SHOP_PLATE_CHANGE_LETTERS_BASE_RUB,
  SHOP_PLATE_CHANGE_REGION_BASE_RUB,
  SHOP_PLATE_REGISTER_BASE_RUB,
  formatVehiclePlate,
  formatVehiclePlateFromUser,
  type VehiclePlateParts,
} from "./economyLicensePlate.js";
import {
  computePlatePrestige,
  platePrestigeRulesTableLines,
  formatPlateRollEmbedFooter,
  PLATE_SHOP_PRESTIGE_HINT_LINES,
  type PlateShopLastRoll,
} from "./economyPlatePrestige.js";
import {
  SHOP_SIM_CHANGE_LAST_BASE_RUB,
  SHOP_SIM_CHANGE_MID_BASE_RUB,
  SHOP_SIM_CHANGE_OPERATOR_BASE_RUB,
  SHOP_SIM_REGISTER_BASE_RUB,
  SHOP_SIM_START_BALANCE_RUB,
  formatSimNumber,
  formatSimNumberFromUser,
  parseSimNumberParts,
  rollUniqueSimLast,
  rollUniqueSimMid,
  rollUniqueSimNumberParts,
  rollUniqueSimOperator,
  simNumberKey,
  simNumberPartsToPatch,
  userHasSimNumber,
  type SimNumberParts,
} from "./economySimNumber.js";
import {
  computeSimPrestige,
  simPrestigeRulesTableLines,
  formatSimRollEmbedFooter,
  SIM_SHOP_PRESTIGE_HINT_LINES,
  type SimShopLastRoll,
} from "./economySimPrestige.js";
import { housingRentUnusedRefundRub } from "./economyHousing.js";
import {
  carPlateParts,
  encodePlateKey,
  findOwnedApartment,
  findOwnedCar,
  findOwnedPet,
  findOwnedPhone,
  formatCarWithPlateLine,
  formatOwnedPetLine,
  listAttachedPlates,
  listOwnedApartmentsByOrigin,
  listOwnedCars,
  listOwnedCarsByOrigin,
  listOwnedPets,
  listOwnedPhones,
  listOwnedPhonesByOrigin,
  listUnattachedPlates,
  newAssetUid,
  sanitizePetName,
  shortCarLabel,
  shortPetButtonLabel,
  userCanOpenPlateShop,
  userOwnsPetType,
} from "./economyAssets.js";
import {
  inflatedApartmentUtilityRub,
  inflatedCatalogApartmentPrice,
  inflatedCatalogCarPrice,
  inflatedCatalogPhonePrice,
  inflatedHousingRentPrice,
  scaledEconomyExpense,
  scaledEconomyPsIncome,
  scaledShopPrice,
} from "./economyMacro.js";
import { remitShopPurchaseVatToTreasury } from "./taxTreasury.js";
import { getEconomyUser, listEconomyUsers, patchEconomyUser, updateEconomyUser, type EconomyUser } from "./userStore.js";
import { selectedShopTradeUids } from "./shopTradeDraft.js";
export {
  attachVehiclePlateToCar,
  changeVehiclePlateDigits,
  changeVehiclePlateDigitsForCar,
  changeVehiclePlateLetters,
  changeVehiclePlateLettersForCar,
  changeVehiclePlateRegion,
  changeVehiclePlateRegionForCar,
  detachVehiclePlateFromCar,
  purchaseApartment,
  purchaseApartmentFull,
  purchaseApartmentTrade,
  purchaseCar,
  purchaseCarFull,
  purchaseCarTrade,
  purchasePhone,
  purchasePhoneFull,
  purchasePhoneTrade,
  registerVehiclePlate,
  registerVehiclePlateForCar,
  sellForeignApartment,
  sellOwnedApartment,
  sellOwnedCar,
  sellOwnedPhone,
  sellSovietApartment,
  syncVehiclePlatePrestige,
} from "./economyShopActions.js";

const PANEL_COLOR = 0x2b2d31;

/** То же, что `ECON_BUTTON_MENU` в `panel.ts`. */
export const ECON_BUTTON_MENU = "econ:menu";

/** Нижний ряд: «Назад» и «Главное меню» рядом (всегда последний ряд). */
export function shopNavBottomRow(backId: string, backLabel = "Назад"): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(backId).setLabel(backLabel).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(ECON_BUTTON_MENU).setLabel("Главное меню").setStyle(ButtonStyle.Secondary),
  );
}

export function buildShopNoticeEmbed(title: string, body: string): EmbedBuilder {
  return new EmbedBuilder().setColor(PANEL_COLOR).setTitle(title).setDescription(body);
}

export function withShopNote(embed: EmbedBuilder, note?: string): EmbedBuilder {
  if (!note) return embed;
  const d = embed.data.description ?? "";
  return EmbedBuilder.from(embed).setDescription(`${note}\n\n${d}`);
}

function shopShortageLine(have: number, need: number): string | undefined {
  if (have >= need) return undefined;
  return `Не хватает **${fmt(need - have)}** ₽ (на счёте **${fmt(have)}**, к оплате **${fmt(need)}**).`;
}

function tradeConfirmLabel(net: number, selectedCount: number): string {
  if (selectedCount === 0) return "Подтвердить обмен";
  if (net > 0) return `Подтвердить · оплата ${fmt(net)} ₽`;
  if (net < 0) return `Подтвердить · возврат ${fmt(-net)} ₽`;
  return "Подтвердить · без доплаты";
}

function shopDetailsNavBottomRow(
  detailsId: string,
  backId: string,
  backLabel = "Назад",
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(detailsId).setLabel("Условия").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(backId).setLabel(backLabel).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(ECON_BUTTON_MENU).setLabel("Главное меню").setStyle(ButtonStyle.Secondary),
  );
}

export const ECON_SHOP_HUB = "econ:shop:hub";
export const ECON_SHOP_PHONE = "econ:shop:phone";
export const ECON_SHOP_PHONE_ORIGIN_PREFIX = "econ:shop:phone:";
export const ECON_SHOP_PHONE_BUY_PREFIX = "econ:shop:phoneBuy:";
export const ECON_SHOP_PHONE_FULL_PREFIX = "econ:shop:phoneFull:";
export const ECON_SHOP_PHONE_TRADE_PREFIX = "econ:shop:phoneTr:";
export const ECON_SHOP_PHONE_TRADE_OK_PREFIX = "econ:shop:phoneTrOk:";
export const ECON_SHOP_PHONE_TRADE_TG_PREFIX = "econ:shop:phoneTrTg:";
export const ECON_SHOP_PHONE_TRADE_GO_PREFIX = "econ:shop:phoneTrGo:";
export const ECON_SHOP_PHONE_BUY_CONFIRM_PREFIX = "econ:shop:phoneBuyOk:";
export const ECON_SHOP_PHONE_BUY_CANCEL_PREFIX = "econ:shop:phoneBuyCan:";
export const ECON_SHOP_PHONE_SELL = "econ:shop:phone:sell";
export const ECON_SHOP_PHONE_SELL_UID_PREFIX = "econ:shop:phoneSellU:";
export const ECON_SHOP_PHONE_SELL_OK_PREFIX = "econ:shop:phoneSellY:";
export const ECON_SHOP_PHONE_SELL_CONFIRM = "econ:shop:phone:sell:ok";
export const ECON_SHOP_PHONE_SELL_CANCEL = "econ:shop:phone:sell:cancel";
export const ECON_SHOP_PHONE_DETAILS_PREFIX = "econ:shop:phoneCatalog:";
export const ECON_SHOP_CAR = "econ:shop:car";
export const ECON_SHOP_CAR_ORIGIN_PREFIX = "econ:shop:car:";
export const ECON_SHOP_CAR_BUY_PREFIX = "econ:shop:carBuy:";
export const ECON_SHOP_CAR_FULL_PREFIX = "econ:shop:carFull:";
export const ECON_SHOP_CAR_TRADE_PREFIX = "econ:shop:carTr:";
export const ECON_SHOP_CAR_TRADE_OK_PREFIX = "econ:shop:carTrOk:";
export const ECON_SHOP_CAR_TRADE_TG_PREFIX = "econ:shop:carTrTg:";
export const ECON_SHOP_CAR_TRADE_GO_PREFIX = "econ:shop:carTrGo:";
export const ECON_SHOP_CAR_BUY_CONFIRM_PREFIX = "econ:shop:carBuyOk:";
export const ECON_SHOP_CAR_BUY_CANCEL_PREFIX = "econ:shop:carBuyCan:";
export const ECON_SHOP_CAR_DETAILS_PREFIX = "econ:shop:carCatalog:";
export const ECON_SHOP_PLATE = "econ:shop:plate";
export const ECON_SHOP_PLATE_REGISTER = "econ:shop:plate:reg";
export const ECON_SHOP_PLATE_DIGITS = "econ:shop:plate:dig";
export const ECON_SHOP_PLATE_LETTERS = "econ:shop:plate:let";
export const ECON_SHOP_PLATE_REGION = "econ:shop:plate:regio";
export const ECON_SHOP_PLATE_DETAILS = "econ:shop:plate:details";
export const ECON_SHOP_PLATE_CAR_PREFIX = "econ:shop:plateCar:";
export const ECON_SHOP_PLATE_DIG_PREFIX = "econ:shop:plateDig:";
export const ECON_SHOP_PLATE_LET_PREFIX = "econ:shop:plateLet:";
export const ECON_SHOP_PLATE_RGN_PREFIX = "econ:shop:plateRgn:";
export const ECON_SHOP_PLATE_NEW_PREFIX = "econ:shop:plateNew:";
export const ECON_SHOP_PLATE_DET_PREFIX = "econ:shop:plateDet:";
export const ECON_SHOP_PLATE_DET_OK_PREFIX = "econ:shop:plateDetY:";
export const ECON_SHOP_PLATE_ATT_PREFIX = "econ:shop:plateAtt:";
export const ECON_SHOP_PLATE_ATT_PICK_PREFIX = "econ:shop:plateAtP:";
export const ECON_SHOP_PLATE_ATT_OK_PREFIX = "econ:shop:plateAtY:";
export const ECON_SHOP_CAR_SELL = "econ:shop:car:sell";
export const ECON_SHOP_CAR_SELL_UID_PREFIX = "econ:shop:carSellU:";
export const ECON_SHOP_CAR_SELL_OK_PREFIX = "econ:shop:carSellY:";
export const ECON_SHOP_CAR_SELL_CONFIRM = "econ:shop:car:sell:ok";
export const ECON_SHOP_CAR_SELL_CANCEL = "econ:shop:car:sell:cancel";
export const ECON_SHOP_HOUSE = "econ:shop:house";
export const ECON_SHOP_HOUSE_ORIGIN_PREFIX = "econ:shop:house:";
export const ECON_SHOP_HOUSE_DETAILS_PREFIX = "econ:shop:houseCatalog:";
/** Меню аренды (не путать с `econ:shop:house:rent:1d` и т.д.). */
export const ECON_SHOP_HOUSE_RENT_MENU = "econ:shop:house:rentMenu";
export const ECON_SHOP_HOUSE_RENT_1D = "econ:shop:house:rent:1d";
export const ECON_SHOP_HOUSE_RENT_7D = "econ:shop:house:rent:7d";
export const ECON_SHOP_HOUSE_RENT_30D = "econ:shop:house:rent:30d";
export const ECON_SHOP_HOUSE_LEAVE = "econ:shop:house:leave";
export const ECON_SHOP_APT_BUY_PREFIX = "econ:shop:aptBuy:";
export const ECON_SHOP_APT_FULL_PREFIX = "econ:shop:aptFull:";
export const ECON_SHOP_APT_TRADE_PREFIX = "econ:shop:aptTr:";
export const ECON_SHOP_APT_TRADE_OK_PREFIX = "econ:shop:aptTrOk:";
export const ECON_SHOP_APT_TRADE_TG_PREFIX = "econ:shop:aptTrTg:";
export const ECON_SHOP_APT_TRADE_GO_PREFIX = "econ:shop:aptTrGo:";
export const ECON_SHOP_APT_BUY_CONFIRM_PREFIX = "econ:shop:aptBuyOk:";
export const ECON_SHOP_APT_BUY_CANCEL_PREFIX = "econ:shop:aptBuyCan:";
export const ECON_SHOP_APT_SELL_SOVIET = "econ:shop:apt:sell:sov";
export const ECON_SHOP_APT_SELL_UID_PREFIX = "econ:shop:aptSellU:";
export const ECON_SHOP_APT_SELL_OK_PREFIX = "econ:shop:aptSellY:";
export const ECON_SHOP_APT_SELL_SOVIET_CONFIRM = "econ:shop:apt:sell:sov:ok";
export const ECON_SHOP_APT_SELL_SOVIET_CANCEL = "econ:shop:apt:sell:sov:cancel";
export const ECON_SHOP_APT_SELL_FOREIGN = "econ:shop:apt:sell:for";
export const ECON_SHOP_APT_SELL_FOREIGN_CONFIRM = "econ:shop:apt:sell:for:ok";
export const ECON_SHOP_APT_SELL_FOREIGN_CANCEL = "econ:shop:apt:sell:for:cancel";
export const ECON_SHOP_ANIMALS = "econ:shop:animals";
export const ECON_SHOP_ANIMALS_BUY = "econ:shop:animals:buy";
export const ECON_SHOP_ANIMALS_OWNED = "econ:shop:animals:mine";
export const ECON_SHOP_ANIMALS_DETAILS = "econ:shop:animalsCatalog";
export const ECON_SHOP_PET_BUY_PREFIX = "econ:shop:petBuy:";
export const ECON_SHOP_PET_VIEW_PREFIX = "econ:shop:petView:";
export const ECON_SHOP_PET_RENAME_PREFIX = "econ:shop:petRen:";
export const ECON_MODAL_PET_RENAME_PREFIX = "modal:econ:petName:";

function fmt(n: number): string {
  return n.toLocaleString("ru-RU");
}

function originTitle(o: CatalogOrigin): string {
  return o === "soviet" ? "Советское" : "Заморское";
}

function signedStat(n: number): string {
  if (n > 0) return `+${fmt(n)}`;
  if (n < 0) return `−${fmt(Math.abs(n))}`;
  return "0";
}

function statChangeLabel(
  cur: { origin: CatalogOrigin; prestigeDelta: number; domesticDelta: number } | undefined,
  next: { origin: CatalogOrigin; prestigeDelta: number; domesticDelta: number },
): string {
  const delta = statDeltasOnReplace(cur, next);
  const parts: string[] = [];
  if (delta.domesticDelta !== 0) parts.push(`${signedStat(delta.domesticDelta)} быта`);
  if (delta.prestigeDelta !== 0) parts.push(`${signedStat(delta.prestigeDelta)} престижа`);
  return parts.join(" · ") || "без изменения статов";
}

function tradeInPctLabel(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

/** Пояснение зачёта при обмене своей вещи. На кнопках каталога всегда полная цена. */
function shopUpgradeTradeInLine(rate: number): string {
  return `Апгрейд: зачёт **${tradeInPctLabel(rate)}** цены текущего.`;
}

function shopPlainSellLine(rate: number): string {
  return `Продажа: **${tradeInPctLabel(rate)}** каталога.`;
}

function shopApartmentTradeInLines(): string[] {
  return [
    `Переезд: зачёт **${tradeInPctLabel(APARTMENT_TRADE_IN_RATE)}**–**${tradeInPctLabel(APARTMENT_TRADE_IN_RATE_AFTER_MONTH)}**.`,
  ];
}

function housingOwnedDays(purchasedAtMs: number | undefined, nowMs: number = Date.now()): number | undefined {
  if (purchasedAtMs == null || !Number.isFinite(purchasedAtMs) || purchasedAtMs <= 0) return undefined;
  return Math.max(0, Math.floor((nowMs - purchasedAtMs) / MS_PER_DAY));
}

/** Сколько суток уже владеете квартирой (для зачёта после 30 сут). */
function housingOwnedDaysLabel(purchasedAtMs: number | undefined, nowMs: number = Date.now()): string | undefined {
  const days = housingOwnedDays(purchasedAtMs, nowMs);
  if (days == null) return undefined;
  return `${days} сут`;
}

const SHOP_BRANCH_NONE = "**нет**";

function catalogStatGainLabel(item: { prestigeDelta: number; domesticDelta: number }): string {
  const parts: string[] = [];
  if (item.domesticDelta > 0) parts.push(`+${fmt(item.domesticDelta)} быта`);
  if (item.prestigeDelta > 0) parts.push(`+${fmt(item.prestigeDelta)} престижа`);
  if (item.domesticDelta < 0) parts.push(`${signedStat(item.domesticDelta)} быта`);
  if (item.prestigeDelta < 0) parts.push(`${signedStat(item.prestigeDelta)} престижа`);
  return parts.join(" · ") || "без статов";
}

function netSpendLabel(net: number): string {
  if (net > 0) return `спишется **${fmt(net)}** ₽`;
  if (net < 0) return `вернётся **${fmt(-net)}** ₽`;
  return "без доплаты";
}

function canAffordNet(rubles: number, net: number): boolean {
  return net <= 0 || rubles >= net;
}

function canAffordAnyTrade(rubles: number, nets: number[]): boolean {
  return nets.some((n) => canAffordNet(rubles, n));
}

function phoneTradeNets(gid: string, full: number, owned: ReturnType<typeof listOwnedPhonesByOrigin>): number[] {
  const nets: number[] = [];
  for (const rec of owned) {
    const cur = getPhoneDef(rec.id);
    if (!cur) continue;
    nets.push(full - Math.floor(inflatedCatalogPhonePrice(gid, cur.id) * PHONE_TRADE_IN_RATE));
  }
  return nets;
}

function carTradeNets(gid: string, full: number, owned: ReturnType<typeof listOwnedCarsByOrigin>): number[] {
  const nets: number[] = [];
  for (const rec of owned) {
    const cur = getCarDef(rec.id);
    if (!cur) continue;
    nets.push(full - Math.floor(inflatedCatalogCarPrice(gid, cur.id) * CAR_TRADE_IN_RATE));
  }
  return nets;
}

function aptTradeNets(
  gid: string,
  full: number,
  owned: ReturnType<typeof listOwnedApartmentsByOrigin>,
  now: number = Date.now(),
): number[] {
  const nets: number[] = [];
  for (const rec of owned) {
    const cur = getApartmentDef(rec.id);
    if (!cur) continue;
    const rate = apartmentTradeInRate(rec.purchasedAtMs, now);
    nets.push(full - Math.floor(inflatedCatalogApartmentPrice(gid, cur.id) * rate));
  }
  return nets;
}

function formatOwnedList(
  items: string[],
  fallback: string = SHOP_BRANCH_NONE,
): string {
  if (items.length === 0) return fallback;
  return items.map((s) => `**${s}**`).join(", ");
}

function shopBranchOwnershipBlock(u: EconomyUser, kind: "phone" | "car" | "house"): string[] {
  if (kind === "phone") {
    const sov = listOwnedPhonesByOrigin(u, "soviet").map((p) => getPhoneDef(p.id)?.label ?? p.id);
    const frn = listOwnedPhonesByOrigin(u, "foreign").map((p) => getPhoneDef(p.id)?.label ?? p.id);
    return ["**У вас:**", `• **Советское:** ${formatOwnedList(sov)}`, `• **Заморское:** ${formatOwnedList(frn)}`];
  }
  if (kind === "car") {
    const sov = listOwnedCarsByOrigin(u, "soviet");
    const frn = listOwnedCarsByOrigin(u, "foreign");
    const unattached = listUnattachedPlates(u);
    return [
      "**У вас:**",
      `• **Советское:** ${sov.length ? sov.map((c) => formatCarWithPlateLine(c)).join("; ") : SHOP_BRANCH_NONE}`,
      `• **Заморское:** ${frn.length ? frn.map((c) => formatCarWithPlateLine(c)).join("; ") : SHOP_BRANCH_NONE}`,
      `• **Неприкрепленные номера:** ${
        unattached.length ? unattached.map((p) => `**${formatVehiclePlate(p)}**`).join(", ") : SHOP_BRANCH_NONE
      }`,
    ];
  }
  const now = Date.now();
  const hk = u.housingKind ?? "none";
  const sovApts = listOwnedApartmentsByOrigin(u, "soviet").map((a) => {
    const label = getApartmentDef(a.id)?.label ?? a.id;
    const owned = housingOwnedDaysLabel(a.purchasedAtMs, now);
    return owned ? `${label} (${owned})` : label;
  });
  const frnApts = listOwnedApartmentsByOrigin(u, "foreign").map((a) => {
    const label = getApartmentDef(a.id)?.label ?? a.id;
    const owned = housingOwnedDaysLabel(a.purchasedAtMs, now);
    return owned ? `${label} (${owned})` : label;
  });
  let soviet = formatOwnedList(sovApts);
  if (sovApts.length === 0 && hk === "rent" && u.housingRentNextDueMs) {
    soviet = `аренда до <t:${Math.floor(u.housingRentNextDueMs / 1000)}:R>`;
  }
  return ["**У вас:**", `• **Советское:** ${soviet}`, `• **Заморское:** ${formatOwnedList(frnApts)}`];
}

export function shopItemButtonLabel(short: string, cost: number): string {
  const s = short.length > 18 ? `${short.slice(0, 16)}…` : short;
  return `${s} · ${fmt(cost)} ₽`;
}

export function buildShopHubEmbed(member: GuildMember): EmbedBuilder {
  const u = getEconomyUser(member.guild.id, member.id);
  return new EmbedBuilder()
    .setColor(PANEL_COLOR)
    .setTitle("Магазин")
    .setDescription(
      [
        `Баланс: **${fmt(u.rubles)}** ₽`,
        `Престиж: **${fmt(u.prestigePoints ?? 0)}** · Быт: **${fmt(u.domesticPoints ?? 0)}**`,
        "",
        "**Советское** = быт, **Заморское** = престиж.",
        "Подробные условия зачёта и продажи — внутри каждого раздела.",
      ].join("\n"),
    );
}

export const ECON_SHOP_SIM = "econ:shop:sim";
export const ECON_SHOP_SIM_REGISTER = "econ:shop:sim:reg";
export const ECON_SHOP_SIM_CHANGE = "econ:shop:sim:change";
export const ECON_SHOP_SIM_OPERATOR = "econ:shop:sim:op";
export const ECON_SHOP_SIM_MID = "econ:shop:sim:mid";
export const ECON_SHOP_SIM_LAST = "econ:shop:sim:last";
export const ECON_SHOP_SIM_TOPUP_OPEN = "econ:shop:sim:topupOpen";
export const ECON_SHOP_SIM_DETAILS = "econ:shop:sim:details";
export const ECON_SHOP_LOTTERY = "econ:shop:lottery";
export const ECON_SHOP_APPEARANCE = "econ:shop:appearance";

export function buildShopHubRows(member: GuildMember): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(ECON_SHOP_PHONE).setLabel("Телефон").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(ECON_SHOP_CAR).setLabel("Авто").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(ECON_SHOP_HOUSE).setLabel("Жильё").setStyle(ButtonStyle.Secondary),
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(ECON_SHOP_ANIMALS).setLabel("Животные").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(ECON_SHOP_LOTTERY).setLabel("Лотерея").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(ECON_SHOP_APPEARANCE).setLabel("Оформление").setStyle(ButtonStyle.Secondary),
    ),
    shopNavBottomRow(ECON_BUTTON_MENU),
  ];
}

export function buildShopOriginPickEmbed(
  title: string,
  member: GuildMember,
  kind: "phone" | "car",
): EmbedBuilder {
  const u = getEconomyUser(member.guild.id, member.id);
  const lines = [`Баланс: **${fmt(u.rubles)}** ₽`, "", ...shopBranchOwnershipBlock(u, kind)];
  if (kind === "car") {
    lines.push("", ...SHOP_CAR_PLATE_HINT_LINES);
  }
  return new EmbedBuilder().setColor(PANEL_COLOR).setTitle(title).setDescription(lines.join("\n"));
}

export function buildShopOriginPickRows(
  member: GuildMember,
  kind: "phone" | "car",
  backId: string,
): ActionRowBuilder<ButtonBuilder>[] {
  const prefix = kind === "phone" ? ECON_SHOP_PHONE_ORIGIN_PREFIX : ECON_SHOP_CAR_ORIGIN_PREFIX;
  const rows: ActionRowBuilder<ButtonBuilder>[] = [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`${prefix}soviet`).setLabel("Советское").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`${prefix}foreign`).setLabel("Заморское").setStyle(ButtonStyle.Secondary),
    ),
  ];
  if (kind === "phone") {
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(ECON_SHOP_SIM).setLabel("Сим-карта").setStyle(ButtonStyle.Secondary),
      ),
    );
  }
  if (kind === "car") {
    const u = getEconomyUser(member.guild.id, member.id);
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(ECON_SHOP_PLATE)
          .setLabel("Госномер")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(!userCanOpenPlateShop(u)),
      ),
    );
  }
  rows.push(shopNavBottomRow(backId));
  return rows;
}

function inflatedPlateShopPrice(guildId: string, baseRub: number): number {
  return scaledShopPrice(guildId, baseRub);
}

export function buildShopPlateEmbed(member: GuildMember, lastRoll?: PlateShopLastRoll): EmbedBuilder {
  const u = getEconomyUser(member.guild.id, member.id);
  const cars = listOwnedCars(u);
  const unattached = listUnattachedPlates(u);
  const lines = [
    `Баланс: **${fmt(u.rubles)}** ₽`,
    "",
    "**Ваши авто:**",
    cars.length ? cars.map((c) => `• ${formatCarWithPlateLine(c)}`).join("\n") : "• нет",
    "",
    "**Неприкрепленные:**",
    unattached.length ? unattached.map((p) => `• **${formatVehiclePlate(p)}**`).join("\n") : "• нет",
    "",
    "Неприкрепленные номера престижа **не** дают. Престиж = серия + цифры + регион + визуал + множители сочетаний.",
  ];
  if (!lastRoll) {
    lines.push("", ...PLATE_SHOP_PRESTIGE_HINT_LINES);
  }
  const attachedPrestige = (u.vehiclePlatePrestige ?? 0);
  if (attachedPrestige > 0) lines.push(`Престиж с авто: **${fmt(attachedPrestige)}**`);
  if (lastRoll) lines.push(...formatPlateRollEmbedFooter(lastRoll));
  return new EmbedBuilder().setColor(PANEL_COLOR).setTitle("Госномер").setDescription(lines.join("\n"));
}

export function buildShopPlateDetailsEmbed(member: GuildMember): EmbedBuilder {
  const u = getEconomyUser(member.guild.id, member.id);
  const attached = listAttachedPlates(u);
  const unattached = listUnattachedPlates(u);
  const lines = [...platePrestigeRulesTableLines()];
  if (attached.length > 0) {
    lines.push("", "**Прикрепленные (дают престиж):**");
    for (const p of attached) {
      lines.push(`• **${formatVehiclePlate(p)}** — **${fmt(computePlatePrestige(p).total)}** престижа`);
    }
  }
  if (unattached.length > 0) {
    lines.push("", "**Неприкрепленные (престижа нет):**");
    for (const p of unattached) {
      lines.push(`• **${formatVehiclePlate(p)}**`);
    }
  }
  return new EmbedBuilder().setColor(PANEL_COLOR).setTitle("Госномер · условия").setDescription(lines.join("\n"));
}

export function buildShopPlateRows(member: GuildMember): ActionRowBuilder<ButtonBuilder>[] {
  const u = getEconomyUser(member.guild.id, member.id);
  const cars = listOwnedCars(u).filter((c) => Boolean(getCarDef(c.id)));
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let i = 0; i < Math.min(cars.length, 12); i += 4) {
    const slice = cars.slice(i, i + 4);
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        ...slice.map((c) =>
          new ButtonBuilder()
            .setCustomId(`${ECON_SHOP_PLATE_CAR_PREFIX}${c.uid}`)
            .setLabel(shortCarLabel(c))
            .setStyle(ButtonStyle.Secondary),
        ),
      ),
    );
  }
  rows.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(ECON_SHOP_PLATE_DETAILS).setLabel("Условия").setStyle(ButtonStyle.Secondary),
    ),
  );
  rows.push(shopNavBottomRow(ECON_SHOP_CAR));
  return rows;
}

export function buildShopPlateCarEmbed(member: GuildMember, carUid: string, lastRoll?: PlateShopLastRoll): EmbedBuilder | undefined {
  const u = getEconomyUser(member.guild.id, member.id);
  const car = findOwnedCar(u, carUid);
  if (!car) return undefined;
  const plate = carPlateParts(car);
  const platePrestige = plate ? computePlatePrestige(plate) : undefined;
  const lines = [
    `Баланс: **${fmt(u.rubles)}** ₽`,
    `Авто: ${formatCarWithPlateLine(car)}`,
    plate ? `Госномер: **${formatVehiclePlate(plate)}**` : "Госномер: **нет** (можно оформить или прикрепить из запаса).",
  ];
  if (platePrestige) lines.push(`Престиж этого номера: **${fmt(platePrestige.total)}**`);
  if (!lastRoll) lines.push("", ...PLATE_SHOP_PRESTIGE_HINT_LINES);
  if (lastRoll) lines.push(...formatPlateRollEmbedFooter(lastRoll));
  return new EmbedBuilder().setColor(PANEL_COLOR).setTitle("Госномер · авто").setDescription(lines.join("\n"));
}

export function buildShopPlateCarRows(member: GuildMember, carUid: string): ActionRowBuilder<ButtonBuilder>[] {
  const u = getEconomyUser(member.guild.id, member.id);
  const gid = member.guild.id;
  const car = findOwnedCar(u, carUid);
  const hasPlate = Boolean(car && carPlateParts(car));
  const unattached = listUnattachedPlates(u);
  const digCost = inflatedPlateShopPrice(gid, SHOP_PLATE_CHANGE_DIGITS_BASE_RUB);
  const letCost = inflatedPlateShopPrice(gid, SHOP_PLATE_CHANGE_LETTERS_BASE_RUB);
  const regioCost = inflatedPlateShopPrice(gid, SHOP_PLATE_CHANGE_REGION_BASE_RUB);
  const regCost = inflatedPlateShopPrice(gid, SHOP_PLATE_REGISTER_BASE_RUB);

  const changeRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${ECON_SHOP_PLATE_DIG_PREFIX}${carUid}`)
      .setLabel(`Цифры · ${fmt(digCost)} ₽`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!hasPlate || u.rubles < digCost),
    new ButtonBuilder()
      .setCustomId(`${ECON_SHOP_PLATE_LET_PREFIX}${carUid}`)
      .setLabel(`Буквы · ${fmt(letCost)} ₽`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!hasPlate || u.rubles < letCost),
    new ButtonBuilder()
      .setCustomId(`${ECON_SHOP_PLATE_RGN_PREFIX}${carUid}`)
      .setLabel(`Регион · ${fmt(regioCost)} ₽`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!hasPlate || u.rubles < regioCost),
  );

  const actionRow = new ActionRowBuilder<ButtonBuilder>();
  if (hasPlate) {
    actionRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`${ECON_SHOP_PLATE_DET_PREFIX}${carUid}`)
        .setLabel("Снять номер")
        .setStyle(ButtonStyle.Danger),
    );
  } else {
    actionRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`${ECON_SHOP_PLATE_NEW_PREFIX}${carUid}`)
        .setLabel(`Оформить · ${fmt(regCost)} ₽`)
        .setStyle(ButtonStyle.Success)
        .setDisabled(u.rubles < regCost),
      new ButtonBuilder()
        .setCustomId(`${ECON_SHOP_PLATE_ATT_PREFIX}${carUid}`)
        .setLabel("Прикрепить номер")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(unattached.length === 0),
    );
  }

  return [
    changeRow,
    actionRow,
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(ECON_SHOP_PLATE_DETAILS).setLabel("Условия").setStyle(ButtonStyle.Secondary),
    ),
    shopNavBottomRow(ECON_SHOP_PLATE),
  ];
}

export function buildShopCarSellConfirmEmbed(member: GuildMember, uid?: string): EmbedBuilder {
  const u = getEconomyUser(member.guild.id, member.id);
  const rec = uid ? findOwnedCar(u, uid) : listOwnedCars(u)[0];
  const cur = rec ? getCarDef(rec.id) : getCarDef(u.ownedCarId);
  const refund = cur
    ? Math.floor(inflatedCatalogCarPrice(member.guild.id, cur.id) * CAR_SELL_REFUND_RATE)
    : 0;
  const plate = rec ? carPlateParts(rec) : undefined;
  const lines = [
    `Продать **${cur?.label ?? "авто"}**?`,
    `Вернётся **${fmt(refund)}** ₽ (**${tradeInPctLabel(CAR_SELL_REFUND_RATE)}** каталожной цены).`,
    "",
    "Это **продажа**, не замена на лучшее — авто исчезнет с профиля.",
  ];
  if (plate) {
    lines.push(
      "",
      `Госномер **${formatVehiclePlate(plate)}** уйдёт в неприкрепленные (престиж номера не действует, пока снова не будет на авто).`,
    );
  }
  return new EmbedBuilder().setColor(PANEL_COLOR).setTitle("Подтверждение продажи").setDescription(lines.join("\n"));
}

export function buildShopCarSellConfirmRows(uid?: string): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(uid ? `${ECON_SHOP_CAR_SELL_OK_PREFIX}${uid}` : ECON_SHOP_CAR_SELL_CONFIRM)
        .setLabel("Продать")
        .setStyle(ButtonStyle.Danger),
    ),
    shopNavBottomRow(uid ? ECON_SHOP_CAR_SELL : ECON_SHOP_CAR_SELL_CANCEL, "Отменить"),
  ];
}

function buildShopConfirmRows(
  confirmId: string,
  confirmLabel: string,
  confirmStyle: ButtonStyle.Success | ButtonStyle.Danger,
  cancelBackId: string,
): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(confirmId).setLabel(confirmLabel).setStyle(confirmStyle),
    ),
    shopNavBottomRow(cancelBackId, "Отменить"),
  ];
}

export function buildShopPhoneBuyConfirmEmbed(member: GuildMember, pid: string): EmbedBuilder | undefined {
  const defP = getPhoneDef(pid);
  if (!defP) return undefined;
  const u = getEconomyUser(member.guild.id, member.id);
  const gid = member.guild.id;
  const full = inflatedCatalogPhonePrice(gid, defP.id);
  const owned = listOwnedPhonesByOrigin(u, defP.origin);
  const lines = [
    `**${defP.label}**`,
    `Полная цена: **${fmt(full)}** ₽ — ${netSpendLabel(full)} · статы: **${catalogStatGainLabel(defP)}**`,
  ];
  if (owned.length === 0) {
    lines.push("", "Обменять пока **нечего** — можно только купить за полную стоимость.");
  } else {
    lines.push("", `Обмен своей (зачёт **${tradeInPctLabel(PHONE_TRADE_IN_RATE)}**): можно сдать **несколько** телефонов, зачёт суммируется.`);
    for (const rec of owned) {
      const cur = getPhoneDef(rec.id);
      if (!cur) continue;
      const credit = Math.floor(inflatedCatalogPhonePrice(gid, cur.id) * PHONE_TRADE_IN_RATE);
      const net = full - credit;
      lines.push(`• **${cur.label}**: ${netSpendLabel(net)} · ${statChangeLabel(cur, defP)}`);
    }
  }
  const lack = shopShortageLine(u.rubles, full);
  if (lack) lines.push("", lack);
  return new EmbedBuilder().setColor(PANEL_COLOR).setTitle("Покупка телефона").setDescription(lines.join("\n"));
}

export function buildShopPhoneBuyConfirmRows(member: GuildMember, pid: string, origin: CatalogOrigin): ActionRowBuilder<ButtonBuilder>[] {
  const u = getEconomyUser(member.guild.id, member.id);
  const hasTrade = listOwnedPhonesByOrigin(u, origin).length > 0;
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${ECON_SHOP_PHONE_FULL_PREFIX}${pid}`)
        .setLabel("Купить за полную стоимость")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`${ECON_SHOP_PHONE_TRADE_PREFIX}${pid}`)
        .setLabel("Обменять свою")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(!hasTrade),
    ),
    shopNavBottomRow(`${ECON_SHOP_PHONE_BUY_CANCEL_PREFIX}${origin}`, "Назад"),
  ];
}

export function buildShopCarBuyConfirmEmbed(member: GuildMember, cid: string): EmbedBuilder | undefined {
  const defC = getCarDef(cid);
  if (!defC) return undefined;
  const u = getEconomyUser(member.guild.id, member.id);
  const gid = member.guild.id;
  const full = inflatedCatalogCarPrice(gid, defC.id);
  const owned = listOwnedCarsByOrigin(u, defC.origin);
  const lines = [
    `**${defC.label}**`,
    `Полная цена: **${fmt(full)}** ₽ — ${netSpendLabel(full)} · статы: **${catalogStatGainLabel(defC)}**`,
  ];
  if (owned.length === 0) {
    lines.push("", "Обменять пока **нечего** — можно только купить за полную стоимость.");
  } else {
    lines.push("", `Обмен своей (зачёт **${tradeInPctLabel(CAR_TRADE_IN_RATE)}**). Можно сдать **несколько** авто; госномера уйдут в неприкрепленные.`);
    for (const rec of owned) {
      const cur = getCarDef(rec.id);
      if (!cur) continue;
      const credit = Math.floor(inflatedCatalogCarPrice(gid, cur.id) * CAR_TRADE_IN_RATE);
      lines.push(`• **${cur.label}**: ${netSpendLabel(full - credit)} · ${statChangeLabel(cur, defC)}`);
    }
  }
  const lack = shopShortageLine(u.rubles, full);
  if (lack) lines.push("", lack);
  return new EmbedBuilder().setColor(PANEL_COLOR).setTitle("Покупка авто").setDescription(lines.join("\n"));
}

export function buildShopCarBuyConfirmRows(member: GuildMember, cid: string, origin: CatalogOrigin): ActionRowBuilder<ButtonBuilder>[] {
  const u = getEconomyUser(member.guild.id, member.id);
  const hasTrade = listOwnedCarsByOrigin(u, origin).length > 0;
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${ECON_SHOP_CAR_FULL_PREFIX}${cid}`)
        .setLabel("Купить за полную стоимость")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`${ECON_SHOP_CAR_TRADE_PREFIX}${cid}`)
        .setLabel("Обменять свою")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(!hasTrade),
    ),
    shopNavBottomRow(`${ECON_SHOP_CAR_BUY_CANCEL_PREFIX}${origin}`, "Назад"),
  ];
}

export function buildShopApartmentBuyConfirmEmbed(member: GuildMember, aid: string): EmbedBuilder | undefined {
  const defA = getApartmentDef(aid);
  if (!defA) return undefined;
  const u = getEconomyUser(member.guild.id, member.id);
  const now = Date.now();
  const gid = member.guild.id;
  const full = inflatedCatalogApartmentPrice(gid, defA.id);
  const util = inflatedApartmentUtilityRub(gid, defA.id);
  const owned = listOwnedApartmentsByOrigin(u, defA.origin);
  const lines = [
    `**${defA.label}**`,
    `Полная цена: **${fmt(full)}** ₽ — ${netSpendLabel(full)} · статы: **${catalogStatGainLabel(defA)}**`,
    `ЖКХ: **${fmt(util)}** ₽/мес.`,
  ];
  if (defA.origin === "soviet" && (u.housingKind ?? "none") === "rent") {
    const rentRefund = housingRentUnusedRefundRub(u, now, gid);
    if (rentRefund > 0) lines.push(`При покупке вернётся неиспользованная аренда: **+${fmt(rentRefund)}** ₽.`);
  }
  if (owned.length === 0) {
    lines.push("", "Обменять пока **нечего** — можно только купить за полную стоимость.");
  } else {
    lines.push("", "Обмен своей (зачёт зависит от срока владения). Можно сдать **несколько** квартир, зачёт суммируется.");
    for (const rec of owned) {
      const cur = getApartmentDef(rec.id);
      if (!cur) continue;
      const rate = apartmentTradeInRate(rec.purchasedAtMs, now);
      const credit = Math.floor(inflatedCatalogApartmentPrice(gid, cur.id) * rate);
      lines.push(`• **${cur.label}**: ${netSpendLabel(full - credit)} · ${statChangeLabel(cur, defA)} · зачёт **${tradeInPctLabel(rate)}**`);
    }
  }
  const lack = shopShortageLine(u.rubles + (defA.origin === "soviet" && (u.housingKind ?? "none") === "rent" ? housingRentUnusedRefundRub(u, now, gid) : 0), full);
  if (lack) lines.push("", lack);
  return new EmbedBuilder().setColor(PANEL_COLOR).setTitle("Покупка жилья").setDescription(lines.join("\n"));
}

export function buildShopApartmentBuyConfirmRows(member: GuildMember, aid: string, origin: CatalogOrigin): ActionRowBuilder<ButtonBuilder>[] {
  const u = getEconomyUser(member.guild.id, member.id);
  const hasTrade = listOwnedApartmentsByOrigin(u, origin).length > 0;
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${ECON_SHOP_APT_FULL_PREFIX}${aid}`)
        .setLabel("Купить за полную стоимость")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`${ECON_SHOP_APT_TRADE_PREFIX}${aid}`)
        .setLabel("Обменять свою")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(!hasTrade),
    ),
    shopNavBottomRow(`${ECON_SHOP_APT_BUY_CANCEL_PREFIX}${origin}`, "Назад"),
  ];
}

export function buildShopPhoneTradePickEmbed(member: GuildMember, pid: string): EmbedBuilder | undefined {
  const defP = getPhoneDef(pid);
  if (!defP) return undefined;
  const u = getEconomyUser(member.guild.id, member.id);
  const gid = member.guild.id;
  const full = inflatedCatalogPhonePrice(gid, defP.id);
  const owned = listOwnedPhonesByOrigin(u, defP.origin);
  const selected = new Set(selectedShopTradeUids(gid, member.id, "phone", pid));
  let credit = 0;
  const lines = [
    `Обмен на **${defP.label}**. Полная цена **${fmt(full)}** ₽.`,
    `Зачёт **${tradeInPctLabel(PHONE_TRADE_IN_RATE)}**. Можно отметить **несколько** телефонов — зачёт суммируется.`,
    `Баланс: **${fmt(u.rubles)}** ₽`,
    "",
  ];
  if (owned.length === 0) {
    lines.push("Обменивать **нечего**.");
  } else {
    for (const rec of owned) {
      const cur = getPhoneDef(rec.id);
      if (!cur) continue;
      const itemCredit = Math.floor(inflatedCatalogPhonePrice(gid, cur.id) * PHONE_TRADE_IN_RATE);
      const mark = selected.has(rec.uid) ? "☑" : "☐";
      lines.push(`${mark} **${cur.label}** — зачёт **${fmt(itemCredit)}** ₽`);
      if (selected.has(rec.uid)) credit += itemCredit;
    }
    lines.push("");
    if (selected.size === 0) {
      lines.push("Отметьте один или несколько телефонов.");
    } else {
      const net = full - credit;
      lines.push(`Итого зачёт: **${fmt(credit)}** ₽`);
      lines.push(`Итог: ${netSpendLabel(net)}`);
      const lack = shopShortageLine(u.rubles, Math.max(0, net));
      if (lack) lines.push(lack);
    }
  }
  return new EmbedBuilder().setColor(PANEL_COLOR).setTitle("Обмен телефона").setDescription(lines.join("\n"));
}

export function buildShopPhoneTradePickRows(member: GuildMember, pid: string): ActionRowBuilder<ButtonBuilder>[] {
  const defP = getPhoneDef(pid);
  const u = getEconomyUser(member.guild.id, member.id);
  const gid = member.guild.id;
  const owned = defP ? listOwnedPhonesByOrigin(u, defP.origin) : [];
  const selected = new Set(selectedShopTradeUids(gid, member.id, "phone", pid));
  const full = defP ? inflatedCatalogPhonePrice(gid, defP.id) : 0;
  let credit = 0;
  for (const rec of owned) {
    if (!selected.has(rec.uid)) continue;
    const cur = getPhoneDef(rec.id);
    if (!cur) continue;
    credit += Math.floor(inflatedCatalogPhonePrice(gid, cur.id) * PHONE_TRADE_IN_RATE);
  }
  const net = full - credit;
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let i = 0; i < Math.min(owned.length, 12); i += 4) {
    const slice = owned.slice(i, i + 4);
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        ...slice.map((rec) => {
          const cur = getPhoneDef(rec.id);
          const on = selected.has(rec.uid);
          const name = cur?.label ?? "телефон";
          const label = `${on ? "✓ " : ""}${name}`.slice(0, 80);
          return new ButtonBuilder()
            .setCustomId(`${ECON_SHOP_PHONE_TRADE_TG_PREFIX}${pid}:${rec.uid}`)
            .setLabel(label)
            .setStyle(on ? ButtonStyle.Primary : ButtonStyle.Secondary);
        }),
      ),
    );
  }
  const canConfirm = selected.size > 0 && (net <= 0 || u.rubles >= net);
  rows.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${ECON_SHOP_PHONE_TRADE_GO_PREFIX}${pid}`)
        .setLabel(tradeConfirmLabel(net, selected.size).slice(0, 80))
        .setStyle(ButtonStyle.Success)
        .setDisabled(!canConfirm),
    ),
  );
  rows.push(shopNavBottomRow(`${ECON_SHOP_PHONE_BUY_PREFIX}${pid}`, "Назад"));
  return rows;
}

export function buildShopCarTradePickEmbed(member: GuildMember, cid: string): EmbedBuilder | undefined {
  const defC = getCarDef(cid);
  if (!defC) return undefined;
  const u = getEconomyUser(member.guild.id, member.id);
  const gid = member.guild.id;
  const full = inflatedCatalogCarPrice(gid, defC.id);
  const owned = listOwnedCarsByOrigin(u, defC.origin);
  const selected = new Set(selectedShopTradeUids(gid, member.id, "car", cid));
  let credit = 0;
  const lines = [
    `Обмен на **${defC.label}**. Полная цена **${fmt(full)}** ₽.`,
    `Зачёт **${tradeInPctLabel(CAR_TRADE_IN_RATE)}**. Можно отметить **несколько** авто. Госномера сданных машин уйдут в неприкрепленные.`,
    `Баланс: **${fmt(u.rubles)}** ₽`,
    "",
  ];
  if (owned.length === 0) {
    lines.push("Обменивать **нечего**.");
  } else {
    for (const rec of owned) {
      const cur = getCarDef(rec.id);
      if (!cur) continue;
      const itemCredit = Math.floor(inflatedCatalogCarPrice(gid, cur.id) * CAR_TRADE_IN_RATE);
      const mark = selected.has(rec.uid) ? "☑" : "☐";
      lines.push(`${mark} ${formatCarWithPlateLine(rec)} — зачёт **${fmt(itemCredit)}** ₽`);
      if (selected.has(rec.uid)) credit += itemCredit;
    }
    lines.push("");
    if (selected.size === 0) {
      lines.push("Отметьте одно или несколько авто.");
    } else {
      const net = full - credit;
      lines.push(`Итого зачёт: **${fmt(credit)}** ₽`);
      lines.push(`Итог: ${netSpendLabel(net)}`);
      const lack = shopShortageLine(u.rubles, Math.max(0, net));
      if (lack) lines.push(lack);
    }
  }
  return new EmbedBuilder().setColor(PANEL_COLOR).setTitle("Обмен авто").setDescription(lines.join("\n"));
}

export function buildShopCarTradePickRows(member: GuildMember, cid: string): ActionRowBuilder<ButtonBuilder>[] {
  const defC = getCarDef(cid);
  const u = getEconomyUser(member.guild.id, member.id);
  const gid = member.guild.id;
  const owned = defC ? listOwnedCarsByOrigin(u, defC.origin) : [];
  const selected = new Set(selectedShopTradeUids(gid, member.id, "car", cid));
  const full = defC ? inflatedCatalogCarPrice(gid, defC.id) : 0;
  let credit = 0;
  for (const rec of owned) {
    if (!selected.has(rec.uid)) continue;
    const cur = getCarDef(rec.id);
    if (!cur) continue;
    credit += Math.floor(inflatedCatalogCarPrice(gid, cur.id) * CAR_TRADE_IN_RATE);
  }
  const net = full - credit;
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let i = 0; i < Math.min(owned.length, 12); i += 4) {
    const slice = owned.slice(i, i + 4);
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        ...slice.map((rec) => {
          const on = selected.has(rec.uid);
          const name = shortCarLabel(rec);
          const label = `${on ? "✓ " : ""}${name}`.slice(0, 80);
          return new ButtonBuilder()
            .setCustomId(`${ECON_SHOP_CAR_TRADE_TG_PREFIX}${cid}:${rec.uid}`)
            .setLabel(label)
            .setStyle(on ? ButtonStyle.Primary : ButtonStyle.Secondary);
        }),
      ),
    );
  }
  const canConfirm = selected.size > 0 && (net <= 0 || u.rubles >= net);
  rows.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${ECON_SHOP_CAR_TRADE_GO_PREFIX}${cid}`)
        .setLabel(tradeConfirmLabel(net, selected.size).slice(0, 80))
        .setStyle(ButtonStyle.Success)
        .setDisabled(!canConfirm),
    ),
  );
  rows.push(shopNavBottomRow(`${ECON_SHOP_CAR_BUY_PREFIX}${cid}`, "Назад"));
  return rows;
}

export function buildShopAptTradePickEmbed(member: GuildMember, aid: string): EmbedBuilder | undefined {
  const defA = getApartmentDef(aid);
  if (!defA) return undefined;
  const u = getEconomyUser(member.guild.id, member.id);
  const gid = member.guild.id;
  const now = Date.now();
  const full = inflatedCatalogApartmentPrice(gid, defA.id);
  const owned = listOwnedApartmentsByOrigin(u, defA.origin);
  const selected = new Set(selectedShopTradeUids(gid, member.id, "apt", aid));
  let credit = 0;
  const lines = [
    `Обмен на **${defA.label}**. Полная цена **${fmt(full)}** ₽.`,
    "Можно отметить **несколько** квартир той же ветки. Зачёт зависит от срока владения и суммируется.",
    `Баланс: **${fmt(u.rubles)}** ₽`,
    "",
  ];
  if (owned.length === 0) {
    lines.push("Обменивать **нечего**.");
  } else {
    for (const rec of owned) {
      const cur = getApartmentDef(rec.id);
      if (!cur) continue;
      const rate = apartmentTradeInRate(rec.purchasedAtMs, now);
      const itemCredit = Math.floor(inflatedCatalogApartmentPrice(gid, cur.id) * rate);
      const mark = selected.has(rec.uid) ? "☑" : "☐";
      lines.push(`${mark} **${cur.label}** — зачёт **${fmt(itemCredit)}** ₽ (**${tradeInPctLabel(rate)}**)`);
      if (selected.has(rec.uid)) credit += itemCredit;
    }
    lines.push("");
    if (selected.size === 0) {
      lines.push("Отметьте одно или несколько жилищ.");
    } else {
      const net = full - credit;
      lines.push(`Итого зачёт: **${fmt(credit)}** ₽`);
      lines.push(`Итог: ${netSpendLabel(net)}`);
      const lack = shopShortageLine(u.rubles, Math.max(0, net));
      if (lack) lines.push(lack);
    }
  }
  return new EmbedBuilder().setColor(PANEL_COLOR).setTitle("Обмен жилья").setDescription(lines.join("\n"));
}

export function buildShopAptTradePickRows(member: GuildMember, aid: string): ActionRowBuilder<ButtonBuilder>[] {
  const defA = getApartmentDef(aid);
  const u = getEconomyUser(member.guild.id, member.id);
  const gid = member.guild.id;
  const now = Date.now();
  const owned = defA ? listOwnedApartmentsByOrigin(u, defA.origin) : [];
  const selected = new Set(selectedShopTradeUids(gid, member.id, "apt", aid));
  const full = defA ? inflatedCatalogApartmentPrice(gid, defA.id) : 0;
  let credit = 0;
  for (const rec of owned) {
    if (!selected.has(rec.uid)) continue;
    const cur = getApartmentDef(rec.id);
    if (!cur) continue;
    const rate = apartmentTradeInRate(rec.purchasedAtMs, now);
    credit += Math.floor(inflatedCatalogApartmentPrice(gid, cur.id) * rate);
  }
  const net = full - credit;
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let i = 0; i < Math.min(owned.length, 12); i += 4) {
    const slice = owned.slice(i, i + 4);
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        ...slice.map((rec) => {
          const cur = getApartmentDef(rec.id);
          const on = selected.has(rec.uid);
          const name = apartmentShopShortLabel(cur?.label ?? "жильё");
          const label = `${on ? "✓ " : ""}${name}`.slice(0, 80);
          return new ButtonBuilder()
            .setCustomId(`${ECON_SHOP_APT_TRADE_TG_PREFIX}${aid}:${rec.uid}`)
            .setLabel(label)
            .setStyle(on ? ButtonStyle.Primary : ButtonStyle.Secondary);
        }),
      ),
    );
  }
  const canConfirm = selected.size > 0 && (net <= 0 || u.rubles >= net);
  rows.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${ECON_SHOP_APT_TRADE_GO_PREFIX}${aid}`)
        .setLabel(tradeConfirmLabel(net, selected.size).slice(0, 80))
        .setStyle(ButtonStyle.Success)
        .setDisabled(!canConfirm),
    ),
  );
  rows.push(shopNavBottomRow(`${ECON_SHOP_APT_BUY_PREFIX}${aid}`, "Назад"));
  return rows;
}

export function buildShopPhoneSellPickEmbed(member: GuildMember): EmbedBuilder {
  const u = getEconomyUser(member.guild.id, member.id);
  const lines = ["Выберите телефон для продажи:", ""];
  for (const rec of listOwnedPhones(u)) {
    const cur = getPhoneDef(rec.id);
    if (!cur) continue;
    const refund = Math.floor(inflatedCatalogPhonePrice(member.guild.id, cur.id) * PHONE_SELL_REFUND_RATE);
    lines.push(`• **${cur.label}**: вернётся **${fmt(refund)}** ₽`);
  }
  return new EmbedBuilder().setColor(PANEL_COLOR).setTitle("Продажа телефона").setDescription(lines.join("\n"));
}

export function buildShopPhoneSellPickRows(member: GuildMember): ActionRowBuilder<ButtonBuilder>[] {
  const u = getEconomyUser(member.guild.id, member.id);
  const owned = listOwnedPhones(u);
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let i = 0; i < Math.min(owned.length, 12); i += 2) {
    const slice = owned.slice(i, i + 2);
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        ...slice.map((rec) => {
          const cur = getPhoneDef(rec.id);
          const refund = cur ? Math.floor(inflatedCatalogPhonePrice(member.guild.id, cur.id) * PHONE_SELL_REFUND_RATE) : 0;
          return new ButtonBuilder()
            .setCustomId(`${ECON_SHOP_PHONE_SELL_UID_PREFIX}${rec.uid}`)
            .setLabel(shopItemButtonLabel(cur?.label ?? "телефон", refund))
            .setStyle(ButtonStyle.Danger);
        }),
      ),
    );
  }
  rows.push(shopNavBottomRow(ECON_SHOP_PHONE));
  return rows;
}

export function buildShopCarSellPickEmbed(member: GuildMember): EmbedBuilder {
  const u = getEconomyUser(member.guild.id, member.id);
  const lines = ["Выберите авто для продажи. Госномер уйдёт в неприкрепленные.", ""];
  for (const rec of listOwnedCars(u)) {
    const cur = getCarDef(rec.id);
    if (!cur) continue;
    const refund = Math.floor(inflatedCatalogCarPrice(member.guild.id, cur.id) * CAR_SELL_REFUND_RATE);
    lines.push(`• ${formatCarWithPlateLine(rec)}: вернётся **${fmt(refund)}** ₽`);
  }
  return new EmbedBuilder().setColor(PANEL_COLOR).setTitle("Продажа авто").setDescription(lines.join("\n"));
}

export function buildShopCarSellPickRows(member: GuildMember): ActionRowBuilder<ButtonBuilder>[] {
  const u = getEconomyUser(member.guild.id, member.id);
  const owned = listOwnedCars(u);
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let i = 0; i < Math.min(owned.length, 12); i += 2) {
    const slice = owned.slice(i, i + 2);
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        ...slice.map((rec) => {
          const cur = getCarDef(rec.id);
          const refund = cur ? Math.floor(inflatedCatalogCarPrice(member.guild.id, cur.id) * CAR_SELL_REFUND_RATE) : 0;
          return new ButtonBuilder()
            .setCustomId(`${ECON_SHOP_CAR_SELL_UID_PREFIX}${rec.uid}`)
            .setLabel(shopItemButtonLabel(cur?.label ?? "авто", refund))
            .setStyle(ButtonStyle.Danger);
        }),
      ),
    );
  }
  rows.push(shopNavBottomRow(ECON_SHOP_CAR));
  return rows;
}

export function buildShopAptSellPickEmbed(member: GuildMember, origin: CatalogOrigin): EmbedBuilder {
  const u = getEconomyUser(member.guild.id, member.id);
  const lines = ["Выберите жильё для продажи:", ""];
  for (const rec of listOwnedApartmentsByOrigin(u, origin)) {
    const cur = getApartmentDef(rec.id);
    if (!cur) continue;
    const refund = Math.floor(inflatedCatalogApartmentPrice(member.guild.id, cur.id) * APARTMENT_SELL_REFUND_RATE);
    lines.push(`• **${cur.label}**: вернётся **${fmt(refund)}** ₽`);
  }
  return new EmbedBuilder().setColor(PANEL_COLOR).setTitle("Продажа жилья").setDescription(lines.join("\n"));
}

export function buildShopAptSellPickRows(member: GuildMember, origin: CatalogOrigin): ActionRowBuilder<ButtonBuilder>[] {
  const u = getEconomyUser(member.guild.id, member.id);
  const owned = listOwnedApartmentsByOrigin(u, origin);
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let i = 0; i < Math.min(owned.length, 12); i += 2) {
    const slice = owned.slice(i, i + 2);
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        ...slice.map((rec) => {
          const cur = getApartmentDef(rec.id);
          const refund = cur ? Math.floor(inflatedCatalogApartmentPrice(member.guild.id, cur.id) * APARTMENT_SELL_REFUND_RATE) : 0;
          return new ButtonBuilder()
            .setCustomId(`${ECON_SHOP_APT_SELL_UID_PREFIX}${rec.uid}`)
            .setLabel(shopItemButtonLabel(apartmentShopShortLabel(cur?.label ?? "жильё"), refund))
            .setStyle(ButtonStyle.Danger);
        }),
      ),
    );
  }
  rows.push(shopNavBottomRow(`${ECON_SHOP_HOUSE_ORIGIN_PREFIX}${origin}`));
  return rows;
}

export function buildShopPlateAttachEmbed(member: GuildMember, carUid: string): EmbedBuilder | undefined {
  const u = getEconomyUser(member.guild.id, member.id);
  const car = findOwnedCar(u, carUid);
  if (!car) return undefined;
  const unattached = listUnattachedPlates(u);
  const lines = [
    `Авто: ${formatCarWithPlateLine(car)}`,
    "",
    "Выберите неприкрепленный номер:",
    unattached.length ? unattached.map((p) => `• **${formatVehiclePlate(p)}**`).join("\n") : "• нет",
  ];
  return new EmbedBuilder().setColor(PANEL_COLOR).setTitle("Прикрепить госномер").setDescription(lines.join("\n"));
}

export function buildShopPlateAttachRows(member: GuildMember, carUid: string): ActionRowBuilder<ButtonBuilder>[] {
  const u = getEconomyUser(member.guild.id, member.id);
  const unattached = listUnattachedPlates(u);
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let i = 0; i < Math.min(unattached.length, 12); i += 2) {
    const slice = unattached.slice(i, i + 2);
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        ...slice.map((p) =>
          new ButtonBuilder()
            .setCustomId(`${ECON_SHOP_PLATE_ATT_PICK_PREFIX}${carUid}:${encodePlateKey(p)}`)
            .setLabel(formatVehiclePlate(p).slice(0, 80))
            .setStyle(ButtonStyle.Secondary),
        ),
      ),
    );
  }
  rows.push(shopNavBottomRow(`${ECON_SHOP_PLATE_CAR_PREFIX}${carUid}`));
  return rows;
}

export function buildShopPlateAttachConfirmEmbed(member: GuildMember, carUid: string, parts: VehiclePlateParts): EmbedBuilder | undefined {
  const car = findOwnedCar(getEconomyUser(member.guild.id, member.id), carUid);
  if (!car) return undefined;
  const prestige = computePlatePrestige(parts).total;
  return new EmbedBuilder()
    .setColor(PANEL_COLOR)
    .setTitle("Подтверждение")
    .setDescription(
      [
        `Прикрепить **${formatVehiclePlate(parts)}** к **${getCarDef(car.id)?.label ?? "авто"}**?`,
        `Престиж номера: **${fmt(prestige)}** (начнёт действовать после крепления).`,
      ].join("\n"),
    );
}

export function buildShopPlateAttachConfirmRows(carUid: string, parts: VehiclePlateParts): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${ECON_SHOP_PLATE_ATT_OK_PREFIX}${carUid}:${encodePlateKey(parts)}`)
        .setLabel("Прикрепить")
        .setStyle(ButtonStyle.Success),
    ),
    shopNavBottomRow(`${ECON_SHOP_PLATE_ATT_PREFIX}${carUid}`, "Отменить"),
  ];
}

export function buildShopPlateDetachConfirmEmbed(member: GuildMember, carUid: string): EmbedBuilder | undefined {
  const car = findOwnedCar(getEconomyUser(member.guild.id, member.id), carUid);
  const plate = car ? carPlateParts(car) : undefined;
  if (!car || !plate) return undefined;
  return new EmbedBuilder()
    .setColor(PANEL_COLOR)
    .setTitle("Снять госномер")
    .setDescription(
      [
        `Снять **${formatVehiclePlate(plate)}** с **${getCarDef(car.id)?.label ?? "авто"}**?`,
        "Номер уйдёт в неприкрепленные и **перестанет** давать престиж, пока снова не будет на авто.",
      ].join("\n"),
    );
}

export function buildShopPlateDetachConfirmRows(carUid: string): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`${ECON_SHOP_PLATE_DET_OK_PREFIX}${carUid}`).setLabel("Снять").setStyle(ButtonStyle.Danger),
    ),
    shopNavBottomRow(`${ECON_SHOP_PLATE_CAR_PREFIX}${carUid}`, "Отменить"),
  ];
}

export function buildShopPhoneSellConfirmEmbed(member: GuildMember, uid?: string): EmbedBuilder {
  const u = getEconomyUser(member.guild.id, member.id);
  const rec = uid ? findOwnedPhone(u, uid) : listOwnedPhones(u)[0];
  const cur = rec ? getPhoneDef(rec.id) : getPhoneDef(u.phoneModelId);
  const refund = cur
    ? Math.floor(inflatedCatalogPhonePrice(member.guild.id, cur.id) * PHONE_SELL_REFUND_RATE)
    : 0;
  return new EmbedBuilder()
    .setColor(PANEL_COLOR)
    .setTitle("Подтверждение продажи")
    .setDescription(
      [
        `Продать **${cur?.label ?? "телефон"}**?`,
        `Вернётся **${fmt(refund)}** ₽ (**${tradeInPctLabel(PHONE_SELL_REFUND_RATE)}** каталожной цены).`,
        "",
        "Это **продажа**, не замена на лучшее — телефон исчезнет с профиля.",
      ].join("\n"),
    );
}

export function buildShopPhoneSellConfirmRows(origin: CatalogOrigin, uid?: string): ActionRowBuilder<ButtonBuilder>[] {
  return buildShopConfirmRows(
    uid ? `${ECON_SHOP_PHONE_SELL_OK_PREFIX}${uid}` : ECON_SHOP_PHONE_SELL_CONFIRM,
    "Продать",
    ButtonStyle.Danger,
    uid ? ECON_SHOP_PHONE_SELL : `${ECON_SHOP_PHONE_SELL_CANCEL}:${origin}`,
  );
}

export function buildShopApartmentSellConfirmEmbed(member: GuildMember, origin: "soviet" | "foreign", uid?: string): EmbedBuilder {
  const u = getEconomyUser(member.guild.id, member.id);
  const rec = uid
    ? findOwnedApartment(u, uid)
    : origin === "soviet"
      ? listOwnedApartmentsByOrigin(u, "soviet")[0]
      : listOwnedApartmentsByOrigin(u, "foreign")[0];
  const cur = rec
    ? getApartmentDef(rec.id)
    : origin === "soviet"
      ? getApartmentDef(u.ownedApartmentId)
      : getApartmentDef(u.ownedForeignApartmentId);
  const refund = cur
    ? Math.floor(inflatedCatalogApartmentPrice(member.guild.id, cur.id) * APARTMENT_SELL_REFUND_RATE)
    : 0;
  return new EmbedBuilder()
    .setColor(PANEL_COLOR)
    .setTitle("Подтверждение продажи")
    .setDescription(
      [
        `Продать **${cur?.label ?? "жильё"}**?`,
        `Вернётся **${fmt(refund)}** ₽ (**${tradeInPctLabel(APARTMENT_SELL_REFUND_RATE)}** каталожной цены).`,
        "",
        "Это **продажа**, не переезд на лучшее — жильё исчезнет с профиля.",
      ].join("\n"),
    );
}

export function buildShopAptUidSellConfirmRows(origin: CatalogOrigin, uid: string): ActionRowBuilder<ButtonBuilder>[] {
  return buildShopConfirmRows(
    `${ECON_SHOP_APT_SELL_OK_PREFIX}${uid}`,
    "Продать",
    ButtonStyle.Danger,
    origin === "soviet" ? ECON_SHOP_APT_SELL_SOVIET : ECON_SHOP_APT_SELL_FOREIGN,
  );
}

export function buildShopApartmentSellSovietConfirmRows(): ActionRowBuilder<ButtonBuilder>[] {
  return buildShopConfirmRows(
    ECON_SHOP_APT_SELL_SOVIET_CONFIRM,
    "Продать",
    ButtonStyle.Danger,
    ECON_SHOP_APT_SELL_SOVIET_CANCEL,
  );
}

export function buildShopApartmentSellForeignConfirmRows(): ActionRowBuilder<ButtonBuilder>[] {
  return buildShopConfirmRows(
    ECON_SHOP_APT_SELL_FOREIGN_CONFIRM,
    "Продать",
    ButtonStyle.Danger,
    ECON_SHOP_APT_SELL_FOREIGN_CANCEL,
  );
}

export function buildShopHousePickEmbed(member: GuildMember): EmbedBuilder {
  const u = getEconomyUser(member.guild.id, member.id);
  const hk = u.housingKind ?? "none";
  const lines = [
    `Баланс: **${fmt(u.rubles)}** ₽`,
    "",
    ...shopBranchOwnershipBlock(u, "house"),
    "",
    "Можно купить **несколько** квартир любого типа. **Аренда** — только советская, для профессий **ур. 2+**.",
  ];
  if (hk === "owned" && u.ownedApartmentId) {
    lines.push("Своя квартира — аренда **недоступна**.");
  }
  return new EmbedBuilder().setColor(PANEL_COLOR).setTitle("Жильё").setDescription(lines.join("\n"));
}

export function buildShopHousePickRows(backId: string): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${ECON_SHOP_HOUSE_ORIGIN_PREFIX}soviet`)
        .setLabel("Советское")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`${ECON_SHOP_HOUSE_ORIGIN_PREFIX}foreign`)
        .setLabel("Заморское")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(ECON_SHOP_HOUSE_RENT_MENU).setLabel("Аренда").setStyle(ButtonStyle.Success),
    ),
    shopNavBottomRow(backId),
  ];
}

export function buildShopHouseRentEmbed(member: GuildMember): EmbedBuilder {
  const u = getEconomyUser(member.guild.id, member.id);
  const hk = u.housingKind ?? "none";
  const lines = [
    `Баланс: **${fmt(u.rubles)}** ₽`,
    "",
    "Аренда советского жилья — для профессий **ур. 2+**.",
  ];
  if (hk === "rent" && u.housingRentNextDueMs) {
    lines.push(`Оплачено **до** <t:${Math.floor(u.housingRentNextDueMs / 1000)}:R>.`);
  } else if (hk === "owned") {
    lines.push("Своя квартира — аренда **недоступна**.");
  }
  return new EmbedBuilder().setColor(PANEL_COLOR).setTitle("Жильё · Аренда").setDescription(lines.join("\n"));
}

export function buildShopHouseRentRows(member: GuildMember): ActionRowBuilder<ButtonBuilder>[] {
  const u = getEconomyUser(member.guild.id, member.id);
  const hk = u.housingKind ?? "none";
  const gid = member.guild.id;
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];

  if (hk !== "owned") {
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(ECON_SHOP_HOUSE_RENT_1D)
          .setLabel(`1 сут · ${fmt(inflatedHousingRentPrice(gid, "day"))} ₽`)
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(ECON_SHOP_HOUSE_RENT_7D)
          .setLabel(`7 сут · ${fmt(inflatedHousingRentPrice(gid, "week"))} ₽`)
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(ECON_SHOP_HOUSE_RENT_30D)
          .setLabel(`30 сут · ${fmt(inflatedHousingRentPrice(gid, "month"))} ₽`)
          .setStyle(ButtonStyle.Secondary),
      ),
    );
  }
  if (hk === "rent") {
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(ECON_SHOP_HOUSE_LEAVE).setLabel("Съехать с аренды").setStyle(ButtonStyle.Danger),
      ),
    );
  }
  rows.push(shopNavBottomRow(ECON_SHOP_HOUSE));
  return rows;
}

export function parseOriginFromSuffix(suffix: string): CatalogOrigin | undefined {
  if (suffix === "soviet") return "soviet";
  if (suffix === "foreign") return "foreign";
  return undefined;
}

export function buildShopPhoneListEmbed(member: GuildMember, origin: CatalogOrigin): EmbedBuilder {
  const u = getEconomyUser(member.guild.id, member.id);
  const owned = listOwnedPhonesByOrigin(u, origin);
  const catalogLines = phonesByOrigin(origin).map((p) => {
    const price = inflatedCatalogPhonePrice(member.guild.id, p.id);
    return `• **${p.label}** — **${fmt(price)}** ₽ · ${catalogStatGainLabel(p)}`;
  });
  return new EmbedBuilder()
    .setColor(PANEL_COLOR)
    .setTitle(`Телефон · ${originTitle(origin)}`)
    .setDescription(
      [
        `Баланс: **${fmt(u.rubles)}** ₽`,
        owned.length ? `Сейчас: ${owned.map((p) => `**${getPhoneDef(p.id)?.label ?? p.id}**`).join(", ")}` : "Сейчас: **нет**",
        shopUpgradeTradeInLine(PHONE_TRADE_IN_RATE),
        shopPlainSellLine(PHONE_SELL_REFUND_RATE),
        "На кнопках — **полная** цена. После нажатия можно купить ещё одну или обменять свою.",
        "",
        ...catalogLines,
      ].join("\n"),
    );
}

export function buildShopPhoneDetailsEmbed(member: GuildMember, origin: CatalogOrigin): EmbedBuilder {
  const lines = phonesByOrigin(origin).map((p) => {
    const price = inflatedCatalogPhonePrice(member.guild.id, p.id);
    return `• **${p.label}** — **${fmt(price)}** ₽ · ${catalogStatGainLabel(p)}`;
  });
  return new EmbedBuilder()
    .setColor(PANEL_COLOR)
    .setTitle(`Телефон · ${originTitle(origin)} · каталог`)
    .setDescription(["Полная цена модели и статы от покупки (без зачёта).", "", ...lines].join("\n"));
}

export function buildShopPhoneListRows(member: GuildMember, origin: CatalogOrigin): ActionRowBuilder<ButtonBuilder>[] {
  const u = getEconomyUser(member.guild.id, member.id);
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  if (listOwnedPhonesByOrigin(u, origin).length > 0) {
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(ECON_SHOP_PHONE_SELL).setLabel("Продать телефон").setStyle(ButtonStyle.Danger),
      ),
    );
  }
  const list = phonesByOrigin(origin);
  for (let i = 0; i < list.length; i += 3) {
    const slice = list.slice(i, i + 3);
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        ...slice.map((p) => {
          const price = inflatedCatalogPhonePrice(member.guild.id, p.id);
          const canTrade = listOwnedPhonesByOrigin(u, origin).length > 0;
          return new ButtonBuilder()
            .setCustomId(`${ECON_SHOP_PHONE_BUY_PREFIX}${p.id}`)
            .setLabel(shopItemButtonLabel(p.label, price))
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(u.rubles < price && !canTrade);
        }),
      ),
    );
  }
  rows.push(shopDetailsNavBottomRow(`${ECON_SHOP_PHONE_DETAILS_PREFIX}${origin}`, ECON_SHOP_PHONE));
  return rows;
}

export function buildShopCarListEmbed(member: GuildMember, origin: CatalogOrigin): EmbedBuilder {
  const u = getEconomyUser(member.guild.id, member.id);
  const owned = listOwnedCarsByOrigin(u, origin);
  const catalogLines = carsByOrigin(origin).map((c) => {
    const price = inflatedCatalogCarPrice(member.guild.id, c.id);
    const cd = (c.courierShiftCdMs / 3600000).toLocaleString("ru-RU", { maximumFractionDigits: 2 });
    return `• **${c.label}** — **${fmt(price)}** ₽ · ${catalogStatGainLabel(c)} · доставка КД **${cd} ч**`;
  });
  return new EmbedBuilder()
    .setColor(PANEL_COLOR)
    .setTitle(`Авто · ${originTitle(origin)}`)
    .setDescription(
      [
        `Баланс: **${fmt(u.rubles)}** ₽`,
        owned.length ? owned.map((c) => `• ${formatCarWithPlateLine(c)}`).join("\n") : "Сейчас: **нет**",
        shopUpgradeTradeInLine(CAR_TRADE_IN_RATE),
        shopPlainSellLine(CAR_SELL_REFUND_RATE),
        "На кнопках — **полная** цена. После нажатия можно купить ещё одну или обменять свою.",
        "",
        ...catalogLines,
      ].join("\n"),
    );
}

export function buildShopCarDetailsEmbed(member: GuildMember, origin: CatalogOrigin): EmbedBuilder {
  const lines = carsByOrigin(origin).map((c) => {
    const price = inflatedCatalogCarPrice(member.guild.id, c.id);
    const cd = (c.courierShiftCdMs / 3600000).toLocaleString("ru-RU", { maximumFractionDigits: 2 });
    return `• **${c.label}** — **${fmt(price)}** ₽ · ${catalogStatGainLabel(c)} · доставка КД **${cd} ч**`;
  });
  return new EmbedBuilder()
    .setColor(PANEL_COLOR)
    .setTitle(`Авто · ${originTitle(origin)} · каталог`)
    .setDescription(["Полная цена модели и статы от покупки (без зачёта). Госномер при обмене переходит в неприкрепленные.", "", ...lines].join("\n"));
}

export function buildShopCarListRows(member: GuildMember, origin: CatalogOrigin): ActionRowBuilder<ButtonBuilder>[] {
  const u = getEconomyUser(member.guild.id, member.id);
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  if (listOwnedCarsByOrigin(u, origin).length > 0) {
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(ECON_SHOP_CAR_SELL).setLabel("Продать авто").setStyle(ButtonStyle.Danger),
      ),
    );
  }
  const list = carsByOrigin(origin);
  for (let i = 0; i < list.length; i += 3) {
    const slice = list.slice(i, i + 3);
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        ...slice.map((c) => {
          const price = inflatedCatalogCarPrice(member.guild.id, c.id);
          const canTrade = listOwnedCarsByOrigin(u, origin).length > 0;
          return new ButtonBuilder()
            .setCustomId(`${ECON_SHOP_CAR_BUY_PREFIX}${c.id}`)
            .setLabel(shopItemButtonLabel(c.label, price))
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(u.rubles < price && !canTrade);
        }),
      ),
    );
  }
  rows.push(shopDetailsNavBottomRow(`${ECON_SHOP_CAR_DETAILS_PREFIX}${origin}`, ECON_SHOP_CAR));
  return rows;
}

export function buildShopHouseListEmbed(member: GuildMember, origin: CatalogOrigin): EmbedBuilder {
  const u = getEconomyUser(member.guild.id, member.id);
  const gid = member.guild.id;
  const now = Date.now();
  const owned = listOwnedApartmentsByOrigin(u, origin);
  const lines: string[] = [`Баланс: **${fmt(u.rubles)}** ₽`];
  if (owned.length) {
    for (const rec of owned) {
      const def = getApartmentDef(rec.id);
      const ownedDays = housingOwnedDaysLabel(rec.purchasedAtMs, now);
      const util = def ? inflatedApartmentUtilityRub(gid, def.id) : 0;
      const rate = apartmentTradeInRate(rec.purchasedAtMs, now);
      lines.push(
        `• **${def?.label ?? rec.id}**${ownedDays ? ` · ${ownedDays}` : ""} · ЖКХ **${fmt(util)}** ₽/мес. · зачёт **${tradeInPctLabel(rate)}**`,
      );
    }
  } else if (origin === "soviet" && (u.housingKind ?? "none") === "rent") {
    const due = u.housingRentNextDueMs;
    lines.push(due != null ? `Сейчас: **аренда** до <t:${Math.floor(due / 1000)}:R>` : "Сейчас: **аренда**");
  } else {
    lines.push("Сейчас: **нет**");
  }
  lines.push(...shopApartmentTradeInLines(), shopPlainSellLine(APARTMENT_SELL_REFUND_RATE));
  lines.push("На кнопках — **полная** цена. После нажатия можно купить ещё одну или обменять свою.");
  const catalogLines = apartmentsByOrigin(origin).map((a) => {
    const price = inflatedCatalogApartmentPrice(gid, a.id);
    const utility = inflatedApartmentUtilityRub(gid, a.id);
    return `• **${a.label}** — **${fmt(price)}** ₽ · ${catalogStatGainLabel(a)} · ЖКХ **${fmt(utility)}** ₽/мес.`;
  });
  lines.push("", ...catalogLines);
  return new EmbedBuilder().setColor(PANEL_COLOR).setTitle(`Жильё · ${originTitle(origin)}`).setDescription(lines.join("\n"));
}

export function buildShopHouseDetailsEmbed(member: GuildMember, origin: CatalogOrigin): EmbedBuilder {
  const gid = member.guild.id;
  const lines = apartmentsByOrigin(origin).map((a) => {
    const price = inflatedCatalogApartmentPrice(gid, a.id);
    const utility = inflatedApartmentUtilityRub(gid, a.id);
    return `• **${a.label}** — **${fmt(price)}** ₽ · ${catalogStatGainLabel(a)} · ЖКХ **${fmt(utility)}** ₽/мес.`;
  });
  return new EmbedBuilder()
    .setColor(PANEL_COLOR)
    .setTitle(`Жильё · ${originTitle(origin)} · каталог`)
    .setDescription(
      [
        `Обмен: зачёт **${tradeInPctLabel(APARTMENT_TRADE_IN_RATE)}**, после 30 суток — **${tradeInPctLabel(APARTMENT_TRADE_IN_RATE_AFTER_MONTH)}**.`,
        "Полная цена модели и статы от покупки (без зачёта).",
        "",
        ...lines,
      ].join("\n"),
    );
}

export function buildShopHouseListRows(member: GuildMember, origin: CatalogOrigin): ActionRowBuilder<ButtonBuilder>[] {
  const u = getEconomyUser(member.guild.id, member.id);
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  if (listOwnedApartmentsByOrigin(u, origin).length > 0) {
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(origin === "soviet" ? ECON_SHOP_APT_SELL_SOVIET : ECON_SHOP_APT_SELL_FOREIGN)
          .setLabel("Продать")
          .setStyle(ButtonStyle.Danger),
      ),
    );
  }
  const list = apartmentsByOrigin(origin);
  for (let i = 0; i < list.length; i += 3) {
    const slice = list.slice(i, i + 3);
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        ...slice.map((a) => {
          const price = inflatedCatalogApartmentPrice(member.guild.id, a.id);
          const rentRefund =
            a.origin === "soviet" && (u.housingKind ?? "none") === "rent"
              ? housingRentUnusedRefundRub(u, Date.now(), member.guild.id)
              : 0;
          const canTrade = listOwnedApartmentsByOrigin(u, origin).length > 0;
          return new ButtonBuilder()
            .setCustomId(`${ECON_SHOP_APT_BUY_PREFIX}${a.id}`)
            .setLabel(shopItemButtonLabel(apartmentShopShortLabel(a.label), price))
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(u.rubles + rentRefund < price && !canTrade);
        }),
      ),
    );
  }
  rows.push(shopDetailsNavBottomRow(`${ECON_SHOP_HOUSE_DETAILS_PREFIX}${origin}`, ECON_SHOP_HOUSE));
  return rows;
}

export function buildShopAnimalsEmbed(member: GuildMember): EmbedBuilder {
  const u = getEconomyUser(member.guild.id, member.id);
  const pets = listOwnedPets(u);
  const lines = [
    `Баланс: **${fmt(u.rubles)}** ₽`,
    pets.length
      ? `Свои: ${pets.map((p) => formatOwnedPetLine(p)).join("; ")}`
      : "Свои: **нет**",
    "Можно держать **несколько разных типов** (по одному каждого). Покупка всегда за **полную** цену.",
    "Уход в **00:00 МСК** — ₽ и СР с каждого питомца.",
  ];
  return new EmbedBuilder().setColor(PANEL_COLOR).setTitle("Животные").setDescription(lines.join("\n"));
}

export function buildShopAnimalsRows(member: GuildMember): ActionRowBuilder<ButtonBuilder>[] {
  const hasPets = listOwnedPets(getEconomyUser(member.guild.id, member.id)).length > 0;
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(ECON_SHOP_ANIMALS_BUY).setLabel("Купить").setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(ECON_SHOP_ANIMALS_OWNED)
        .setLabel("Свои")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!hasPets),
    ),
    shopNavBottomRow(ECON_SHOP_HUB),
  ];
}

export function buildShopAnimalsBuyEmbed(member: GuildMember): EmbedBuilder {
  const u = getEconomyUser(member.guild.id, member.id);
  const catalog = PET_MODELS.map((p) => {
    const cost = scaledShopPrice(member.guild.id, p.purchaseRub);
    const ps = scaledEconomyPsIncome(member.guild.id, p.dailyPsRub);
    const owned = userOwnsPetType(u, p.id) ? " · **уже есть**" : "";
    return `• **${p.label}** — **${fmt(cost)}** ₽ · **+${fmt(ps)} СР/сут**${owned}`;
  });
  return new EmbedBuilder()
    .setColor(PANEL_COLOR)
    .setTitle("Животные · купить")
    .setDescription(
      [
        `Баланс: **${fmt(u.rubles)}** ₽`,
        "На кнопках — **полная** цена. Один питомец каждого типа.",
        "Уход в **00:00 МСК** — ₽ и СР. Части питомцев нужно жильё или телефон.",
        "",
        ...catalog,
      ].join("\n"),
    );
}

export function buildShopAnimalsDetailsEmbed(member: GuildMember): EmbedBuilder {
  const lines = PET_MODELS.map((p) => {
    const cost = scaledShopPrice(member.guild.id, p.purchaseRub);
    const upkeep = scaledEconomyExpense(member.guild.id, p.dailyUpkeepRub);
    const ps = scaledEconomyPsIncome(member.guild.id, p.dailyPsRub);
    return [
      `• **${p.label}** — **${fmt(cost)}** ₽ · содержание **${fmt(upkeep)}** ₽/сут · **+${fmt(ps)} СР/сут**`,
      `  Нужно: ${petRequirementsLine(p)}`,
    ].join("\n");
  });
  return new EmbedBuilder()
    .setColor(PANEL_COLOR)
    .setTitle("Животные · условия")
    .setDescription(["Полная цена, без зачёта. Можно держать несколько **разных** типов.", "", ...lines].join("\n"));
}

export function buildShopAnimalsBuyRows(member: GuildMember): ActionRowBuilder<ButtonBuilder>[] {
  const u = getEconomyUser(member.guild.id, member.id);
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let i = 0; i < PET_MODELS.length; i += 2) {
    const slice = PET_MODELS.slice(i, i + 2);
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        ...slice.map((p) => {
          const cost = scaledShopPrice(member.guild.id, p.purchaseRub);
          const ps = scaledEconomyPsIncome(member.guild.id, p.dailyPsRub);
          const block = petOwnershipBlockReason(u, p);
          const base = shopItemButtonLabel(p.label, cost);
          const withPs = `${base} · +${fmt(ps)} СР`;
          return new ButtonBuilder()
            .setCustomId(`${ECON_SHOP_PET_BUY_PREFIX}${p.id}`)
            .setLabel(withPs.length > 80 ? base : withPs)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(Boolean(block));
        }),
      ),
    );
  }
  rows.push(shopDetailsNavBottomRow(ECON_SHOP_ANIMALS_DETAILS, ECON_SHOP_ANIMALS));
  return rows;
}

export function buildShopAnimalsOwnedEmbed(member: GuildMember): EmbedBuilder {
  const u = getEconomyUser(member.guild.id, member.id);
  const pets = listOwnedPets(u);
  const lines = [
    pets.length
      ? pets.map((p) => `• ${formatOwnedPetLine(p)}`).join("\n")
      : "Пока **нет** питомцев. Купите в разделе **Купить**.",
  ];
  return new EmbedBuilder().setColor(PANEL_COLOR).setTitle("Животные · свои").setDescription(lines.join("\n"));
}

export function buildShopAnimalsOwnedRows(member: GuildMember): ActionRowBuilder<ButtonBuilder>[] {
  const pets = listOwnedPets(getEconomyUser(member.guild.id, member.id));
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let i = 0; i < Math.min(pets.length, 12); i += 4) {
    const slice = pets.slice(i, i + 4);
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        ...slice.map((p) =>
          new ButtonBuilder()
            .setCustomId(`${ECON_SHOP_PET_VIEW_PREFIX}${p.uid}`)
            .setLabel(shortPetButtonLabel(p))
            .setStyle(ButtonStyle.Secondary),
        ),
      ),
    );
  }
  rows.push(shopNavBottomRow(ECON_SHOP_ANIMALS));
  return rows;
}

export function buildShopPetViewEmbed(member: GuildMember, uid: string): EmbedBuilder | undefined {
  const rec = findOwnedPet(getEconomyUser(member.guild.id, member.id), uid);
  if (!rec) return undefined;
  const def = getPetDef(rec.id);
  const gid = member.guild.id;
  const upkeep = def ? scaledEconomyExpense(gid, def.dailyUpkeepRub) : 0;
  const ps = def ? scaledEconomyPsIncome(gid, def.dailyPsRub) : 0;
  const lines = [
    `Тип: **${def?.label ?? rec.id}**`,
    `Имя: **${rec.name}**`,
    `Содержание: **${fmt(upkeep)}** ₽/сут · **+${fmt(ps)} СР/сут**`,
  ];
  if (rec.pausedNoFunds) lines.push("Уход **приостановлен**: не хватило ₽ в полночь МСК.");
  return new EmbedBuilder().setColor(PANEL_COLOR).setTitle("Питомец").setDescription(lines.join("\n"));
}

export function buildShopPetViewRows(uid: string): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${ECON_SHOP_PET_RENAME_PREFIX}${uid}`)
        .setLabel("Изменить имя")
        .setStyle(ButtonStyle.Primary),
    ),
    shopNavBottomRow(ECON_SHOP_ANIMALS_OWNED),
  ];
}

export function applyRentPlanPurchase(member: GuildMember, plan: HousingRentPlan): { ok: true } | { ok: false; reply: string } {
  const u = getEconomyUser(member.guild.id, member.id);
  if ((u.housingKind ?? "none") === "owned") return { ok: false, reply: "У вас **своя советская квартира** — аренда недоступна." };
  const price = inflatedHousingRentPrice(member.guild.id, plan);
  const periodMs = housingRentPlanPeriodMs(plan);
  if (u.rubles < price) return { ok: false, reply: shopShortageLine(u.rubles, price) ?? `Не хватает ₽.` };
  const now = Date.now();
  const hk = u.housingKind ?? "none";
  const baseEnd = hk === "rent" && u.housingRentNextDueMs && u.housingRentNextDueMs > now ? u.housingRentNextDueMs : now;
  const nextDue = baseEnd + periodMs;
  const chainStart = hk === "rent" ? (u.housingRentChainStartedAtMs ?? now) : now;
  const totalPaid = (hk === "rent" ? (u.housingRentTotalPaidRub ?? 0) : 0) + price;
  let applied = false;
  updateEconomyUser(member.guild.id, member.id, (cur) => {
    if (cur.rubles < price) return cur;
    applied = true;
    return {
      ...cur,
      rubles: cur.rubles - price,
      housingKind: "rent",
      housingRentNextDueMs: nextDue,
      housingRentPlan: plan,
      housingRentLastPaidRub: price,
      housingRentLastPeriodMs: periodMs,
      housingRentChainStartedAtMs: chainStart,
      housingRentTotalPaidRub: totalPaid,
      courierBikeUntilMs: undefined,
    };
  });
  if (!applied) return { ok: false, reply: shopShortageLine(getEconomyUser(member.guild.id, member.id).rubles, price) ?? `Не хватает ₽.` };
  remitShopPurchaseVatToTreasury(member.guild.id, price);
  return { ok: true };
}

export function purchasePet(member: GuildMember, petId: string): { ok: true } | { ok: false; reply: string } {
  const def = getPetDef(petId);
  if (!def) return { ok: false, reply: "Неизвестный питомец." };
  const u = getEconomyUser(member.guild.id, member.id);
  const block = petOwnershipBlockReason(u, def);
  if (block) return { ok: false, reply: block };
  const cost = scaledShopPrice(member.guild.id, def.purchaseRub);
  if (u.rubles < cost) return { ok: false, reply: shopShortageLine(u.rubles, cost) ?? "Не хватает ₽." };
  let applied = false;
  updateEconomyUser(member.guild.id, member.id, (curU) => {
    if (curU.rubles < cost) return curU;
    if (listOwnedPets(curU).some((p) => p.id === def.id)) return curU;
    applied = true;
    return {
      ...curU,
      rubles: curU.rubles - cost,
      ownedPets: [...listOwnedPets(curU), { uid: newAssetUid(), id: def.id, name: def.label }],
    };
  });
  if (!applied) return { ok: false, reply: shopShortageLine(getEconomyUser(member.guild.id, member.id).rubles, cost) ?? "Не хватает ₽." };
  remitShopPurchaseVatToTreasury(member.guild.id, cost);
  return { ok: true };
}

export function renameOwnedPet(
  member: GuildMember,
  uid: string,
  rawName: string,
): { ok: true; name: string } | { ok: false; reply: string } {
  const rec = findOwnedPet(getEconomyUser(member.guild.id, member.id), uid);
  if (!rec) return { ok: false, reply: "Питомец не найден." };
  const fallback = getPetDef(rec.id)?.label ?? "Питомец";
  const name = sanitizePetName(rawName, fallback);
  updateEconomyUser(member.guild.id, member.id, (cur) => {
    if (!findOwnedPet(cur, uid)) return cur;
    return {
      ...cur,
      ownedPets: listOwnedPets(cur).map((p) => (p.uid === uid ? { ...p, name } : p)),
    };
  });
  return { ok: true, name };
}

function inflatedSimShopPrice(guildId: string, baseRub: number): number {
  return scaledShopPrice(guildId, baseRub);
}

type ShopSimEmbedOpts = { showHints?: boolean };

function shopSimStatusLines(member: GuildMember, opts: ShopSimEmbedOpts = {}): string[] {
  const u = getEconomyUser(member.guild.id, member.id);
  const sim = formatSimNumberFromUser(u);
  const simParts = parseSimNumberParts(u);
  const simPrestige = simParts ? computeSimPrestige(simParts) : undefined;
  const lines = [`Баланс: **${fmt(u.rubles)}** ₽`, sim ? `Номер: **${sim}**` : "Сим-карта: **не оформлена**"];
  if (simPrestige && simPrestige.total > 0) {
    lines.push(`Престиж: **${fmt(simPrestige.total)}**`);
  } else if (sim) {
    lines.push("Престиж: **0**");
  }
  if (sim) lines.push(`Баланс сим: **${fmt(u.simBalanceRub ?? 0)} ₽**`);
  if (opts.showHints) lines.push("", ...SIM_SHOP_PRESTIGE_HINT_LINES);
  if (!u.hasPhone) lines.push("", "Сначала купите **телефон**.");
  return lines;
}

export function buildShopSimEmbed(member: GuildMember, lastRoll?: SimShopLastRoll): EmbedBuilder {
  const u = getEconomyUser(member.guild.id, member.id);
  const hasSim = userHasSimNumber(u);
  const regCost = SHOP_SIM_REGISTER_BASE_RUB;
  const lines = [...shopSimStatusLines(member, { showHints: !hasSim })];
  if (!hasSim) {
    lines.push("", `Первая сим-карта — **${regCost} ₽** (+**${SHOP_SIM_START_BALANCE_RUB} ₽** на баланс сим).`);
  }
  if (lastRoll) lines.push(...formatSimRollEmbedFooter(lastRoll));
  return new EmbedBuilder().setColor(PANEL_COLOR).setTitle("Сим-карта").setDescription(lines.join("\n"));
}

export function buildShopSimChangeEmbed(member: GuildMember, lastRoll?: SimShopLastRoll): EmbedBuilder {
  const lines = [
    ...shopSimStatusLines(member),
    "",
    "Престиж = блоки (код/середина/конец) + весь номер + множители сочетаний.",
    "Выберите блок. Два других могут совпасть с чужим номером.",
  ];
  if (lastRoll) lines.push(...formatSimRollEmbedFooter(lastRoll));
  return new EmbedBuilder()
    .setColor(PANEL_COLOR)
    .setTitle("Сим-карта · смена номера")
    .setDescription(lines.join("\n"));
}

export function buildShopSimDetailsEmbed(member: GuildMember): EmbedBuilder {
  const u = getEconomyUser(member.guild.id, member.id);
  const simParts = parseSimNumberParts(u);
  const lines = [...simPrestigeRulesTableLines()];
  if (simParts) {
    const b = computeSimPrestige(simParts);
    lines.push("", `Ваш текущий номер даёт: **${fmt(b.total)}** престижа.`);
  }
  return new EmbedBuilder().setColor(PANEL_COLOR).setTitle("Сим-карта · условия").setDescription(lines.join("\n"));
}

export function buildShopSimRows(member: GuildMember): ActionRowBuilder<ButtonBuilder>[] {
  const u = getEconomyUser(member.guild.id, member.id);
  const hasSim = userHasSimNumber(u);
  const regCost = SHOP_SIM_REGISTER_BASE_RUB;
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];

  if (!hasSim) {
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(ECON_SHOP_SIM_REGISTER)
          .setLabel(`Купить сим-карту · ${regCost} ₽`)
          .setStyle(ButtonStyle.Success)
          .setDisabled(!u.hasPhone || u.rubles < regCost),
      ),
    );
  } else {
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(ECON_SHOP_SIM_TOPUP_OPEN)
          .setLabel("Пополнить сим…")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(!u.hasPhone),
        new ButtonBuilder()
          .setCustomId(ECON_SHOP_SIM_CHANGE)
          .setLabel("Изменить номер")
          .setStyle(ButtonStyle.Primary)
          .setDisabled(!u.hasPhone),
      ),
    );
  }
  rows.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(ECON_SHOP_SIM_DETAILS).setLabel("Условия").setStyle(ButtonStyle.Secondary),
    ),
  );
  rows.push(shopNavBottomRow(ECON_SHOP_PHONE, "К телефону"));
  return rows;
}

export function buildShopSimChangeRows(member: GuildMember): ActionRowBuilder<ButtonBuilder>[] {
  const u = getEconomyUser(member.guild.id, member.id);
  const gid = member.guild.id;
  const hasSim = userHasSimNumber(u);
  const opCost = inflatedSimShopPrice(gid, SHOP_SIM_CHANGE_OPERATOR_BASE_RUB);
  const midCost = inflatedSimShopPrice(gid, SHOP_SIM_CHANGE_MID_BASE_RUB);
  const lastCost = inflatedSimShopPrice(gid, SHOP_SIM_CHANGE_LAST_BASE_RUB);

  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(ECON_SHOP_SIM_OPERATOR)
        .setLabel(`Оператор · ${fmt(opCost)} ₽`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!hasSim || !u.hasPhone || u.rubles < opCost),
      new ButtonBuilder()
        .setCustomId(ECON_SHOP_SIM_MID)
        .setLabel(`Середина · ${fmt(midCost)} ₽`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!hasSim || !u.hasPhone || u.rubles < midCost),
      new ButtonBuilder()
        .setCustomId(ECON_SHOP_SIM_LAST)
        .setLabel(`Конец · ${fmt(lastCost)} ₽`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!hasSim || !u.hasPhone || u.rubles < lastCost),
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(ECON_SHOP_SIM_DETAILS).setLabel("Условия").setStyle(ButtonStyle.Secondary),
    ),
    shopNavBottomRow(ECON_SHOP_SIM),
  ];
}

function patchUserSimWithPrestige(
  guildId: string,
  userId: string,
  parts: SimNumberParts,
  rublesSpend: number,
  extra?: Partial<EconomyUser>,
): { ok: true; breakdown: ReturnType<typeof computeSimPrestige>; prestigeDelta: number } | { ok: false } {
  const breakdown = computeSimPrestige(parts);
  let applied = false;
  let prestigeDelta = 0;
  updateEconomyUser(guildId, userId, (cur) => {
    if (cur.rubles < rublesSpend) return cur;
    applied = true;
    const oldAccrued = cur.courierSimPrestige ?? 0;
    prestigeDelta = breakdown.total - oldAccrued;
    const stats = patchStatsFromShop(cur.prestigePoints ?? 0, cur.domesticPoints ?? 0, {
      prestigeDelta,
      domesticDelta: 0,
    });
    return {
      ...cur,
      rubles: cur.rubles - rublesSpend,
      courierSimNumber: undefined,
      ...simNumberPartsToPatch(parts),
      courierSimPrestige: breakdown.total,
      ...stats,
      ...extra,
    };
  });
  if (!applied) return { ok: false };
  return { ok: true, breakdown, prestigeDelta };
}

export function syncSimPrestige(member: GuildMember): void {
  const u = getEconomyUser(member.guild.id, member.id);
  const parts = parseSimNumberParts(u);
  if (!parts) return;
  const total = computeSimPrestige(parts).total;
  const accrued = u.courierSimPrestige ?? 0;
  if (total === accrued) return;
  const stats = patchStatsFromShop(u.prestigePoints ?? 0, u.domesticPoints ?? 0, {
    prestigeDelta: total - accrued,
    domesticDelta: 0,
  });
  patchEconomyUser(member.guild.id, member.id, { courierSimPrestige: total, ...stats });
}

function simLastRoll(
  action: string,
  number: string,
  breakdown: ReturnType<typeof computeSimPrestige>,
  prestigeDelta: number,
): SimShopLastRoll {
  return { action, number, breakdown, prestigeDelta };
}

function guildTakenSimNumberKeys(guildId: string, excludeUserId: string): Set<string> {
  const taken = new Set<string>();
  for (const { userId, user } of listEconomyUsers(guildId)) {
    if (userId === excludeUserId) continue;
    const parts = parseSimNumberParts(user);
    if (parts) taken.add(simNumberKey(parts));
  }
  return taken;
}

export function registerSimNumber(
  member: GuildMember,
): { ok: true; number: string; lastRoll: SimShopLastRoll } | { ok: false; reply: string } {
  const u = getEconomyUser(member.guild.id, member.id);
  if (!u.hasPhone) return { ok: false, reply: "Сначала купите **телефон**." };
  if (userHasSimNumber(u)) return { ok: false, reply: "Сим-карта **уже оформлена**." };
  const cost = SHOP_SIM_REGISTER_BASE_RUB;
  if (u.rubles < cost) return { ok: false, reply: `Нужно **${cost} ₽**.` };
  const taken = guildTakenSimNumberKeys(member.guild.id, member.id);
  const parts = rollUniqueSimNumberParts(taken);
  const simPatch = patchUserSimWithPrestige(member.guild.id, member.id, parts, cost, {
    simBalanceRub: SHOP_SIM_START_BALANCE_RUB,
  });
  if (!simPatch.ok) return { ok: false, reply: `Нужно **${cost} ₽**.` };
  remitShopPurchaseVatToTreasury(member.guild.id, cost);
  const number = formatSimNumber(parts);
  return {
    ok: true,
    number,
    lastRoll: simLastRoll("Оформлена симка", number, simPatch.breakdown, simPatch.prestigeDelta),
  };
}

export function changeSimOperator(
  member: GuildMember,
): { ok: true; number: string; lastRoll: SimShopLastRoll } | { ok: false; reply: string } {
  const u = getEconomyUser(member.guild.id, member.id);
  const cur = parseSimNumberParts(u);
  if (!cur) return { ok: false, reply: "Сначала **оформите** симку." };
  const cost = inflatedSimShopPrice(member.guild.id, SHOP_SIM_CHANGE_OPERATOR_BASE_RUB);
  if (u.rubles < cost) return { ok: false, reply: `Нужно **${fmt(cost)}** ₽.` };
  const taken = guildTakenSimNumberKeys(member.guild.id, member.id);
  const next = {
    ...cur,
    operator: rollUniqueSimOperator(taken, { mid: cur.mid, last: cur.last }),
  };
  const simPatch = patchUserSimWithPrestige(member.guild.id, member.id, next, cost);
  if (!simPatch.ok) return { ok: false, reply: `Нужно **${fmt(cost)}** ₽.` };
  remitShopPurchaseVatToTreasury(member.guild.id, cost);
  const number = formatSimNumber(next);
  return { ok: true, number, lastRoll: simLastRoll("Новый оператор", number, simPatch.breakdown, simPatch.prestigeDelta) };
}

export function changeSimMid(
  member: GuildMember,
): { ok: true; number: string; lastRoll: SimShopLastRoll } | { ok: false; reply: string } {
  const u = getEconomyUser(member.guild.id, member.id);
  const cur = parseSimNumberParts(u);
  if (!cur) return { ok: false, reply: "Сначала **оформите** симку." };
  const cost = inflatedSimShopPrice(member.guild.id, SHOP_SIM_CHANGE_MID_BASE_RUB);
  if (u.rubles < cost) return { ok: false, reply: `Нужно **${fmt(cost)}** ₽.` };
  const taken = guildTakenSimNumberKeys(member.guild.id, member.id);
  const next = {
    ...cur,
    mid: rollUniqueSimMid(taken, { operator: cur.operator, last: cur.last }),
  };
  const simPatch = patchUserSimWithPrestige(member.guild.id, member.id, next, cost);
  if (!simPatch.ok) return { ok: false, reply: `Нужно **${fmt(cost)}** ₽.` };
  remitShopPurchaseVatToTreasury(member.guild.id, cost);
  const number = formatSimNumber(next);
  return { ok: true, number, lastRoll: simLastRoll("Новая середина", number, simPatch.breakdown, simPatch.prestigeDelta) };
}

export function changeSimLast(
  member: GuildMember,
): { ok: true; number: string; lastRoll: SimShopLastRoll } | { ok: false; reply: string } {
  const u = getEconomyUser(member.guild.id, member.id);
  const cur = parseSimNumberParts(u);
  if (!cur) return { ok: false, reply: "Сначала **оформите** симку." };
  const cost = inflatedSimShopPrice(member.guild.id, SHOP_SIM_CHANGE_LAST_BASE_RUB);
  if (u.rubles < cost) return { ok: false, reply: `Нужно **${fmt(cost)}** ₽.` };
  const taken = guildTakenSimNumberKeys(member.guild.id, member.id);
  const next = {
    ...cur,
    last: rollUniqueSimLast(taken, { operator: cur.operator, mid: cur.mid }),
  };
  const simPatch = patchUserSimWithPrestige(member.guild.id, member.id, next, cost);
  if (!simPatch.ok) return { ok: false, reply: `Нужно **${fmt(cost)}** ₽.` };
  remitShopPurchaseVatToTreasury(member.guild.id, cost);
  const number = formatSimNumber(next);
  return { ok: true, number, lastRoll: simLastRoll("Новый конец", number, simPatch.breakdown, simPatch.prestigeDelta) };
}
