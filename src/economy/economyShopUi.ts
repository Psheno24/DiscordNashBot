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
  PET_MODELS,
  PET_TRADE_IN_RATE,
  PHONE_SELL_REFUND_RATE,
  PHONE_TRADE_IN_RATE,
  apartmentsByOrigin,
  carsByOrigin,
  getApartmentDef,
  getCarDef,
  getPetDef,
  getPhoneDef,
  housingRentPlanPeriodMs,
  patchStatsFromShop,
  petOwnershipBlockReason,
  petPurchaseCostRub,
  petRequirementsLine,
  phonesByOrigin,
  shopApartmentPurchaseCostRub,
  shopCarPurchaseCostRub,
  shopPhonePurchaseCostRub,
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
  clearVehiclePlatePatch,
  formatVehiclePlate,
  formatVehiclePlateFromUser,
  parseVehiclePlateParts,
  pickRandomPlateRegion,
  rollRandomVehiclePlateDigits,
  rollRandomVehiclePlateLetters,
  rollRandomVehiclePlateParts,
  type VehiclePlateParts,
  userHasOwnedCar,
  userHasVehiclePlate,
  vehiclePlatePartsToPatch,
} from "./economyLicensePlate.js";
import {
  computePlatePrestige,
  formatPlatePrestigeBreakdownShort,
  formatPlateRollEmbedFooter,
  PLATE_SHOP_PRESTIGE_HINT_LINES,
  type PlateShopLastRoll,
} from "./economyPlatePrestige.js";
import { cancelRentAndBikeOnAssetPurchase, clearSovietHousingRentPatch } from "./economyHousingUtil.js";
import { economyUserClearTier2PlusJobPatch, housingRentUnusedRefundRub, userHasActiveHousing } from "./economyHousing.js";
import {
  inflatedApartmentPurchaseCost,
  inflatedCarPurchaseCost,
  inflatedCatalogApartmentPrice,
  inflatedCatalogCarPrice,
  inflatedCatalogPhonePrice,
  inflatedHousingRentPrice,
  inflatedPhonePurchaseCost,
  scaledEconomyExpense,
  scaledEconomyPsIncome,
  scaledShopPrice,
} from "./economyMacro.js";
import { appendFeedEvent } from "./feedStore.js";
import { remitShopPurchaseVatToTreasury } from "./taxTreasury.js";
import { getEconomyUser, patchEconomyUser, type EconomyUser } from "./userStore.js";

const PANEL_COLOR = 0x2b2d31;

export const ECON_SHOP_HUB = "econ:shop:hub";
export const ECON_SHOP_PHONE = "econ:shop:phone";
export const ECON_SHOP_PHONE_ORIGIN_PREFIX = "econ:shop:phone:";
export const ECON_SHOP_PHONE_BUY_PREFIX = "econ:shop:phoneBuy:";
export const ECON_SHOP_PHONE_BUY_CONFIRM_PREFIX = "econ:shop:phoneBuyOk:";
export const ECON_SHOP_PHONE_BUY_CANCEL_PREFIX = "econ:shop:phoneBuyCan:";
export const ECON_SHOP_PHONE_SELL = "econ:shop:phone:sell";
export const ECON_SHOP_PHONE_SELL_CONFIRM = "econ:shop:phone:sell:ok";
export const ECON_SHOP_PHONE_SELL_CANCEL = "econ:shop:phone:sell:cancel";
export const ECON_SHOP_CAR = "econ:shop:car";
export const ECON_SHOP_CAR_ORIGIN_PREFIX = "econ:shop:car:";
export const ECON_SHOP_CAR_BUY_PREFIX = "econ:shop:carBuy:";
export const ECON_SHOP_CAR_BUY_CONFIRM_PREFIX = "econ:shop:carBuyOk:";
export const ECON_SHOP_CAR_BUY_CANCEL_PREFIX = "econ:shop:carBuyCan:";
export const ECON_SHOP_PLATE = "econ:shop:plate";
export const ECON_SHOP_PLATE_REGISTER = "econ:shop:plate:reg";
export const ECON_SHOP_PLATE_DIGITS = "econ:shop:plate:dig";
export const ECON_SHOP_PLATE_LETTERS = "econ:shop:plate:let";
export const ECON_SHOP_PLATE_REGION = "econ:shop:plate:regio";
export const ECON_SHOP_CAR_SELL = "econ:shop:car:sell";
export const ECON_SHOP_CAR_SELL_CONFIRM = "econ:shop:car:sell:ok";
export const ECON_SHOP_CAR_SELL_CANCEL = "econ:shop:car:sell:cancel";
export const ECON_SHOP_HOUSE = "econ:shop:house";
export const ECON_SHOP_HOUSE_ORIGIN_PREFIX = "econ:shop:house:";
/** Меню аренды (не путать с `econ:shop:house:rent:1d` и т.д.). */
export const ECON_SHOP_HOUSE_RENT_MENU = "econ:shop:house:rentMenu";
export const ECON_SHOP_HOUSE_RENT_1D = "econ:shop:house:rent:1d";
export const ECON_SHOP_HOUSE_RENT_7D = "econ:shop:house:rent:7d";
export const ECON_SHOP_HOUSE_RENT_30D = "econ:shop:house:rent:30d";
export const ECON_SHOP_HOUSE_LEAVE = "econ:shop:house:leave";
export const ECON_SHOP_APT_BUY_PREFIX = "econ:shop:aptBuy:";
export const ECON_SHOP_APT_BUY_CONFIRM_PREFIX = "econ:shop:aptBuyOk:";
export const ECON_SHOP_APT_BUY_CANCEL_PREFIX = "econ:shop:aptBuyCan:";
export const ECON_SHOP_APT_SELL_SOVIET = "econ:shop:apt:sell:sov";
export const ECON_SHOP_APT_SELL_SOVIET_CONFIRM = "econ:shop:apt:sell:sov:ok";
export const ECON_SHOP_APT_SELL_SOVIET_CANCEL = "econ:shop:apt:sell:sov:cancel";
export const ECON_SHOP_APT_SELL_FOREIGN = "econ:shop:apt:sell:for";
export const ECON_SHOP_APT_SELL_FOREIGN_CONFIRM = "econ:shop:apt:sell:for:ok";
export const ECON_SHOP_APT_SELL_FOREIGN_CANCEL = "econ:shop:apt:sell:for:cancel";
export const ECON_SHOP_ANIMALS = "econ:shop:animals";
export const ECON_SHOP_PET_BUY_PREFIX = "econ:shop:petBuy:";

function fmt(n: number): string {
  return n.toLocaleString("ru-RU");
}

function originTitle(o: CatalogOrigin): string {
  return o === "soviet" ? "Советское" : "Заморское";
}

function statLabel(item: { origin: CatalogOrigin; prestigeDelta: number; domesticDelta: number }): string {
  if (item.origin === "soviet") return `+**${fmt(item.domesticDelta)}** быта`;
  return `+**${fmt(item.prestigeDelta)}** престижа`;
}

