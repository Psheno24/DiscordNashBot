/**
 * Магазин терминала в Telegram: те же действия, что в Discord,
 * с раскладкой кнопок «один ряд — один смысл», чтобы подписи были видны целиком.
 */
import type { Client, GuildMember } from "discord.js";
import type { EmbedBuilder } from "discord.js";
import {
  apartmentShopShortLabel,
  apartmentsByOrigin,
  carsByOrigin,
  getApartmentDef,
  getCarDef,
  getPhoneDef,
  PET_MODELS,
  phonesByOrigin,
  type CatalogOrigin,
  type HousingRentPlan,
} from "../economy/economyCatalog.js";
import {
  decodePlateKey,
  encodePlateKey,
  findOwnedApartment,
  findOwnedCar,
  findOwnedPet,
  findOwnedPhone,
  listOwnedApartmentsByOrigin,
  listOwnedCars,
  listOwnedCarsByOrigin,
  listOwnedPets,
  listOwnedPhonesByOrigin,
  listUnattachedPlates,
  shortCarLabel,
  shortPetButtonLabel,
  userCanOpenPlateShop,
} from "../economy/economyAssets.js";
import {
  applyRentPlanPurchase,
  buildShopAnimalsBuyEmbed,
  buildShopAnimalsDetailsEmbed,
  buildShopAnimalsEmbed,
  buildShopAnimalsOwnedEmbed,
  buildShopApartmentBuyConfirmEmbed,
  buildShopApartmentSellConfirmEmbed,
  buildShopAptTradePickEmbed,
  buildShopCarBuyConfirmEmbed,
  buildShopCarDetailsEmbed,
  buildShopCarListEmbed,
  buildShopCarSellConfirmEmbed,
  buildShopCarTradePickEmbed,
  buildShopHouseDetailsEmbed,
  buildShopHouseListEmbed,
  buildShopHousePickEmbed,
  buildShopHouseRentEmbed,
  buildShopHubEmbed,
  buildShopOriginPickEmbed,
  buildShopPetViewEmbed,
  buildShopPhoneBuyConfirmEmbed,
  buildShopPhoneDetailsEmbed,
  buildShopPhoneListEmbed,
  buildShopPhoneSellConfirmEmbed,
  buildShopPhoneTradePickEmbed,
  buildShopPlateAttachConfirmEmbed,
  buildShopPlateAttachEmbed,
  buildShopPlateCarEmbed,
  buildShopPlateDetachConfirmEmbed,
  buildShopPlateDetailsEmbed,
  buildShopPlateEmbed,
  buildShopSimChangeEmbed,
  buildShopSimDetailsEmbed,
  buildShopSimEmbed,
  changeSimLast,
  changeSimMid,
  changeSimOperator,
  purchasePet,
  registerSimNumber,
  renameOwnedPet,
  syncSimPrestige,
} from "../economy/economyShopUi.js";
import { buildShopAppearanceEmbed } from "../economy/economyShopAppearanceUi.js";
import {
  attachVehiclePlateToCar,
  changeVehiclePlateDigitsForCar,
  changeVehiclePlateLettersForCar,
  changeVehiclePlateRegionForCar,
  detachVehiclePlateFromCar,
  purchaseApartmentFull,
  purchaseApartmentTrade,
  purchaseCarFull,
  purchaseCarTrade,
  purchasePhoneFull,
  purchasePhoneTrade,
  registerVehiclePlateForCar,
  sellOwnedApartment,
  sellOwnedCar,
  sellOwnedPhone,
} from "../economy/economyShopActions.js";
import {
  SHOP_PLATE_CHANGE_DIGITS_BASE_RUB,
  SHOP_PLATE_CHANGE_LETTERS_BASE_RUB,
  SHOP_PLATE_CHANGE_REGION_BASE_RUB,
  SHOP_PLATE_REGISTER_BASE_RUB,
  formatVehiclePlate,
} from "../economy/economyLicensePlate.js";
import {
  SHOP_SIM_CHANGE_LAST_BASE_RUB,
  SHOP_SIM_CHANGE_MID_BASE_RUB,
  SHOP_SIM_CHANGE_OPERATOR_BASE_RUB,
  SHOP_SIM_REGISTER_BASE_RUB,
  userHasSimNumber,
} from "../economy/economySimNumber.js";
import {
  inflatedCatalogApartmentPrice,
  inflatedCatalogCarPrice,
  inflatedCatalogPhonePrice,
  inflatedHousingRentPrice,
  scaledShopPrice,
} from "../economy/economyMacro.js";
import { remitShopPurchaseVatToTreasury } from "../economy/taxTreasury.js";
import { clearSovietHousingRentPatch } from "../economy/economyHousingUtil.js";
import { economyUserClearTier2PlusJobPatch } from "../economy/economyHousing.js";
import { beginShopTradeDraft, selectedShopTradeUids, toggleShopTradeUid } from "../economy/shopTradeDraft.js";
import {
  addLotteryTickets,
  getLotteryState,
  LOTTERY_TICKET_PRICE_RUB,
} from "../economy/lotteryStore.js";
import {
  ensureDueLotteryDraws,
  LOTTERY_JACKPOT_CHANCES,
  LOTTERY_REFUND_CHANCES,
  lotteryPeriodMskYmd,
} from "../economy/lotteryDraw.js";
import { appendFeedEvent } from "../economy/feedStore.js";
import { renderProfileCardPng } from "../economy/profileCardRender.js";
import {
  getProfileFrameColor,
  isProfileFrameColorId,
  PROFILE_COLOR_CHANGE_PRICE_RUB,
  PROFILE_FRAME_COLORS,
  type ProfileFrameColorId,
} from "../economy/profileThemes.js";
import {
  getEconomyUser,
  patchEconomyUser,
  trySpendEconomyUserRubles,
  updateEconomyUser,
} from "../economy/userStore.js";
import { economyMarkdownToTelegramHtml, economyTelegramScreen } from "../economy/panel.js";
import { patchTelegramUiState } from "./bridgeStore.js";
import {
  btnLabel,
  kb,
  navRow,
  row,
  TG_BTN_FULL,
  withNote,
  type InlineBtn,
  type InlineKb,
  type ScreenPayload,
} from "./tgUi.js";

function fmt(n: number): string {
  return n.toLocaleString("ru-RU");
}

function originWord(o: CatalogOrigin): string {
  return o === "soviet" ? "Советское" : "Заморское";
}

function originCode(o: CatalogOrigin): "s" | "f" {
  return o === "soviet" ? "s" : "f";
}

function parseOrigin(code: string): CatalogOrigin | undefined {
  if (code === "s" || code === "soviet") return "soviet";
  if (code === "f" || code === "foreign") return "foreign";
  return undefined;
}

function fromEmbed(embed: EmbedBuilder, note?: string): string {
  const title = embed.data.title ?? "Магазин";
  const desc = embed.data.description ?? "";
  return withNote(economyTelegramScreen(title, desc), note ? economyMarkdownToTelegramHtml(note) : undefined);
}

function mdNote(note: string): string {
  return economyMarkdownToTelegramHtml(note);
}

function itemBtn(label: string, cost: number, data: string): InlineBtn {
  const price = `${fmt(cost)} ₽`;
  const maxName = Math.max(8, TG_BTN_FULL - price.length - 3);
  const name = btnLabel(label, maxName);
  return { text: btnLabel(`${name} · ${price}`, TG_BTN_FULL), callback_data: data };
}

function shopNav(back: string, backLabel = "← Назад"): InlineBtn[] {
  return navRow(back, backLabel);
}

function screen(text: string, ...rows: InlineBtn[][]): ScreenPayload {
  return { text, markup: kb(...rows) };
}