function tradeInPctLabel(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

/** Пояснение зачёта при покупке лучшего в той же ветке (цены на кнопках уже с учётом зачёта). */
function shopUpgradeTradeInLine(rate: number): string {
  return `Апгрейд на **лучшее** в этой ветке: зачёт **${tradeInPctLabel(rate)}** каталожной цены текущего (на кнопках — итог к оплате).`;
}

function shopPlainSellLine(rate: number): string {
  return `**Продать** (без замены): возврат **${tradeInPctLabel(rate)}** каталожной цены.`;
}

function shopApartmentTradeInLines(): string[] {
  return [
    `Переезд на **лучшее** жильё той же ветки: зачёт **${tradeInPctLabel(APARTMENT_TRADE_IN_RATE)}** каталожной цены; если владели **30+ суток** — **${tradeInPctLabel(APARTMENT_TRADE_IN_RATE_AFTER_MONTH)}**.`,
  ];
}

const SHOP_BRANCH_NONE = "**нет**";

function shopBranchOwnershipBlock(u: EconomyUser, kind: "phone" | "car" | "house"): string[] {
  let soviet = SHOP_BRANCH_NONE;
  let foreign = SHOP_BRANCH_NONE;

  if (kind === "phone") {
    if (u.hasPhone) {
      const cur = getPhoneDef(u.phoneModelId);
      if (cur) {
        const label = `**${cur.label}**`;
        if (cur.origin === "soviet") soviet = label;
        else foreign = label;
      }
    }
  } else if (kind === "car") {
    const cur = getCarDef(u.ownedCarId);
    if (cur) {
      const label = `**${cur.label}**`;
      if (cur.origin === "soviet") soviet = label;
      else foreign = label;
    }
    const plate = formatVehiclePlateFromUser(u);
    return [
      "**У вас:**",
      `• **Советское:** ${soviet}`,
      `• **Заморское:** ${foreign}`,
      `• **Госномер:** ${plate ? `**${plate}**` : SHOP_BRANCH_NONE}`,
    ];
  } else {
    const hk = u.housingKind ?? "none";
    if (hk === "owned" && u.ownedApartmentId) {
      soviet = `**${getApartmentDef(u.ownedApartmentId)?.label ?? "—"}**`;
    } else if (hk === "rent" && u.housingRentNextDueMs) {
      soviet = `аренда до <t:${Math.floor(u.housingRentNextDueMs / 1000)}:R>`;
    }
    if (u.housingForeignKind === "owned" && u.ownedForeignApartmentId) {
      foreign = `**${getApartmentDef(u.ownedForeignApartmentId)?.label ?? "—"}**`;
    }
  }

  return ["**У вас:**", `• **Советское:** ${soviet}`, `• **Заморское:** ${foreign}`];
}

export function shopItemButtonLabel(short: string, cost: number): string {
  const s = short.length > 18 ? `${short.slice(0, 16)}…` : short;
  return `${s} · ${fmt(cost)}₽`;
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
        "**Советское** — быт (СР за смены и голос). **Заморское** — престиж (доп. ₽ на работах).",
        "Жильё: можно **советское** и **заморское** одновременно. Телефон и авто — **одно** из двух веток.",
        "",
        "Апгрейд на лучшее в той же ветке уменьшает цену за счёт текущего: телефон **50%**, авто **75%**, жильё **90–120%**, питомец **50%** (подробнее в разделе).",
        `Продажа без замены: телефон **${tradeInPctLabel(PHONE_SELL_REFUND_RATE)}**, авто **${tradeInPctLabel(CAR_SELL_REFUND_RATE)}**, жильё **${tradeInPctLabel(APARTMENT_SELL_REFUND_RATE)}** каталожной цены.`,
      ].join("\n"),
    );
}

export const ECON_SHOP_SIM = "econ:shop:sim";
export const ECON_SHOP_LOTTERY = "econ:shop:lottery";
export const ECON_SHOP_APPEARANCE = "econ:shop:appearance";

export function buildShopHubRows(member: GuildMember): ActionRowBuilder<ButtonBuilder>[] {
  const u = getEconomyUser(member.guild.id, member.id);
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(ECON_SHOP_PHONE).setLabel("Телефон").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(ECON_SHOP_SIM)
        .setLabel("Симка")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!u.hasPhone),
      new ButtonBuilder().setCustomId(ECON_SHOP_CAR).setLabel("Авто").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(ECON_SHOP_HOUSE).setLabel("Жильё").setStyle(ButtonStyle.Secondary),
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(ECON_SHOP_ANIMALS).setLabel("Животные").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(ECON_SHOP_LOTTERY).setLabel("Лотерея").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(ECON_SHOP_APPEARANCE).setLabel("Оформление").setStyle(ButtonStyle.Secondary),
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId("econ:menu").setLabel("Главное меню").setStyle(ButtonStyle.Secondary),
    ),
  ];
}

export function buildShopOriginPickEmbed(
  title: string,
  member: GuildMember,
  kind: "phone" | "car",
): EmbedBuilder {
  const u = getEconomyUser(member.guild.id, member.id);
  const lines = [
    `Баланс: **${fmt(u.rubles)}** ₽ · престиж **${fmt(u.prestigePoints ?? 0)}** · быт **${fmt(u.domesticPoints ?? 0)}**`,
    "",
    ...shopBranchOwnershipBlock(u, kind),
  ];
  if (kind === "car") {
    lines.push("", ...SHOP_CAR_PLATE_HINT_LINES);
  }
  return new EmbedBuilder().setColor(PANEL_COLOR).setTitle(title).setDescription(lines.join("\n"));
}

export function buildShopOriginPickRows(kind: "phone" | "car", backId: string): ActionRowBuilder<ButtonBuilder>[] {
  const prefix = kind === "phone" ? ECON_SHOP_PHONE_ORIGIN_PREFIX : ECON_SHOP_CAR_ORIGIN_PREFIX;
  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`${prefix}soviet`).setLabel("Советское").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`${prefix}foreign`).setLabel("Заморское").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(backId).setLabel("Назад").setStyle(ButtonStyle.Secondary),
  );
  if (kind === "phone") return [row1];
  return [
    row1,
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(ECON_SHOP_PLATE).setLabel("Гос.номер").setStyle(ButtonStyle.Secondary),
    ),
  ];
}

function inflatedPlateShopPrice(guildId: string, baseRub: number): number {
  return scaledShopPrice(guildId, baseRub);
}

export function buildShopPlateEmbed(member: GuildMember, lastRoll?: PlateShopLastRoll): EmbedBuilder {
  const u = getEconomyUser(member.guild.id, member.id);
  const plate = formatVehiclePlateFromUser(u);
  const plateParts = parseVehiclePlateParts(u);
  const platePrestige = plateParts ? computePlatePrestige(plateParts) : undefined;
  const lines = [
    `Баланс: **${fmt(u.rubles)}** ₽`,
    "",
    "При покупке **любого** авто нужно оформить **госномер**. Иначе — штраф **10%** к заработку на работах, сменах и прочих начислениях.",
    "Номер **сохраняется** при замене авто на лучшее; при **продаже** авто госномер **теряется**.",
    "Буквы и цифры в серии **могут повторяться** (например **В 888 ВВ**, **А 777 АА**).",
    "",
    ...PLATE_SHOP_PRESTIGE_HINT_LINES,
    "",
    plate ? `Текущий номер: **${plate}**` : "Госномер: **не оформлен**",
  ];
  if (platePrestige && platePrestige.total > 0) {
    lines.push(`Престиж с номера: **${fmt(platePrestige.total)}**`);
    if (!lastRoll) {
      lines.push(`(${formatPlatePrestigeBreakdownShort(platePrestige)})`);
      if (platePrestige.regionHint) lines.push(platePrestige.regionHint);
    }
  } else if (plate) {
    lines.push("Престиж с номера: **0**");
  }
  if (lastRoll) lines.push(...formatPlateRollEmbedFooter(lastRoll));
  return new EmbedBuilder().setColor(PANEL_COLOR).setTitle("Гос.номер").setDescription(lines.join("\n"));
}

export function buildShopPlateRows(member: GuildMember): ActionRowBuilder<ButtonBuilder>[] {
  const u = getEconomyUser(member.guild.id, member.id);
  const gid = member.guild.id;
  const hasCar = userHasOwnedCar(u);
  const hasPlate = userHasVehiclePlate(u);
  const regCost = inflatedPlateShopPrice(gid, SHOP_PLATE_REGISTER_BASE_RUB);
  const digCost = inflatedPlateShopPrice(gid, SHOP_PLATE_CHANGE_DIGITS_BASE_RUB);
  const letCost = inflatedPlateShopPrice(gid, SHOP_PLATE_CHANGE_LETTERS_BASE_RUB);
  const regioCost = inflatedPlateShopPrice(gid, SHOP_PLATE_CHANGE_REGION_BASE_RUB);

  const digitsBtn = new ButtonBuilder()
    .setCustomId(ECON_SHOP_PLATE_DIGITS)
    .setLabel(`Цифры · ${fmt(digCost)}₽`)
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(!hasPlate || u.rubles < digCost);
  const lettersBtn = new ButtonBuilder()
    .setCustomId(ECON_SHOP_PLATE_LETTERS)
    .setLabel(`Буквы · ${fmt(letCost)}₽`)
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(!hasPlate || u.rubles < letCost);
  const regionBtn = new ButtonBuilder()
    .setCustomId(ECON_SHOP_PLATE_REGION)
    .setLabel(`Регион · ${fmt(regioCost)}₽`)
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(!hasPlate || u.rubles < regioCost);

  const mainRow = new ActionRowBuilder<ButtonBuilder>();
  if (!hasPlate) {
    mainRow.addComponents(
      new ButtonBuilder()
        .setCustomId(ECON_SHOP_PLATE_REGISTER)
        .setLabel(`Оформить · ${fmt(regCost)}₽`)
        .setStyle(ButtonStyle.Success)
        .setDisabled(!hasCar || u.rubles < regCost),
      ButtonBuilder.from(digitsBtn).setDisabled(true),
      ButtonBuilder.from(lettersBtn).setDisabled(true),
      ButtonBuilder.from(regionBtn).setDisabled(true),
    );
  } else {
    mainRow.addComponents(digitsBtn, lettersBtn, regionBtn);
  }

  return [
    mainRow,
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(ECON_SHOP_CAR).setLabel("Назад").setStyle(ButtonStyle.Secondary),
    ),
  ];
}

export function buildShopCarSellConfirmEmbed(member: GuildMember): EmbedBuilder {
  const u = getEconomyUser(member.guild.id, member.id);
  const cur = getCarDef(u.ownedCarId);
  const refund = cur
    ? Math.floor(inflatedCatalogCarPrice(member.guild.id, cur.id) * CAR_SELL_REFUND_RATE)
    : 0;
  const plate = formatVehiclePlateFromUser(u);
  const lines = [
    `Продать **${cur?.label ?? "авто"}**?`,
    `Вернётся **${fmt(refund)}** ₽ (**${tradeInPctLabel(CAR_SELL_REFUND_RATE)}** каталожной цены).`,
    "",
    "Это **продажа**, не замена на лучшее — авто исчезнет с профиля.",
  ];
  if (plate) {
    lines.push("", `⚠️ Вместе с авто будет снят госномер **${plate}**. При следующей покупке авто номер нужно оформить **заново**.`);
  }
  return new EmbedBuilder().setColor(PANEL_COLOR).setTitle("Подтверждение продажи").setDescription(lines.join("\n"));
}

export function buildShopCarSellConfirmRows(): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(ECON_SHOP_CAR_SELL_CONFIRM).setLabel("Продать").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(ECON_SHOP_CAR_SELL_CANCEL).setLabel("Отменить").setStyle(ButtonStyle.Secondary),
    ),
  ];
}

function buildShopConfirmRows(
  confirmId: string,
  confirmLabel: string,
  confirmStyle: ButtonStyle.Success | ButtonStyle.Danger,
  cancelId: string,
): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(confirmId).setLabel(confirmLabel).setStyle(confirmStyle),
      new ButtonBuilder().setCustomId(cancelId).setLabel("Отменить").setStyle(ButtonStyle.Secondary),
    ),
  ];
}

export function buildShopPhoneBuyConfirmEmbed(member: GuildMember, pid: string): EmbedBuilder | undefined {
  const defP = getPhoneDef(pid);
  if (!defP) return undefined;
  const u = getEconomyUser(member.guild.id, member.id);
  const cur = getPhoneDef(u.phoneModelId);
  const cost = inflatedPhonePurchaseCost(member.guild.id, cur, defP, Boolean(u.hasPhone));
  const lines = [
    `Купить **${defP.label}**?`,
    `Спишется **${fmt(cost)}** ₽ с личного счёта.`,
    `Бонус: ${statLabel(defP)}`,
  ];
  if (cur && cur.origin === defP.origin && u.hasPhone) {
    const credit = Math.floor(inflatedCatalogPhonePrice(member.guild.id, cur.id) * PHONE_TRADE_IN_RATE);
    lines.push("", `Зачёт за **${cur.label}**: **−${fmt(credit)}** ₽ (**${tradeInPctLabel(PHONE_TRADE_IN_RATE)}** каталожной цены).`);
  }
  return new EmbedBuilder().setColor(PANEL_COLOR).setTitle("Подтверждение покупки").setDescription(lines.join("\n"));
}

export function buildShopPhoneBuyConfirmRows(pid: string, origin: CatalogOrigin): ActionRowBuilder<ButtonBuilder>[] {
  return buildShopConfirmRows(
    `${ECON_SHOP_PHONE_BUY_CONFIRM_PREFIX}${pid}`,
    "Купить",
    ButtonStyle.Success,
    `${ECON_SHOP_PHONE_BUY_CANCEL_PREFIX}${origin}`,
  );
}

export function buildShopCarBuyConfirmEmbed(member: GuildMember, cid: string): EmbedBuilder | undefined {
  const defC = getCarDef(cid);
  if (!defC) return undefined;
  const u = getEconomyUser(member.guild.id, member.id);
  const cur = getCarDef(u.ownedCarId);
  const cost = inflatedCarPurchaseCost(member.guild.id, cur, defC);
  const lines = [
    `Купить **${defC.label}**?`,
    `Спишется **${fmt(cost)}** ₽ с личного счёта.`,
    `Бонус: ${statLabel(defC)}`,
  ];
  if (cur && cur.origin === defC.origin) {
    const credit = Math.floor(inflatedCatalogCarPrice(member.guild.id, cur.id) * CAR_TRADE_IN_RATE);
    lines.push("", `Зачёт за **${cur.label}**: **−${fmt(credit)}** ₽ (**${tradeInPctLabel(CAR_TRADE_IN_RATE)}** каталожной цены).`);
  }
  return new EmbedBuilder().setColor(PANEL_COLOR).setTitle("Подтверждение покупки").setDescription(lines.join("\n"));
}

export function buildShopCarBuyConfirmRows(cid: string, origin: CatalogOrigin): ActionRowBuilder<ButtonBuilder>[] {
  return buildShopConfirmRows(
    `${ECON_SHOP_CAR_BUY_CONFIRM_PREFIX}${cid}`,
    "Купить",
    ButtonStyle.Success,
    `${ECON_SHOP_CAR_BUY_CANCEL_PREFIX}${origin}`,
  );
}