function lotteryDrawUnixTs(nowMs: number = Date.now()): number {
  const period = lotteryPeriodMskYmd(nowMs);
  return Math.floor(Date.parse(`${period}T21:00:00+03:00`) / 1000);
}

function lotteryHubText(member: GuildMember): string {
  ensureDueLotteryDraws(member.guild);
  const period = lotteryPeriodMskYmd();
  const st = getLotteryState(member.guild.id, period);
  const drawTs = lotteryDrawUnixTs();
  const drawAt = new Date(drawTs * 1000).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
  return economyTelegramScreen(
    "Лотерея",
    [
      `Билет — **${fmt(LOTTERY_TICKET_PRICE_RUB)}** ₽`,
      `Джекпот: **${fmt(st.jackpotRub)}** ₽ · в продаже: **${st.ticketsSold}**`,
      `Розыгрыш: **${drawAt}** (21:00 МСК)`,
      "",
      "Выбери количество билетов кнопкой ниже.",
    ].join("\n"),
  );
}

function lotteryDetailsText(): string {
  return economyTelegramScreen(
    "Лотерея · условия",
    [
      `**Каждый билет:** полный возврат **${LOTTERY_REFUND_CHANCES.full}%**, половина **${LOTTERY_REFUND_CHANCES.half}%**, без возврата **${LOTTERY_REFUND_CHANCES.none}%**.`,
      "",
      `**Крупный исход за период:** 100% джекпота **${LOTTERY_JACKPOT_CHANCES.full}%**, 50% **${LOTTERY_JACKPOT_CHANCES.half}%**, 10% **${LOTTERY_JACKPOT_CHANCES.tenth}%**.`,
      "Если крупный исход выпал, победитель случайно выбирается среди всех билетов.",
    ].join("\n"),
  );
}

export function screenShopHub(member: GuildMember, note?: string): ScreenPayload {
  return screen(
    fromEmbed(buildShopHubEmbed(member), note),
    row({ text: "Телефон", callback_data: "s:ph" }, { text: "Авто", callback_data: "s:car" }),
    row({ text: "Жильё", callback_data: "s:hs" }, { text: "Животные", callback_data: "s:an" }),
    row({ text: "Лотерея", callback_data: "s:lt" }, { text: "Оформление", callback_data: "s:ap" }),
    shopNav("m", "← Меню"),
  );
}

function phoneMenu(member: GuildMember, note?: string): ScreenPayload {
  return screen(
    fromEmbed(buildShopOriginPickEmbed("Телефон", member, "phone"), note),
    row({ text: "Советское", callback_data: "s:ph:s" }),
    row({ text: "Заморское", callback_data: "s:ph:f" }),
    row({ text: "Сим-карта", callback_data: "s:sim" }),
    shopNav("s"),
  );
}

function carMenu(member: GuildMember, note?: string): ScreenPayload {
  const u = getEconomyUser(member.guild.id, member.id);
  const rows: InlineBtn[][] = [
    row({ text: "Советское", callback_data: "s:car:s" }),
    row({ text: "Заморское", callback_data: "s:car:f" }),
  ];
  if (userCanOpenPlateShop(u)) {
    rows.push(row({ text: "Госномер", callback_data: "s:pl" }));
  }
  rows.push(shopNav("s"));
  return screen(fromEmbed(buildShopOriginPickEmbed("Авто", member, "car"), note), ...rows);
}

function phoneList(member: GuildMember, origin: CatalogOrigin, note?: string): ScreenPayload {
  const u = getEconomyUser(member.guild.id, member.id);
  const oc = originCode(origin);
  const rows: InlineBtn[][] = [];
  if (listOwnedPhonesByOrigin(u, origin).length > 0) {
    rows.push(row({ text: "Продать", callback_data: `s:ph:sl:${oc}` }));
  }
  for (const p of phonesByOrigin(origin)) {
    const price = inflatedCatalogPhonePrice(member.guild.id, p.id);
    rows.push(row(itemBtn(p.label, price, `s:ph:i:${p.id}`)));
  }
  rows.push(row({ text: "Условия", callback_data: `s:ph:d:${oc}` }));
  rows.push(shopNav("s:ph"));
  return screen(fromEmbed(buildShopPhoneListEmbed(member, origin), note), ...rows);
}

function carList(member: GuildMember, origin: CatalogOrigin, note?: string): ScreenPayload {
  const u = getEconomyUser(member.guild.id, member.id);
  const oc = originCode(origin);
  const rows: InlineBtn[][] = [];
  if (listOwnedCarsByOrigin(u, origin).length > 0) {
    rows.push(row({ text: "Продать", callback_data: `s:car:sl:${oc}` }));
  }
  for (const c of carsByOrigin(origin)) {
    const price = inflatedCatalogCarPrice(member.guild.id, c.id);
    rows.push(row(itemBtn(c.label, price, `s:car:i:${c.id}`)));
  }
  rows.push(row({ text: "Условия", callback_data: `s:car:d:${oc}` }));
  rows.push(shopNav("s:car"));
  return screen(fromEmbed(buildShopCarListEmbed(member, origin), note), ...rows);
}

function phoneBuyConfirm(member: GuildMember, pid: string, note?: string): ScreenPayload | null {
  const def = getPhoneDef(pid);
  const emb = buildShopPhoneBuyConfirmEmbed(member, pid);
  if (!def || !emb) return null;
  const owned = listOwnedPhonesByOrigin(getEconomyUser(member.guild.id, member.id), def.origin);
  const rows: InlineBtn[][] = [
    row({ text: "Купить полностью", callback_data: `s:ph:full:${pid}` }),
  ];
  if (owned.length > 0) {
    rows.push(row({ text: "Обменять", callback_data: `s:ph:tr:${pid}` }));
  }
  rows.push(shopNav(`s:ph:${originCode(def.origin)}`));
  return screen(fromEmbed(emb, note), ...rows);
}

function carBuyConfirm(member: GuildMember, cid: string, note?: string): ScreenPayload | null {
  const def = getCarDef(cid);
  const emb = buildShopCarBuyConfirmEmbed(member, cid);
  if (!def || !emb) return null;
  const owned = listOwnedCarsByOrigin(getEconomyUser(member.guild.id, member.id), def.origin);
  const rows: InlineBtn[][] = [
    row({ text: "Купить полностью", callback_data: `s:car:full:${cid}` }),
  ];
  if (owned.length > 0) {
    rows.push(row({ text: "Обменять", callback_data: `s:car:tr:${cid}` }));
  }
  rows.push(shopNav(`s:car:${originCode(def.origin)}`));
  return screen(fromEmbed(emb, note), ...rows);
}

function phoneTradePick(member: GuildMember, pid: string, note?: string): ScreenPayload | null {
  const emb = buildShopPhoneTradePickEmbed(member, pid);
  const def = getPhoneDef(pid);
  if (!emb || !def) return null;
  const u = getEconomyUser(member.guild.id, member.id);
  const selected = new Set(selectedShopTradeUids(member.guild.id, member.id, "phone", pid));
  const rows: InlineBtn[][] = [];
  for (const rec of listOwnedPhonesByOrigin(u, def.origin)) {
    const cur = getPhoneDef(rec.id);
    const on = selected.has(rec.uid);
    const name = btnLabel(`${on ? "✓ " : ""}${cur?.label ?? rec.id}`, TG_BTN_FULL);
    rows.push(row({ text: name, callback_data: `s:ph:tg:${pid}:${rec.uid}` }));
  }
  rows.push(row({ text: "Подтвердить обмен", callback_data: `s:ph:go:${pid}` }));
  rows.push(shopNav(`s:ph:i:${pid}`, "← К покупке"));
  return screen(fromEmbed(emb, note), ...rows);
}