export function buildShopApartmentBuyConfirmEmbed(member: GuildMember, aid: string): EmbedBuilder | undefined {
  const defA = getApartmentDef(aid);
  if (!defA) return undefined;
  const u = getEconomyUser(member.guild.id, member.id);
  const now = Date.now();
  const gid = member.guild.id;
  const curA =
    defA.origin === "soviet" && (u.housingKind ?? "none") === "owned"
      ? getApartmentDef(u.ownedApartmentId)
      : undefined;
  const curF = defA.origin === "foreign" && u.housingForeignKind === "owned" ? getApartmentDef(u.ownedForeignApartmentId) : undefined;
  const cur = curA ?? curF;
  const cost =
    cur && ((defA.origin === "soviet" && (u.housingKind ?? "none") === "owned") || (defA.origin === "foreign" && u.housingForeignKind === "owned"))
      ? inflatedApartmentPurchaseCost(
          gid,
          cur,
          defA,
          defA.origin === "soviet" ? u.ownedApartmentPurchasedAtMs : u.ownedForeignApartmentPurchasedAtMs,
          now,
        )
      : inflatedCatalogApartmentPrice(gid, defA.id);
  const lines = [
    `Купить **${defA.label}**?`,
    `Спишется **${fmt(cost)}** ₽ с личного счёта.`,
    `Бонус: ${statLabel(defA)}`,
  ];
  if (defA.origin === "soviet" && (u.housingKind ?? "none") === "rent") {
    const rentRefund = housingRentUnusedRefundRub(u, now, gid);
    if (rentRefund > 0) {
      lines.push("", `Возврат неиспользованной аренды: **+${fmt(rentRefund)}** ₽.`);
    }
  }
  if (cur && cur.origin === defA.origin) {
    const rate =
      defA.origin === "soviet"
        ? (u.ownedApartmentPurchasedAtMs != null && now - u.ownedApartmentPurchasedAtMs >= HOUSING_CALENDAR_MONTH_MS
            ? APARTMENT_TRADE_IN_RATE_AFTER_MONTH
            : APARTMENT_TRADE_IN_RATE)
        : u.ownedForeignApartmentPurchasedAtMs != null &&
            now - u.ownedForeignApartmentPurchasedAtMs >= HOUSING_CALENDAR_MONTH_MS
          ? APARTMENT_TRADE_IN_RATE_AFTER_MONTH
          : APARTMENT_TRADE_IN_RATE;
    const credit = Math.floor(inflatedCatalogApartmentPrice(gid, cur.id) * rate);
    lines.push("", `Зачёт за **${cur.label}**: **−${fmt(credit)}** ₽ (**${tradeInPctLabel(rate)}** каталожной цены).`);
  }
  return new EmbedBuilder().setColor(PANEL_COLOR).setTitle("Подтверждение покупки").setDescription(lines.join("\n"));
}

export function buildShopApartmentBuyConfirmRows(aid: string, origin: CatalogOrigin): ActionRowBuilder<ButtonBuilder>[] {
  return buildShopConfirmRows(
    `${ECON_SHOP_APT_BUY_CONFIRM_PREFIX}${aid}`,
    "Купить",
    ButtonStyle.Success,
    `${ECON_SHOP_APT_BUY_CANCEL_PREFIX}${origin}`,
  );
}

export function buildShopPhoneSellConfirmEmbed(member: GuildMember): EmbedBuilder {
  const u = getEconomyUser(member.guild.id, member.id);
  const cur = getPhoneDef(u.phoneModelId);
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

export function buildShopPhoneSellConfirmRows(origin: CatalogOrigin): ActionRowBuilder<ButtonBuilder>[] {
  return buildShopConfirmRows(
    ECON_SHOP_PHONE_SELL_CONFIRM,
    "Продать",
    ButtonStyle.Danger,
    `${ECON_SHOP_PHONE_SELL_CANCEL}:${origin}`,
  );
}

export function buildShopApartmentSellConfirmEmbed(member: GuildMember, origin: "soviet" | "foreign"): EmbedBuilder {
  const u = getEconomyUser(member.guild.id, member.id);
  const cur =
    origin === "soviet" ? getApartmentDef(u.ownedApartmentId) : getApartmentDef(u.ownedForeignApartmentId);
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
    `Баланс: **${fmt(u.rubles)}** ₽ · престиж **${fmt(u.prestigePoints ?? 0)}** · быт **${fmt(u.domesticPoints ?? 0)}**`,
    "",
    ...shopBranchOwnershipBlock(u, "house"),
    "",
    "**Советское** — покупка (быт). **Заморское** — покупка (престиж). Можно владеть **обоими** сразу.",
    "**Аренда** — только советское жильё, для работ 2+ уровня.",
  ];
  if (hk === "owned" && u.ownedApartmentId) {
    lines.push("", "Своя **советская** квартира — аренда **недоступна**.");
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
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(backId).setLabel("Назад").setStyle(ButtonStyle.Secondary),
    ),
  ];
}

export function buildShopHouseRentEmbed(member: GuildMember): EmbedBuilder {
  const u = getEconomyUser(member.guild.id, member.id);
  const gid = member.guild.id;
  const hk = u.housingKind ?? "none";
  const lines = [
    `Баланс: **${fmt(u.rubles)}** ₽`,
    "",
    "Аренда **советского** жилья — для **работ 2+** и **тир-3** (пока действует срок).",
    "",
    `• **1 сутки** — **${fmt(inflatedHousingRentPrice(gid, "day"))}** ₽`,
    `• **7 суток** — **${fmt(inflatedHousingRentPrice(gid, "week"))}** ₽`,
    `• **30 суток** — **${fmt(inflatedHousingRentPrice(gid, "month"))}** ₽`,
  ];
  if (hk === "rent" && u.housingRentNextDueMs) {
    lines.push("", `Оплачено **до** <t:${Math.floor(u.housingRentNextDueMs / 1000)}:F>. Продление **добавляет** срок.`);
  } else if (hk === "owned") {
    lines.push("", "У вас **своя** советская квартира — аренда **недоступна**.");
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
          .setLabel(`1 сут · ${fmt(inflatedHousingRentPrice(gid, "day"))}₽`)
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(ECON_SHOP_HOUSE_RENT_7D)
          .setLabel(`7 сут · ${fmt(inflatedHousingRentPrice(gid, "week"))}₽`)
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(ECON_SHOP_HOUSE_RENT_30D)
          .setLabel(`30 сут · ${fmt(inflatedHousingRentPrice(gid, "month"))}₽`)
          .setStyle(ButtonStyle.Secondary),
      ),
    );
  }
  if (hk === "rent") {
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(ECON_SHOP_HOUSE_LEAVE).setLabel("Съехать").setStyle(ButtonStyle.Danger),
      ),
    );
  }
  rows.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(ECON_SHOP_HOUSE).setLabel("Назад").setStyle(ButtonStyle.Secondary),
    ),
  );
  return rows;
}

export function parseOriginFromSuffix(suffix: string): CatalogOrigin | undefined {
  if (suffix === "soviet") return "soviet";
  if (suffix === "foreign") return "foreign";
  return undefined;
}

export function buildShopPhoneListEmbed(member: GuildMember, origin: CatalogOrigin): EmbedBuilder {
  const u = getEconomyUser(member.guild.id, member.id);
  const cur = getPhoneDef(u.phoneModelId);
  const lines = phonesByOrigin(origin).map(
    (p) => `• **${p.label}** — **${fmt(inflatedCatalogPhonePrice(member.guild.id, p.id))}** ₽ (${statLabel(p)})`,
  );
  return new EmbedBuilder()
    .setColor(PANEL_COLOR)
    .setTitle(`Телефон · ${originTitle(origin)}`)
    .setDescription(
      [
        `Баланс: **${fmt(u.rubles)}** ₽`,
        cur ? `Сейчас: **${cur.label}**` : "Сейчас: **нет**",
        "",
        shopUpgradeTradeInLine(PHONE_TRADE_IN_RATE),
        shopPlainSellLine(PHONE_SELL_REFUND_RATE),
        "",
        ...lines,
      ].join("\n"),
    );
}

export function buildShopPhoneListRows(member: GuildMember, origin: CatalogOrigin): ActionRowBuilder<ButtonBuilder>[] {
  const u = getEconomyUser(member.guild.id, member.id);
  const cur = getPhoneDef(u.phoneModelId);
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  if (u.hasPhone && cur?.origin === origin) {
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
          const cost = inflatedPhonePurchaseCost(member.guild.id, cur, p, Boolean(u.hasPhone));
          const downgrade =
            cur &&
            cur.origin === origin &&
            inflatedCatalogPhonePrice(member.guild.id, p.id) < inflatedCatalogPhonePrice(member.guild.id, cur.id);
          const disabled = downgrade || u.rubles < cost || (cur?.id === p.id && Boolean(u.hasPhone));
          return new ButtonBuilder()
            .setCustomId(`${ECON_SHOP_PHONE_BUY_PREFIX}${p.id}`)
            .setLabel(shopItemButtonLabel(p.label.split(" ")[0] ?? p.label, cost))
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled);
        }),
      ),
    );
  }
  rows.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(ECON_SHOP_PHONE).setLabel("Назад").setStyle(ButtonStyle.Secondary),
    ),
  );
  return rows;
}

export function buildShopCarListEmbed(member: GuildMember, origin: CatalogOrigin): EmbedBuilder {
  const u = getEconomyUser(member.guild.id, member.id);
  const cur = getCarDef(u.ownedCarId);
  const lines = carsByOrigin(origin).map(
    (c) =>
      `• **${c.label}** — **${fmt(inflatedCatalogCarPrice(member.guild.id, c.id))}** ₽ (${statLabel(c)}) · КД доставки **${(c.courierShiftCdMs / 3600000).toFixed(2).replace(/\.?0+$/, "")}** ч`,
  );
  const plateLine = formatVehiclePlateFromUser(u);
  return new EmbedBuilder()
    .setColor(PANEL_COLOR)
    .setTitle(`Авто · ${originTitle(origin)}`)
    .setDescription(
      [
        `Баланс: **${fmt(u.rubles)}** ₽`,
        cur ? `Сейчас: **${cur.label}**` : "Сейчас: **нет**",
        plateLine ? `Госномер: **${plateLine}**` : "Госномер: **нет**",
        "",
        ...SHOP_CAR_PLATE_HINT_LINES,
        "",
        shopUpgradeTradeInLine(CAR_TRADE_IN_RATE),
        shopPlainSellLine(CAR_SELL_REFUND_RATE),
        "",
        ...lines,
      ].join("\n"),
    );
}

export function buildShopCarListRows(member: GuildMember, origin: CatalogOrigin): ActionRowBuilder<ButtonBuilder>[] {
  const u = getEconomyUser(member.guild.id, member.id);
  const cur = getCarDef(u.ownedCarId);
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  if (cur && cur.origin === origin) {
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
          const cost = inflatedCarPurchaseCost(member.guild.id, cur, c);
          const downgrade =
            cur &&
            cur.origin === origin &&
            inflatedCatalogCarPrice(member.guild.id, c.id) < inflatedCatalogCarPrice(member.guild.id, cur.id);
          const disabled = downgrade || u.rubles < cost || cur?.id === c.id;
          return new ButtonBuilder()
            .setCustomId(`${ECON_SHOP_CAR_BUY_PREFIX}${c.id}`)
            .setLabel(shopItemButtonLabel(c.label.split(" ")[0] ?? c.label, cost))
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled);
        }),
      ),
    );
  }
  rows.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(ECON_SHOP_CAR).setLabel("Назад").setStyle(ButtonStyle.Secondary),
    ),
  );
  return rows;
}

export function buildShopHouseListEmbed(member: GuildMember, origin: CatalogOrigin): EmbedBuilder {
  const u = getEconomyUser(member.guild.id, member.id);
  const lines: string[] = [`Баланс: **${fmt(u.rubles)}** ₽`, ""];
  if (origin === "soviet") {
    if (u.housingKind === "owned" && u.ownedApartmentId) {
      lines.push(`Своё: **${getApartmentDef(u.ownedApartmentId)?.label ?? "—"}**`, "");
    } else {
      lines.push("Покупка **советского** жилья. Аренда — отдельная кнопка в меню жилья.", "");
    }
  } else if (u.housingForeignKind === "owned" && u.ownedForeignApartmentId) {
    lines.push(`Своё: **${getApartmentDef(u.ownedForeignApartmentId)?.label ?? "—"}**`, "");
  }
  lines.push("", ...shopApartmentTradeInLines());
  lines.push(shopPlainSellLine(APARTMENT_SELL_REFUND_RATE), "");
  for (const a of apartmentsByOrigin(origin)) {
    lines.push(`• **${a.label}** — **${fmt(inflatedCatalogApartmentPrice(member.guild.id, a.id))}** ₽ (${statLabel(a)})`);
  }
  return new EmbedBuilder().setColor(PANEL_COLOR).setTitle(`Жильё · ${originTitle(origin)}`).setDescription(lines.join("\n"));
}

export function buildShopHouseListRows(member: GuildMember, origin: CatalogOrigin): ActionRowBuilder<ButtonBuilder>[] {
  const u = getEconomyUser(member.guild.id, member.id);
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  const now = Date.now();

  if (origin === "soviet" && u.housingKind === "owned" && u.ownedApartmentId) {
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(ECON_SHOP_APT_SELL_SOVIET).setLabel("Продать").setStyle(ButtonStyle.Danger),
      ),
    );
  } else if (origin === "foreign" && u.housingForeignKind === "owned" && u.ownedForeignApartmentId) {
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(ECON_SHOP_APT_SELL_FOREIGN).setLabel("Продать").setStyle(ButtonStyle.Danger),
      ),
    );
  }

  const curA =
    origin === "soviet" && u.housingKind === "owned" ? getApartmentDef(u.ownedApartmentId) : undefined;
  const curF =
    origin === "foreign" && u.housingForeignKind === "owned" ? getApartmentDef(u.ownedForeignApartmentId) : undefined;
  const cur = curA ?? curF;
  const list = apartmentsByOrigin(origin);

  for (let i = 0; i < list.length; i += 3) {
    const slice = list.slice(i, i + 3);
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        ...slice.map((a) => {
          const cost =
            cur &&
            ((origin === "soviet" && u.housingKind === "owned") ||
              (origin === "foreign" && u.housingForeignKind === "owned"))
              ? inflatedApartmentPurchaseCost(
                  member.guild.id,
                  cur,
                  a,
                  origin === "soviet" ? u.ownedApartmentPurchasedAtMs : u.ownedForeignApartmentPurchasedAtMs,
                  now,
                )
              : inflatedCatalogApartmentPrice(member.guild.id, a.id);
          const downgrade =
            cur &&
            cur.origin === origin &&
            inflatedCatalogApartmentPrice(member.guild.id, a.id) <
              inflatedCatalogApartmentPrice(member.guild.id, cur.id);
          const ownedSame =
            (origin === "soviet" && u.housingKind === "owned" && u.ownedApartmentId === a.id) ||
            (origin === "foreign" && u.housingForeignKind === "owned" && u.ownedForeignApartmentId === a.id);
          return new ButtonBuilder()
            .setCustomId(`${ECON_SHOP_APT_BUY_PREFIX}${a.id}`)
            .setLabel(shopItemButtonLabel(a.label.slice(0, 12), cost))
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(downgrade || u.rubles < cost || ownedSame);
        }),
      ),
    );
  }

  rows.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(ECON_SHOP_HOUSE).setLabel("Назад").setStyle(ButtonStyle.Secondary),
    ),
  );
  return rows;
}