function carTradePick(member: GuildMember, cid: string, note?: string): ScreenPayload | null {
  const emb = buildShopCarTradePickEmbed(member, cid);
  const def = getCarDef(cid);
  if (!emb || !def) return null;
  const u = getEconomyUser(member.guild.id, member.id);
  const selected = new Set(selectedShopTradeUids(member.guild.id, member.id, "car", cid));
  const rows: InlineBtn[][] = [];
  for (const rec of listOwnedCarsByOrigin(u, def.origin)) {
    const on = selected.has(rec.uid);
    const name = btnLabel(`${on ? "✓ " : ""}${shortCarLabel(rec)}`, TG_BTN_FULL);
    rows.push(row({ text: name, callback_data: `s:car:tg:${cid}:${rec.uid}` }));
  }
  rows.push(row({ text: "Подтвердить обмен", callback_data: `s:car:go:${cid}` }));
  rows.push(shopNav(`s:car:i:${cid}`, "← К покупке"));
  return screen(fromEmbed(emb, note), ...rows);
}

function phoneSellPick(member: GuildMember, origin: CatalogOrigin, note?: string): ScreenPayload {
  const u = getEconomyUser(member.guild.id, member.id);
  const oc = originCode(origin);
  const rows: InlineBtn[][] = [];
  for (const rec of listOwnedPhonesByOrigin(u, origin)) {
    const def = getPhoneDef(rec.id);
    rows.push(row({ text: btnLabel(def?.label ?? rec.id), callback_data: `s:ph:su:${rec.uid}` }));
  }
  rows.push(shopNav(`s:ph:${oc}`));
  const body = economyTelegramScreen(
    `Продать телефон · ${originWord(origin)}`,
    listOwnedPhonesByOrigin(u, origin).length
      ? "Выбери телефон для продажи."
      : "Нечего продавать.",
  );
  return screen(withNote(body, note ? mdNote(note) : undefined), ...rows);
}

function carSellPick(member: GuildMember, origin: CatalogOrigin, note?: string): ScreenPayload {
  const u = getEconomyUser(member.guild.id, member.id);
  const oc = originCode(origin);
  const rows: InlineBtn[][] = [];
  for (const rec of listOwnedCarsByOrigin(u, origin)) {
    rows.push(row({ text: btnLabel(shortCarLabel(rec)), callback_data: `s:car:su:${rec.uid}` }));
  }
  rows.push(shopNav(`s:car:${oc}`));
  const body = economyTelegramScreen(
    `Продать авто · ${originWord(origin)}`,
    listOwnedCarsByOrigin(u, origin).length ? "Выбери авто для продажи." : "Нечего продавать.",
  );
  return screen(withNote(body, note ? mdNote(note) : undefined), ...rows);
}

function houseMenu(member: GuildMember, note?: string): ScreenPayload {
  return screen(
    fromEmbed(buildShopHousePickEmbed(member), note),
    row({ text: "Советское", callback_data: "s:hs:s" }),
    row({ text: "Заморское", callback_data: "s:hs:f" }),
    row({ text: "Аренда", callback_data: "s:hs:rent" }),
    shopNav("s"),
  );
}

function houseList(member: GuildMember, origin: CatalogOrigin, note?: string): ScreenPayload {
  const u = getEconomyUser(member.guild.id, member.id);
  const oc = originCode(origin);
  const rows: InlineBtn[][] = [];
  if (listOwnedApartmentsByOrigin(u, origin).length > 0) {
    rows.push(row({ text: "Продать", callback_data: `s:hs:sl:${oc}` }));
  }
  for (const a of apartmentsByOrigin(origin)) {
    const price = inflatedCatalogApartmentPrice(member.guild.id, a.id);
    rows.push(row(itemBtn(apartmentShopShortLabel(a.label), price, `s:hs:i:${a.id}`)));
  }
  rows.push(row({ text: "Условия", callback_data: `s:hs:d:${oc}` }));
  rows.push(shopNav("s:hs"));
  return screen(fromEmbed(buildShopHouseListEmbed(member, origin), note), ...rows);
}

function aptBuyConfirm(member: GuildMember, aid: string, note?: string): ScreenPayload | null {
  const def = getApartmentDef(aid);
  const emb = buildShopApartmentBuyConfirmEmbed(member, aid);
  if (!def || !emb) return null;
  const owned = listOwnedApartmentsByOrigin(getEconomyUser(member.guild.id, member.id), def.origin);
  const rows: InlineBtn[][] = [
    row({ text: "Купить полностью", callback_data: `s:hs:full:${aid}` }),
  ];
  if (owned.length > 0) {
    rows.push(row({ text: "Обменять", callback_data: `s:hs:tr:${aid}` }));
  }
  rows.push(shopNav(`s:hs:${originCode(def.origin)}`));
  return screen(fromEmbed(emb, note), ...rows);
}

function aptTradePick(member: GuildMember, aid: string, note?: string): ScreenPayload | null {
  const emb = buildShopAptTradePickEmbed(member, aid);
  const def = getApartmentDef(aid);
  if (!emb || !def) return null;
  const u = getEconomyUser(member.guild.id, member.id);
  const selected = new Set(selectedShopTradeUids(member.guild.id, member.id, "apt", aid));
  const rows: InlineBtn[][] = [];
  for (const rec of listOwnedApartmentsByOrigin(u, def.origin)) {
    const cur = getApartmentDef(rec.id);
    const on = selected.has(rec.uid);
    const name = btnLabel(`${on ? "✓ " : ""}${apartmentShopShortLabel(cur?.label ?? "жильё")}`, TG_BTN_FULL);
    rows.push(row({ text: name, callback_data: `s:hs:tg:${aid}:${rec.uid}` }));
  }
  rows.push(row({ text: "Подтвердить обмен", callback_data: `s:hs:go:${aid}` }));
  rows.push(shopNav(`s:hs:i:${aid}`, "← К покупке"));
  return screen(fromEmbed(emb, note), ...rows);
}

function aptSellPick(member: GuildMember, origin: CatalogOrigin, note?: string): ScreenPayload {
  const u = getEconomyUser(member.guild.id, member.id);
  const oc = originCode(origin);
  const rows: InlineBtn[][] = [];
  for (const rec of listOwnedApartmentsByOrigin(u, origin)) {
    const def = getApartmentDef(rec.id);
    rows.push(
      row({
        text: btnLabel(apartmentShopShortLabel(def?.label ?? rec.id)),
        callback_data: `s:hs:su:${rec.uid}`,
      }),
    );
  }
  rows.push(shopNav(`s:hs:${oc}`));
  const body = economyTelegramScreen(
    `Продать жильё · ${originWord(origin)}`,
    listOwnedApartmentsByOrigin(u, origin).length ? "Выбери квартиру." : "Нечего продавать.",
  );
  return screen(withNote(body, note ? mdNote(note) : undefined), ...rows);
}

function houseRent(member: GuildMember, note?: string): ScreenPayload {
  const u = getEconomyUser(member.guild.id, member.id);
  const gid = member.guild.id;
  const hk = u.housingKind ?? "none";
  const rows: InlineBtn[][] = [];
  if (hk !== "owned") {
    rows.push(row(itemBtn("1 сутки", inflatedHousingRentPrice(gid, "day"), "s:hs:r:day")));
    rows.push(row(itemBtn("7 суток", inflatedHousingRentPrice(gid, "week"), "s:hs:r:week")));
    rows.push(row(itemBtn("30 суток", inflatedHousingRentPrice(gid, "month"), "s:hs:r:month")));
  }
  if (hk === "rent") {
    rows.push(row({ text: "Съехать с аренды", callback_data: "s:hs:leave" }));
  }
  rows.push(shopNav("s:hs"));
  return screen(fromEmbed(buildShopHouseRentEmbed(member), note), ...rows);
}