export function buildShopAnimalsEmbed(member: GuildMember): EmbedBuilder {
  const u = getEconomyUser(member.guild.id, member.id);
  const cur = getPetDef(u.ownedPetId);
  const gid = member.guild.id;
  const lines = PET_MODELS.map((p) => {
    const cost = scaledShopPrice(gid, petPurchaseCostRub(cur, p));
    const upkeep = scaledEconomyExpense(gid, p.dailyUpkeepRub);
    const psDay = scaledEconomyPsIncome(gid, p.dailyPsRub);
    return [
      `• **${p.label}** — покупка **${fmt(cost)}** ₽, **${fmt(upkeep)}** ₽/сут, **+${fmt(psDay)}** СР/сут`,
      `  Требования: ${petRequirementsLine(p)}`,
    ].join("\n");
  });
  return new EmbedBuilder()
    .setColor(PANEL_COLOR)
    .setTitle("Животные")
    .setDescription(
      [
        `Баланс: **${fmt(u.rubles)}** ₽`,
        cur ? `Питомец: **${cur.label}**` : "Питомец: **нет**",
        shopUpgradeTradeInLine(PET_TRADE_IN_RATE),
        "Уход в **00:00 МСК**: списание ₽ и начисление СР; без денег на содержание бонус СР **не начисляется**.",
        "Жильё для питомцев — только **собственность** (аренда не подходит).",
        "",
        ...lines,
      ].join("\n"),
    );
}

export function buildShopAnimalsRows(member: GuildMember): ActionRowBuilder<ButtonBuilder>[] {
  const u = getEconomyUser(member.guild.id, member.id);
  const cur = getPetDef(u.ownedPetId);
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let i = 0; i < PET_MODELS.length; i += 2) {
    const slice = PET_MODELS.slice(i, i + 2);
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        ...slice.map((p) => {
          const cost = scaledShopPrice(member.guild.id, petPurchaseCostRub(cur, p));
          const block = petOwnershipBlockReason(u, p);
          return new ButtonBuilder()
            .setCustomId(`${ECON_SHOP_PET_BUY_PREFIX}${p.id}`)
            .setLabel(shopItemButtonLabel(p.label, cost))
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(Boolean(block) || u.rubles < cost || cur?.id === p.id);
        }),
      ),
    );
  }
  rows.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(ECON_SHOP_HUB).setLabel("Назад").setStyle(ButtonStyle.Secondary),
    ),
  );
  return rows;
}

export function applyRentPlanPurchase(member: GuildMember, plan: HousingRentPlan): { ok: true } | { ok: false; reply: string } {
  const u = getEconomyUser(member.guild.id, member.id);
  if ((u.housingKind ?? "none") === "owned") return { ok: false, reply: "У вас **своя советская квартира** — аренда недоступна." };
  const price = inflatedHousingRentPrice(member.guild.id, plan);
  const periodMs = housingRentPlanPeriodMs(plan);
  if (u.rubles < price) return { ok: false, reply: `Нужно **${fmt(price)}** ₽.` };
  const now = Date.now();
  const hk = u.housingKind ?? "none";
  const baseEnd = hk === "rent" && u.housingRentNextDueMs && u.housingRentNextDueMs > now ? u.housingRentNextDueMs : now;
  const nextDue = baseEnd + periodMs;
  const chainStart = hk === "rent" ? (u.housingRentChainStartedAtMs ?? now) : now;
  const totalPaid = (hk === "rent" ? (u.housingRentTotalPaidRub ?? 0) : 0) + price;
  patchEconomyUser(member.guild.id, member.id, {
    rubles: u.rubles - price,
    housingKind: "rent",
    housingRentNextDueMs: nextDue,
    housingRentPlan: plan,
    housingRentLastPaidRub: price,
    housingRentLastPeriodMs: periodMs,
    housingRentChainStartedAtMs: chainStart,
    housingRentTotalPaidRub: totalPaid,
    courierBikeUntilMs: undefined,
  });
  remitShopPurchaseVatToTreasury(member.guild.id, price);
  return { ok: true };
}

export function purchasePhone(member: GuildMember, pid: string): { ok: true } | { ok: false; reply: string } {
  const defP = getPhoneDef(pid);
  if (!defP) return { ok: false, reply: "Неизвестная модель." };
  const u = getEconomyUser(member.guild.id, member.id);
  const cur = getPhoneDef(u.phoneModelId);
  const cost = inflatedPhonePurchaseCost(member.guild.id, cur, defP, Boolean(u.hasPhone));
  if (cur && inflatedCatalogPhonePrice(member.guild.id, defP.id) < inflatedCatalogPhonePrice(member.guild.id, cur.id)) {
    return { ok: false, reply: "Понижение модели **недоступно**." };
  }
  if (u.rubles < cost) return { ok: false, reply: `Нужно ещё **${fmt(cost)}** ₽.` };
  if (cur?.id === defP.id && u.hasPhone) return { ok: false, reply: "У вас уже эта модель." };
  const stats = patchStatsFromShop(u.prestigePoints ?? 0, u.domesticPoints ?? 0, statDeltasOnReplace(cur, defP));
  patchEconomyUser(member.guild.id, member.id, {
    rubles: u.rubles - cost,
    hasPhone: true,
    phoneModelId: defP.id,
    ...stats,
  });
  remitShopPurchaseVatToTreasury(member.guild.id, cost);
  return { ok: true };
}

export function purchaseCar(member: GuildMember, cid: string): { ok: true } | { ok: false; reply: string } {
  const defC = getCarDef(cid);
  if (!defC) return { ok: false, reply: "Неизвестное авто." };
  const u = getEconomyUser(member.guild.id, member.id);
  const cur = getCarDef(u.ownedCarId);
  const cost = inflatedCarPurchaseCost(member.guild.id, cur, defC);
  if (cur && inflatedCatalogCarPrice(member.guild.id, defC.id) < inflatedCatalogCarPrice(member.guild.id, cur.id)) {
    return { ok: false, reply: "Понижение класса **недоступно**." };
  }
  if (u.rubles < cost) return { ok: false, reply: `Нужно ещё **${fmt(cost)}** ₽.` };
  if (cur?.id === defC.id) return { ok: false, reply: "У вас уже это авто." };
  const stats = patchStatsFromShop(u.prestigePoints ?? 0, u.domesticPoints ?? 0, statDeltasOnReplace(cur, defC));
  patchEconomyUser(member.guild.id, member.id, {
    rubles: u.rubles - cost,
    ownedCarId: defC.id,
    ...stats,
    ...cancelRentAndBikeOnAssetPurchase(u),
  });
  remitShopPurchaseVatToTreasury(member.guild.id, cost);
  return { ok: true };
}

function patchUserPlateWithPrestige(
  guildId: string,
  userId: string,
  u: EconomyUser,
  parts: VehiclePlateParts,
  rublesAfter: number,
): { breakdown: ReturnType<typeof computePlatePrestige>; prestigeDelta: number; prestigeAccrued: number } {
  const breakdown = computePlatePrestige(parts);
  const oldAccrued = u.vehiclePlatePrestige ?? 0;
  const prestigeDelta = breakdown.total - oldAccrued;
  const stats = patchStatsFromShop(u.prestigePoints ?? 0, u.domesticPoints ?? 0, {
    prestigeDelta,
    domesticDelta: 0,
  });
  patchEconomyUser(guildId, userId, {
    rubles: rublesAfter,
    ...vehiclePlatePartsToPatch(parts),
    vehiclePlatePrestige: breakdown.total,
    ...stats,
  });
  return { breakdown, prestigeDelta, prestigeAccrued: breakdown.total };
}