function animalsMenu(member: GuildMember, note?: string): ScreenPayload {
  return screen(
    fromEmbed(buildShopAnimalsEmbed(member), note),
    row({ text: "Купить", callback_data: "s:an:buy" }),
    row({ text: "Мои", callback_data: "s:an:mine" }),
    row({ text: "Условия", callback_data: "s:an:d" }),
    shopNav("s"),
  );
}

function animalsBuy(member: GuildMember, note?: string): ScreenPayload {
  const gid = member.guild.id;
  const rows: InlineBtn[][] = [];
  for (const p of PET_MODELS) {
    const cost = scaledShopPrice(gid, p.purchaseRub);
    rows.push(row(itemBtn(p.label, cost, `s:an:b:${p.id}`)));
  }
  rows.push(shopNav("s:an"));
  return screen(fromEmbed(buildShopAnimalsBuyEmbed(member), note), ...rows);
}

function animalsOwned(member: GuildMember, note?: string): ScreenPayload {
  const u = getEconomyUser(member.guild.id, member.id);
  const rows: InlineBtn[][] = [];
  for (const p of listOwnedPets(u)) {
    rows.push(row({ text: btnLabel(shortPetButtonLabel(p)), callback_data: `s:an:v:${p.uid}` }));
  }
  rows.push(shopNav("s:an"));
  return screen(fromEmbed(buildShopAnimalsOwnedEmbed(member), note), ...rows);
}

function petView(member: GuildMember, uid: string, note?: string): ScreenPayload | null {
  const emb = buildShopPetViewEmbed(member, uid);
  if (!emb) return null;
  return screen(
    fromEmbed(emb, note),
    row({ text: "Изменить имя", callback_data: `s:an:rn:${uid}` }),
    shopNav("s:an:mine"),
  );
}

function plateHub(member: GuildMember, note?: string): ScreenPayload {
  const u = getEconomyUser(member.guild.id, member.id);
  const rows: InlineBtn[][] = [];
  for (const c of listOwnedCars(u).slice(0, 12)) {
    if (!getCarDef(c.id)) continue;
    rows.push(row({ text: btnLabel(shortCarLabel(c)), callback_data: `s:pl:c:${c.uid}` }));
  }
  rows.push(row({ text: "Условия", callback_data: "s:pl:d" }));
  rows.push(shopNav("s:car"));
  return screen(fromEmbed(buildShopPlateEmbed(member), note), ...rows);
}

function plateCar(member: GuildMember, carUid: string, note?: string): ScreenPayload | null {
  const emb = buildShopPlateCarEmbed(member, carUid);
  if (!emb) return null;
  const u = getEconomyUser(member.guild.id, member.id);
  const gid = member.guild.id;
  const car = findOwnedCar(u, carUid);
  const hasPlate = Boolean(car?.plate);
  const dig = scaledShopPrice(gid, SHOP_PLATE_CHANGE_DIGITS_BASE_RUB);
  const letC = scaledShopPrice(gid, SHOP_PLATE_CHANGE_LETTERS_BASE_RUB);
  const rgn = scaledShopPrice(gid, SHOP_PLATE_CHANGE_REGION_BASE_RUB);
  const reg = scaledShopPrice(gid, SHOP_PLATE_REGISTER_BASE_RUB);
  const rows: InlineBtn[][] = [];
  if (hasPlate) {
    rows.push(row(itemBtn("Цифры", dig, `s:pl:dig:${carUid}`)));
    rows.push(row(itemBtn("Буквы", letC, `s:pl:let:${carUid}`)));
    rows.push(row(itemBtn("Регион", rgn, `s:pl:rgn:${carUid}`)));
    rows.push(row({ text: "Снять номер", callback_data: `s:pl:det:${carUid}` }));
  } else {
    rows.push(row(itemBtn("Оформить", reg, `s:pl:new:${carUid}`)));
    if (listUnattachedPlates(u).length > 0) {
      rows.push(row({ text: "Прикрепить номер", callback_data: `s:pl:att:${carUid}` }));
    }
  }
  rows.push(shopNav("s:pl"));
  return screen(fromEmbed(emb, note), ...rows);
}

function simMenu(member: GuildMember, note?: string): ScreenPayload {
  syncSimPrestige(member);
  const u = getEconomyUser(member.guild.id, member.id);
  const rows: InlineBtn[][] = [];
  if (!userHasSimNumber(u)) {
    rows.push(row(itemBtn("Купить сим", SHOP_SIM_REGISTER_BASE_RUB, "s:sim:reg")));
  } else {
    rows.push(row({ text: "Пополнить", callback_data: "s:sim:top" }));
    rows.push(row({ text: "Изменить номер", callback_data: "s:sim:ch" }));
  }
  rows.push(row({ text: "Условия", callback_data: "s:sim:d" }));
  rows.push(shopNav("s:ph", "← Телефон"));
  return screen(fromEmbed(buildShopSimEmbed(member), note), ...rows);
}

function simChange(member: GuildMember, note?: string): ScreenPayload {
  const u = getEconomyUser(member.guild.id, member.id);
  const gid = member.guild.id;
  const op = scaledShopPrice(gid, SHOP_SIM_CHANGE_OPERATOR_BASE_RUB);
  const mid = scaledShopPrice(gid, SHOP_SIM_CHANGE_MID_BASE_RUB);
  const last = scaledShopPrice(gid, SHOP_SIM_CHANGE_LAST_BASE_RUB);
  return screen(
    fromEmbed(buildShopSimChangeEmbed(member), note),
    row(itemBtn("Оператор", op, "s:sim:op")),
    row(itemBtn("Середина", mid, "s:sim:mid")),
    row(itemBtn("Конец", last, "s:sim:last")),
    shopNav("s:sim"),
  );
}

function simTopup(member: GuildMember, note?: string): ScreenPayload {
  const amounts = [500, 1_000, 5_000, 10_000, 25_000];
  const rows = amounts.map((a) => row(itemBtn(`+${fmt(a)}`, a, `s:sim:tu:${a}`)));
  rows.push(shopNav("s:sim"));
  const u = getEconomyUser(member.guild.id, member.id);
  const body = economyTelegramScreen(
    "Пополнить сим",
    `Баланс: **${fmt(u.rubles)}** ₽\nБаланс сим: **${fmt(u.simBalanceRub ?? 0)}** ₽\n\nСумма спишется со счёта на баланс сим.`,
  );
  return screen(withNote(body, note ? mdNote(note) : undefined), ...rows);
}

function lotteryMenu(member: GuildMember, note?: string): ScreenPayload {
  const qtys = [1, 5, 10, 25, 50];
  const rows = qtys.map((q) =>
    row(itemBtn(`${q} шт`, q * LOTTERY_TICKET_PRICE_RUB, `s:lt:q:${q}`)),
  );
  rows.push(row({ text: "Условия", callback_data: "s:lt:d" }));
  rows.push(shopNav("s"));
  return screen(withNote(lotteryHubText(member), note ? mdNote(note) : undefined), ...rows);
}

function lotteryConfirm(member: GuildMember, qty: number): ScreenPayload {
  const total = qty * LOTTERY_TICKET_PRICE_RUB;
  const body = economyTelegramScreen(
    "Подтверждение",
    `Купить билетов: **${qty}**\nСумма: **${fmt(total)}** ₽\n\nСписание с личного счёта → джекпот.`,
  );
  return screen(
    body,
    row({ text: "Купить", callback_data: `s:lt:ok:${qty}` }),
    shopNav("s:lt", "Отмена"),
  );
}