/** Однократная синхронизация престижа номера (миграция старых сохранений). */
export function syncVehiclePlatePrestige(member: GuildMember): void {
  const u = getEconomyUser(member.guild.id, member.id);
  const parts = parseVehiclePlateParts(u);
  if (!parts) return;
  const total = computePlatePrestige(parts).total;
  const accrued = u.vehiclePlatePrestige ?? 0;
  if (total === accrued) return;
  const stats = patchStatsFromShop(u.prestigePoints ?? 0, u.domesticPoints ?? 0, {
    prestigeDelta: total - accrued,
    domesticDelta: 0,
  });
  patchEconomyUser(member.guild.id, member.id, { vehiclePlatePrestige: total, ...stats });
}

function plateLastRoll(
  action: string,
  plate: string,
  breakdown: ReturnType<typeof computePlatePrestige>,
  prestigeDelta: number,
): PlateShopLastRoll {
  return { action, plate, breakdown, prestigeDelta };
}

export function registerVehiclePlate(
  member: GuildMember,
): { ok: true; plate: string; lastRoll: PlateShopLastRoll } | { ok: false; reply: string } {
  const u = getEconomyUser(member.guild.id, member.id);
  if (!userHasOwnedCar(u)) return { ok: false, reply: "Сначала купите **авто**." };
  if (userHasVehiclePlate(u)) return { ok: false, reply: "Госномер **уже оформлен**." };
  const cost = inflatedPlateShopPrice(member.guild.id, SHOP_PLATE_REGISTER_BASE_RUB);
  if (u.rubles < cost) return { ok: false, reply: `Нужно **${fmt(cost)}** ₽.` };
  const parts = rollRandomVehiclePlateParts();
  const { breakdown, prestigeDelta, prestigeAccrued } = patchUserPlateWithPrestige(
    member.guild.id,
    member.id,
    u,
    parts,
    u.rubles - cost,
  );
  remitShopPurchaseVatToTreasury(member.guild.id, cost);
  const plate = formatVehiclePlate(parts);
  return {
    ok: true,
    plate,
    lastRoll: plateLastRoll("Оформлен госномер", plate, breakdown, prestigeDelta),
  };
}

export function changeVehiclePlateDigits(
  member: GuildMember,
): { ok: true; plate: string; lastRoll: PlateShopLastRoll } | { ok: false; reply: string } {
  const u = getEconomyUser(member.guild.id, member.id);
  const cur = parseVehiclePlateParts(u);
  if (!cur) return { ok: false, reply: "Сначала **оформите** госномер." };
  const cost = inflatedPlateShopPrice(member.guild.id, SHOP_PLATE_CHANGE_DIGITS_BASE_RUB);
  if (u.rubles < cost) return { ok: false, reply: `Нужно **${fmt(cost)}** ₽.` };
  const next = { ...cur, digits: rollRandomVehiclePlateDigits() };
  const { breakdown, prestigeDelta, prestigeAccrued } = patchUserPlateWithPrestige(
    member.guild.id,
    member.id,
    u,
    next,
    u.rubles - cost,
  );
  remitShopPurchaseVatToTreasury(member.guild.id, cost);
  const plate = formatVehiclePlate(next);
  return {
    ok: true,
    plate,
    lastRoll: plateLastRoll("Новые цифры", plate, breakdown, prestigeDelta),
  };
}

export function changeVehiclePlateLetters(
  member: GuildMember,
): { ok: true; plate: string; lastRoll: PlateShopLastRoll } | { ok: false; reply: string } {
  const u = getEconomyUser(member.guild.id, member.id);
  const cur = parseVehiclePlateParts(u);
  if (!cur) return { ok: false, reply: "Сначала **оформите** госномер." };
  const cost = inflatedPlateShopPrice(member.guild.id, SHOP_PLATE_CHANGE_LETTERS_BASE_RUB);
  if (u.rubles < cost) return { ok: false, reply: `Нужно **${fmt(cost)}** ₽.` };
  const next = { ...cur, ...rollRandomVehiclePlateLetters() };
  const { breakdown, prestigeDelta, prestigeAccrued } = patchUserPlateWithPrestige(
    member.guild.id,
    member.id,
    u,
    next,
    u.rubles - cost,
  );
  remitShopPurchaseVatToTreasury(member.guild.id, cost);
  const plate = formatVehiclePlate(next);
  return {
    ok: true,
    plate,
    lastRoll: plateLastRoll("Новые буквы", plate, breakdown, prestigeDelta),
  };
}

export function changeVehiclePlateRegion(
  member: GuildMember,
): { ok: true; plate: string; lastRoll: PlateShopLastRoll } | { ok: false; reply: string } {
  const u = getEconomyUser(member.guild.id, member.id);
  const cur = parseVehiclePlateParts(u);
  if (!cur) return { ok: false, reply: "Сначала **оформите** госномер." };
  const cost = inflatedPlateShopPrice(member.guild.id, SHOP_PLATE_CHANGE_REGION_BASE_RUB);
  if (u.rubles < cost) return { ok: false, reply: `Нужно **${fmt(cost)}** ₽.` };
  const next = { ...cur, region: pickRandomPlateRegion() };
  const { breakdown, prestigeDelta, prestigeAccrued } = patchUserPlateWithPrestige(
    member.guild.id,
    member.id,
    u,
    next,
    u.rubles - cost,
  );
  remitShopPurchaseVatToTreasury(member.guild.id, cost);
  const plate = formatVehiclePlate(next);
  return {
    ok: true,
    plate,
    lastRoll: plateLastRoll("Новый регион", plate, breakdown, prestigeDelta),
  };
}

export function sellOwnedPhone(member: GuildMember): { ok: true; refund: number } | { ok: false; reply: string } {
  const u = getEconomyUser(member.guild.id, member.id);
  const cur = getPhoneDef(u.phoneModelId);
  if (!u.hasPhone || !cur) return { ok: false, reply: "Нет **телефона** для продажи." };
  const refund = Math.floor(inflatedCatalogPhonePrice(member.guild.id, cur.id) * PHONE_SELL_REFUND_RATE);
  const stats = patchStatsFromShop(u.prestigePoints ?? 0, u.domesticPoints ?? 0, {
    prestigeDelta: -cur.prestigeDelta,
    domesticDelta: -cur.domesticDelta,
  });
  patchEconomyUser(member.guild.id, member.id, {
    rubles: u.rubles + refund,
    hasPhone: false,
    phoneModelId: undefined,
    ...stats,
  });
  return { ok: true, refund };
}

export function sellOwnedCar(member: GuildMember): { ok: true; refund: number } | { ok: false; reply: string } {
  const u = getEconomyUser(member.guild.id, member.id);
  const cur = getCarDef(u.ownedCarId);
  if (!cur) return { ok: false, reply: "Нет **авто** для продажи." };
  const refund = Math.floor(inflatedCatalogCarPrice(member.guild.id, cur.id) * CAR_SELL_REFUND_RATE);
  const platePrestige = u.vehiclePlatePrestige ?? 0;
  const stats = patchStatsFromShop(u.prestigePoints ?? 0, u.domesticPoints ?? 0, {
    prestigeDelta: -cur.prestigeDelta - platePrestige,
    domesticDelta: -cur.domesticDelta,
  });
  patchEconomyUser(member.guild.id, member.id, {
    rubles: u.rubles + refund,
    ownedCarId: undefined,
    ...clearVehiclePlatePatch(),
    vehiclePlatePrestige: undefined,
    ...stats,
  });
  return { ok: true, refund };
}