function appearanceMenu(member: GuildMember, note?: string): ScreenPayload {
  const rows: InlineBtn[][] = PROFILE_FRAME_COLORS.map((c) =>
    row({ text: btnLabel(`Примерить: ${c.label}`), callback_data: `s:ap:try:${c.id}` }),
  );
  rows.push(row({ text: "Моя карточка", callback_data: "s:ap:card" }));
  rows.push(shopNav("s"));
  return screen(fromEmbed(buildShopAppearanceEmbed(member), note), ...rows);
}

function appearanceBuyConfirm(colorId: ProfileFrameColorId): ScreenPayload {
  const def = getProfileFrameColor(colorId);
  const body = economyTelegramScreen(
    "Оформление · покупка",
    `Рамка **${def.label}** — **${fmt(PROFILE_COLOR_CHANGE_PRICE_RUB)}** ₽.\nПревью выше (если отправилось). Подтверди покупку.`,
  );
  return screen(
    body,
    row(itemBtn("Купить рамку", PROFILE_COLOR_CHANGE_PRICE_RUB, `s:ap:buy:${colorId}`)),
    shopNav("s:ap"),
  );
}

export type ShopPresent = (payload: ScreenPayload) => Promise<void>;
export type ShopToast = (text?: string) => Promise<void>;
export type ShopSendPhoto = (caption: string, png: Buffer, markup?: InlineKb) => Promise<void>;