export function purchaseApartment(member: GuildMember, aid: string): { ok: true; refund: number } | { ok: false; reply: string } {
  const defA = getApartmentDef(aid);
  if (!defA) return { ok: false, reply: "Неизвестная квартира." };
  const u = getEconomyUser(member.guild.id, member.id);
  const now = Date.now();
  const gid = member.guild.id;

  if (defA.origin === "soviet") {
    const hk = u.housingKind ?? "none";
    const curA = getApartmentDef(u.ownedApartmentId);
    const cost =
      hk === "owned" && curA
        ? inflatedApartmentPurchaseCost(gid, curA, defA, u.ownedApartmentPurchasedAtMs, now)
        : inflatedCatalogApartmentPrice(gid, defA.id);
    if (hk === "owned" && curA && inflatedCatalogApartmentPrice(gid, defA.id) < inflatedCatalogApartmentPrice(gid, curA.id)) {
      return { ok: false, reply: "Переезд на более дешёвую квартиру **недоступен**." };
    }
    const rentRefund = hk === "rent" ? housingRentUnusedRefundRub(u, now, gid) : 0;
    if (u.rubles + rentRefund < cost) {
      return { ok: false, reply: `Нужно ещё **${fmt(Math.max(0, cost - rentRefund))}** ₽.` };
    }
    if (hk === "owned" && curA?.id === defA.id) return { ok: false, reply: "У вас уже эта квартира." };
    const stats = patchStatsFromShop(u.prestigePoints ?? 0, u.domesticPoints ?? 0, statDeltasOnReplace(curA, defA));
    patchEconomyUser(member.guild.id, member.id, {
      rubles: u.rubles + rentRefund - cost,
      housingKind: "owned",
      ownedApartmentId: defA.id,
      ownedApartmentPurchasedAtMs: now,
      housingUtilityNextDueMs: now + HOUSING_CALENDAR_MONTH_MS,
      ...clearSovietHousingRentPatch(),
      ...stats,
      courierBikeUntilMs: undefined,
    });
    remitShopPurchaseVatToTreasury(gid, cost);
    return { ok: true, refund: rentRefund };
  }

  const curF = getApartmentDef(u.ownedForeignApartmentId);
  const cost =
    u.housingForeignKind === "owned" && curF
      ? inflatedApartmentPurchaseCost(gid, curF, defA, u.ownedForeignApartmentPurchasedAtMs, now)
      : inflatedCatalogApartmentPrice(gid, defA.id);
  if (
    u.housingForeignKind === "owned" &&
    curF &&
    inflatedCatalogApartmentPrice(gid, defA.id) < inflatedCatalogApartmentPrice(gid, curF.id)
  ) {
    return { ok: false, reply: "Переезд на более дешёвое жильё **недоступен**." };
  }
  if (u.rubles < cost) return { ok: false, reply: `Нужно ещё **${fmt(cost)}** ₽.` };
  if (u.housingForeignKind === "owned" && curF?.id === defA.id) return { ok: false, reply: "У вас уже это жильё." };
  const stats = patchStatsFromShop(u.prestigePoints ?? 0, u.domesticPoints ?? 0, statDeltasOnReplace(curF, defA));
  patchEconomyUser(member.guild.id, member.id, {
    rubles: u.rubles - cost,
    housingForeignKind: "owned",
    ownedForeignApartmentId: defA.id,
    ownedForeignApartmentPurchasedAtMs: now,
    housingForeignUtilityNextDueMs: now + HOUSING_CALENDAR_MONTH_MS,
    ...stats,
    ...cancelRentAndBikeOnAssetPurchase(u),
  });
  remitShopPurchaseVatToTreasury(gid, cost);
  return { ok: true, refund: 0 };
}

export function purchasePet(member: GuildMember, petId: string): { ok: true } | { ok: false; reply: string } {
  const def = getPetDef(petId);
  if (!def) return { ok: false, reply: "Неизвестный питомец." };
  const u = getEconomyUser(member.guild.id, member.id);
  const block = petOwnershipBlockReason(u, def);
  if (block) return { ok: false, reply: block };
  const cur = getPetDef(u.ownedPetId);
  const cost = scaledShopPrice(member.guild.id, petPurchaseCostRub(cur, def));
  if (u.rubles < cost) return { ok: false, reply: `Нужно **${fmt(cost)}** ₽.` };
  patchEconomyUser(member.guild.id, member.id, {
    rubles: u.rubles - cost,
    ownedPetId: def.id,
    petPausedNoFunds: false,
  });
  remitShopPurchaseVatToTreasury(member.guild.id, cost);
  return { ok: true };
}

export function sellSovietApartment(member: GuildMember): { ok: true; refund: number } | { ok: false; reply: string } {
  const u = getEconomyUser(member.guild.id, member.id);
  if ((u.housingKind ?? "none") !== "owned") return { ok: false, reply: "Продать можно только **советскую** квартиру." };
  const curA = getApartmentDef(u.ownedApartmentId);
  if (!curA) return { ok: false, reply: "Квартира не найдена." };
  const refund = Math.floor(inflatedCatalogApartmentPrice(member.guild.id, curA.id) * APARTMENT_SELL_REFUND_RATE);
  const stats = patchStatsFromShop(u.prestigePoints ?? 0, u.domesticPoints ?? 0, {
    prestigeDelta: -curA.prestigeDelta,
    domesticDelta: -curA.domesticDelta,
  });
  const quitJob = !userHasActiveHousing({ ...u, housingKind: "none", ownedApartmentId: undefined })
    ? economyUserClearTier2PlusJobPatch(u)
    : {};
  patchEconomyUser(member.guild.id, member.id, {
    rubles: u.rubles + refund,
    housingKind: "none",
    ownedApartmentId: undefined,
    ownedApartmentPurchasedAtMs: undefined,
    housingUtilityNextDueMs: undefined,
    ...stats,
    ...quitJob,
  });
  return { ok: true, refund };
}

export function sellForeignApartment(member: GuildMember): { ok: true; refund: number } | { ok: false; reply: string } {
  const u = getEconomyUser(member.guild.id, member.id);
  if (u.housingForeignKind !== "owned") return { ok: false, reply: "Нет **заморского** жилья." };
  const curA = getApartmentDef(u.ownedForeignApartmentId);
  if (!curA) return { ok: false, reply: "Жильё не найдено." };
  const refund = Math.floor(inflatedCatalogApartmentPrice(member.guild.id, curA.id) * APARTMENT_SELL_REFUND_RATE);
  const stats = patchStatsFromShop(u.prestigePoints ?? 0, u.domesticPoints ?? 0, {
    prestigeDelta: -curA.prestigeDelta,
    domesticDelta: -curA.domesticDelta,
  });
  const quitJob = !userHasActiveHousing({ ...u, housingForeignKind: undefined, ownedForeignApartmentId: undefined })
    ? economyUserClearTier2PlusJobPatch(u)
    : {};
  patchEconomyUser(member.guild.id, member.id, {
    rubles: u.rubles + refund,
    housingForeignKind: undefined,
    ownedForeignApartmentId: undefined,
    ownedForeignApartmentPurchasedAtMs: undefined,
    housingForeignUtilityNextDueMs: undefined,
    ...stats,
    ...quitJob,
  });
  return { ok: true, refund };
}