export async function routeShopCallback(opts: {
  client: Client;
  member: GuildMember;
  data: string;
  present: ShopPresent;
  toast: ShopToast;
  sendPhoto: ShopSendPhoto;
}): Promise<boolean> {
  const { member, data, present, toast, sendPhoto } = opts;
  if (!data.startsWith("s")) return false;
  if (data !== "s" && !data.startsWith("s:")) return false;

  const gid = member.guild.id;
  const uid = member.id;

  const fail = async (note: string, fallback: ScreenPayload) => {
    await toast(note.replace(/\*\*/g, "").slice(0, 180));
    await present({ ...fallback, text: withNote(fallback.text, mdNote(note)) });
  };

  if (data === "s") {
    await present(screenShopHub(member));
    return true;
  }

  // —— Телефон ——
  if (data === "s:ph") {
    await present(phoneMenu(member));
    return true;
  }
  if (data === "s:ph:s" || data === "s:ph:f") {
    await present(phoneList(member, data.endsWith(":s") ? "soviet" : "foreign"));
    return true;
  }
  if (data.startsWith("s:ph:d:")) {
    const origin = parseOrigin(data.slice("s:ph:d:".length));
    if (!origin) return true;
    await present(
      screen(fromEmbed(buildShopPhoneDetailsEmbed(member, origin)), shopNav(`s:ph:${originCode(origin)}`)),
    );
    return true;
  }
  if (data.startsWith("s:ph:i:")) {
    const pid = data.slice("s:ph:i:".length);
    const p = phoneBuyConfirm(member, pid);
    if (!p) await toast("Неизвестная модель");
    else await present(p);
    return true;
  }
  if (data.startsWith("s:ph:full:")) {
    const pid = data.slice("s:ph:full:".length);
    const def = getPhoneDef(pid);
    if (!def) {
      await toast("Неизвестная модель");
      return true;
    }
    const r = purchasePhoneFull(member, pid);
    if (!r.ok) {
      const p = phoneBuyConfirm(member, pid, r.reply);
      if (p) await present(p);
      else await toast(r.reply.replace(/\*\*/g, ""));
      return true;
    }
    await toast("Куплено");
    await present(phoneList(member, def.origin, "Куплено за полную стоимость."));
    return true;
  }
  if (data.startsWith("s:ph:tr:")) {
    const pid = data.slice("s:ph:tr:".length);
    beginShopTradeDraft(gid, uid, "phone", pid, []);
    const p = phoneTradePick(member, pid);
    if (p) await present(p);
    return true;
  }
  if (data.startsWith("s:ph:tg:")) {
    const rest = data.slice("s:ph:tg:".length);
    const sep = rest.lastIndexOf(":");
    if (sep < 0) return true;
    const pid = rest.slice(0, sep);
    const phoneUid = rest.slice(sep + 1);
    toggleShopTradeUid(gid, uid, "phone", pid, phoneUid);
    const p = phoneTradePick(member, pid);
    if (p) await present(p);
    return true;
  }
  if (data.startsWith("s:ph:go:")) {
    const pid = data.slice("s:ph:go:".length);
    const def = getPhoneDef(pid);
    if (!def) return true;
    const uids = selectedShopTradeUids(gid, uid, "phone", pid);
    const r = purchasePhoneTrade(member, pid, uids);
    if (!r.ok) {
      const p = phoneTradePick(member, pid, r.reply);
      if (p) await present(p);
      return true;
    }
    await toast("Обмен выполнен");
    await present(phoneList(member, def.origin, "Обмен выполнен."));
    return true;
  }
  if (data.startsWith("s:ph:sl:")) {
    const origin = parseOrigin(data.slice("s:ph:sl:".length));
    if (!origin) return true;
    await present(phoneSellPick(member, origin));
    return true;
  }
  if (data.startsWith("s:ph:su:")) {
    const phoneUid = data.slice("s:ph:su:".length);
    const emb = buildShopPhoneSellConfirmEmbed(member, phoneUid);
    await present(
      screen(
        fromEmbed(emb),
        row({ text: "Продать", callback_data: `s:ph:sy:${phoneUid}` }),
        shopNav("s:ph"),
      ),
    );
    return true;
  }
  if (data.startsWith("s:ph:sy:")) {
    const phoneUid = data.slice("s:ph:sy:".length);
    const rec = findOwnedPhone(getEconomyUser(gid, uid), phoneUid);
    const origin = getPhoneDef(rec?.id)?.origin ?? "soviet";
    const r = sellOwnedPhone(member, phoneUid);
    if (!r.ok) {
      await fail(r.reply, phoneSellPick(member, origin));
      return true;
    }
    await toast(`+${fmt(r.refund)} ₽`);
    await present(phoneList(member, origin, `Продано: **+${fmt(r.refund)}** ₽.`));
    return true;
  }

  // —— Авто ——
  if (data === "s:car") {
    await present(carMenu(member));
    return true;
  }
  if (data === "s:car:s" || data === "s:car:f") {
    await present(carList(member, data.endsWith(":s") ? "soviet" : "foreign"));
    return true;
  }
  if (data.startsWith("s:car:d:")) {
    const origin = parseOrigin(data.slice("s:car:d:".length));
    if (!origin) return true;
    await present(
      screen(fromEmbed(buildShopCarDetailsEmbed(member, origin)), shopNav(`s:car:${originCode(origin)}`)),
    );
    return true;
  }
  if (data.startsWith("s:car:i:")) {
    const cid = data.slice("s:car:i:".length);
    const p = carBuyConfirm(member, cid);
    if (!p) await toast("Неизвестная модель");
    else await present(p);
    return true;
  }
  if (data.startsWith("s:car:full:")) {
    const cid = data.slice("s:car:full:".length);
    const def = getCarDef(cid);
    if (!def) {
      await toast("Неизвестная модель");
      return true;
    }
    const r = purchaseCarFull(member, cid);
    if (!r.ok) {
      const p = carBuyConfirm(member, cid, r.reply);
      if (p) await present(p);
      return true;
    }
    await toast("Куплено");
    await present(carList(member, def.origin, "Куплено за полную стоимость."));
    return true;
  }
  if (data.startsWith("s:car:tr:")) {
    const cid = data.slice("s:car:tr:".length);
    beginShopTradeDraft(gid, uid, "car", cid, []);
    const p = carTradePick(member, cid);
    if (p) await present(p);
    return true;
  }
  if (data.startsWith("s:car:tg:")) {
    const rest = data.slice("s:car:tg:".length);
    const sep = rest.lastIndexOf(":");
    if (sep < 0) return true;
    const cid = rest.slice(0, sep);
    const carUid = rest.slice(sep + 1);
    toggleShopTradeUid(gid, uid, "car", cid, carUid);
    const p = carTradePick(member, cid);
    if (p) await present(p);
    return true;
  }
  if (data.startsWith("s:car:go:")) {
    const cid = data.slice("s:car:go:".length);
    const def = getCarDef(cid);
    if (!def) return true;
    const uids = selectedShopTradeUids(gid, uid, "car", cid);
    const r = purchaseCarTrade(member, cid, uids);
    if (!r.ok) {
      const p = carTradePick(member, cid, r.reply);
      if (p) await present(p);
      return true;
    }
    await toast("Обмен выполнен");
    await present(carList(member, def.origin, "Обмен выполнен."));
    return true;
  }
  if (data.startsWith("s:car:sl:")) {
    const origin = parseOrigin(data.slice("s:car:sl:".length));
    if (!origin) return true;
    await present(carSellPick(member, origin));
    return true;
  }
  if (data.startsWith("s:car:su:")) {
    const carUid = data.slice("s:car:su:".length);
    await present(
      screen(
        fromEmbed(buildShopCarSellConfirmEmbed(member, carUid)),
        row({ text: "Продать", callback_data: `s:car:sy:${carUid}` }),
        shopNav("s:car"),
      ),
    );
    return true;
  }
  if (data.startsWith("s:car:sy:")) {
    const carUid = data.slice("s:car:sy:".length);
    const rec = findOwnedCar(getEconomyUser(gid, uid), carUid);
    const origin = getCarDef(rec?.id)?.origin ?? "soviet";
    const r = sellOwnedCar(member, carUid);
    if (!r.ok) {
      await fail(r.reply, carSellPick(member, origin));
      return true;
    }
    await toast(`+${fmt(r.refund)} ₽`);
    await present(carList(member, origin, `Продано: **+${fmt(r.refund)}** ₽.`));
    return true;
  }

  // —— Госномер ——
  if (data === "s:pl") {
    if (!userCanOpenPlateShop(getEconomyUser(gid, uid))) {
      await toast("Нужно авто");
      await present(carMenu(member, "Сначала купите авто."));
      return true;
    }
    await present(plateHub(member));
    return true;
  }
  if (data === "s:pl:d") {
    await present(screen(fromEmbed(buildShopPlateDetailsEmbed(member)), shopNav("s:pl")));
    return true;
  }
  if (data.startsWith("s:pl:c:")) {
    const carUid = data.slice("s:pl:c:".length);
    const p = plateCar(member, carUid);
    if (!p) await toast("Авто не найдено");
    else await present(p);
    return true;
  }
  if (data.startsWith("s:pl:new:")) {
    const carUid = data.slice("s:pl:new:".length);
    const r = registerVehiclePlateForCar(member, carUid);
    if (!r.ok) {
      const p = plateCar(member, carUid, r.reply);
      if (p) await present(p);
      return true;
    }
    await toast("Номер оформлен");
    await present(plateCar(member, carUid, `Номер: **${r.plate}**`)!);
    return true;
  }
  if (data.startsWith("s:pl:dig:")) {
    const carUid = data.slice("s:pl:dig:".length);
    const r = changeVehiclePlateDigitsForCar(member, carUid);
    if (!r.ok) {
      const p = plateCar(member, carUid, r.reply);
      if (p) await present(p);
      return true;
    }
    await present(plateCar(member, carUid, `Цифры: **${r.plate}**`)!);
    return true;
  }
  if (data.startsWith("s:pl:let:")) {
    const carUid = data.slice("s:pl:let:".length);
    const r = changeVehiclePlateLettersForCar(member, carUid);
    if (!r.ok) {
      const p = plateCar(member, carUid, r.reply);
      if (p) await present(p);
      return true;
    }
    await present(plateCar(member, carUid, `Буквы: **${r.plate}**`)!);
    return true;
  }
  if (data.startsWith("s:pl:rgn:")) {
    const carUid = data.slice("s:pl:rgn:".length);
    const r = changeVehiclePlateRegionForCar(member, carUid);
    if (!r.ok) {
      const p = plateCar(member, carUid, r.reply);
      if (p) await present(p);
      return true;
    }
    await present(plateCar(member, carUid, `Регион: **${r.plate}**`)!);
    return true;
  }
  if (data.startsWith("s:pl:det:")) {
    const carUid = data.slice("s:pl:det:".length);
    const emb = buildShopPlateDetachConfirmEmbed(member, carUid);
    if (!emb) {
      await toast("Нет номера");
      return true;
    }
    await present(
      screen(
        fromEmbed(emb),
        row({ text: "Снять", callback_data: `s:pl:detY:${carUid}` }),
        shopNav(`s:pl:c:${carUid}`),
      ),
    );
    return true;
  }
  if (data.startsWith("s:pl:detY:")) {
    const carUid = data.slice("s:pl:detY:".length);
    const r = detachVehiclePlateFromCar(member, carUid);
    if (!r.ok) {
      await toast(r.reply.replace(/\*\*/g, ""));
      const p = plateCar(member, carUid, r.reply);
      if (p) await present(p);
      return true;
    }
    await toast("Снято");
    await present(plateCar(member, carUid, "Номер снят в запас.")!);
    return true;
  }
  if (data.startsWith("s:pl:att:")) {
    const carUid = data.slice("s:pl:att:".length);
    const emb = buildShopPlateAttachEmbed(member, carUid);
    if (!emb) {
      await toast("Нет запаса номеров");
      return true;
    }
    const u = getEconomyUser(gid, uid);
    const rows: InlineBtn[][] = listUnattachedPlates(u).slice(0, 12).map((p) =>
      row({
        text: btnLabel(formatVehiclePlate(p)),
        callback_data: `s:pl:atP:${carUid}:${encodePlateKey(p)}`,
      }),
    );
    rows.push(shopNav(`s:pl:c:${carUid}`));
    await present(screen(fromEmbed(emb), ...rows));
    return true;
  }
  if (data.startsWith("s:pl:atP:")) {
    const rest = data.slice("s:pl:atP:".length);
    const sep = rest.indexOf(":");
    if (sep < 0) return true;
    const carUid = rest.slice(0, sep);
    const key = rest.slice(sep + 1);
    const parts = decodePlateKey(key);
    if (!parts) {
      await toast("Неверный номер");
      return true;
    }
    const emb = buildShopPlateAttachConfirmEmbed(member, carUid, parts);
    if (!emb) {
      await toast("Не удалось");
      return true;
    }
    await present(
      screen(
        fromEmbed(emb),
        row({ text: "Прикрепить", callback_data: `s:pl:atY:${carUid}:${key}` }),
        shopNav(`s:pl:att:${carUid}`),
      ),
    );
    return true;
  }
  if (data.startsWith("s:pl:atY:")) {
    const rest = data.slice("s:pl:atY:".length);
    const sep = rest.indexOf(":");
    if (sep < 0) return true;
    const carUid = rest.slice(0, sep);
    const parts = decodePlateKey(rest.slice(sep + 1));
    if (!parts) return true;
    const r = attachVehiclePlateToCar(member, carUid, parts);
    if (!r.ok) {
      await toast(r.reply.replace(/\*\*/g, ""));
      const p = plateCar(member, carUid, r.reply);
      if (p) await present(p);
      return true;
    }
    await toast("Прикреплено");
    await present(plateCar(member, carUid, `Прикреплено: **${formatVehiclePlate(parts)}**`)!);
    return true;
  }

  // —— Жильё ——
  if (data === "s:hs") {
    await present(houseMenu(member));
    return true;
  }
  if (data === "s:hs:s" || data === "s:hs:f") {
    await present(houseList(member, data.endsWith(":s") ? "soviet" : "foreign"));
    return true;
  }
  if (data === "s:hs:rent") {
    await present(houseRent(member));
    return true;
  }
  if (data.startsWith("s:hs:d:")) {
    const origin = parseOrigin(data.slice("s:hs:d:".length));
    if (!origin) return true;
    await present(
      screen(fromEmbed(buildShopHouseDetailsEmbed(member, origin)), shopNav(`s:hs:${originCode(origin)}`)),
    );
    return true;
  }
  if (data.startsWith("s:hs:i:")) {
    const aid = data.slice("s:hs:i:".length);
    const p = aptBuyConfirm(member, aid);
    if (!p) await toast("Неизвестная квартира");
    else await present(p);
    return true;
  }
  if (data.startsWith("s:hs:full:")) {
    const aid = data.slice("s:hs:full:".length);
    const def = getApartmentDef(aid);
    if (!def) return true;
    const r = purchaseApartmentFull(member, aid);
    if (!r.ok) {
      const p = aptBuyConfirm(member, aid, r.reply);
      if (p) await present(p);
      return true;
    }
    await toast("Куплено");
    await present(houseList(member, def.origin, "Куплено за полную стоимость."));
    return true;
  }
  if (data.startsWith("s:hs:tr:")) {
    const aid = data.slice("s:hs:tr:".length);
    beginShopTradeDraft(gid, uid, "apt", aid, []);
    const p = aptTradePick(member, aid);
    if (p) await present(p);
    return true;
  }
  if (data.startsWith("s:hs:tg:")) {
    const rest = data.slice("s:hs:tg:".length);
    const sep = rest.lastIndexOf(":");
    if (sep < 0) return true;
    const aid = rest.slice(0, sep);
    const aptUid = rest.slice(sep + 1);
    toggleShopTradeUid(gid, uid, "apt", aid, aptUid);
    const p = aptTradePick(member, aid);
    if (p) await present(p);
    return true;
  }
  if (data.startsWith("s:hs:go:")) {
    const aid = data.slice("s:hs:go:".length);
    const def = getApartmentDef(aid);
    if (!def) return true;
    const uids = selectedShopTradeUids(gid, uid, "apt", aid);
    const r = purchaseApartmentTrade(member, aid, uids);
    if (!r.ok) {
      const p = aptTradePick(member, aid, r.reply);
      if (p) await present(p);
      return true;
    }
    await toast("Обмен выполнен");
    await present(houseList(member, def.origin, "Обмен выполнен."));
    return true;
  }
  if (data.startsWith("s:hs:sl:")) {
    const origin = parseOrigin(data.slice("s:hs:sl:".length));
    if (!origin) return true;
    await present(aptSellPick(member, origin));
    return true;
  }
  if (data.startsWith("s:hs:su:")) {
    const aptUid = data.slice("s:hs:su:".length);
    const rec = findOwnedApartment(getEconomyUser(gid, uid), aptUid);
    const origin = getApartmentDef(rec?.id)?.origin ?? "soviet";
    await present(
      screen(
        fromEmbed(buildShopApartmentSellConfirmEmbed(member, origin, aptUid)),
        row({ text: "Продать", callback_data: `s:hs:sy:${aptUid}` }),
        shopNav(`s:hs:${originCode(origin)}`),
      ),
    );
    return true;
  }
  if (data.startsWith("s:hs:sy:")) {
    const aptUid = data.slice("s:hs:sy:".length);
    const rec = findOwnedApartment(getEconomyUser(gid, uid), aptUid);
    const origin = getApartmentDef(rec?.id)?.origin ?? "soviet";
    const r = sellOwnedApartment(member, aptUid);
    if (!r.ok) {
      await fail(r.reply, aptSellPick(member, origin));
      return true;
    }
    await toast(`+${fmt(r.refund)} ₽`);
    await present(houseList(member, origin, `Продано: **+${fmt(r.refund)}** ₽.`));
    return true;
  }
  if (data.startsWith("s:hs:r:")) {
    const planRaw = data.slice("s:hs:r:".length);
    const plan: HousingRentPlan | undefined =
      planRaw === "day" ? "day" : planRaw === "week" ? "week" : planRaw === "month" ? "month" : undefined;
    if (!plan) return true;
    const r = applyRentPlanPurchase(member, plan);
    if (!r.ok) {
      await present(houseRent(member, r.reply));
      return true;
    }
    await toast("Аренда оплачена");
    await present(houseRent(member, "Аренда оформлена."));
    return true;
  }
  if (data === "s:hs:leave") {
    const u = getEconomyUser(gid, uid);
    if ((u.housingKind ?? "none") !== "rent") {
      await present(houseRent(member, "Вы **не** на аренде."));
      return true;
    }
    patchEconomyUser(gid, uid, {
      ...clearSovietHousingRentPatch(),
      ...economyUserClearTier2PlusJobPatch(u),
    });
    await toast("Съехали");
    await present(houseRent(member, "Аренда снята."));
    return true;
  }

  // —— Животные ——
  if (data === "s:an") {
    await present(animalsMenu(member));
    return true;
  }
  if (data === "s:an:buy") {
    await present(animalsBuy(member));
    return true;
  }
  if (data === "s:an:mine") {
    await present(animalsOwned(member));
    return true;
  }
  if (data === "s:an:d") {
    await present(screen(fromEmbed(buildShopAnimalsDetailsEmbed(member)), shopNav("s:an")));
    return true;
  }
  if (data.startsWith("s:an:b:")) {
    const petId = data.slice("s:an:b:".length);
    const r = purchasePet(member, petId);
    if (!r.ok) {
      await present(animalsBuy(member, r.reply));
      return true;
    }
    await toast("Питомец куплен");
    await present(animalsBuy(member, "Питомец куплен."));
    return true;
  }
  if (data.startsWith("s:an:v:")) {
    const petUid = data.slice("s:an:v:".length);
    const p = petView(member, petUid);
    if (!p) await toast("Не найден");
    else await present(p);
    return true;
  }
  if (data.startsWith("s:an:rn:")) {
    const petUid = data.slice("s:an:rn:".length);
    if (!findOwnedPet(getEconomyUser(gid, uid), petUid)) {
      await toast("Не найден");
      return true;
    }
    // pendingInput выставляет bot.ts (нужен telegram user id) — здесь только экран
    await toast("Отправь новое имя сообщением");
    await present(
      screen(
        economyTelegramScreen(
          "Имя питомца",
          "Отправь следующим сообщением новое имя (до 24 символов).\nИли нажми «Отмена».",
        ),
        shopNav(`s:an:v:${petUid}`, "Отмена"),
      ),
    );
    return true;
  }

  // —— Сим ——
  if (data === "s:sim") {
    const su = getEconomyUser(gid, uid);
    if (!su.hasPhone) {
      await toast("Нужен телефон");
      await present(phoneMenu(member, "Сначала купите телефон."));
      return true;
    }
    await present(simMenu(member));
    return true;
  }
  if (data === "s:sim:reg") {
    const r = registerSimNumber(member);
    if (!r.ok) {
      await present(simMenu(member, r.reply));
      return true;
    }
    await toast("Сим оформлена");
    await present(simMenu(member, `Номер: **${r.number}**`));
    return true;
  }
  if (data === "s:sim:ch") {
    await present(simChange(member));
    return true;
  }
  if (data === "s:sim:d") {
    await present(screen(fromEmbed(buildShopSimDetailsEmbed(member)), shopNav("s:sim")));
    return true;
  }
  if (data === "s:sim:top") {
    await present(simTopup(member));
    return true;
  }
  if (data === "s:sim:op" || data === "s:sim:mid" || data === "s:sim:last") {
    const r =
      data === "s:sim:op"
        ? changeSimOperator(member)
        : data === "s:sim:mid"
          ? changeSimMid(member)
          : changeSimLast(member);
    if (!r.ok) {
      await present(simChange(member, r.reply));
      return true;
    }
    await toast("Номер изменён");
    await present(simChange(member, `Номер: **${r.number}**`));
    return true;
  }
  if (data.startsWith("s:sim:tu:")) {
    const amount = Number.parseInt(data.slice("s:sim:tu:".length), 10);
    if (!Number.isFinite(amount) || amount < 1) return true;
    const u = getEconomyUser(gid, uid);
    if (!u.hasPhone || !userHasSimNumber(u)) {
      await toast("Нужны телефон и сим");
      return true;
    }
    let ok = false;
    updateEconomyUser(gid, uid, (cur) => {
      if (cur.rubles < amount) return cur;
      ok = true;
      return {
        ...cur,
        rubles: cur.rubles - amount,
        simBalanceRub: (cur.simBalanceRub ?? 0) + amount,
      };
    });
    if (!ok) {
      await present(simTopup(member, `На счёте только **${fmt(getEconomyUser(gid, uid).rubles)}** ₽.`));
      return true;
    }
    remitShopPurchaseVatToTreasury(gid, amount);
    await toast("Пополнено");
    await present(simMenu(member, `Пополнено на **${fmt(amount)}** ₽.`));
    return true;
  }

  // —— Лотерея ——
  if (data === "s:lt") {
    await present(lotteryMenu(member));
    return true;
  }
  if (data === "s:lt:d") {
    await present(screen(lotteryDetailsText(), shopNav("s:lt")));
    return true;
  }
  if (data.startsWith("s:lt:q:")) {
    const qty = Number.parseInt(data.slice("s:lt:q:".length), 10);
    if (!Number.isFinite(qty) || qty < 1 || qty > 500) return true;
    await present(lotteryConfirm(member, qty));
    return true;
  }
  if (data.startsWith("s:lt:ok:")) {
    const qty = Number.parseInt(data.slice("s:lt:ok:".length), 10);
    if (!Number.isFinite(qty) || qty < 1) return true;
    const total = qty * LOTTERY_TICKET_PRICE_RUB;
    const spend = trySpendEconomyUserRubles(gid, uid, total);
    if (!spend.ok) {
      await present(lotteryMenu(member, `Не хватает ₽ (нужно **${fmt(total)}**).`));
      return true;
    }
    remitShopPurchaseVatToTreasury(gid, total);
    ensureDueLotteryDraws(member.guild);
    addLotteryTickets(gid, lotteryPeriodMskYmd(), uid, qty);
    appendFeedEvent({
      ts: Date.now(),
      guildId: gid,
      type: "job:shift",
      actorUserId: uid,
      text: `${member.toString()} купил лотерейных билетов: **${qty}** × **${fmt(LOTTERY_TICKET_PRICE_RUB)}** ₽`,
    });
    await toast("Куплено");
    await present(lotteryMenu(member, `Куплено билетов: **${qty}**.`));
    return true;
  }

  // —— Оформление ——
  if (data === "s:ap") {
    await present(appearanceMenu(member));
    return true;
  }
  if (data === "s:ap:card") {
    try {
      const png = await renderProfileCardPng(member, {});
      await sendPhoto("Моя карточка", png, kb(shopNav("s:ap")));
      await toast();
    } catch (e) {
      console.error("tg profile card", e);
      await toast("Не удалось собрать карточку");
      await present(appearanceMenu(member, "Не удалось собрать карточку."));
    }
    return true;
  }
  if (data.startsWith("s:ap:try:")) {
    const colorId = data.slice("s:ap:try:".length);
    if (!isProfileFrameColorId(colorId)) {
      await toast("Неизвестный цвет");
      return true;
    }
    const u = getEconomyUser(gid, uid);
    if (u.profileCardColor === colorId) {
      await toast("Уже активна");
      await present(appearanceMenu(member, `Рамка **${getProfileFrameColor(colorId).label}** уже активна.`));
      return true;
    }
    try {
      const png = await renderProfileCardPng(member, {
        previewFrameColorId: colorId,
        watermark: true,
      });
      const cap = economyMarkdownToTelegramHtml(
        `**Превью рамки · ${getProfileFrameColor(colorId).label}**\n_Водяной знак «ПРЕВЬЮ» — только пример._`,
      );
      await sendPhoto(cap, png, appearanceBuyConfirm(colorId).markup);
      await toast();
    } catch (e) {
      console.error("tg appearance try", e);
      await present(appearanceBuyConfirm(colorId));
    }
    return true;
  }
  if (data.startsWith("s:ap:buy:")) {
    const colorId = data.slice("s:ap:buy:".length);
    if (!isProfileFrameColorId(colorId)) {
      await toast("Неизвестный цвет");
      return true;
    }
    const def = getProfileFrameColor(colorId);
    const u = getEconomyUser(gid, uid);
    if (u.profileCardColor === colorId) {
      await toast("Уже активна");
      return true;
    }
    const spend = trySpendEconomyUserRubles(gid, uid, PROFILE_COLOR_CHANGE_PRICE_RUB);
    if (!spend.ok) {
      await toast(`Нужно ${fmt(PROFILE_COLOR_CHANGE_PRICE_RUB)} ₽`);
      await present(appearanceMenu(member));
      return true;
    }
    updateEconomyUser(gid, uid, (cur) => ({ ...cur, profileCardColor: colorId }));
    appendFeedEvent({
      ts: Date.now(),
      guildId: gid,
      type: "job:shift",
      actorUserId: uid,
      text: `${member.toString()} сменил рамку карточки на **${def.label}** (−${fmt(PROFILE_COLOR_CHANGE_PRICE_RUB)} ₽).`,
    });
    try {
      const png = await renderProfileCardPng(member, {});
      await sendPhoto(
        economyMarkdownToTelegramHtml(`Рамка **${def.label}** сохранена.`),
        png,
        kb(shopNav("s:ap")),
      );
      await toast("Готово");
    } catch {
      await present(appearanceMenu(member, `Рамка **${def.label}** сохранена.`));
    }
    return true;
  }

  return false;
}

/** Выставить ожидание имени питомца (вызывается из bot с tg user id). */
export function beginPetRenamePending(tgUserId: string, petUid: string): void {
  patchTelegramUiState(tgUserId, {
    pendingInput: { kind: "petRename", uid: petUid, expiresAtMs: Date.now() + 5 * 60_000 },
  });
}

export function clearPendingInput(tgUserId: string): void {
  patchTelegramUiState(tgUserId, { pendingInput: undefined });
}

export function handlePetRenameText(
  member: GuildMember,
  petUid: string,
  rawName: string,
): ScreenPayload {
  const r = renameOwnedPet(member, petUid, rawName);
  if (!r.ok) return petView(member, petUid, r.reply) ?? animalsOwned(member, r.reply);
  return petView(member, petUid, `Имя: **${r.name}**`) ?? animalsOwned(member, `Имя: **${r.name}**`);
}

/** true, если callback — запрос переименования питомца (нужен tg user id снаружи). */
export function isPetRenameCallback(data: string): string | null {
  if (!data.startsWith("s:an:rn:")) return null;
  return data.slice("s:an:rn:".length) || null;
}
