import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type Client,
  type GuildMember,
  type ModalSubmitInteraction,
} from "discord.js";
import {
  createTelegramLinkCode,
  getLastIssuedTelegramCode,
  getLinkedTelegramIdForDiscord,
  isTelegramHubGranted,
} from "../telegram/bridgeStore.js";
import { isTelegramBridgeConfigured } from "../telegram/env.js";
import { economyFeedChannelId, economyTerminalChannelId } from "../config.js";
import { getVoiceSeconds } from "../voice/timeStore.js";
import { appendFeedEvent, listFeedEvents } from "./feedStore.js";
import {
  clearEconomyTerminalPanelMessageId,
  getEconomyFeedPanelMessageId,
  getEconomyTerminalPanelMessageId,
  setEconomyFeedPanelMessageId,
  setEconomyTerminalPanelMessageId,
} from "./panelStore.js";
import {
  ECONOMY_SKILL_MAX,
  getEconomyUser,
  lastWorkAtForJob,
  listEconomyUsers,
  patchEconomyUser,
  trySpendEconomyUserRubles,
  updateEconomyUser,
  type EconomyUser,
  type JobId,
  type SkillId,
} from "./userStore.js";
import {
  bestCourierCar,
  carPlateParts,
  decodePlateKey,
  findOwnedApartment,
  formatOwnedPetLine,
  listOwnedApartmentsByOrigin,
  listOwnedCars,
  listOwnedCarsByOrigin,
  listOwnedPets,
  listOwnedPhones,
  listOwnedPhonesByOrigin,
  PET_NAME_MAX,
} from "./economyAssets.js";
import {
  computeTier3PassiveRub,
  computeTier3PassiveRubDetailed,
  getTier3JobDef,
  isTier3JobId,
  JOBS_TIER3,
  SOLE_PROP_AD_CD_MS,
  SOLE_PROP_CAP_MAX,
  SOLE_PROP_CONTROL_CD_MS,
  SOLE_PROP_STAFF_CD_MS,
  applyOfficeMeetingStreak,
  TIER3_BOSS_CD_MS,
  TIER3_MAX_PROMOTION_RANK,
  TIER3_SIDE_GIG_CD_MS,
  tier3PatchWhenJobChanges,
  tier3PromotionRank,
  TIER3_PROMOTION_EVERY_DAYS,
  type Tier3JobDef,
  type Tier3JobId,
} from "./tier3Jobs.js";
import {
  APARTMENT_MODELS,
  APARTMENT_TRADE_IN_RATE,
  APARTMENT_TRADE_IN_RATE_AFTER_MONTH,
  CAR_MODELS,
  CAR_TRADE_IN_RATE,
  courierBikeRentPriceRub,
  COURIER_SIM_MONTHLY_FEE_RUB,
  COURIER_SIM_MONTHLY_PERIOD_MS,
  getApartmentDef,
  getCarDef,
  getPhoneDef,
  APARTMENT_SELL_REFUND_RATE,
  HOUSING_CALENDAR_MONTH_MS,
  HOUSING_RENT_DAY_PKG_RUB,
  HOUSING_RENT_DAILY_MONTH_EQUIV_RUB,
  HOUSING_RENT_MONTH_PKG_RUB,
  HOUSING_RENT_WEEK_PKG_RUB,
  housingRentPlanPeriodMs,
  housingRentPlanPriceRub,
  PHONE_MODELS,
  PHONE_TRADE_IN_RATE,
  shopApartmentPurchaseCostRub,
  shopCarPurchaseCostRub,
  shopPhonePurchaseCostRub,
  type HousingRentPlan,
} from "./economyCatalog.js";
import {
  beginShopTradeDraft,
  clearShopTradeDraft,
  selectedShopTradeUids,
  toggleShopTradeUid,
} from "./shopTradeDraft.js";
import { economyUserClearTier2PlusJobPatch, housingRentUnusedRefundRub, userHasActiveHousing } from "./economyHousing.js";
import { clearSovietHousingRentPatch } from "./economyHousingUtil.js";
import { feedNetPrestigeRubBonus, feedPrestigeDomesticBonusSuffix } from "./economyFeedBonus.js";
import {
  applyPrestigeToShiftRub,
  prestigePassiveIncomeMult,
  shiftPsApplies,
  shiftPsFromDomestic,
} from "./economyModifiers.js";
import {
  applyRentPlanPurchase,
  buildShopAnimalsEmbed,
  buildShopAnimalsRows,
  buildShopCarListEmbed,
  buildShopCarListRows,
  buildShopCarDetailsEmbed,
  buildShopHouseListEmbed,
  buildShopHouseListRows,
  buildShopHouseDetailsEmbed,
  buildShopHousePickEmbed,
  buildShopHousePickRows,
  buildShopHouseRentEmbed,
  buildShopHouseRentRows,
  buildShopHubEmbed,
  buildShopHubRows,
  buildShopOriginPickEmbed,
  buildShopOriginPickRows,
  buildShopPhoneListEmbed,
  buildShopPhoneListRows,
  buildShopPhoneDetailsEmbed,
  ECON_SHOP_ANIMALS,
  ECON_SHOP_ANIMALS_BUY,
  ECON_SHOP_ANIMALS_OWNED,
  ECON_SHOP_ANIMALS_DETAILS,
  ECON_SHOP_APT_BUY_PREFIX,
  ECON_SHOP_APT_FULL_PREFIX,
  ECON_SHOP_APT_TRADE_PREFIX,
  ECON_SHOP_APT_TRADE_OK_PREFIX,
  ECON_SHOP_APT_TRADE_TG_PREFIX,
  ECON_SHOP_APT_TRADE_GO_PREFIX,
  ECON_SHOP_APT_SELL_FOREIGN,
  ECON_SHOP_APT_SELL_SOVIET,
  ECON_SHOP_APT_SELL_UID_PREFIX,
  ECON_SHOP_APT_SELL_OK_PREFIX,
  ECON_SHOP_CAR,
  ECON_SHOP_CAR_BUY_PREFIX,
  ECON_SHOP_CAR_FULL_PREFIX,
  ECON_SHOP_CAR_TRADE_PREFIX,
  ECON_SHOP_CAR_TRADE_OK_PREFIX,
  ECON_SHOP_CAR_TRADE_TG_PREFIX,
  ECON_SHOP_CAR_TRADE_GO_PREFIX,
  ECON_SHOP_CAR_ORIGIN_PREFIX,
  ECON_SHOP_CAR_DETAILS_PREFIX,
  ECON_SHOP_HOUSE,
  ECON_SHOP_HOUSE_LEAVE,
  ECON_SHOP_HOUSE_ORIGIN_PREFIX,
  ECON_SHOP_HOUSE_DETAILS_PREFIX,
  ECON_SHOP_HOUSE_RENT_MENU,
  ECON_SHOP_HOUSE_RENT_1D,
  ECON_SHOP_HOUSE_RENT_30D,
  ECON_SHOP_HOUSE_RENT_7D,
  ECON_SHOP_HUB,
  ECON_SHOP_PET_BUY_PREFIX,
  ECON_SHOP_PET_VIEW_PREFIX,
  ECON_SHOP_PET_RENAME_PREFIX,
  ECON_MODAL_PET_RENAME_PREFIX,
  ECON_SHOP_PHONE,
  ECON_SHOP_PHONE_BUY_PREFIX,
  ECON_SHOP_PHONE_FULL_PREFIX,
  ECON_SHOP_PHONE_TRADE_PREFIX,
  ECON_SHOP_PHONE_TRADE_OK_PREFIX,
  ECON_SHOP_PHONE_TRADE_TG_PREFIX,
  ECON_SHOP_PHONE_TRADE_GO_PREFIX,
  ECON_SHOP_PHONE_BUY_CONFIRM_PREFIX,
  ECON_SHOP_PHONE_BUY_CANCEL_PREFIX,
  ECON_SHOP_PHONE_SELL,
  ECON_SHOP_PHONE_SELL_UID_PREFIX,
  ECON_SHOP_PHONE_SELL_OK_PREFIX,
  ECON_SHOP_PHONE_SELL_CONFIRM,
  ECON_SHOP_PHONE_SELL_CANCEL,
  ECON_SHOP_PHONE_ORIGIN_PREFIX,
  ECON_SHOP_PHONE_DETAILS_PREFIX,
  parseOriginFromSuffix,
  purchaseApartment,
  purchaseApartmentFull,
  purchaseApartmentTrade,
  purchaseCar,
  purchaseCarFull,
  purchaseCarTrade,
  purchasePet,
  renameOwnedPet,
  purchasePhone,
  purchasePhoneFull,
  purchasePhoneTrade,
  sellForeignApartment,
  sellSovietApartment,
  sellOwnedApartment,
  sellOwnedCar,
  sellOwnedPhone,
  buildShopPlateEmbed,
  buildShopPlateDetailsEmbed,
  buildShopPlateRows,
  buildShopPlateCarEmbed,
  buildShopPlateCarRows,
  buildShopPlateAttachEmbed,
  buildShopPlateAttachRows,
  buildShopPlateAttachConfirmEmbed,
  buildShopPlateAttachConfirmRows,
  buildShopPlateDetachConfirmEmbed,
  buildShopPlateDetachConfirmRows,
  buildShopPhoneTradePickEmbed,
  buildShopPhoneTradePickRows,
  buildShopCarTradePickEmbed,
  buildShopCarTradePickRows,
  buildShopAptTradePickEmbed,
  buildShopAptTradePickRows,
  buildShopPhoneSellPickEmbed,
  buildShopPhoneSellPickRows,
  buildShopCarSellPickEmbed,
  buildShopCarSellPickRows,
  buildShopAptSellPickEmbed,
  buildShopAptSellPickRows,
  buildShopCarSellConfirmEmbed,
  buildShopCarSellConfirmRows,
  buildShopPhoneBuyConfirmEmbed,
  buildShopPhoneBuyConfirmRows,
  buildShopCarBuyConfirmEmbed,
  buildShopCarBuyConfirmRows,
  buildShopApartmentBuyConfirmEmbed,
  buildShopApartmentBuyConfirmRows,
  buildShopPhoneSellConfirmEmbed,
  buildShopPhoneSellConfirmRows,
  buildShopApartmentSellConfirmEmbed,
  buildShopApartmentSellSovietConfirmRows,
  buildShopApartmentSellForeignConfirmRows,
  buildShopAptUidSellConfirmRows,
  buildShopNoticeEmbed,
  withShopNote,
  ECON_SHOP_CAR_BUY_CONFIRM_PREFIX,
  ECON_SHOP_CAR_BUY_CANCEL_PREFIX,
  ECON_SHOP_APT_BUY_CONFIRM_PREFIX,
  ECON_SHOP_APT_BUY_CANCEL_PREFIX,
  ECON_SHOP_APT_SELL_SOVIET_CONFIRM,
  ECON_SHOP_APT_SELL_SOVIET_CANCEL,
  ECON_SHOP_APT_SELL_FOREIGN_CONFIRM,
  ECON_SHOP_APT_SELL_FOREIGN_CANCEL,
  syncVehiclePlatePrestige,
  registerVehiclePlate,
  registerVehiclePlateForCar,
  changeVehiclePlateDigits,
  changeVehiclePlateLetters,
  changeVehiclePlateRegion,
  changeVehiclePlateDigitsForCar,
  changeVehiclePlateLettersForCar,
  changeVehiclePlateRegionForCar,
  attachVehiclePlateToCar,
  detachVehiclePlateFromCar,
  ECON_SHOP_PLATE,
  ECON_SHOP_PLATE_REGISTER,
  ECON_SHOP_PLATE_DIGITS,
  ECON_SHOP_PLATE_LETTERS,
  ECON_SHOP_PLATE_REGION,
  ECON_SHOP_PLATE_DETAILS,
  ECON_SHOP_PLATE_CAR_PREFIX,
  ECON_SHOP_PLATE_DIG_PREFIX,
  ECON_SHOP_PLATE_LET_PREFIX,
  ECON_SHOP_PLATE_RGN_PREFIX,
  ECON_SHOP_PLATE_NEW_PREFIX,
  ECON_SHOP_PLATE_DET_PREFIX,
  ECON_SHOP_PLATE_DET_OK_PREFIX,
  ECON_SHOP_PLATE_ATT_PREFIX,
  ECON_SHOP_PLATE_ATT_PICK_PREFIX,
  ECON_SHOP_PLATE_ATT_OK_PREFIX,
  ECON_SHOP_CAR_SELL,
  ECON_SHOP_CAR_SELL_UID_PREFIX,
  ECON_SHOP_CAR_SELL_OK_PREFIX,
  ECON_SHOP_CAR_SELL_CONFIRM,
  ECON_SHOP_CAR_SELL_CANCEL,
  ECON_SHOP_APPEARANCE,
  shopNavBottomRow,
  ECON_NAV_BACK_TO_MENU,
  buildShopSimEmbed,
  buildShopSimDetailsEmbed,
  buildShopSimChangeEmbed,
  buildShopSimChangeRows,
  buildShopSimRows,
  buildShopAnimalsDetailsEmbed,
  buildShopAnimalsBuyEmbed,
  buildShopAnimalsBuyRows,
  buildShopAnimalsOwnedEmbed,
  buildShopAnimalsOwnedRows,
  buildShopPetViewEmbed,
  buildShopPetViewRows,
  changeSimLast,
  changeSimMid,
  changeSimOperator,
  registerSimNumber,
  syncSimPrestige,
  ECON_SHOP_SIM,
  ECON_SHOP_SIM_REGISTER,
  ECON_SHOP_SIM_CHANGE,
  ECON_SHOP_SIM_OPERATOR,
  ECON_SHOP_SIM_MID,
  ECON_SHOP_SIM_LAST,
  ECON_SHOP_SIM_TOPUP_OPEN,
  ECON_SHOP_SIM_DETAILS,
} from "./economyShopUi.js";
import {
  applyUnregisteredVehiclePenalty,
  economyCarDisplayLine,
  formatVehiclePlate,
  unregisteredVehiclePenaltyApplies,
} from "./economyLicensePlate.js";
import {
  buildShopAppearanceEmbed,
  buildShopAppearanceRows,
  handleAppearanceShopButton,
  isAppearanceShopButton,
  replyWithProfileCardImage,
} from "./economyShopAppearanceUi.js";
import { tier3RankTitle } from "./tier3RankTitles.js";
import { loadVoiceLadder } from "../voice/loadLadder.js";
import { listBetEvents, type BetEvent, type PlacedBet } from "../bets/store.js";
import { mskTodayYmd } from "./mskCalendar.js";
import {
  addToTreasury,
  getLegalIncomeTaxPercent,
  getSolePropWeeklyCapitalTaxPercent,
  isLegalTaxableJob,
  remitShopPurchaseVatToTreasury,
  solePropWithdrawWithFee,
  withholdLegalIncomeTax,
} from "./taxTreasury.js";
import {
  isTier12JobId,
  tier12CareerEmbedLines,
  tier12RankFromShifts,
  tier12RankIncomeMult,
  tier12RankTitle,
} from "./tier12Career.js";
import {
  buildMacroTerminalLines,
  inflatedApartmentPurchaseCost,
  inflatedApartmentUtilityRub,
  inflatedCarPurchaseCost,
  inflatedCatalogApartmentPrice,
  inflatedCatalogCarPrice,
  inflatedCatalogPhonePrice,
  inflatedHousingRentPrice,
  inflatedPhonePurchaseCost,
  scalePositiveIncome,
  scaleSignedIncome,
  scaledShopPrice,
} from "./economyMacro.js";
import { formatSimNumberFromUser, userHasSimNumber } from "./economySimNumber.js";
import {
  ensureDueLotteryDraws,
  lotteryPeriodMskYmd,
  LOTTERY_JACKPOT_CHANCES,
  LOTTERY_REFUND_CHANCES,
  msUntilNextLotteryDrawMsk,
} from "./lotteryDraw.js";
import {
  addLotteryTickets,
  getLotteryState,
  LOTTERY_TICKET_PRICE_RUB,
} from "./lotteryStore.js";
import {
  ASSEMBLER_7TH_BONUS_BASE_RUB,
  buildJobDetailMainBlock,
  jobOpeningLine,
  jobPayoutShortForMenu,
  jobShiftPayEmbedLine,
  tier3OfficeShiftBonusLine,
} from "./jobEconomyText.js";
import {
  applyShiftPayCoeffToGrossRub,
  formatAccCdHours,
  shiftPayCoeffApplies,
  shiftPayCoeffFromAccMs,
  SHIFT_PAY_FREE_CD_MS,
} from "./shiftPayCoeff.js";

export const ECON_BUTTON_MENU = "econ:menu";
export const ECON_BUTTON_PROFILE = "econ:profile";
export const ECON_BUTTON_HOUSING = "econ:housing";
export const ECON_BUTTON_PLAYERS = "econ:players";
export const ECON_BUTTON_WORK = "econ:work";
export const ECON_BUTTON_SKILLS = "econ:skills";
export const ECON_BUTTON_SHOP = "econ:shop";
const ECON_SHOP_LOTTERY = "econ:shop:lottery";
/** Экран «Жильё» в главном меню (не магазин): только арендатор. */
const ECON_HOUSING_EDIT = "econ:housing:edit";
const ECON_HOUSING_BACK = "econ:housing:back";
const ECON_HOUSING_LEAVE = "econ:housing:leave";
const ECON_HOUSING_DETAILS = "econ:housing:details";
const ECON_HOUSING_EXT_PREFIX = "econ:housing:ext:";
const ECON_SHOP_HOUSE_RENEW_AFTER_REQ_PREFIX = "econ:shop:house:renewReq:";
const ECON_SHOP_HOUSE_RENEW_AFTER_CNF_PREFIX = "econ:shop:house:renewCnf:";
const ECON_SHOP_HOUSE_RENEW_AFTER_CAN = "econ:shop:house:renewCan";
const ECON_SHOP_LOTTERY_BUY_OPEN = "econ:shop:lottery:buyOpen";
const ECON_SHOP_LOTTERY_DETAILS = "econ:shop:lottery:details";
const ECON_LOTTERY_CONFIRM_PREFIX = "econ:lottery:confirm:";
const ECON_LOTTERY_CANCEL = "econ:lottery:cancel";
const ECON_MODAL_LOTTERY_QTY = "modal:econ:lotteryQty";

const ECON_COURIER_BIKE_1D = "econ:work:courierbike:1d";
const ECON_COURIER_BIKE_3D = "econ:work:courierbike:3d";
const ECON_COURIER_BIKE_7D = "econ:work:courierbike:7d";

const ASSEMBLER_BASE_CD_MS = 3 * 60 * 60 * 1000;

const ECON_PROFILE_BUTTON_INFO = "econ:profile:info";
const ECON_PROFILE_BUTTON_CARD = "econ:profile:card";
const ECON_PROFILE_BUTTON_LADDER = "econ:profile:ladder";
const ECON_PROFILE_BUTTON_DETAILS = "econ:profile:details";
const ECON_PROFILE_BUTTON_LADDER_ALL = "econ:profile:ladderAll";
const ECON_PROFILE_BUTTON_BETS_HISTORY = "econ:profile:betsHistory";
/** Экран привязки Telegram (если задан TELEGRAM_BOT_TOKEN). */
const ECON_PROFILE_BUTTON_TG = "econ:profile:tgCode";
const ECON_TG_BACK_PROFILE = "econ:tg:back";
const ECON_TG_MENU_ROOT = "econ:tg:menu";
const ECON_TG_NEW_CODE = "econ:tg:newCode";
const ECON_TG_NEW_CONFIRM = "econ:tg:newConfirm";
const ECON_TG_NEW_CANCEL = "econ:tg:newCancel";
const TG_LINK_CODE_TTL_MS = 10 * 60 * 1000;
const ECON_PROFILE_BETS_PAGE_PREFIX = "econ:profile:betsPage:";
/** Записей на страницу (лимит описания эмбеда ~4096 символов). */
const PROFILE_BETS_PAGE_SIZE = 7;

const ECON_WORK_BUTTON_STARTERS = "econ:work:starters";
const ECON_WORK_BUTTON_JOB_PREFIX = "econ:work:job:";
const ECON_WORK_BUTTON_TAKE_PREFIX = "econ:work:take:";
const ECON_WORK_BUTTON_SHIFT = "econ:work:shift";
const ECON_WORK_BUTTON_MY_JOB = "econ:work:myJob";
const ECON_WORK_BUTTON_QUIT = "econ:work:quit";
const ECON_WORK_BUTTON_QUIT_CONFIRM = "econ:work:quit:confirm";
/** Подтверждение: уволиться с текущей и взять `jobId` */
const ECON_WORK_BUTTON_SWITCH_CONFIRM_PREFIX = "econ:work:switchOk:";

const ECON_WORK_BUTTON_TIER2 = "econ:work:tier2";
const ECON_WORK_BUTTON_TIER3 = "econ:work:tier3";
const ECON_WORK_BUTTON_JOB_DETAIL_PREFIX = "econ:work:jobDetail:";
const ECON_WORK_BUTTON_JOB_DETAIL_CLOSE_PREFIX = "econ:work:jobDetailClose:";
const ECON_TIER3_SIDE = "econ:work:t3:side";
const ECON_TIER3_BOSS = "econ:work:t3:boss";
const ECON_IP_AD_OPEN = "econ:work:ip:adOpen";
const ECON_IP_STAFF = "econ:work:ip:staff";
const ECON_IP_CONTROL = "econ:work:ip:control";
const ECON_IP_DEP_OPEN = "econ:work:ip:depOpen";
const ECON_IP_WD_OPEN = "econ:work:ip:wdOpen";
const ECON_IP_CALC_OPEN = "econ:work:ip:calcOpen";
const ECON_IP_CALC_CLOSE = "econ:work:ip:calcClose";
const ECON_PLAYERS_BUTTON_TOP_PS = "econ:players:topPs";
const ECON_PLAYERS_BUTTON_TOP_RUB = "econ:players:topRub";

const ECON_MODAL_SIM_TOPUP = "modal:econ:simTopup";
const ECON_MODAL_IP_AD = "modal:econ:ipAd";
const ECON_MODAL_IP_DEP = "modal:econ:ipDep";
const ECON_MODAL_IP_WD = "modal:econ:ipWd";
const ECON_MODAL_IP_CALC = "modal:econ:ipCalc";

export const ECON_FEED_BUTTON_ARCHIVE = "econFeed:archive";
const ECON_FEED_BUTTON_PAGE_PREFIX = "econFeed:page:";

const PANEL_COLOR = 0x263238;
const PROFILE_COLOR = 0x1b5e20;
const FEED_COLOR = 0x0d47a1;

const BIKE_1D_MS = 1 * 86400000;
const BIKE_3D_MS = 3 * 86400000;
const BIKE_7D_MS = 7 * 86400000;

function fmt(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const rounded = Math.round(n * 100) / 100;
  const isWhole = Math.abs(rounded - Math.round(rounded)) < 1e-9;
  const x = isWhole ? Math.round(rounded) : rounded;
  return x.toLocaleString("ru-RU", isWhole ? { maximumFractionDigits: 0 } : { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

const DISCORD_BUTTON_LABEL_MAX = 80;

function shopItemButtonLabel(name: string, costRub: number): string {
  const suffix = `${fmt(costRub)} ₽`;
  const full = `${name} (${suffix})`;
  if (full.length <= DISCORD_BUTTON_LABEL_MAX) return full;
  const maxName = DISCORD_BUTTON_LABEL_MAX - suffix.length - 4;
  return `${name.slice(0, Math.max(1, maxName))}… (${suffix})`;
}

function rentPlanLabelRu(p: HousingRentPlan | undefined): string {
  if (p === "day") return "1 сутки";
  if (p === "week") return "7 суток";
  return "30 суток";
}

function progressName(): string {
  return "Социальный рейтинг";
}

function progressShort(): string {
  return "СР";
}

function buildTerminalPanelEmbed(guildName: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(PANEL_COLOR)
    .setTitle("Терминал страны")
    .setDescription("Профиль, работа, магазин и навыки — кнопками ниже.")
    .setFooter({ text: `Сервер: ${guildName}` });
}

function buildTerminalPanelRows(member: GuildMember): ActionRowBuilder<ButtonBuilder>[] {
  const u = getEconomyUser(member.guild.id, member.id);
  const showHousing = (u.housingKind ?? "none") === "rent";
  const rows: ActionRowBuilder<ButtonBuilder>[] = [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(ECON_BUTTON_PROFILE).setLabel("Профиль").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(ECON_BUTTON_WORK).setLabel("Работа").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(ECON_BUTTON_SHOP).setLabel("Магазин").setStyle(ButtonStyle.Secondary),
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(ECON_BUTTON_SKILLS).setLabel("Навыки").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(ECON_BUTTON_PLAYERS).setLabel("Игроки").setStyle(ButtonStyle.Secondary),
    ),
  ];
  if (showHousing) {
    rows[1]?.addComponents(new ButtonBuilder().setCustomId(ECON_BUTTON_HOUSING).setLabel("Аренда").setStyle(ButtonStyle.Secondary));
  }
  return rows;
}

function buildTerminalPublicEmbed(guildId: string, guildName: string): EmbedBuilder {
  const macro = buildMacroTerminalLines(guildId);
  return new EmbedBuilder()
    .setColor(PANEL_COLOR)
    .setTitle("Нейроком")
    .setDescription(
      [
        "**Нейроком** — да здравствует ИИ в общине советских граждан!",
        "",
        "Управляй своей жизнью в государстве через кнопку **«Главное меню»** (видно только тебе).",
        "",
        ...macro,
      ].join("\n"),
    )
    .setFooter({ text: `Сервер: ${guildName}` });
}

function buildTerminalPublicRows(): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(ECON_BUTTON_MENU).setLabel("Главное меню").setStyle(ButtonStyle.Primary),
    ),
  ];
}

function buildMenuRow(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(ECON_BUTTON_MENU).setLabel("Главное меню").setStyle(ButtonStyle.Secondary),
  );
}

function resolveVoiceLadderStep(psTotal: number): {
  current: { roleName: string; voiceMinutesTotal: number };
  next?: { roleName: string; voiceMinutesTotal: number };
} | null {
  let ladder: ReturnType<typeof loadVoiceLadder>["ladder"] | undefined;
  try {
    ladder = loadVoiceLadder().ladder;
  } catch {
    ladder = undefined;
  }
  if (!ladder?.length) return null;
  let current = ladder[0]!;
  for (const t of ladder) {
    if (psTotal >= t.voiceMinutesTotal) current = t;
  }
  const idx = ladder.findIndex((t) => t.roleName === current.roleName && t.voiceMinutesTotal === current.voiceMinutesTotal);
  const next = idx >= 0 ? ladder[idx + 1] : undefined;
  return { current, next };
}

/** Строки прогресса по лестнице ролей для профиля (без двусмысленного «803 — до следующей 197»). */
function buildVoiceLadderProgressLines(psTotal: number): string[] {
  const ps = progressShort();
  const step = resolveVoiceLadderStep(psTotal);
  if (!step) {
    return [`${progressName()} (прогресс роли): **${fmt(psTotal)}** ${ps}`];
  }
  const lines = [`${progressName()} (прогресс роли): **${fmt(psTotal)}** ${ps} **сейчас**`];
  if (!step.next) {
    lines.push(`Лестница ролей: **${step.current.roleName}** — **последняя ступень**`);
    return lines;
  }
  const need = Math.max(0, step.next.voiceMinutesTotal - psTotal);
  lines.push(
    `Следующая роль **${step.next.roleName}**: не хватает **${fmt(need)}** ${ps} (порог **${fmt(step.next.voiceMinutesTotal)}** ${ps})`,
  );
  return lines;
}

function ownedApartmentProfileBlockLine(
  guildId: string,
  aptId: string | undefined,
  purchasedAtMs?: number,
): string {
  const apt = getApartmentDef(aptId);
  if (!apt) return "—";
  const util = inflatedApartmentUtilityRub(guildId, apt.id);
  const ownedDays =
    purchasedAtMs != null && Number.isFinite(purchasedAtMs) && purchasedAtMs > 0
      ? Math.max(0, Math.floor((Date.now() - purchasedAtMs) / 86_400_000))
      : undefined;
  const ownedPart = ownedDays != null ? ` · владеете **${ownedDays}** сут` : "";
  return `**${apt.label}** · ЖКХ **${fmt(util)}** ₽/мес.${ownedPart}`;
}

function buildProfilePurchasesBlock(guildId: string, u: ReturnType<typeof getEconomyUser>): string[] {
  const lines: string[] = [];
  const phones = listOwnedPhones(u);
  if (phones.length === 0) {
    lines.push("Телефон: **нет**");
  } else {
    const phonePart = phones.map((p) => `**${getPhoneDef(p.id)?.label ?? p.id}**`).join(", ");
    if (!userHasSimNumber(u)) {
      lines.push(`Телефон: ${phonePart} (сим **нет**)`);
    } else {
      const simFmt = formatSimNumberFromUser(u) ?? "—";
      lines.push(`Телефон: ${phonePart} (сим **${simFmt}**, баланс **${fmt(u.simBalanceRub ?? 0)}** ₽)`);
    }
  }
  lines.push(economyCarDisplayLine(u));
  const hk = u.housingKind ?? "none";
  const sov = listOwnedApartmentsByOrigin(u, "soviet");
  const frn = listOwnedApartmentsByOrigin(u, "foreign");
  const homeSov =
    hk === "rent"
      ? "**аренда** (советское жильё)"
      : sov.length > 0
        ? sov.map((a) => ownedApartmentProfileBlockLine(guildId, a.id, a.purchasedAtMs)).join("; ")
        : "**нет** (сов.)";
  const homeFor =
    frn.length > 0
      ? frn.map((a) => ownedApartmentProfileBlockLine(guildId, a.id, a.purchasedAtMs)).join("; ")
      : "**нет** (зам.)";
  lines.push(`Жильё: ${homeSov} · ${homeFor}`);
  lines.push(`Престиж: **${fmt(u.prestigePoints ?? 0)}** · Быт: **${fmt(u.domesticPoints ?? 0)}**`);
  const pets = listOwnedPets(u);
  if (pets.length > 0) {
    lines.push(`Питомцы: ${pets.map((p) => formatOwnedPetLine(p)).join("; ")}`);
  }
  return lines;
}

function showTelegramBridgeInProfile(member: GuildMember): boolean {
  if (!isTelegramBridgeConfigured()) return false;
  return member.guild.ownerId === member.id || isTelegramHubGranted(member.guild.id, member.id);
}

function buildProfileHubRows(member: GuildMember, active: "info" | "ladder" | "bets"): ActionRowBuilder<ButtonBuilder>[] {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(ECON_PROFILE_BUTTON_INFO)
        .setLabel("Инфо")
        .setStyle(active === "info" ? ButtonStyle.Primary : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(ECON_PROFILE_BUTTON_CARD)
        .setLabel("Карточка")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(ECON_PROFILE_BUTTON_LADDER)
        .setLabel("Лестница")
        .setStyle(active === "ladder" ? ButtonStyle.Primary : ButtonStyle.Secondary),
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(ECON_PROFILE_BUTTON_DETAILS)
        .setLabel("Детали")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(ECON_PROFILE_BUTTON_BETS_HISTORY)
        .setLabel("История ставок")
        .setStyle(active === "bets" ? ButtonStyle.Primary : ButtonStyle.Secondary),
    ),
  ];
  if (active === "ladder") {
    rows[1]?.addComponents(
      new ButtonBuilder()
        .setCustomId(ECON_PROFILE_BUTTON_LADDER_ALL)
        .setLabel("Все пороги")
        .setStyle(ButtonStyle.Secondary),
    );
  }
  if (showTelegramBridgeInProfile(member)) {
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(ECON_PROFILE_BUTTON_TG)
          .setLabel("Telegram: код привязки")
          .setStyle(ButtonStyle.Secondary),
      ),
    );
  }
  rows.push(buildMenuRow());
  return rows;
}

function buildTelegramHubEmbed(member: GuildMember): EmbedBuilder {
  const gid = member.guild.id;
  const uid = member.id;
  const linkedTg = getLinkedTelegramIdForDiscord(gid, uid);
  const last = getLastIssuedTelegramCode(gid, uid);
  const now = Date.now();
  const lines: string[] = [];
  lines.push(linkedTg ? "**Статус:** Telegram **привязан**." : "**Статус:** Telegram **не привязан**.");
  lines.push("");
  if (last) {
    const expired = now > last.expiresAtMs;
    lines.push(`**Код:** \`${last.code}\`${expired ? " **(истёк)**" : ""}`);
    if (!expired) {
      const expSec = Math.floor(last.expiresAtMs / 1000);
      lines.push(`Действует до <t:${expSec}:F> (<t:${expSec}:R>).`);
    }
  } else {
    lines.push("_Код ещё не выдавался — нажми **«Новый код»**._");
  }
  lines.push("", "В Telegram: `/link КОД`");
  return new EmbedBuilder()
    .setColor(PROFILE_COLOR)
    .setTitle("Telegram")
    .setDescription(lines.join("\n"))
    .setFooter({ text: `Запросил: ${member.user.tag}` });
}

function buildTelegramNewCodeConfirmEmbed(member: GuildMember): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(PANEL_COLOR)
    .setTitle("Выдать новый код?")
    .setDescription(
      [
        "Действующий код привязки будет **отменён**.",
        "Новый код нужен, если Telegram ещё не привязан, старый истёк, или нужен другой аккаунт.",
      ].join("\n"),
    )
    .setFooter({ text: `Запросил: ${member.user.tag}` });
}

function buildTelegramHubRows(member: GuildMember, view: "hub" | "confirmNew"): ActionRowBuilder<ButtonBuilder>[] {
  if (view === "confirmNew") {
    return [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(ECON_TG_NEW_CONFIRM).setLabel("Да, новый код").setStyle(ButtonStyle.Danger),
      ),
      shopNavBottomRow(ECON_TG_NEW_CANCEL, "Отменить"),
    ];
  }
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(ECON_TG_NEW_CODE).setLabel("Новый код").setStyle(ButtonStyle.Primary),
    ),
    shopNavBottomRow(ECON_TG_BACK_PROFILE),
  ];
}

async function assertTelegramHubAccess(interaction: ButtonInteraction, member: GuildMember): Promise<boolean> {
  if (!isTelegramBridgeConfigured()) {
    await interaction.reply({ content: "Telegram для бота не настроен.", flags: MessageFlags.Ephemeral });
    return false;
  }
  const allowed =
    member.guild.ownerId === member.id || isTelegramHubGranted(member.guild.id, member.id);
  if (!allowed) {
    await interaction.reply({
      content: "Раздел Telegram в профиле вам не выдан. Обратитесь к **владельцу сервера**.",
      flags: MessageFlags.Ephemeral,
    });
    return false;
  }
  return true;
}

/** Чистый результат одной принятой ставки (кэф зафиксирован при приёме). */
function betStakeNetRubles(ev: BetEvent, bet: PlacedBet): number | "pending" | "cancelled" {
  if (ev.status === "cancelled") return "cancelled";
  if (ev.status !== "resolved" || !ev.winningOptionId) return "pending";
  if (bet.optionId === ev.winningOptionId) {
    const payout = Math.floor(bet.amount * bet.oddsAtPlacement);
    return payout - bet.amount;
  }
  return -bet.amount;
}

function listMemberBetStakes(member: GuildMember): { ev: BetEvent; bet: PlacedBet }[] {
  const guildId = member.guild.id;
  const userId = member.id;
  const out: { ev: BetEvent; bet: PlacedBet }[] = [];
  for (const ev of listBetEvents(guildId)) {
    const stakes = ev.bets[userId];
    if (!stakes?.length) continue;
    for (const bet of stakes) out.push({ ev, bet });
  }
  out.sort((a, b) => b.bet.ts - a.bet.ts);
  return out;
}

function buildProfileBetHistoryEmbed(member: GuildMember, page: number): EmbedBuilder {
  const mine = listMemberBetStakes(member);
  const total = mine.length;

  if (total === 0) {
    return new EmbedBuilder()
      .setColor(PROFILE_COLOR)
      .setTitle("История ставок")
      .setDescription("Пока нет ни одной ставки.")
      .setFooter({ text: `Запросил: ${member.user.tag}` });
  }

  const totalPages = Math.max(1, Math.ceil(total / PROFILE_BETS_PAGE_SIZE));
  const p = Math.max(0, Math.min(Math.floor(page), totalPages - 1));
  const slice = mine.slice(p * PROFILE_BETS_PAGE_SIZE, p * PROFILE_BETS_PAGE_SIZE + PROFILE_BETS_PAGE_SIZE);

  const blocks: string[] = [];
  for (const { ev: e, bet: b } of slice) {
    const opt = e.options.find((o) => o.id === b.optionId);
    const label = opt?.label ?? b.optionId;
    const oddStr = b.oddsAtPlacement.toLocaleString("ru-RU");
    const net = betStakeNetRubles(e, b);
    let resultLine: string;
    if (net === "pending") {
      resultLine = "_Итог: ждёт решения админа._";
    } else if (net === "cancelled") {
      resultLine = "Итог: **возврат** ставки (событие отменено).";
    } else if (net > 0) {
      resultLine = `Итог: **+${fmt(net)} ₽** чистыми (сверх суммы ставки).`;
    } else if (net < 0) {
      resultLine = `Итог: **${formatDelta(net)}**`;
    } else {
      resultLine = "**0 ₽** (без изменения баланса по итогу).";
    }
    blocks.push(
      [
        `**${e.title}**`,
        `Ставка: **${fmt(b.amount)} ₽** на «${label}» · кэф при приёме **x${oddStr}**`,
        resultLine,
      ].join("\n"),
    );
  }

  const intro =
    totalPages > 1
      ? `_Всего ставок: **${total}** · страница **${p + 1}** из **${totalPages}**_\n\n`
      : `_Всего ставок: **${total}**_\n\n`;

  return new EmbedBuilder()
    .setColor(PROFILE_COLOR)
    .setTitle("История ставок")
    .setDescription(intro + blocks.join("\n\n"))
    .setFooter({ text: `Запросил: ${member.user.tag}` });
}

function buildProfileBetsTabComponents(member: GuildMember, page: number): ActionRowBuilder<ButtonBuilder>[] {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  const mine = listMemberBetStakes(member);
  const totalPages = Math.max(1, Math.ceil(mine.length / PROFILE_BETS_PAGE_SIZE));
  const p = Math.max(0, Math.min(Math.floor(page), totalPages - 1));

  if (totalPages > 1) {
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`${ECON_PROFILE_BETS_PAGE_PREFIX}${p - 1}`)
          .setLabel("← Ранее")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(p === 0),
        new ButtonBuilder()
          .setCustomId(`${ECON_PROFILE_BETS_PAGE_PREFIX}${p + 1}`)
          .setLabel("Далее →")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(p >= totalPages - 1),
      ),
    );
  }
  rows.push(...buildProfileHubRows(member, "bets"));
  return rows;
}

function buildProfileEmbed(member: GuildMember): EmbedBuilder {
  const u = getEconomyUser(member.guild.id, member.id);
  const jobName = u.jobId ? jobTitle(u.jobId) : "не выбрана";

  return new EmbedBuilder()
    .setColor(PROFILE_COLOR)
    .setTitle(`Профиль (${member.displayName})`)
    .setDescription(
      [
        `Баланс: **${fmt(u.rubles)}** ₽ · СР: **${fmt(u.psTotal)}**`,
        `Престиж: **${fmt(u.prestigePoints ?? 0)}** · Быт: **${fmt(u.domesticPoints ?? 0)}**`,
        ...buildVoiceLadderProgressLines(u.psTotal),
        `Работа: **${jobName}**`,
      ].join("\n"),
    )
    .setFooter({ text: `Запросил: ${member.user.tag}` });
}

function buildProfileDetailsEmbed(member: GuildMember): EmbedBuilder {
  const u = getEconomyUser(member.guild.id, member.id);
  const lines = [
    "**Активы:**",
    ...buildProfilePurchasesBlock(member.guild.id, u),
    "",
    "Голос начисляет **СР**, но не ₽. Быт усиливает СР с голоса и легальных смен.",
  ];
  return new EmbedBuilder()
    .setColor(PROFILE_COLOR)
    .setTitle(`Профиль · подробно (${member.displayName})`)
    .setDescription(lines.join("\n"))
    .setFooter({ text: `Запросил: ${member.user.tag}` });
}

function buildLadderEmbed(member: GuildMember): EmbedBuilder {
  const u = getEconomyUser(member.guild.id, member.id);
  let ladder: ReturnType<typeof loadVoiceLadder>["ladder"] | undefined;
  try {
    ladder = loadVoiceLadder().ladder;
  } catch {
    ladder = undefined;
  }
  if (!ladder || ladder.length === 0) {
    return new EmbedBuilder()
      .setColor(PANEL_COLOR)
      .setTitle("Голосовая лестница")
      .setDescription("Лестница недоступна (ошибка `config/voice-ladder.json`).")
      .setFooter({ text: `Запросил: ${member.user.tag}` });
  }

  const step = resolveVoiceLadderStep(u.psTotal);
  const current = step?.current ?? ladder[0]!;
  const next = step?.next;

  const lines: string[] = [];
  lines.push(`${progressName()}: **${fmt(u.psTotal)}** ${progressShort()} **сейчас**`);
  lines.push(`Текущая ступень: **${current.roleName}**`);
  if (next) {
    const need = Math.max(0, next.voiceMinutesTotal - u.psTotal);
    lines.push(
      `Следующая роль **${next.roleName}**: не хватает **${fmt(need)}** ${progressShort()} (порог **${fmt(next.voiceMinutesTotal)}** ${progressShort()})`,
    );
  } else {
    lines.push("Ты уже на **последней ступени**.");
  }
  return new EmbedBuilder()
    .setColor(PANEL_COLOR)
    .setTitle("Голосовая лестница")
    .setDescription(lines.join("\n"))
    .setFooter({ text: `Запросил: ${member.user.tag}` });
}

function buildLadderAllEmbed(member: GuildMember): EmbedBuilder {
  let ladder: ReturnType<typeof loadVoiceLadder>["ladder"] | undefined;
  try {
    ladder = loadVoiceLadder().ladder;
  } catch {
    ladder = undefined;
  }
  const lines = ladder?.length
    ? ladder.map((t) => `• **${t.roleName}** — **${fmt(t.voiceMinutesTotal)} СР**`)
    : ["Лестница недоступна."];
  lines.push("", "СР дают голос и легальные смены; быт усиливает начисление.");
  return new EmbedBuilder()
    .setColor(PANEL_COLOR)
    .setTitle("Голосовая лестница · все пороги")
    .setDescription(lines.join("\n"));
}

function buildPlayersMenuEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(PANEL_COLOR)
    .setTitle("Игроки")
    .setDescription("Топы по социальному рейтингу и по балансу ₽.");
}

function buildPlayersMenuRows(): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(ECON_PLAYERS_BUTTON_TOP_PS).setLabel("Топ СР").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(ECON_PLAYERS_BUTTON_TOP_RUB).setLabel("Топ ₽").setStyle(ButtonStyle.Primary),
    ),
    buildMenuRow(),
  ];
}

async function buildTopEmbed(viewer: GuildMember, kind: "ps" | "rub"): Promise<EmbedBuilder> {
  const list = listEconomyUsers(viewer.guild.id);
  const sorted = [...list].sort((a, b) => {
    const av = kind === "ps" ? a.user.psTotal : a.user.rubles;
    const bv = kind === "ps" ? b.user.psTotal : b.user.rubles;
    return bv - av;
  });
  const top = sorted.slice(0, 10);

  const lines: string[] = [];
  for (let i = 0; i < top.length; i++) {
    const { userId, user } = top[i]!;
    const val = kind === "ps" ? user.psTotal : user.rubles;
    lines.push(`${i + 1}. <@${userId}> — **${fmt(val)}**`);
  }
  if (!lines.length) lines.push("Пока нет данных.");

  return new EmbedBuilder()
    .setColor(PROFILE_COLOR)
    .setTitle(kind === "ps" ? `Топ игроков по ${progressShort()}` : "Топ игроков по ₽")
    .setDescription(lines.join("\n"))
    .setFooter({ text: `Запросил: ${viewer.user.tag}` });
}

const WORK_JOB_IDS = [
  "courier",
  "waiter",
  "watchman",
  "dispatcher",
  "assembler",
  "expediter",
  "officeAnalyst",
  "shadowFixer",
  "soleProp",
] as const satisfies readonly JobId[];

function isWorkJobId(s: string): s is JobId {
  return (WORK_JOB_IDS as readonly string[]).includes(s);
}

function formatCooldown(msLeft: number): string {
  const sec = Math.max(0, Math.floor(msLeft / 1000));
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}д ${h}ч`;
  if (h > 0) return `${h}ч ${m}м`;
  return `${m}м`;
}

type JobDef = {
  id: JobId;
  title: string;
  baseCooldownMs: number;
  basePayoutRub: number;
  description: string;
  reqSkills?: Partial<Record<SkillId, number>>;
  tier3Archetype?: "legal" | "illegal" | "ip";
  passiveBaseRub?: number;
};

// Чем выше потолок при активной игре — тем короче КД. Стабильный фикс — реже смены.
const JOBS_STARTER: JobDef[] = [
  {
    id: "courier",
    title: "Доставка",
    baseCooldownMs: 3 * 60 * 60 * 1000,
    basePayoutRub: 7_250,
    description: "КД **3** ч · **6,5–8k** ₽ · телефон + симка",
  },
  {
    id: "waiter",
    title: "Уличный брокер",
    baseCooldownMs: 8 * 60 * 60 * 1000,
    basePayoutRub: 0,
    description: "КД **8** ч · рандом **−10k…58k** ₽",
  },
  {
    id: "watchman",
    title: "Кладбище",
    baseCooldownMs: 24 * 60 * 60 * 1000,
    basePayoutRub: 12_000,
    description: "КД **24** ч · **11–13k** ₽",
  },
];

type StarterJobId = (typeof JOBS_STARTER)[number]["id"];

function getJobDef(id: StarterJobId): JobDef {
  const d = JOBS_STARTER.find((j) => j.id === id);
  if (!d) throw new Error(`unknown job: ${id}`);
  return d;
}

function jobDefFromTier3(d: Tier3JobDef): JobDef {
  return {
    id: d.id,
    title: d.title,
    baseCooldownMs: d.baseCooldownMs,
    basePayoutRub: d.basePayoutRub,
    description: d.description,
    reqSkills: { ...d.reqSkills },
    tier3Archetype: d.archetype,
    passiveBaseRub: d.passiveBaseRub,
  };
}

// Тир-2: та же логика КД; тир-3 — комбо из трёх навыков.
const JOBS_TIER2: JobDef[] = [
  {
    id: "dispatcher",
    title: "Колл-центр",
    baseCooldownMs: 24 * 60 * 60 * 1000,
    basePayoutRub: 28_000,
    description: "КД **24** ч · **26–30k** ₽ · жильё",
    reqSkills: { communication: 28, discipline: 20 },
  },
  {
    id: "assembler",
    title: "Склад",
    baseCooldownMs: ASSEMBLER_BASE_CD_MS,
    basePayoutRub: 16_500,
    description: "КД **3** ч · **15–18k** ₽ · авто ускоряет · жильё",
    reqSkills: { discipline: 28, logistics: 20 },
  },
  {
    id: "expediter",
    title: "Развлекательный центр",
    baseCooldownMs: 6 * 60 * 60 * 1000,
    basePayoutRub: 0,
    description: "КД **6** ч · рандом **−38k…155k** ₽ · жильё",
    reqSkills: { logistics: 28, communication: 20 },
  },
];

function getAnyJobDef(id: JobId): JobDef {
  const s = JOBS_STARTER.find((j) => j.id === id);
  if (s) return s;
  const t2 = JOBS_TIER2.find((j) => j.id === id);
  if (t2) return t2;
  const t3 = JOBS_TIER3.find((j) => j.id === id);
  if (t3) return jobDefFromTier3(t3);
  throw new Error(`unknown job: ${id}`);
}

function jobTitle(id: JobId): string {
  return getAnyJobDef(id).title;
}

function getSkillLevel(u: ReturnType<typeof getEconomyUser>, skill: SkillId): number {
  return Math.max(0, Math.floor(u.skills?.[skill] ?? 0));
}

function meetsJobReq(u: ReturnType<typeof getEconomyUser>, def: JobDef): { ok: boolean; missing: string[] } {
  const missing: string[] = [];
  for (const [k, v] of Object.entries(def.reqSkills ?? {})) {
    const skill = k as SkillId;
    const need = v ?? 0;
    if (need <= 0) continue;
    const have = getSkillLevel(u, skill);
    if (have < need) missing.push(`${skillName(skill)} ${need}+ (у вас ${have})`);
  }
  return { ok: missing.length === 0, missing };
}

function randInt(min: number, max: number): number {
  const a = Math.ceil(min);
  const b = Math.floor(max);
  if (b <= a) return a;
  return Math.floor(a + Math.random() * (b - a + 1));
}

function chance(p: number): boolean {
  return Math.random() < Math.min(1, Math.max(0, p));
}

/** Накопленный КД за сутки для лимита выплаты (только роли с КД ниже 6 ч). */
function workShiftCdAccStatusLines(u: ReturnType<typeof getEconomyUser>, jobId: JobId, now: number): string[] {
  const cdMs = effectiveShiftCooldownMs(u, jobId, now);
  if (!shiftPayCoeffApplies(cdMs)) return [];
  const ymd = mskTodayYmd(now);
  const acc = u.workShiftMskYmd === ymd ? (u.workShiftCdAccMs ?? 0) : 0;
  const freeH = formatAccCdHours(SHIFT_PAY_FREE_CD_MS);
  return [`Накоплено КД за сутки: **${formatAccCdHours(acc)}** / **${freeH}** ч до понижения коэффициента.`];
}

function jobTaxEmbedLines(guildId: string, jobId: JobId): string[] {
  if (jobId === "shadowFixer") return ["Налог: **не удерживается**."];
  const pct = getLegalIncomeTaxPercent(guildId);
  const out = [`Налог с зачисления: **${pct}**%.`];
  if (jobId === "soleProp") {
    const cap = getSolePropWeeklyCapitalTaxPercent(guildId);
    if (cap > 0) out.push(`Налог с капитала ИП (еженед.): **${cap}**%.`);
  }
  return out;
}

function tier3CareerEmbedLines(guildId: string, u: ReturnType<typeof getEconomyUser>, jobId: Tier3JobId): string[] {
  const streak = u.jobMskDayStreak ?? 0;
  const rank = tier3PromotionRank(streak);
  const title = tier3RankTitle(jobId, rank);
  const lines: string[] = [];
  if (jobId === "soleProp") {
    if (rank >= TIER3_MAX_PROMOTION_RANK) {
      lines.push(`**${title}** (ранг **${rank}**, максимум) · стрик **${streak}** дн.`);
    } else {
      const daysToNext = (rank + 1) * TIER3_PROMOTION_EVERY_DAYS - streak;
      lines.push(
        `**${title}** (ранг **${rank}**) · стрик **${streak}** дн. · **${daysToNext}** дн. до следующего ранга (**ранг ${rank + 1}**)`,
      );
    }
    lines.push(`**Множитель ранга к суточному окладу** (пассивно): **×${(1 + 0.08 * rank).toFixed(2)}**`);
    return lines;
  }
  if (rank >= TIER3_MAX_PROMOTION_RANK) {
    lines.push(`**${title}** (ранг **${rank}**, максимум) · стрик **${streak}** дн.`);
  } else {
    const nextTitle = tier3RankTitle(jobId, rank + 1);
    const daysToNext = (rank + 1) * TIER3_PROMOTION_EVERY_DAYS - streak;
    lines.push(
      `**${title}** (ранг **${rank}**) · стрик **${streak}** дн. · **${daysToNext}** дн. до следующего ранга (**${nextTitle}**)`,
    );
  }
  lines.push(`**Множитель ранга к суточному окладу** (пассивно): **×${(1 + 0.08 * rank).toFixed(2)}**`);
  if (jobId === "officeAnalyst") {
    lines.push(tier3OfficeShiftBonusLine(guildId));
  } else {
    lines.push("**Положительные исходы смены** усиливаются **рангом** и **стриком** (в разделе **Условия**).");
  }
  return lines;
}

/** Уличный брокер: штраф и джекпот зависят от ранга (−1% штраф / +1% джекпот за ступень). */
function streetBrokerChances(rank: number): {
  fine: number;
  bad: number;
  normal: number;
  good: number;
  jackpot: number;
} {
  const fine = Math.max(3, 8 - rank);
  const jackpot = Math.min(10, 5 + rank);
  const midTotal = 100 - fine - jackpot;
  return {
    fine,
    bad: midTotal * (32 / 87),
    normal: midTotal * (40 / 87),
    good: midTotal * (15 / 87),
    jackpot,
  };
}

function rollStreetBrokerRub(guildId: string, rank: number): number {
  const p = streetBrokerChances(rank);
  const r = Math.random() * 100;
  if (r < p.fine) return scaleSignedIncome(guildId, -10_000);
  let x = r - p.fine;
  if (x < p.bad) return scaleSignedIncome(guildId, randInt(2800, 3200));
  x -= p.bad;
  if (x < p.normal) return scaleSignedIncome(guildId, randInt(10400, 11600));
  x -= p.normal;
  if (x < p.good) return scaleSignedIncome(guildId, randInt(23800, 26200));
  return scaleSignedIncome(guildId, randInt(52000, 58000));
}

/** Корпоративный брокер (рандом тир-2): ветки как в балансе v2. */
function corporateBrokerChances(rank: number): {
  fine: number;
  weak: number;
  normal: number;
  big: number;
  contract: number;
} {
  const fine = Math.max(3, 8 - rank);
  const contract = Math.min(10, 4 + rank);
  const midTotal = 100 - fine - contract;
  return {
    fine,
    weak: midTotal * (32 / 88),
    normal: midTotal * (42 / 88),
    big: midTotal * (14 / 88),
    contract,
  };
}

function rollCorporateBrokerRub(guildId: string, rank: number): number {
  const p = corporateBrokerChances(rank);
  const r = Math.random() * 100;
  if (r < p.fine) return scaleSignedIncome(guildId, randInt(-38000, -32000));
  let x = r - p.fine;
  if (x < p.weak) return scaleSignedIncome(guildId, randInt(7200, 8800));
  x -= p.weak;
  if (x < p.normal) return scaleSignedIncome(guildId, randInt(20500, 23500));
  x -= p.normal;
  if (x < p.big) return scaleSignedIncome(guildId, randInt(51000, 59000));
  return scaleSignedIncome(guildId, randInt(135000, 155000));
}

function formatDelta(n: number): string {
  if (n === 0) return "0 ₽";
  const sign = n > 0 ? "+" : "−";
  return `${sign}${Math.abs(n).toLocaleString("ru-RU")} ₽`;
}

/** Ориентир суточного оклада офиса того же ранга — для бонусов 10–30% у тир-3. */
function tier3ReferencePassiveRubFromStreak(guildId: string, streakDays: number): number {
  const office = getTier3JobDef("officeAnalyst");
  const rank = tier3PromotionRank(streakDays);
  return scalePositiveIncome(guildId, Math.floor(office.passiveBaseRub * (1 + 0.08 * rank)));
}

function solePropAdMaxRub(guildId: string, streakDays: number): number {
  const rank = tier3PromotionRank(streakDays);
  return scalePositiveIncome(guildId, Math.min(SOLE_PROP_CAP_MAX, 125_000 + rank * 40_000));
}

function rubFromTier3MetaPercent(guildId: string, streakDays: number): number {
  const ref = tier3ReferencePassiveRubFromStreak(guildId, streakDays);
  const p = 0.1 + Math.random() * 0.2;
  return Math.max(0, Math.floor(ref * p));
}

function solePropAdvertOutcome(
  guildId: string,
  bizBal: number,
  amount: number,
  maxAd: number,
): { ok: boolean; delta: number; detail: string } {
  const minAd = scalePositiveIncome(guildId, 10_000);
  if (amount < minAd || amount > maxAd || amount > bizBal) {
    return { ok: false, delta: 0, detail: "Сумма вне диапазона или больше баланса бизнеса." };
  }
  const frac = maxAd > 0 ? amount / maxAd : 1;
  const failP = Math.min(0.92, 0.22 + 0.58 * Math.pow(frac, 1.15));
  if (Math.random() < failP) {
    const lossMult = 0.7 + Math.random() * 0.3;
    const loss = scalePositiveIncome(guildId, Math.min(bizBal, Math.floor(amount * lossMult)));
    return { ok: false, delta: -loss, detail: `Реклама не зашла: **${formatDelta(-loss)}** с баланса бизнеса.` };
  }
  const gainPct = 0.07 + 0.38 * (1 - frac);
  const jitter = 0.88 + Math.random() * 0.28;
  const gain = scalePositiveIncome(guildId, Math.floor(amount * gainPct * jitter));
  return { ok: true, delta: gain, detail: `Реклама сработала: **+${fmt(gain)}** ₽ на баланс бизнеса.` };
}

function rollSolePropStaffOutcome(u: EconomyUser, now: number): { patch: Partial<EconomyUser>; detail: string } {
  const eff0 = u.solePropPassiveEffMult ?? 1;
  const patch: Partial<EconomyUser> = { solePropStaffReadyAt: now + SOLE_PROP_STAFF_CD_MS };
  const r = Math.random();
  if (r < 0.32) {
    const mult = Math.round((1.1 + Math.random() * 0.2) * 100) / 100;
    const w = [0.35, 0.28, 0.2, 0.12, 0.05];
    let acc = 0;
    const roll = Math.random();
    let days = 5;
    for (let i = 0; i < w.length; i++) {
      acc += w[i];
      if (roll < acc) {
        days = i + 1;
        break;
      }
    }
    patch.solePropPassiveTempMult = mult;
    patch.solePropPassiveTempUntilMs = now + days * 86400000;
    return { patch, detail: `Слаженнее: временный множ. **×${mult.toFixed(2)}** на **${days}** дн.` };
  }
  if (r < 0.47) {
    patch.solePropPassiveEffMult = 1;
    return { patch, detail: "Новый набор: эффективность выровнена к **×1.0**." };
  }
  if (r < 0.62) {
    const ne = Math.round(Math.min(1, Math.max(0.3, eff0 - 0.1)) * 10) / 10;
    patch.solePropPassiveEffMult = ne;
    return { patch, detail: `Текучка: эффективность **×${ne.toFixed(1)}**.` };
  }
  if (r < 0.72) {
    patch.solePropPassiveTempMult = 1;
    patch.solePropPassiveTempUntilMs = undefined;
    return { patch, detail: "Разлад: временный буст снят." };
  }
  return { patch, detail: "Персонал без заметных изменений." };
}

function hasActiveBikeRental(u: ReturnType<typeof getEconomyUser>, now: number): boolean {
  return Number.isFinite(u.courierBikeUntilMs) && (u.courierBikeUntilMs ?? 0) > now;
}

function hasOwnedCourierCar(u: ReturnType<typeof getEconomyUser>): boolean {
  return Boolean(bestCourierCar(u));
}

/** Транспорт доставки: личное авто или аренда электровела. Без привязки к jobId — только состояние игрока. */
function courierTransportExtrasLines(u: ReturnType<typeof getEconomyUser>, now: number): string[] {
  const best = bestCourierCar(u);
  if (best) {
    const plate = carPlateParts(best.rec);
    const plateFmt = plate ? formatVehiclePlate(plate) : undefined;
    const penalty = unregisteredVehiclePenaltyApplies(u);
    const platePart = plateFmt
      ? ` · ${plateFmt}`
      : penalty
        ? " · **без номера** (−10%)"
        : " · без номера";
    return [`**Авто:** **${best.def.label}** · КД **${(best.def.courierShiftCdMs / 3600000).toFixed(1).replace(/\.0$/, "")}** ч${platePart}`];
  }
  if (hasActiveBikeRental(u, now)) {
    const t = Math.floor((u.courierBikeUntilMs ?? 0) / 1000);
    return [`**Вел:** до <t:${t}:R>`];
  }
  return ["**Вел:** не в аренде (или купите авто)."];
}

function courierSimExtrasLines(u: ReturnType<typeof getEconomyUser>, now: number): string[] {
  const fee = COURIER_SIM_MONTHLY_FEE_RUB;
  const lines: string[] = [];
  if (u.courierPhonePaidUntilMs && now < u.courierPhonePaidUntilMs) {
    const lt = Math.floor(u.courierPhonePaidUntilMs / 1000);
    lines.push(`**Сим:** тариф до <t:${lt}:R>`);
  } else {
    lines.push(`**Сим:** тариф не оплачен — при смене **${fee.toLocaleString("ru-RU")}** ₽/30 сут`);
  }
  lines.push(`**Баланс сим:** **${fmt(u.simBalanceRub ?? 0)}** ₽`);
  return lines;
}

/** Полный блок «транспорт + сим» для карточек доставки и подробностей. */
function courierWorkExtrasLines(u: ReturnType<typeof getEconomyUser>, now: number): string[] {
  return [...courierTransportExtrasLines(u, now), ...courierSimExtrasLines(u, now)];
}

function jobUsesVariablePayout(jobId: JobId): boolean {
  return jobId === "waiter" || jobId === "expediter" || jobId === "shadowFixer";
}

function hasTier2PlusHousing(u: EconomyUser, now: number): boolean {
  return userHasActiveHousing(u, now);
}

type HousingRentRefreshMode = "shop" | "myRentEdit";

async function replyAfterRentPlanPurchase(
  interaction: ButtonInteraction,
  member: GuildMember,
  mode: HousingRentRefreshMode,
): Promise<void> {
  if (mode === "shop") {
    await replyOrUpdate(interaction, {
      embeds: [buildShopHouseRentEmbed(member)],
      components: buildShopHouseRentRows(member),
    });
  } else {
    await replyOrUpdate(interaction, { embeds: [buildMyRentEditEmbed(member)], components: buildMyRentEditRows(member) });
  }
}

/** Главный экран «Жильё» в меню терминала — только для аренды. */
function buildMyRentHomeEmbed(member: GuildMember): EmbedBuilder {
  const gid = member.guild.id;
  const u = getEconomyUser(gid, member.id);
  const now = Date.now();
  const due = u.housingRentNextDueMs;
  const curPlan = u.housingRentPlan ?? "month";
  const curRub = inflatedHousingRentPrice(gid, curPlan);
  const renewLine =
    u.housingRentRenewalPlan != null
      ? `После срока: **${rentPlanLabelRu(u.housingRentRenewalPlan)}** (**${fmt(inflatedHousingRentPrice(gid, u.housingRentRenewalPlan))}** ₽).`
      : `После срока: **${rentPlanLabelRu(curPlan)}** (**${fmt(curRub)}** ₽).`;
  const lines = [
    due != null && now < due
      ? `Оплачено **до** <t:${Math.floor(due / 1000)}:R>.`
      : "Срок **истёк** — продлите ниже или в магазине.",
    renewLine,
  ];
  return new EmbedBuilder()
    .setColor(PANEL_COLOR)
    .setTitle("Моя аренда")
    .setDescription(lines.join("\n"))
    .setFooter({ text: `Запросил: ${member.user.tag}` });
}

function buildMyRentHomeRows(member: GuildMember): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(ECON_HOUSING_EDIT).setLabel("Изменить срок").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(ECON_HOUSING_DETAILS).setLabel("Условия").setStyle(ButtonStyle.Secondary),
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(ECON_HOUSING_LEAVE).setLabel("Съехать с аренды").setStyle(ButtonStyle.Danger),
    ),
    buildMenuRow(),
  ];
}

function buildMyRentDetailsEmbed(member: GuildMember): EmbedBuilder {
  const gid = member.guild.id;
  const u = getEconomyUser(gid, member.id);
  const now = Date.now();
  const refund = housingRentUnusedRefundRub(u, now, gid);
  const renewal = u.housingRentRenewalPlan ?? u.housingRentPlan ?? "month";
  const lines = [
    `Автопродление: **${rentPlanLabelRu(renewal)}** за **${fmt(inflatedHousingRentPrice(gid, renewal))}** ₽ после окончания срока.`,
    `Покупка своей квартиры сейчас вернёт **≈ ${fmt(refund)}** ₽ неиспользованной аренды.`,
    "",
    "Возврат считается пропорционально неиспользованному времени оплаченной цепочки. Если денег на автопродление не хватит, аренда завершится.",
  ];
  return new EmbedBuilder()
    .setColor(PANEL_COLOR)
    .setTitle("Моя аренда · подробнее")
    .setDescription(lines.join("\n"));
}

function buildMyRentEditEmbed(member: GuildMember): EmbedBuilder {
  const u = getEconomyUser(member.guild.id, member.id);
  const now = Date.now();
  const due = u.housingRentNextDueMs;
  const prepaid =
    due != null && now < due
      ? `Оплачено **до** <t:${Math.floor(due / 1000)}:R> — новый пакет **добавляет** срок.`
      : "Срок истёк — отсчёт с **сейчас**.";
  const lines = [
    "**Продлить** — списание сейчас, срок сдвигается.",
    prepaid,
    "",
    "**Пакет после срока** — что спишется в начале дня после окончания текущего периода.",
  ];
  return new EmbedBuilder()
    .setColor(PANEL_COLOR)
    .setTitle("Жильё · срок и продление")
    .setDescription(lines.join("\n"))
    .setFooter({ text: `Запросил: ${member.user.tag}` });
}

function buildMyRentEditRows(member: GuildMember): ActionRowBuilder<ButtonBuilder>[] {
  const gid = member.guild.id;
  const u = getEconomyUser(gid, member.id);
  const rentDay = inflatedHousingRentPrice(gid, "day");
  const rentWeek = inflatedHousingRentPrice(gid, "week");
  const rentMonth = inflatedHousingRentPrice(gid, "month");
  const rows: ActionRowBuilder<ButtonBuilder>[] = [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${ECON_HOUSING_EXT_PREFIX}day`)
        .setLabel(`+1 сут. (${fmt(rentDay)} ₽)`)
        .setStyle(ButtonStyle.Primary)
        .setDisabled(u.rubles < rentDay),
      new ButtonBuilder()
        .setCustomId(`${ECON_HOUSING_EXT_PREFIX}week`)
        .setLabel(`+7 сут. (${fmt(rentWeek)} ₽)`)
        .setStyle(ButtonStyle.Primary)
        .setDisabled(u.rubles < rentWeek),
      new ButtonBuilder()
        .setCustomId(`${ECON_HOUSING_EXT_PREFIX}month`)
        .setLabel(`+30 сут. (${fmt(rentMonth)} ₽)`)
        .setStyle(ButtonStyle.Success)
        .setDisabled(u.rubles < rentMonth),
    ),
  ];
  const nowR = Date.now();
  if (u.housingRentNextDueMs != null && nowR < u.housingRentNextDueMs) {
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`${ECON_SHOP_HOUSE_RENEW_AFTER_REQ_PREFIX}day`)
          .setLabel("После срока: 1 сут.")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`${ECON_SHOP_HOUSE_RENEW_AFTER_REQ_PREFIX}week`)
          .setLabel("После срока: 7 сут.")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`${ECON_SHOP_HOUSE_RENEW_AFTER_REQ_PREFIX}month`)
          .setLabel("После срока: 30 сут.")
          .setStyle(ButtonStyle.Success),
      ),
    );
  }
  rows.push(shopNavBottomRow(ECON_HOUSING_BACK));
  return rows;
}

function lotteryDrawUnixTs(nowMs: number = Date.now()): number {
  const period = lotteryPeriodMskYmd(nowMs);
  return Math.floor(Date.parse(`${period}T21:00:00+03:00`) / 1000);
}

function buildShopLotteryEmbed(member: GuildMember): EmbedBuilder {
  ensureDueLotteryDraws(member.guild);
  const gid = member.guild.id;
  const period = lotteryPeriodMskYmd();
  const st = getLotteryState(gid, period);
  const drawTs = lotteryDrawUnixTs();
  const lines = [
    `Билет — **${fmt(LOTTERY_TICKET_PRICE_RUB)}** ₽. Джекпот: **${fmt(st.jackpotRub)}** ₽ · в продаже: **${st.ticketsSold}**`,
    `Розыгрыш: <t:${drawTs}:R> (**21:00** МСК)`,
  ];
  return new EmbedBuilder().setColor(PANEL_COLOR).setTitle("Магазин · Лотерея").setDescription(lines.join("\n")).setFooter({ text: `Запросил: ${member.user.tag}` });
}

function buildShopLotteryRows(member: GuildMember): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(ECON_SHOP_LOTTERY_BUY_OPEN).setLabel("Купить").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(ECON_SHOP_LOTTERY_DETAILS).setLabel("Условия").setStyle(ButtonStyle.Secondary),
    ),
    shopNavBottomRow(ECON_SHOP_HUB),
  ];
}

function buildShopLotteryDetailsEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(PANEL_COLOR)
    .setTitle("Лотерея · подробнее")
    .setDescription(
      [
        `**Каждый билет:** полный возврат **${LOTTERY_REFUND_CHANCES.full}%**, половина **${LOTTERY_REFUND_CHANCES.half}%**, без возврата **${LOTTERY_REFUND_CHANCES.none}%**.`,
        "",
        `**Один общий крупный исход за период:** 100% джекпота **${LOTTERY_JACKPOT_CHANCES.full}%**, 50% **${LOTTERY_JACKPOT_CHANCES.half}%**, 10% **${LOTTERY_JACKPOT_CHANCES.tenth}%**.`,
        "Если крупный исход выпал, победитель случайно выбирается среди всех билетов; больше билетов повышает шанс быть выбранным.",
      ].join("\n"),
    );
}

function buildLotteryConfirmEmbed(member: GuildMember, qty: number): EmbedBuilder {
  const total = qty * LOTTERY_TICKET_PRICE_RUB;
  return new EmbedBuilder()
    .setColor(PANEL_COLOR)
    .setTitle("Подтверждение покупки")
    .setDescription(
      [
        `Купить лотерейных билетов: **${qty}**`,
        `Сумма: **${fmt(total)}** ₽`,
        "",
        "Средства спишутся с **личного счёта** и пополнят **джекпот**.",
      ].join("\n"),
    )
    .setFooter({ text: member.user.tag });
}

function buildLotteryConfirmRows(qty: number): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${ECON_LOTTERY_CONFIRM_PREFIX}${qty}`)
        .setLabel("Купить")
        .setStyle(ButtonStyle.Success),
    ),
    shopNavBottomRow(ECON_LOTTERY_CANCEL, "Отменить"),
  ];
}

function parseLotteryQtyInput(raw: string): number | undefined {
  const s = raw.trim().replace(/\s/g, "");
  if (!/^\d+$/.test(s)) return undefined;
  const n = Number.parseInt(s, 10);
  if (!Number.isFinite(n) || n < 1 || n > 500) return undefined;
  return n;
}

function buildCourierBikeRow(member: GuildMember): ActionRowBuilder<ButtonBuilder> {
  const gid = member.guild.id;
  const u = getEconomyUser(gid, member.id);
  const r = u.rubles;
  const p1 = scaledShopPrice(gid, courierBikeRentPriceRub(1));
  const p3 = scaledShopPrice(gid, courierBikeRentPriceRub(3));
  const p7 = scaledShopPrice(gid, courierBikeRentPriceRub(7));
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(ECON_COURIER_BIKE_1D)
      .setLabel(`Вел 1д (${fmt(p1)} ₽)`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(r < p1),
    new ButtonBuilder()
      .setCustomId(ECON_COURIER_BIKE_3D)
      .setLabel(`Вел 3д (${fmt(p3)} ₽)`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(r < p3),
    new ButtonBuilder()
      .setCustomId(ECON_COURIER_BIKE_7D)
      .setLabel(`Вел 7д (${fmt(p7)} ₽)`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(r < p7),
  );
}

function extendBikeRentalMs(curUntil: number | undefined, now: number, addMs: number): number {
  const base = curUntil && curUntil > now ? curUntil : now;
  return base + addMs;
}

function getJobExp(u: ReturnType<typeof getEconomyUser>, jobId: JobId): number {
  return Math.max(0, Math.floor((u.jobExp as any)?.[jobId] ?? 0));
}

function effectiveCourierCooldownMs(u: ReturnType<typeof getEconomyUser>, now: number = Date.now()): number {
  const def = getJobDef("courier");
  const best = bestCourierCar(u);
  if (best) return best.def.courierShiftCdMs;
  if (hasActiveBikeRental(u, now)) return 2 * 60 * 60 * 1000;
  return def.baseCooldownMs;
}

/** Склад: без личного авто — **3** ч; с авто из магазина — КД по классу машины. */
function effectiveAssemblerCooldownMs(u: ReturnType<typeof getEconomyUser>, _now?: number): number {
  const best = bestCourierCar(u);
  if (best) return best.def.courierShiftCdMs;
  return ASSEMBLER_BASE_CD_MS;
}

export function effectiveShiftCooldownMs(u: ReturnType<typeof getEconomyUser>, jobId: JobId, now: number): number {
  if (jobId === "courier") return effectiveCourierCooldownMs(u, now);
  if (jobId === "assembler") return effectiveAssemblerCooldownMs(u, now);
  return getAnyJobDef(jobId).baseCooldownMs;
}

export function canWorkNow(u: ReturnType<typeof getEconomyUser>, jobId: JobId, now: number): { ok: boolean; msLeft: number } {
  const cd = effectiveShiftCooldownMs(u, jobId, now);
  const last = lastWorkAtForJob(u, jobId);
  const next = last + cd;
  if (now >= next) return { ok: true, msLeft: 0 };
  return { ok: false, msLeft: next - now };
}

/** Подсказка КД склада: **3** ч без авто или КД по классу машины. */
function assemblerWorkExtrasLines(u: ReturnType<typeof getEconomyUser>, now: number): string[] {
  const cdMs = effectiveAssemblerCooldownMs(u, now);
  const h = cdHoursLabel(cdMs);
  const best = bestCourierCar(u);
  if (best) {
    return [`**Склад:** с авто **${best.def.label}** — КД смены **${h}** ч.`];
  }
  return [
    "**Склад:** без личного авто — КД смены **3** ч.",
    "Купите **авто** в магазине терминала — **КД** по классу машины (см. каталог **Авто**).",
  ];
}

const WORK_SECTION_INTRO = [
  "Выберите уровень и профессию. **Смена** — после КД.",
  "**ур. 2/ур. 3** — навыки + жильё (аренда или своя квартира).",
].join("\n");

function buildWorkMenuEmbed(member: GuildMember): EmbedBuilder {
  const u = getEconomyUser(member.guild.id, member.id);
  if (!u.jobId) {
    return new EmbedBuilder()
      .setColor(PANEL_COLOR)
      .setTitle("Работа")
      .setDescription([WORK_SECTION_INTRO, "", "Текущая работа: **не выбрана**."].join("\n"))
      .setFooter({ text: `Запросил: ${member.user.tag}` });
  }
  const def = getAnyJobDef(u.jobId);
  const now = Date.now();
  const state = canWorkNow(u, u.jobId, now);
  const cd = effectiveShiftCooldownMs(u, u.jobId, now);
  const lines =
    u.jobId === "soleProp"
      ? ([
          `Текущая работа: **${def.title}**`,
          `Доход: **${jobPayoutShortForMenu(member.guild.id, u.jobId, def.basePayoutRub)}** (пассивно) — действия бизнеса и **суточный оклад**.`,
        ] as string[])
      : [
          `Текущая работа: **${def.title}**`,
          `Оплата за смену: **${jobPayoutShortForMenu(member.guild.id, u.jobId, def.basePayoutRub)}** · КД: **${cdHoursLabel(cd)} ч**`,
          state.ok ? "Смена: **доступна сейчас**." : `Смена: через **${formatCooldown(state.msLeft)}**.`,
        ];
  return new EmbedBuilder()
    .setColor(PANEL_COLOR)
    .setTitle("Работа")
    .setDescription(lines.join("\n"))
    .setFooter({ text: `Запросил: ${member.user.tag}` });
}

function buildWorkMenuRows(member: GuildMember): ActionRowBuilder<ButtonBuilder>[] {
  const u = getEconomyUser(member.guild.id, member.id);
  if (!u.jobId) {
    return [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(ECON_WORK_BUTTON_STARTERS).setLabel("Начальные · ур. 1").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(ECON_WORK_BUTTON_TIER2).setLabel("С навыком · ур. 2").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(ECON_WORK_BUTTON_TIER3).setLabel("Продвинутые · ур. 3").setStyle(ButtonStyle.Secondary),
      ),
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(ECON_BUTTON_SKILLS).setLabel("Навыки").setStyle(ButtonStyle.Secondary),
      ),
      buildMenuRow(),
    ];
  }
  const now = Date.now();
  const state = canWorkNow(u, u.jobId, now);
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  const shiftRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(ECON_WORK_BUTTON_SHIFT)
      .setLabel("Выйти на смену")
      .setStyle(ButtonStyle.Success)
      .setDisabled(!state.ok),
    new ButtonBuilder()
      .setCustomId(ECON_WORK_BUTTON_MY_JOB)
      .setLabel("Моя работа")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!u.jobId),
    new ButtonBuilder().setCustomId(ECON_BUTTON_SKILLS).setLabel("Навыки").setStyle(ButtonStyle.Secondary),
  );
  rows.push(shiftRow);
  rows.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(ECON_WORK_BUTTON_STARTERS).setLabel("Начальные · ур. 1").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(ECON_WORK_BUTTON_TIER2).setLabel("С навыком · ур. 2").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(ECON_WORK_BUTTON_TIER3).setLabel("Продвинутые · ур. 3").setStyle(ButtonStyle.Secondary),
    ),
  );
  rows.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(ECON_BUTTON_MENU).setLabel("Главное меню").setStyle(ButtonStyle.Secondary),
    ),
  );
  return rows;
}

function cdHoursLabel(ms: number): string {
  const h = ms / (60 * 60 * 1000);
  if (Math.abs(h - Math.round(h)) < 1e-9) return String(Math.round(h));
  return h.toLocaleString("ru-RU", { maximumFractionDigits: 1 });
}

function formatJobTierReqLine(def: JobDef): string {
  const r = def.reqSkills;
  if (!r || Object.keys(r).length === 0) return "Навыки не требуются.";
  const parts: string[] = [];
  for (const k of ["communication", "logistics", "discipline"] as const) {
    const need = r[k];
    if (need && need > 0) {
      const nm = k === "communication" ? "Коммуникация" : k === "logistics" ? "Логистика" : "Дисциплина";
      parts.push(`${nm} **${need}+**`);
    }
  }
  return parts.join(", ");
}

function buildStarterJobsEmbed(member: GuildMember): EmbedBuilder {
  const gid = member.guild.id;
  const lines = JOBS_STARTER.map((d) => jobOpeningLine(gid, d.id));
  return new EmbedBuilder()
    .setColor(PANEL_COLOR)
    .setTitle("Начальные · уровень 1")
    .setDescription(lines.join("\n\n"))
    .setFooter({ text: `Запросил: ${member.user.tag}` });
}

function buildTier2JobsOverviewEmbed(member: GuildMember): EmbedBuilder {
  const gid = member.guild.id;
  const lines = JOBS_TIER2.map((d) => `${jobOpeningLine(gid, d.id)} · ${formatJobTierReqLine(d)}`);
  return new EmbedBuilder()
    .setColor(PANEL_COLOR)
    .setTitle("С навыком · уровень 2")
    .setDescription(lines.join("\n\n"))
    .setFooter({ text: `Запросил: ${member.user.tag}` });
}

function buildStarterJobsRows(): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`${ECON_WORK_BUTTON_JOB_PREFIX}courier`).setLabel("Доставка").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`${ECON_WORK_BUTTON_JOB_PREFIX}waiter`).setLabel("Брокер").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`${ECON_WORK_BUTTON_JOB_PREFIX}watchman`).setLabel("Кладбище").setStyle(ButtonStyle.Secondary),
    ),
    shopNavBottomRow(ECON_BUTTON_WORK),
  ];
}

function buildJobDetailBody(member: GuildMember, jobId: JobId): string {
  const def = getAnyJobDef(jobId);
  const gid = member.guild.id;
  let main = buildJobDetailMainBlock(gid, jobId, { promotionEveryDays: TIER3_PROMOTION_EVERY_DAYS });
  if (main === jobId) main = def.title;
  const u = getEconomyUser(member.guild.id, member.id);
  const now = Date.now();
  const tail: string[] = [];
  if (jobId === "courier" && u.jobId === "courier") {
    tail.push("", ...courierWorkExtrasLines(u, now));
  }
  if (jobId === "assembler" && u.jobId === "assembler") {
    tail.push("", ...assemblerWorkExtrasLines(u, now));
  }
  const exp = getJobExp(u, jobId);
  const t12Rank = isTier12JobId(jobId) ? tier12RankFromShifts(exp, def.baseCooldownMs) : 0;
  if (jobId === "waiter") {
    const p = streetBrokerChances(t12Rank);
    tail.push(
      "",
      `**Шансы при ранге ${t12Rank}:** штраф **${fmt(p.fine)}%** · слабый **${fmt(p.bad)}%** · обычный **${fmt(p.normal)}%** · хороший **${fmt(p.good)}%** · джекпот **${fmt(p.jackpot)}%**.`,
    );
  } else if (jobId === "expediter") {
    const p = corporateBrokerChances(t12Rank);
    tail.push(
      "",
      `**Шансы при ранге ${t12Rank}:** штраф **${fmt(p.fine)}%** · слабый **${fmt(p.weak)}%** · обычный **${fmt(p.normal)}%** · крупный **${fmt(p.big)}%** · контракт **${fmt(p.contract)}%**.`,
    );
  } else if (jobId === "shadowFixer") {
    tail.push(
      "",
      "**Шансы:** облава **10%** · срыв **22%** · средний поток **32%** · крупная сделка **24%** · очень крупно **9%** · куш **3%**.",
    );
  }
  if (isTier12JobId(jobId)) {
    tail.push("", "**Карьера:**", ...tier12CareerEmbedLines(jobId, exp, def.baseCooldownMs));
  } else if (isTier3JobId(jobId)) {
    const careerUser = u.jobId === jobId ? u : { ...u, jobMskDayStreak: 0 };
    tail.push("", "**Карьера:**", ...tier3CareerEmbedLines(gid, careerUser, jobId));
  }
  const cdAcc = workShiftCdAccStatusLines(u, jobId, now);
  if (cdAcc.length) tail.push("", ...cdAcc);
  tail.push("", ...jobTaxEmbedLines(gid, jobId));
  return [main, ...tail].join("\n\n");
}

function buildJobDetailEmbed(member: GuildMember, jobId: JobId): EmbedBuilder {
  const def = getAnyJobDef(jobId);
  return new EmbedBuilder()
    .setColor(PROFILE_COLOR)
    .setTitle(`${def.title} — подробно`)
    .setDescription(buildJobDetailBody(member, jobId))
    .setFooter({ text: `Запросил: ${member.user.tag}` });
}

function buildJobDetailRows(jobId: JobId): ActionRowBuilder<ButtonBuilder>[] {
  return [shopNavBottomRow(`${ECON_WORK_BUTTON_JOB_DETAIL_CLOSE_PREFIX}${jobId}`)];
}

function buildJobInfoEmbed(member: GuildMember, jobId: JobId): EmbedBuilder {
  const u = getEconomyUser(member.guild.id, member.id);
  const def = getAnyJobDef(jobId);
  const now = Date.now();
  const cd = effectiveShiftCooldownMs(u, jobId, now);
  const guildId = member.guild.id;
  const body: string[] = [];

  if (jobId === "soleProp") {
    body.push(`КД панели ИП: **${cdHoursLabel(def.baseCooldownMs)} ч**`);
  } else {
    body.push(`КД смены: **${cdHoursLabel(cd)} ч**`);
  }
  body.push(jobShiftPayEmbedLine(guildId, jobId));

  body.push("");
  const exp = getJobExp(u, jobId);
  body.push(`Опыт смен на **этой** профессии: **${exp}**`);

  if (jobId === "courier" && u.jobId === "courier") {
    body.push("");
    body.push(...courierWorkExtrasLines(u, now));
  }
  if (jobId === "assembler" && u.jobId === "assembler") {
    body.push("");
    body.push(...assemblerWorkExtrasLines(u, now));
  }
  const t3 =
    u.jobId === jobId
      ? tier3StatusLines(guildId, u, jobId, now)
      : jobId === "soleProp"
        ? ["Прогноз суточного оклада — кнопка **Калькулятор**."]
        : [];
  if (t3.length) {
    body.push("");
    body.push(...t3);
  }

  const req = meetsJobReq(u, def);
  if ((def.reqSkills ?? {}) && Object.keys(def.reqSkills ?? {}).length > 0) {
    body.push("");
    body.push(req.ok ? "Требования: **выполнены**." : `Требования: **не выполнены**.\n- ${req.missing.join("\n- ")}`);
  }

  const needsHousing = isTier2JobId(jobId) || isTier3PanelJob(jobId);
  if (needsHousing) {
    body.push("");
    if (hasTier2PlusHousing(u, now)) {
      const hk = u.housingKind ?? "none";
      if (hk === "rent" && u.housingRentNextDueMs != null && now < u.housingRentNextDueMs) {
        body.push(`Жильё: **аренда** до <t:${Math.floor(u.housingRentNextDueMs / 1000)}:R>.`);
      } else if (hk === "owned" && u.ownedApartmentId) {
        body.push(`Жильё: **своя** (${getApartmentDef(u.ownedApartmentId)?.label ?? "есть"}).`);
      } else {
        body.push("Жильё: **есть**.");
      }
    } else {
      body.push("Жильё: **нет** — нужна аренда или покупка в магазине.");
    }
  }

  body.push("");
  body.push(u.jobId === jobId ? "Статус: **это ваша текущая работа**." : "Статус: **не выбрана**.");

  return new EmbedBuilder()
    .setColor(PROFILE_COLOR)
    .setTitle(`${def.title}`)
    .setDescription(body.join("\n"))
    .setFooter({ text: `Запросил: ${member.user.tag}` });
}

function isTier2JobId(jobId: JobId): boolean {
  return JOBS_TIER2.some((j) => j.id === jobId);
}

function isTier3PanelJob(jobId: JobId): boolean {
  return isTier3JobId(jobId);
}

function workCatalogBackButtonId(jobId: JobId): string {
  if (isTier3PanelJob(jobId)) return ECON_WORK_BUTTON_TIER3;
  if (isTier2JobId(jobId)) return ECON_WORK_BUTTON_TIER2;
  return ECON_WORK_BUTTON_STARTERS;
}

function tier3StatusLines(guildId: string, u: ReturnType<typeof getEconomyUser>, jobId: JobId, now: number): string[] {
  if (!isTier3PanelJob(jobId)) return [];
  const def = getTier3JobDef(jobId as Tier3JobId);
  const rank = tier3PromotionRank(u.jobMskDayStreak ?? 0);
  const lines: string[] = [];
  const rankTitle = tier3RankTitle(jobId as Tier3JobId, rank);
  lines.push(`**Должность:** **${rankTitle}** (ранг **${rank}**) · стрик: **${u.jobMskDayStreak ?? 0}** дн.`);
  if (def.archetype === "legal") {
    lines.push(`**Суточный оклад** (пассивно) — **основной** доход; смены — дополнение.`);
  } else if (def.archetype === "illegal") {
    lines.push(`Суточного пассивного оклада **нет**; смены + мелкие действия **24 ч** КД каждое.`);
  } else {
    const sdef = getTier3JobDef("soleProp");
    const passEst = computeTier3PassiveRub({
      guildId,
      jobId: "soleProp",
      def: sdef,
      streakDays: u.jobMskDayStreak ?? 0,
      solePropCapitalRub: u.solePropCapitalRub ?? 0,
      solePropRiskDial: u.solePropRiskDial ?? 0,
      prestigePoints: u.prestigePoints ?? 0,
      solePropPassiveEffMult: u.solePropPassiveEffMult ?? 1,
      solePropPassiveTempMult: u.solePropPassiveTempMult ?? 1,
    });
    lines.push(`Баланс бизнеса: **${fmt(u.solePropCapitalRub ?? 0)}** ₽ · оценка суточного оклада: **~${fmt(passEst)}** ₽.`);
    lines.push(
      `Эффективность суточного оклада: **×${(u.solePropPassiveEffMult ?? 1).toFixed(1)}** · временный множ.: **×${(u.solePropPassiveTempMult ?? 1).toFixed(2)}**${
        u.solePropPassiveTempUntilMs && now < u.solePropPassiveTempUntilMs
          ? ` до <t:${Math.floor(u.solePropPassiveTempUntilMs / 1000)}:R>`
          : ""
      }.`,
    );
    const adL = (u.solePropAdvertReadyAt ?? 0) - now;
    const stL = (u.solePropStaffReadyAt ?? 0) - now;
    const ctL = (u.solePropControlReadyAt ?? 0) - now;
    lines.push(adL > 0 ? `Реклама: через **${formatCooldown(adL)}**.` : `Реклама: **доступна**.`);
    lines.push(stL > 0 ? `Персонал: через **${formatCooldown(stL)}**.` : `Персонал: **доступен**.`);
    lines.push(ctL > 0 ? `Контроль: через **${formatCooldown(ctL)}**.` : `Контроль: **доступен**.`);
    lines.push("Точный прогноз для любой суммы — кнопка **Калькулятор**.");
    return lines;
  }
  const bossLeft = (u.tier3BossReadyAt ?? 0) - now;
  if (def.archetype === "illegal") {
    const sideLeft = (u.tier3SideGigReadyAt ?? 0) - now;
    lines.push(sideLeft > 0 ? `Связь: через **${formatCooldown(sideLeft)}**.` : `Связь: **доступна**.`);
    lines.push(bossLeft > 0 ? `Куратор: через **${formatCooldown(bossLeft)}**.` : `Куратор: **доступен**.`);
  } else {
    lines.push(bossLeft > 0 ? `Совещание: через **${formatCooldown(bossLeft)}**.` : `Совещание: **доступно**.`);
  }
  return lines;
}

function solePropCalculatedIncome(
  guildId: string,
  u: ReturnType<typeof getEconomyUser>,
  capitalRub: number,
): { gross: number; afterPlate: number; tax: number; net: number } {
  const isCurrentIp = u.jobId === "soleProp";
  const tempMult =
    isCurrentIp && u.solePropPassiveTempUntilMs && Date.now() < u.solePropPassiveTempUntilMs
      ? (u.solePropPassiveTempMult ?? 1)
      : 1;
  const gross = computeTier3PassiveRubDetailed({
    guildId,
    jobId: "soleProp",
    def: getTier3JobDef("soleProp"),
    streakDays: isCurrentIp ? (u.jobMskDayStreak ?? 0) : 0,
    solePropCapitalRub: capitalRub,
    solePropRiskDial: 0,
    prestigePoints: u.prestigePoints ?? 0,
    solePropPassiveEffMult: isCurrentIp ? (u.solePropPassiveEffMult ?? 1) : 1,
    solePropPassiveTempMult: tempMult,
  }).total;
  const afterPlate = applyUnregisteredVehiclePenalty(u, gross);
  const taxPercent = getLegalIncomeTaxPercent(guildId);
  const tax = Math.min(afterPlate, Math.floor((afterPlate * taxPercent) / 100));
  return { gross, afterPlate, tax, net: afterPlate - tax };
}

function buildSolePropCalculatorEmbed(member: GuildMember, capitalRub: number): EmbedBuilder {
  const u = getEconomyUser(member.guild.id, member.id);
  const gid = member.guild.id;
  const isCurrentIp = u.jobId === "soleProp";
  const result = solePropCalculatedIncome(gid, u, capitalRub);
  const currentCapital = isCurrentIp ? (u.solePropCapitalRub ?? 0) : 0;
  const current = solePropCalculatedIncome(gid, u, currentCapital);
  const rank = tier3PromotionRank(isCurrentIp ? (u.jobMskDayStreak ?? 0) : 0);
  const tempMult =
    isCurrentIp && u.solePropPassiveTempUntilMs && Date.now() < u.solePropPassiveTempUntilMs
      ? (u.solePropPassiveTempMult ?? 1)
      : 1;
  const efficiency = isCurrentIp ? (u.solePropPassiveEffMult ?? 1) : 1;
  const plateLoss = result.gross - result.afterPlate;
  const delta = result.net - current.net;
  const lines = [
    `Капитал: **${fmt(capitalRub)}** ₽ (сейчас **${fmt(currentCapital)}** ₽)`,
    `Валовой оклад: **${fmt(result.gross)}** ₽/сут`,
    plateLoss > 0 ? `Авто без номера: **−${fmt(plateLoss)}** ₽` : "Штраф за госномер: **нет**",
    `Подоходный налог **${fmt(getLegalIncomeTaxPercent(gid))}%**: **−${fmt(result.tax)}** ₽`,
    `**На личный счёт: ${fmt(result.net)} ₽/сут**`,
    "",
    `Множители: ранг **×${(1 + rank * 0.08).toFixed(2)}** · престиж **×${prestigePassiveIncomeMult(u.prestigePoints ?? 0).toFixed(3)}** · эффективность **×${efficiency.toFixed(2)}** · временный **×${tempMult.toFixed(2)}**.`,
    "Отдача капитала **затухает**: около **7 млн** оклад догоняет полный гринд офиса, дальше сильнее ранг, престиж и опыт.",
    `К текущему капиталу: **${delta >= 0 ? "+" : "−"}${fmt(Math.abs(delta))}** ₽/сут.`,
    "",
    "Прогноз использует риск **0**: случайный риск-джиттер не применяется. Баланс не меняется.",
  ];
  return new EmbedBuilder()
    .setColor(PROFILE_COLOR)
    .setTitle("ИП · калькулятор суточного оклада")
    .setDescription(lines.join("\n"));
}

function buildSolePropCalculatorRows(): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(ECON_IP_CALC_CLOSE).setLabel("ОК").setStyle(ButtonStyle.Primary),
    ),
  ];
}

function buildTier3JobsOverviewEmbed(member: GuildMember): EmbedBuilder {
  const gid = member.guild.id;
  const lines = JOBS_TIER3.map((d) => {
    const jd = jobDefFromTier3(d);
    return `${jobOpeningLine(gid, jd.id)} · ${formatJobTierReqLine(jd)}`;
  });
  return new EmbedBuilder()
    .setColor(PANEL_COLOR)
    .setTitle("Продвинутые · уровень 3")
    .setDescription(lines.join("\n\n"))
    .setFooter({ text: `Запросил: ${member.user.tag}` });
}

function buildTier3JobRows(): ActionRowBuilder<ButtonBuilder>[] {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`${ECON_WORK_BUTTON_JOB_PREFIX}officeAnalyst`).setLabel("Офис").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`${ECON_WORK_BUTTON_JOB_PREFIX}shadowFixer`).setLabel("Схемы").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`${ECON_WORK_BUTTON_JOB_PREFIX}soleProp`).setLabel("ИП").setStyle(ButtonStyle.Secondary),
  );
  return [row, shopNavBottomRow(ECON_BUTTON_WORK)];
}

function buildTier3ActionRows(member: GuildMember, jobId: JobId): ActionRowBuilder<ButtonBuilder>[] {
  const u = getEconomyUser(member.guild.id, member.id);
  const now = Date.now();
  const def = getTier3JobDef(jobId as Tier3JobId);

  if (def.archetype === "ip") {
    const adR = !u.solePropAdvertReadyAt || now >= u.solePropAdvertReadyAt;
    const stR = !u.solePropStaffReadyAt || now >= u.solePropStaffReadyAt;
    const ctR = !u.solePropControlReadyAt || now >= u.solePropControlReadyAt;
    return [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(ECON_IP_AD_OPEN).setLabel("Реклама").setStyle(ButtonStyle.Primary).setDisabled(!adR),
        new ButtonBuilder().setCustomId(ECON_IP_STAFF).setLabel("Персонал").setStyle(ButtonStyle.Secondary).setDisabled(!stR),
        new ButtonBuilder().setCustomId(ECON_IP_CONTROL).setLabel("Контроль").setStyle(ButtonStyle.Secondary).setDisabled(!ctR),
      ),
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(ECON_IP_DEP_OPEN).setLabel("В бизнес…").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(ECON_IP_WD_OPEN).setLabel("На счёт…").setStyle(ButtonStyle.Secondary).setDisabled((u.solePropCapitalRub ?? 0) < 1),
        new ButtonBuilder().setCustomId(ECON_IP_CALC_OPEN).setLabel("Калькулятор").setStyle(ButtonStyle.Secondary),
      ),
    ];
  }

  const bossReady = !u.tier3BossReadyAt || now >= u.tier3BossReadyAt;
  if (def.archetype === "legal") {
    return [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(ECON_TIER3_BOSS)
          .setLabel("Совещание")
          .setStyle(ButtonStyle.Primary)
          .setDisabled(!bossReady),
      ),
    ];
  }
  const sideReady = !u.tier3SideGigReadyAt || now >= u.tier3SideGigReadyAt;
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(ECON_TIER3_SIDE)
        .setLabel("Связь")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(!sideReady),
      new ButtonBuilder()
        .setCustomId(ECON_TIER3_BOSS)
        .setLabel("Куратор")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!bossReady),
    ),
  ];
}

function buildSwitchJobConfirmEmbed(member: GuildMember, newJobId: JobId): EmbedBuilder {
  const u = getEconomyUser(member.guild.id, member.id);
  const oldTitle = u.jobId ? jobTitle(u.jobId) : "—";
  const nextTitle = getAnyJobDef(newJobId).title;
  return new EmbedBuilder()
    .setColor(PANEL_COLOR)
    .setTitle("Смена работы")
    .setDescription(`Уволиться с **${oldTitle}** и устроиться **${nextTitle}**?`)
    .setFooter({ text: `Запросил: ${member.user.tag}` });
}

function buildSwitchJobConfirmRows(newJobId: JobId): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${ECON_WORK_BUTTON_SWITCH_CONFIRM_PREFIX}${newJobId}`)
        .setLabel("Да, устроиться сюда")
        .setStyle(ButtonStyle.Danger),
    ),
    shopNavBottomRow(`${ECON_WORK_BUTTON_JOB_PREFIX}${newJobId}`),
  ];
}

function buildJobInfoRows(member: GuildMember, jobId: JobId, canTakeSkills: boolean): ActionRowBuilder<ButtonBuilder>[] {
  const u = getEconomyUser(member.guild.id, member.id);
  const backId = workCatalogBackButtonId(jobId);
  const now = Date.now();
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];

  const jobDetailBtn = new ButtonBuilder()
    .setCustomId(`${ECON_WORK_BUTTON_JOB_DETAIL_PREFIX}${jobId}`)
    .setLabel("Условия")
    .setStyle(ButtonStyle.Secondary);

  if (u.jobId === jobId) {
    const state = canWorkNow(u, jobId, now);
    if (jobId === "soleProp") {
      rows.push(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(ECON_WORK_BUTTON_QUIT)
            .setLabel("Уволиться")
            .setStyle(ButtonStyle.Danger)
            .setDisabled(!state.ok),
          jobDetailBtn,
        ),
      );
    } else {
      rows.push(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(ECON_WORK_BUTTON_SHIFT)
            .setLabel("Выйти на смену")
            .setStyle(ButtonStyle.Success)
            .setDisabled(!state.ok),
          new ButtonBuilder()
            .setCustomId(ECON_WORK_BUTTON_QUIT)
            .setLabel("Уволиться")
            .setStyle(ButtonStyle.Danger)
            .setDisabled(!state.ok),
          jobDetailBtn,
        ),
      );
    }
    if (jobId === "courier" && !hasOwnedCourierCar(u) && !hasActiveBikeRental(u, now)) {
      rows.push(buildCourierBikeRow(member));
    }
    if (isTier3PanelJob(jobId)) {
      rows.push(...buildTier3ActionRows(member, jobId));
    }
    rows.push(shopNavBottomRow(backId));
    return rows;
  }

  const takeId = `${ECON_WORK_BUTTON_TAKE_PREFIX}${jobId}`;
  const switchOk = !u.jobId || canWorkNow(u, u.jobId, now).ok;
  const needsHousing = isTier2JobId(jobId) || isTier3PanelJob(jobId);
  const housingOk = !needsHousing || hasTier2PlusHousing(u, now);
  const selectDisabled = !canTakeSkills || !switchOk || !housingOk;

  rows.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(takeId)
        .setLabel("Выбрать")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(selectDisabled),
      new ButtonBuilder()
        .setCustomId(`${ECON_WORK_BUTTON_JOB_DETAIL_PREFIX}${jobId}`)
        .setLabel("Условия")
        .setStyle(ButtonStyle.Secondary),
      ...(jobId === "soleProp"
        ? [
            new ButtonBuilder()
              .setCustomId(ECON_IP_CALC_OPEN)
              .setLabel("Калькулятор")
              .setStyle(ButtonStyle.Secondary),
          ]
        : []),
    ),
  );
  rows.push(shopNavBottomRow(backId));
  return rows;
}

function buildCurrentJobEmbed(
  member: GuildMember,
  opts?: { lastShiftDeltaRub?: number; lastShiftNotes?: string[]; tier3ActionNotes?: string[] },
): EmbedBuilder {
  const u = getEconomyUser(member.guild.id, member.id);
  if (!u.jobId) {
    return new EmbedBuilder()
      .setColor(PANEL_COLOR)
      .setTitle("Работа")
      .setDescription("Работа не выбрана. Откройте раздел **Начальные · ур. 1** или другой уровень и выберите профессию.")
      .setFooter({ text: `Запросил: ${member.user.tag}` });
  }
  const def = getAnyJobDef(u.jobId);
  const now = Date.now();
  const cd = effectiveShiftCooldownMs(u, u.jobId, now);
  const state = canWorkNow(u, u.jobId, now);
  const exp = getJobExp(u, u.jobId);
  const guildId = member.guild.id;
  const jid = u.jobId;
  const lines: string[] = [`Текущая работа: **${def.title}**`];

  if (jid === "soleProp") {
    lines.push(`КД панели ИП: **${cdHoursLabel(def.baseCooldownMs)} ч**`);
  } else {
    lines.push(`КД смены: **${cdHoursLabel(cd)} ч**`);
  }
  lines.push(jobShiftPayEmbedLine(guildId, jid));

  lines.push("");
  lines.push(`Опыт смен на этой работе: **${exp}**`);

  if (jid === "courier") {
    lines.push("");
    lines.push(...courierWorkExtrasLines(u, now));
  }
  if (jid === "assembler") {
    lines.push("");
    lines.push(...assemblerWorkExtrasLines(u, now));
  }
  const t3 = tier3StatusLines(guildId, u, jid, now);
  if (t3.length) {
    lines.push("");
    lines.push(...t3);
  }

  if (jid !== "soleProp") {
    lines.push("");
    lines.push(state.ok ? "Смена: **доступна сейчас**." : `Смена: через **${formatCooldown(state.msLeft)}**.`);
  }

  if (opts?.lastShiftDeltaRub != null) {
    lines.push("");
    lines.push(`Последняя смена: **${formatDelta(opts.lastShiftDeltaRub)}**`);
    if (opts.lastShiftNotes?.length) {
      lines.push(`Детали: ${opts.lastShiftNotes.join(", ")}`);
    }
  }

  if (opts?.tier3ActionNotes?.length) {
    lines.push("");
    lines.push(...opts.tier3ActionNotes);
  }

  return new EmbedBuilder().setColor(PROFILE_COLOR).setTitle("Моя работа").setDescription(lines.join("\n")).setFooter({ text: `Запросил: ${member.user.tag}` });
}

function buildCurrentJobRows(member: GuildMember): ActionRowBuilder<ButtonBuilder>[] {
  const u = getEconomyUser(member.guild.id, member.id);
  const now = Date.now();
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];

  if (!u.jobId) {
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(ECON_WORK_BUTTON_STARTERS).setLabel("Выбрать работу").setStyle(ButtonStyle.Primary),
      ),
    );
    rows.push(buildMenuRow());
    return rows;
  }

  const state = canWorkNow(u, u.jobId, now);
  const backId = workCatalogBackButtonId(u.jobId);
  const curJobId = u.jobId;
  const myJobDetailBtn = new ButtonBuilder()
    .setCustomId(`${ECON_WORK_BUTTON_JOB_DETAIL_PREFIX}${curJobId}`)
    .setLabel("Условия")
    .setStyle(ButtonStyle.Secondary);
  if (u.jobId === "soleProp") {
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(ECON_WORK_BUTTON_QUIT)
          .setLabel("Уволиться")
          .setStyle(ButtonStyle.Danger)
          .setDisabled(!state.ok),
        myJobDetailBtn,
      ),
    );
  } else {
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(ECON_WORK_BUTTON_SHIFT).setLabel("Выйти на смену").setStyle(ButtonStyle.Success).setDisabled(!state.ok),
        new ButtonBuilder()
          .setCustomId(ECON_WORK_BUTTON_QUIT)
          .setLabel("Уволиться")
          .setStyle(ButtonStyle.Danger)
          .setDisabled(!state.ok),
        myJobDetailBtn,
      ),
    );
  }
  if (u.jobId === "courier" && !hasOwnedCourierCar(u) && !hasActiveBikeRental(u, now)) {
    rows.push(buildCourierBikeRow(member));
  }
  if (isTier3PanelJob(u.jobId)) {
    rows.push(...buildTier3ActionRows(member, u.jobId));
  }
  rows.push(shopNavBottomRow(backId));
  return rows;
}

function skillName(id: SkillId): string {
  if (id === "communication") return "Коммуникация";
  if (id === "logistics") return "Логистика";
  return "Дисциплина";
}

const SKILLS: Array<{ id: SkillId; title: string }> = [
  { id: "communication", title: "Коммуникация" },
  { id: "logistics", title: "Логистика" },
  { id: "discipline", title: "Дисциплина" },
];

const ECON_SKILL_BUTTON_PREFIX = "econ:skill:";
const ECON_SKILLS_DETAILS = "econ:skills:details";
/** Общий КД на любую тренировку: ~2–3 раза в сутки при активной игре. */
export const ECONOMY_TRAIN_COOLDOWN_MS = 8 * 60 * 60 * 1000;

function buildSkillsEmbed(member: GuildMember): EmbedBuilder {
  const u = getEconomyUser(member.guild.id, member.id);
  const now = Date.now();
  const left = u.lastTrainAt ? Math.max(0, u.lastTrainAt + ECONOMY_TRAIN_COOLDOWN_MS - now) : 0;
  const cdLine = left > 0 ? `Следующая тренировка (любой навык) через **${formatCooldown(left)}**.` : "Тренировка **доступна сейчас**.";
  const lines = SKILLS.map((s) => `- **${s.title}**: ${getSkillLevel(u, s.id)} / ${ECONOMY_SKILL_MAX}`);
  return new EmbedBuilder()
    .setColor(PANEL_COLOR)
    .setTitle("Навыки")
    .setDescription([cdLine, "", ...lines].join("\n"))
    .setFooter({ text: `Запросил: ${member.user.tag}` });
}

function buildSkillsDetailsEmbed(member: GuildMember): EmbedBuilder {
  const reqLines = WORK_JOB_IDS.map((id) => getAnyJobDef(id))
    .filter((d) => d.reqSkills && Object.keys(d.reqSkills).length > 0)
    .map((d) => {
      const req = SKILLS.flatMap((s) => {
        const level = d.reqSkills?.[s.id];
        return level == null ? [] : [`${s.title} **${level}**`];
      });
      return `• **${d.title}** — ${req.join(" · ")}`;
    });
  return new EmbedBuilder()
    .setColor(PANEL_COLOR)
    .setTitle("Навыки · подробнее")
    .setDescription(
      [
        `Одна тренировка повышает выбранный навык на **1**. Общий КД — **${formatCooldown(ECONOMY_TRAIN_COOLDOWN_MS)}**, максимум — **${ECONOMY_SKILL_MAX}**.`,
        "",
        "**Требования работ:**",
        ...reqLines,
      ].join("\n"),
    )
    .setFooter({ text: `Запросил: ${member.user.tag}` });
}

function buildSkillsRows(member: GuildMember): ActionRowBuilder<ButtonBuilder>[] {
  const u = getEconomyUser(member.guild.id, member.id);
  const now = Date.now();
  const cooldownReady = !u.lastTrainAt || now >= u.lastTrainAt + ECONOMY_TRAIN_COOLDOWN_MS;
  const trainRow1 = new ActionRowBuilder<ButtonBuilder>();
  const trainRow2 = new ActionRowBuilder<ButtonBuilder>();
  for (const [idx, s] of SKILLS.entries()) {
    const atMax = getSkillLevel(u, s.id) >= ECONOMY_SKILL_MAX;
    const btn = new ButtonBuilder()
      .setCustomId(`${ECON_SKILL_BUTTON_PREFIX}${s.id}`)
      .setLabel(s.title)
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!cooldownReady || atMax);
    if (idx < 2) {
      trainRow1.addComponents(btn);
    } else {
      trainRow2.addComponents(btn);
    }
  }
  trainRow2.addComponents(
    new ButtonBuilder().setCustomId(ECON_SKILLS_DETAILS).setLabel("Детали навыков").setStyle(ButtonStyle.Secondary),
  );
  return [trainRow1, trainRow2, shopNavBottomRow(ECON_BUTTON_WORK, "К работе")];
}

function buildFeedEmbed(guildId: string, guildName: string): EmbedBuilder {
  const events = listFeedEvents(guildId);
  const last = [...events].slice(-10).reverse();
  const lines =
    last.length === 0
      ? ["Пока пусто. События появятся после первых действий участников."]
      : last.map((e) => `• <t:${Math.floor(e.ts / 1000)}:t> — ${e.text}`);

  return new EmbedBuilder()
    .setColor(FEED_COLOR)
    .setTitle("Лента активности")
    .setDescription(lines.join("\n"))
    .setFooter({ text: `Сервер: ${guildName} · хранится 50 событий` });
}

function buildFeedRows(): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(ECON_FEED_BUTTON_ARCHIVE).setLabel("Архив").setStyle(ButtonStyle.Secondary),
    ),
  ];
}

function buildFeedArchiveRows(page: number, totalPages: number): ActionRowBuilder<ButtonBuilder>[] {
  const prevPage = Math.max(1, page - 1);
  const nextPage = Math.min(totalPages, page + 1);

  const pager = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${ECON_FEED_BUTTON_PAGE_PREFIX}${prevPage}`)
      .setLabel("◀")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 1),
    new ButtonBuilder()
      .setCustomId(`${ECON_FEED_BUTTON_PAGE_PREFIX}${nextPage}`)
      .setLabel("▶")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= totalPages),
  );

  return [pager, buildMenuRow()];
}

function buildFeedArchiveEmbed(guildId: string, page: number): { embed: EmbedBuilder; totalPages: number } {
  const events = listFeedEvents(guildId);
  const totalPages = Math.max(1, Math.ceil(events.length / 10));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const slice = [...events].reverse().slice((safePage - 1) * 10, safePage * 10);
  const lines =
    slice.length === 0 ? ["Пока пусто."] : slice.map((e) => `• <t:${Math.floor(e.ts / 1000)}:t> — ${e.text}`);
  const embed = new EmbedBuilder()
    .setColor(FEED_COLOR)
    .setTitle(`Лента: архив (${safePage}/${totalPages})`)
    .setDescription(lines.join("\n"));
  return { embed, totalPages };
}

export async function onEconomyTerminalPanelDeleted(client: Client, channelId: string, messageId: string): Promise<void> {
  const stored = getEconomyTerminalPanelMessageId(channelId);
  if (stored && stored === messageId) {
    clearEconomyTerminalPanelMessageId(channelId);
    await ensureEconomyTerminalPanel(client);
  }
}

export async function ensureEconomyTerminalPanel(client: Client) {
  for (const guild of client.guilds.cache.values()) {
    const chId = economyTerminalChannelId(guild.id);
    if (!chId) continue;

    const ch = await client.channels.fetch(chId).catch(() => null);
    if (!ch?.isTextBased() || ch.isDMBased()) continue;
    if (!ch.isSendable()) continue;

    const payload = { embeds: [buildTerminalPublicEmbed(ch.guild.id, ch.guild.name)], components: buildTerminalPublicRows() };

    const storedId = getEconomyTerminalPanelMessageId(chId);
    if (storedId) {
      const msg = await ch.messages.fetch(storedId).catch(() => null);
      const botId = client.user?.id;
      if (msg && botId && msg.author.id === botId) {
        try {
          await msg.edit(payload);
          continue;
        } catch {
          /* создадим новую */
        }
      }
    }

    const sent = await ch.send(payload);
    setEconomyTerminalPanelMessageId(chId, sent.id);
  }
}

export async function ensureEconomyFeedPanel(client: Client) {
  for (const guild of client.guilds.cache.values()) {
    const chId = economyFeedChannelId(guild.id);
    if (!chId) continue;

    const ch = await client.channels.fetch(chId).catch(() => null);
    if (!ch?.isTextBased() || ch.isDMBased()) continue;
    if (!ch.isSendable()) continue;

    const payload = { embeds: [buildFeedEmbed(guild.id, guild.name)], components: buildFeedRows() };

    const storedId = getEconomyFeedPanelMessageId(chId);
    if (storedId) {
      const msg = await ch.messages.fetch(storedId).catch(() => null);
      const botId = client.user?.id;
      if (msg && botId && msg.author.id === botId) {
        try {
          await msg.edit(payload);
          continue;
        } catch {
          /* создадим новую */
        }
      }
    }

    const sent = await ch.send(payload);
    setEconomyFeedPanelMessageId(chId, sent.id);
  }
}

function logInvalidMessageComponents(components: unknown[] | undefined, context: string): void {
  if (!components) return;
  if (components.length > 5) {
    console.error(`${context}: ${components.length} рядов кнопок (лимит Discord — 5)`);
  }
  const seen = new Set<string>();
  for (const row of components as Array<{ components?: Array<{ data?: { custom_id?: string } }> }>) {
    const comps = row.components ?? [];
    if (comps.length > 5) {
      console.error(`${context}: в ряду ${comps.length} кнопок (лимит — 5)`);
    }
    for (const c of comps) {
      const id = c.data?.custom_id;
      if (!id) continue;
      if (seen.has(id)) console.error(`${context}: повторный customId ${id}`);
      seen.add(id);
    }
  }
}

async function ackInteractionFailed(interaction: ButtonInteraction): Promise<void> {
  if (interaction.replied || interaction.deferred) return;
  try {
    await interaction.reply({
      content: "Не удалось открыть этот экран. Попробуйте ещё раз.",
      flags: MessageFlags.Ephemeral,
    });
  } catch {
    /* Discord уже показал таймаут */
  }
}

async function replyOrUpdate(interaction: ButtonInteraction, payload: { embeds: EmbedBuilder[]; components: any[] }) {
  logInvalidMessageComponents(payload.components, "economy replyOrUpdate");
  try {
    const isEphemeralMessage = Boolean(interaction.message?.flags?.has(MessageFlags.Ephemeral));
    if (interaction.message && isEphemeralMessage) {
      await interaction.update(payload);
      return;
    }
    await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
  } catch (e) {
    console.error("economy replyOrUpdate:", e);
    await ackInteractionFailed(interaction);
  }
}

async function replyShopNotice(
  interaction: ButtonInteraction,
  body: string,
  backId: string,
  title = "Магазин",
) {
  await replyOrUpdate(interaction, {
    embeds: [buildShopNoticeEmbed(title, body)],
    components: [shopNavBottomRow(backId)],
  });
}

async function replyPlateCarScreen(
  interaction: ButtonInteraction,
  member: GuildMember,
  carUid: string,
  note?: string,
) {
  const emb = buildShopPlateCarEmbed(member, carUid);
  if (!emb) {
    await replyShopNotice(interaction, note ?? "Авто не найдено.", ECON_SHOP_PLATE);
    return;
  }
  await replyOrUpdate(interaction, {
    embeds: [note ? withShopNote(emb, note) : emb],
    components: buildShopPlateCarRows(member, carUid),
  });
}

/** Обновить то же сообщение с кнопкой (эпhemeral или канал) — для согласованности нескольких панелей. */
async function updateButtonParentMessage(
  interaction: ButtonInteraction,
  payload: { embeds: EmbedBuilder[]; components: any[]; content?: string },
) {
  if (interaction.message) {
    await interaction.update({
      embeds: payload.embeds,
      components: payload.components,
      ...(payload.content !== undefined ? { content: payload.content } : {}),
    });
    return;
  }
  await interaction.reply({
    embeds: payload.embeds,
    components: payload.components,
    flags: MessageFlags.Ephemeral,
    ...(payload.content !== undefined ? { content: payload.content } : {}),
  });
}

function courierWorkRefreshPayload(member: GuildMember, interaction: ButtonInteraction): { embeds: EmbedBuilder[]; components: ActionRowBuilder<ButtonBuilder>[] } {
  const t = interaction.message?.embeds[0]?.title;
  if (t === "Моя работа") {
    return { embeds: [buildCurrentJobEmbed(member)], components: buildCurrentJobRows(member) };
  }
  const u = getEconomyUser(member.guild.id, member.id);
  const jobId: JobId = u.jobId === "assembler" ? "assembler" : "courier";
  const defJ = getAnyJobDef(jobId);
  const reqJ = meetsJobReq(u, defJ);
  return { embeds: [buildJobInfoEmbed(member, jobId)], components: buildJobInfoRows(member, jobId, reqJ.ok) };
}

function isEconomyButton(id: string): boolean {
  return (
    [
      ECON_BUTTON_MENU,
      ECON_BUTTON_PROFILE,
      ECON_BUTTON_HOUSING,
      ECON_HOUSING_EDIT,
      ECON_HOUSING_BACK,
      ECON_HOUSING_LEAVE,
      ECON_HOUSING_DETAILS,
      ECON_PROFILE_BUTTON_INFO,
      ECON_PROFILE_BUTTON_DETAILS,
      ECON_PROFILE_BUTTON_TG,
      ECON_TG_BACK_PROFILE,
      ECON_TG_MENU_ROOT,
      ECON_TG_NEW_CODE,
      ECON_TG_NEW_CONFIRM,
      ECON_TG_NEW_CANCEL,
      ECON_PROFILE_BUTTON_LADDER,
      ECON_PROFILE_BUTTON_LADDER_ALL,
      ECON_PROFILE_BUTTON_BETS_HISTORY,
      ECON_BUTTON_WORK,
      ECON_BUTTON_SHOP,
      ECON_SHOP_APPEARANCE,
      ECON_SHOP_HUB,
      ECON_SHOP_PHONE,
      ECON_PROFILE_BUTTON_CARD,
      ECON_SHOP_CAR,
      ECON_SHOP_PLATE,
      ECON_SHOP_PLATE_REGISTER,
      ECON_SHOP_PLATE_DIGITS,
      ECON_SHOP_PLATE_LETTERS,
      ECON_SHOP_PLATE_REGION,
      ECON_SHOP_CAR_SELL,
      ECON_SHOP_CAR_SELL_CONFIRM,
      ECON_SHOP_CAR_SELL_CANCEL,
      ECON_SHOP_HOUSE,
      ECON_SHOP_ANIMALS,
      ECON_SHOP_SIM,
      ECON_SHOP_SIM_REGISTER,
      ECON_SHOP_SIM_CHANGE,
      ECON_SHOP_SIM_OPERATOR,
      ECON_SHOP_SIM_MID,
      ECON_SHOP_SIM_LAST,
      ECON_SHOP_SIM_TOPUP_OPEN,
      ECON_SHOP_LOTTERY,
      ECON_SHOP_LOTTERY_BUY_OPEN,
      ECON_SHOP_LOTTERY_DETAILS,
      ECON_LOTTERY_CANCEL,
      ECON_SHOP_APT_SELL_SOVIET,
      ECON_SHOP_APT_SELL_SOVIET_CONFIRM,
      ECON_SHOP_APT_SELL_SOVIET_CANCEL,
      ECON_SHOP_APT_SELL_FOREIGN,
      ECON_SHOP_APT_SELL_FOREIGN_CONFIRM,
      ECON_SHOP_APT_SELL_FOREIGN_CANCEL,
      ECON_SHOP_PHONE_SELL,
      ECON_SHOP_PHONE_SELL_CONFIRM,
      ECON_COURIER_BIKE_1D,
      ECON_COURIER_BIKE_3D,
      ECON_COURIER_BIKE_7D,
      ECON_WORK_BUTTON_STARTERS,
      ECON_WORK_BUTTON_TIER2,
      ECON_WORK_BUTTON_TIER3,
      ECON_TIER3_SIDE,
      ECON_TIER3_BOSS,
      ECON_IP_AD_OPEN,
      ECON_IP_STAFF,
      ECON_IP_CONTROL,
      ECON_IP_DEP_OPEN,
      ECON_IP_WD_OPEN,
      ECON_IP_CALC_OPEN,
      ECON_IP_CALC_CLOSE,
      ECON_WORK_BUTTON_SHIFT,
      ECON_WORK_BUTTON_MY_JOB,
      ECON_WORK_BUTTON_QUIT,
      ECON_WORK_BUTTON_QUIT_CONFIRM,
      ECON_BUTTON_SKILLS,
      ECON_SKILLS_DETAILS,
      ECON_BUTTON_PLAYERS,
      ECON_PLAYERS_BUTTON_TOP_PS,
      ECON_PLAYERS_BUTTON_TOP_RUB,
      ECON_FEED_BUTTON_ARCHIVE,
    ].includes(id) || false
  );
}

function buildCooldownBlockedEmbed(member: GuildMember, msLeft: number): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(PANEL_COLOR)
    .setTitle("Недоступно")
    .setDescription(`Нельзя выполнить действие, пока идёт КД текущей смены.\nОсталось: **${formatCooldown(msLeft)}**.`)
    .setFooter({ text: `Запросил: ${member.user.tag}` });
}

export type EconomyRunWorkShiftResult =
  | { ok: false; kind: "ephemeral"; message: string }
  | { ok: false; kind: "cooldown" }
  | { ok: true; walletDeltaRub: number; psGain: number; treasuryRub: number; notes: string[] };

export type EconomyRunTrainSkillResult =
  | { ok: false; kind: "unknown_skill" | "cooldown_or_max" }
  | { ok: true; skillLabel: string; newLevel: number };

export function economyRunTrainSkill(member: GuildMember, skillId: SkillId): EconomyRunTrainSkillResult {
  if (!["communication", "logistics", "discipline"].includes(skillId)) return { ok: false, kind: "unknown_skill" };
  const u = getEconomyUser(member.guild.id, member.id);
  const now = Date.now();
  if (u.lastTrainAt && now < u.lastTrainAt + ECONOMY_TRAIN_COOLDOWN_MS) return { ok: false, kind: "cooldown_or_max" };
  const curLvl = getSkillLevel(u, skillId);
  if (curLvl >= ECONOMY_SKILL_MAX) return { ok: false, kind: "cooldown_or_max" };
  const nextLvl = Math.min(ECONOMY_SKILL_MAX, curLvl + 1);
  patchEconomyUser(member.guild.id, member.id, {
    skills: { ...(u.skills ?? {}), [skillId]: nextLvl },
    lastTrainAt: now,
  });
  return { ok: true, skillLabel: skillName(skillId), newLevel: nextLvl };
}

/** Общая логика «Выйти на смену» для Discord и Telegram. */
export async function economyRunWorkShift(client: Client, member: GuildMember): Promise<EconomyRunWorkShiftResult> {
  const guildId = member.guild.id;
  const u = getEconomyUser(guildId, member.id);
  const jobId = u.jobId;
  if (!jobId) return { ok: false, kind: "ephemeral", message: "Сначала выбери работу." };
  const now = Date.now();
  const st = canWorkNow(u, jobId, now);
  if (!st.ok) return { ok: false, kind: "cooldown" };

  if (jobId === "soleProp") {
    return {
      ok: false,
      kind: "ephemeral",
      message: "На **ИП** смен **нет** — доход **суточным окладом** (пассивно) и действиями бизнеса.",
    };
  }

  if (jobId === "courier") {
    if (!u.hasPhone) return { ok: false, kind: "ephemeral", message: "Купите **телефон** в магазине терминала." };
    if (!userHasSimNumber(u)) return { ok: false, kind: "ephemeral", message: "Оформите **симку** в магазине." };
    const onlineDue = !u.courierPhonePaidUntilMs || now >= u.courierPhonePaidUntilMs;
    if (onlineDue && (u.simBalanceRub ?? 0) < COURIER_SIM_MONTHLY_FEE_RUB) {
      return {
        ok: false,
        kind: "ephemeral",
        message: `На балансе сим нужно **${COURIER_SIM_MONTHLY_FEE_RUB.toLocaleString("ru-RU")}** ₽ за **тариф** на **30** суток (пополните в магазине).`,
      };
    }
  }

  const def = getAnyJobDef(jobId);
  const expBefore = getJobExp(u, jobId);
  const expAfter = expBefore + 1;

  let base = def.basePayoutRub;
  let extra = 0;
  const notes: string[] = [];

  const rankAfterT12 = isTier12JobId(jobId) ? tier12RankFromShifts(expAfter, def.baseCooldownMs) : 0;

  if (jobId === "courier") {
    base = scaleSignedIncome(guildId, randInt(6_500, 8_000));
  } else if (jobId === "waiter") {
    base = 0;
    extra = rollStreetBrokerRub(guildId, rankAfterT12);
    notes.push(`уличный брокер (до ранга): **${formatDelta(extra)}** ₽`);
  } else if (jobId === "watchman") {
    base = scaleSignedIncome(guildId, randInt(11_000, 13_000));
  } else if (jobId === "dispatcher") {
    base = scaleSignedIncome(guildId, randInt(26_000, 30_000));
  } else if (jobId === "assembler") {
    base = scaleSignedIncome(guildId, randInt(15_000, 18_000));
    if (chance(0.03)) {
      const fine = scaleSignedIncome(guildId, -randInt(4_500, 6_500));
      extra += fine;
      notes.push(`штраф ${formatDelta(fine)}`);
    }
    if (expAfter % 7 === 0) {
      const bonus = scaleSignedIncome(guildId, ASSEMBLER_7TH_BONUS_BASE_RUB);
      extra += bonus;
      notes.push(`премия ${formatDelta(bonus)} (7 смен)`);
    }
  } else if (jobId === "expediter") {
    base = 0;
    extra = rollCorporateBrokerRub(guildId, rankAfterT12);
    notes.push(`корп. брокер (до ранга): **${formatDelta(extra)}** ₽`);
  } else if (jobId === "officeAnalyst") {
    const pr = tier3PromotionRank(u.jobMskDayStreak ?? 0);
    const streak = u.jobMskDayStreak ?? 0;
    const officeRaw = randInt(45_000, 55_000) + pr * 1_000 + Math.min(500, Math.floor(streak / 5) * 40);
    base = scaleSignedIncome(guildId, officeRaw);
    if (chance(0.03)) {
      const fine = scaleSignedIncome(guildId, -randInt(12_000, 22_000));
      extra += fine;
      notes.push(`штраф ${formatDelta(fine)}`);
    }
  } else if (jobId === "shadowFixer") {
    base = 0;
    const pr = tier3PromotionRank(u.jobMskDayStreak ?? 0);
    const streak = u.jobMskDayStreak ?? 0;
    const posBoost = 1 + pr * 0.025 + Math.min(0.15, streak * 0.002);
    const r = Math.random() * 100;
    if (r < 10) {
      extra = scaleSignedIncome(guildId, -150_000);
      notes.push(`облава / потери **${formatDelta(extra)}**`);
    } else if (r < 32) {
      extra = scaleSignedIncome(guildId, -40_000);
      notes.push(`срыв цепочки **${formatDelta(extra)}**`);
    } else if (r < 64) {
      extra = scaleSignedIncome(guildId, Math.floor(40_000 * posBoost));
      notes.push(`средний поток **${formatDelta(extra)}**`);
    } else if (r < 88) {
      extra = scaleSignedIncome(guildId, Math.floor(130_000 * posBoost));
      notes.push(`крупная сделка **${formatDelta(extra)}**`);
    } else if (r < 97) {
      extra = scaleSignedIncome(guildId, Math.floor(400_000 * posBoost));
      notes.push(`очень крупно **${formatDelta(extra)}**`);
    } else {
      extra = scaleSignedIncome(guildId, Math.floor(1_200_000 * posBoost));
      notes.push(`легендарный куш **${formatDelta(extra)}**`);
    }
  }

  let jobTotal = base + extra;
  const variablePayout = jobUsesVariablePayout(jobId);
  if (!variablePayout) jobTotal = Math.max(0, jobTotal);

  if (isTier12JobId(jobId)) {
    const rankBeforeT12 = tier12RankFromShifts(expBefore, def.baseCooldownMs);
    jobTotal = Math.floor(jobTotal * tier12RankIncomeMult(jobId, rankAfterT12));
    if (rankAfterT12 > rankBeforeT12) {
      notes.push(`Повышение: **${tier12RankTitle(jobId, rankAfterT12)}** (ранг **${rankAfterT12}**).`);
      appendFeedEvent({
        ts: now,
        guildId,
        type: "job:promotion",
        actorUserId: member.id,
        text: `${member.toString()}: **${def.title}** — **${tier12RankTitle(jobId, rankAfterT12)}** (ранг **${rankAfterT12}**).`,
      });
    }
  }

  const prestige = u.prestigePoints ?? 0;
  let prestigeRubBonus = 0;
  if (jobTotal > 0) {
    const beforePrestige = jobTotal;
    jobTotal = applyPrestigeToShiftRub(jobTotal, prestige);
    if (jobTotal > beforePrestige) {
      prestigeRubBonus = jobTotal - beforePrestige;
      notes.push(`в том числе за престиж: **+${fmt(prestigeRubBonus)}** ₽`);
    }
  }

  let shiftTaxableGrossRub = jobTotal;
  let spamPatch: Partial<EconomyUser> = {};
  const shiftCdMs = effectiveShiftCooldownMs(u, jobId, now);
  if (shiftPayCoeffApplies(shiftCdMs)) {
    const ymd = mskTodayYmd(now);
    const accBefore = u.workShiftMskYmd === ymd ? (u.workShiftCdAccMs ?? 0) : 0;
    const { grossRub, coeff } = applyShiftPayCoeffToGrossRub(shiftTaxableGrossRub, accBefore);
    if (coeff < 1 - 1e-9) {
      shiftTaxableGrossRub = grossRub;
      if (prestigeRubBonus > 0) prestigeRubBonus = Math.floor(prestigeRubBonus * coeff);
      notes.push(
        `коэффициент по накопленному КД за сутки: **×${coeff}** (до смены **${formatAccCdHours(accBefore)}** ч)`,
      );
    }
    spamPatch = { workShiftMskYmd: ymd, workShiftCdAccMs: accBefore + shiftCdMs };
  }

  let rublesNext = u.rubles;
  let simBalNext = u.simBalanceRub ?? 0;
  let phoneUntilNext = u.courierPhonePaidUntilMs;

  if (jobId === "courier") {
    const onlineDue = !u.courierPhonePaidUntilMs || now >= u.courierPhonePaidUntilMs;
    if (onlineDue) {
      simBalNext -= COURIER_SIM_MONTHLY_FEE_RUB;
      phoneUntilNext = now + COURIER_SIM_MONTHLY_PERIOD_MS;
      notes.push(`тариф 30 суток ${formatDelta(-COURIER_SIM_MONTHLY_FEE_RUB)} (баланс сим)`);
    }
  }

  if (shiftTaxableGrossRub > 0) {
    const beforePlate = shiftTaxableGrossRub;
    shiftTaxableGrossRub = applyUnregisteredVehiclePenalty(u, shiftTaxableGrossRub);
    if (shiftTaxableGrossRub < beforePlate) notes.push("без госномера: **−10%** к выплате");
  }

  let payToWallet = shiftTaxableGrossRub;
  let treasuryRub = 0;
  if (shiftTaxableGrossRub > 0 && isLegalTaxableJob(jobId)) {
    const { netRub, taxRub } = withholdLegalIncomeTax(guildId, shiftTaxableGrossRub);
    payToWallet = netRub;
    treasuryRub = taxRub;
  }
  rublesNext += payToWallet;
  rublesNext = Math.max(0, rublesNext);

  let psGain = 0;
  if (shiftPsApplies(jobId)) {
    psGain = shiftPsFromDomestic(jobId, u.domesticPoints ?? 0);
    psGain = applyUnregisteredVehiclePenalty(u, psGain);
    if (psGain > 0) notes.push(`**+${fmt(psGain)}** СР (быт)`);
  }

  const walletDeltaRub = rublesNext - u.rubles;
  const netPrestigeRub =
    walletDeltaRub > 0 && prestigeRubBonus > 0
      ? feedNetPrestigeRubBonus(shiftTaxableGrossRub, prestigeRubBonus, payToWallet)
      : 0;
  const patch: Partial<EconomyUser> = {
    rubles: rublesNext,
    psTotal: u.psTotal + psGain,
    simBalanceRub: simBalNext,
    courierPhonePaidUntilMs: phoneUntilNext,
    lastWorkAtByJob: { ...(u.lastWorkAtByJob ?? {}), [jobId]: now },
    jobExp: { ...(u.jobExp ?? {}), [jobId]: expAfter },
    lastShiftSummary: {
      walletRub: walletDeltaRub,
      ps: psGain,
      treasuryRub,
      prestigeRub: netPrestigeRub,
      atMs: now,
    },
    ...spamPatch,
  };
  patchEconomyUser(guildId, member.id, patch);
  const feedRubMain =
    walletDeltaRub > 0 && netPrestigeRub > 0 ? walletDeltaRub - netPrestigeRub : walletDeltaRub;
  const feedParts = [formatDelta(feedRubMain)];
  const feedBonus = feedPrestigeDomesticBonusSuffix({
    prestigeRub: netPrestigeRub,
    domesticPs: psGain > 0 ? psGain : 0,
  });
  appendFeedEvent({
    ts: now,
    guildId,
    type: "job:shift",
    actorUserId: member.id,
    text: `${member.toString()} вышел на смену: **${def.title}** — ${feedParts.join(", ")}${feedBonus}`,
  });
  await ensureEconomyFeedPanel(client);
  return { ok: true, walletDeltaRub, psGain, treasuryRub, notes };
}

function tgFmtRub(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  return rounded.toLocaleString("ru-RU", { maximumFractionDigits: 0 });
}

function tgFmtDelta(n: number): string {
  const s = tgFmtRub(n);
  return n >= 0 ? `+${s} ₽` : `${s} ₽`;
}

function tgFmtCooldown(msLeft: number): string {
  const m = Math.ceil(msLeft / 60000);
  if (m >= 1440) return `${Math.floor(m / 1440)} д ${Math.floor((m % 1440) / 60)} ч`;
  if (m >= 60) return `${Math.floor(m / 60)} ч ${m % 60} мин`;
  return `${m} мин`;
}

/** Краткий экран «Работа» для Telegram (смена, КД, лимит 12 ч, последняя смена). */
export function economyFormatTelegramWorkScreen(member: GuildMember): string {
  const u = getEconomyUser(member.guild.id, member.id);
  const now = Date.now();
  const lines: string[] = ["<b>Работа</b>", ""];

  if (!u.jobId) {
    lines.push("Текущая: <b>не выбрана</b>");
    lines.push("", "Выберите профессию в каталоге ниже.");
    return lines.join("\n");
  }

  const def = getAnyJobDef(u.jobId);
  lines.push(`Текущая: <b>${def.title}</b>`);

  if (u.jobId === "soleProp") {
    lines.push("", "ИП — смен нет, доход пассивный.");
    return lines.join("\n");
  }

  const ls = u.lastShiftSummary;
  if (ls) {
    lines.push(`Последняя смена: <b>${tgFmtDelta(ls.walletRub)}</b>`);
    if (ls.walletRub > 0 && ls.prestigeRub > 0) {
      const baseRub = Math.max(0, ls.walletRub - ls.prestigeRub);
      lines.push(`В том числе: смена ${tgFmtDelta(baseRub)} · престиж +${tgFmtRub(ls.prestigeRub)} ₽`);
    }
    if (ls.ps > 0) lines.push(`СР: +${tgFmtRub(ls.ps)}`);
  } else {
    lines.push("Последняя смена: —");
  }

  const cdMs = effectiveShiftCooldownMs(u, u.jobId, now);
  const st = canWorkNow(u, u.jobId, now);
  const cdH = cdHoursLabel(cdMs);
  lines.push(
    st.ok ? `КД: ${cdH} ч · <b>можно</b>` : `КД: ${cdH} ч · <b>${tgFmtCooldown(st.msLeft)}</b>`,
  );

  if (shiftPayCoeffApplies(cdMs)) {
    const ymd = mskTodayYmd(now);
    const acc = u.workShiftMskYmd === ymd ? (u.workShiftCdAccMs ?? 0) : 0;
    const usedH = formatAccCdHours(acc);
    const limitH = formatAccCdHours(SHIFT_PAY_FREE_CD_MS);
    const coeff = shiftPayCoeffFromAccMs(acc);
    lines.push(coeff < 1 - 1e-9 ? `Лимит за сутки: ${usedH}/${limitH} ч · ×${coeff}` : `Лимит за сутки: ${usedH}/${limitH} ч`);
  }

  return lines.join("\n");
}

export function economyFormatTelegramJobListScreen(tier: "t1" | "t2" | "t3"): string {
  const title = tier === "t1" ? "Начальные · ур. 1" : tier === "t2" ? "С навыком · ур. 2" : "Продвинутые · ур. 3";
  return `<b>${title}</b>\n\nВыберите профессию:`;
}

export function economyFormatTelegramJobCardScreen(member: GuildMember, jobId: JobId): string {
  const u = getEconomyUser(member.guild.id, member.id);
  const title = economyJobTitle(jobId);
  if (u.jobId === jobId) return `<b>${title}</b>\n\nТекущая работа.`;
  return `<b>${title}</b>`;
}

/** Markdown Discord → HTML для Telegram (упрощённо). */
export function economyMarkdownToTelegramHtml(text: string): string {
  let s = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  s = s.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
  s = s.replace(/<t:(\d+):[a-zA-Z]+>/g, (_, sec) => {
    const d = new Date(Number(sec) * 1000);
    return d.toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
  });
  return s;
}

export function economyIsWorkJobId(s: string): s is JobId {
  return isWorkJobId(s);
}

export function listWorkJobsByTier(tier: "t1" | "t2" | "t3"): JobId[] {
  if (tier === "t1") return JOBS_STARTER.map((j) => j.id);
  if (tier === "t2") return JOBS_TIER2.map((j) => j.id);
  return JOBS_TIER3.map((j) => j.id);
}

export function economyJobTitle(id: JobId): string {
  return jobTitle(id);
}

export function economyFormatSkillsScreen(member: GuildMember): string {
  const u = getEconomyUser(member.guild.id, member.id);
  const now = Date.now();
  const left = u.lastTrainAt ? Math.max(0, u.lastTrainAt + ECONOMY_TRAIN_COOLDOWN_MS - now) : 0;
  const cdLine =
    left > 0
      ? `Следующая тренировка (любой навык) через <b>${formatCooldown(left)}</b>.`
      : "Тренировка <b>доступна сейчас</b>.";
  const lines = SKILLS.map((s) => `· <b>${s.title}</b>: ${getSkillLevel(u, s.id)} / ${ECONOMY_SKILL_MAX}`);
  return ["<b>Навыки</b>", "", cdLine, "", ...lines, "", "Выбери навык ниже."].join("\n");
}

export function economyFormatSkillsNotify(u: ReturnType<typeof getEconomyUser>): string {
  const lines = SKILLS.map((s) => `· <b>${s.title}</b>: ${getSkillLevel(u, s.id)} / ${ECONOMY_SKILL_MAX}`);
  return ["Можно потренировать <b>навык</b>.", "", ...lines].join("\n");
}

export function economyFormatWorkMenuScreen(member: GuildMember): string {
  const embed = buildWorkMenuEmbed(member);
  const title = embed.data.title ?? "Работа";
  const desc = embed.data.description ?? "";
  return economyMarkdownToTelegramHtml(`<b>${title}</b>\n\n${desc}`);
}

export function economyFormatJobCardScreen(member: GuildMember, jobId: JobId): string {
  const embed = buildJobInfoEmbed(member, jobId);
  const title = embed.data.title ?? economyJobTitle(jobId);
  const desc = embed.data.description ?? "";
  return economyMarkdownToTelegramHtml(`<b>${title}</b>\n\n${desc}`);
}

export function economyFormatJobListScreen(guildId: string, tier: "t1" | "t2" | "t3"): string {
  const title = tier === "t1" ? "Начальные · ур. 1" : tier === "t2" ? "С навыком · ур. 2" : "Продвинутые · ур. 3";
  const jobs = listWorkJobsByTier(tier);
  const lines = jobs.map((id) => `· ${jobOpeningLine(guildId, id)}`);
  return economyMarkdownToTelegramHtml(`<b>${title}</b>\n\n${lines.join("\n")}\n\nВыбери профессию ниже.`);
}

export type EconomyTakeJobResult =
  | { ok: true; kind: "hired" | "already_current" }
  | { ok: false; kind: "unknown_job" }
  | { ok: false; kind: "missing_skills"; missing: string[] }
  | { ok: false; kind: "need_housing" }
  | { ok: false; kind: "shift_cooldown"; msLeft: number }
  | { ok: false; kind: "confirm_switch"; jobId: JobId; currentTitle: string; newTitle: string };

export function economyTakeJob(
  member: GuildMember,
  jobId: JobId,
  opts?: { forceSwitch?: boolean },
): EconomyTakeJobResult {
  if (!isWorkJobId(jobId)) return { ok: false, kind: "unknown_job" };
  const guildId = member.guild.id;
  const cur = getEconomyUser(guildId, member.id);
  const def = getAnyJobDef(jobId);
  const req = meetsJobReq(cur, def);
  if (!req.ok) return { ok: false, kind: "missing_skills", missing: req.missing };
  const nowTake = Date.now();
  if ((isTier2JobId(jobId) || isTier3PanelJob(jobId)) && !hasTier2PlusHousing(cur, nowTake)) {
    return { ok: false, kind: "need_housing" };
  }
  if (cur.jobId) {
    if (cur.jobId === jobId) return { ok: true, kind: "already_current" };
    const st = canWorkNow(cur, cur.jobId, Date.now());
    if (!st.ok) return { ok: false, kind: "shift_cooldown", msLeft: st.msLeft };
    if (!opts?.forceSwitch) {
      return {
        ok: false,
        kind: "confirm_switch",
        jobId,
        currentTitle: jobTitle(cur.jobId),
        newTitle: def.title,
      };
    }
    patchEconomyUser(guildId, member.id, {
      jobId,
      jobChosenAt: Date.now(),
      ...tier3PatchWhenJobChanges(cur, jobId),
    });
    return { ok: true, kind: "hired" };
  }
  const curTake = getEconomyUser(guildId, member.id);
  patchEconomyUser(guildId, member.id, {
    jobId,
    jobChosenAt: Date.now(),
    ...tier3PatchWhenJobChanges(curTake, jobId),
  });
  return { ok: true, kind: "hired" };
}

export type EconomyQuitJobResult =
  | { ok: true }
  | { ok: false; kind: "no_job" | "shift_cooldown"; msLeft?: number };

export function economyQuitJob(member: GuildMember): EconomyQuitJobResult {
  const guildId = member.guild.id;
  const u = getEconomyUser(guildId, member.id);
  if (!u.jobId) return { ok: false, kind: "no_job" };
  const st = canWorkNow(u, u.jobId, Date.now());
  if (!st.ok) return { ok: false, kind: "shift_cooldown", msLeft: st.msLeft };
  const uQuit = getEconomyUser(guildId, member.id);
  patchEconomyUser(guildId, member.id, {
    jobId: undefined,
    jobChosenAt: undefined,
    lastWorkAtByJob: undefined,
    ...tier3PatchWhenJobChanges(uQuit, undefined),
  });
  return { ok: true };
}

export async function handleEconomyButton(interaction: ButtonInteraction): Promise<boolean> {
  const cid = interaction.customId;
  const isKnown =
    isEconomyButton(cid) ||
    cid.startsWith(ECON_PROFILE_BETS_PAGE_PREFIX) ||
    cid.startsWith(ECON_FEED_BUTTON_PAGE_PREFIX) ||
    cid.startsWith(ECON_WORK_BUTTON_JOB_PREFIX) ||
    cid.startsWith(ECON_WORK_BUTTON_TAKE_PREFIX) ||
    cid.startsWith(ECON_WORK_BUTTON_SWITCH_CONFIRM_PREFIX) ||
    cid.startsWith(ECON_WORK_BUTTON_JOB_DETAIL_PREFIX) ||
    cid.startsWith(ECON_WORK_BUTTON_JOB_DETAIL_CLOSE_PREFIX) ||
    cid.startsWith("econ:nav:") ||
    cid.startsWith("econ:shop") ||
    isAppearanceShopButton(cid) ||
    cid.startsWith(ECON_LOTTERY_CONFIRM_PREFIX) ||
    cid.startsWith("econ:housing:") ||
    cid.startsWith(ECON_SKILL_BUTTON_PREFIX) ||
    cid.startsWith("econ:tg:");
  if (!isKnown) return false;
  if (!interaction.inGuild() || !interaction.guildId || !interaction.member) {
    await interaction.reply({ content: "Эта кнопка работает только на сервере.", flags: MessageFlags.Ephemeral });
    return true;
  }

  const member = interaction.member as GuildMember;
  if (member.user.bot) {
    await interaction.reply({ content: "Ботам экономика не положена.", flags: MessageFlags.Ephemeral });
    return true;
  }

  const id = interaction.customId;

  if (id === ECON_BUTTON_MENU || id === ECON_NAV_BACK_TO_MENU) {
    await replyOrUpdate(interaction, {
      embeds: [buildTerminalPanelEmbed(member.guild.name)],
      components: buildTerminalPanelRows(member),
    });
    return true;
  }

  if (id === ECON_BUTTON_PROFILE) {
    await replyOrUpdate(interaction, { embeds: [buildProfileEmbed(member)], components: buildProfileHubRows(member, "info") });
    return true;
  }

  if (id === ECON_BUTTON_HOUSING) {
    const uh = getEconomyUser(member.guild.id, member.id);
    if ((uh.housingKind ?? "none") !== "rent") {
      await interaction.reply({
        content: "Экран **Жильё** доступен при **аренде**. Оформить можно в **Магазин** → жильё.",
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }
    await replyOrUpdate(interaction, { embeds: [buildMyRentHomeEmbed(member)], components: buildMyRentHomeRows(member) });
    return true;
  }

  if (id === ECON_HOUSING_DETAILS) {
    await replyOrUpdate(interaction, {
      embeds: [buildMyRentDetailsEmbed(member)],
      components: [shopNavBottomRow(ECON_BUTTON_HOUSING)],
    });
    return true;
  }

  if (id === ECON_HOUSING_EDIT) {
    const ue = getEconomyUser(member.guild.id, member.id);
    if ((ue.housingKind ?? "none") !== "rent") {
      await interaction.reply({
        content: "Вы **не** на аренде. Жильё оформляется в **Магазин** → жильё.",
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }
    await replyOrUpdate(interaction, { embeds: [buildMyRentEditEmbed(member)], components: buildMyRentEditRows(member) });
    return true;
  }

  if (id === ECON_HOUSING_BACK) {
    const ub = getEconomyUser(member.guild.id, member.id);
    if ((ub.housingKind ?? "none") !== "rent") {
      await replyOrUpdate(interaction, {
        embeds: [buildTerminalPanelEmbed(member.guild.name)],
        components: buildTerminalPanelRows(member),
      });
      return true;
    }
    await replyOrUpdate(interaction, { embeds: [buildMyRentHomeEmbed(member)], components: buildMyRentHomeRows(member) });
    return true;
  }

  if (id === ECON_PROFILE_BUTTON_INFO) {
    await replyOrUpdate(interaction, { embeds: [buildProfileEmbed(member)], components: buildProfileHubRows(member, "info") });
    return true;
  }

  if (id === ECON_PROFILE_BUTTON_CARD) {
    await replyWithProfileCardImage(interaction, member);
    return true;
  }

  if (isAppearanceShopButton(id)) {
    const handled = await handleAppearanceShopButton(interaction, member);
    if (handled) return true;
  }

  if (id === ECON_PROFILE_BUTTON_TG) {
    if (!(await assertTelegramHubAccess(interaction, member))) return true;
    await replyOrUpdate(interaction, {
      embeds: [buildTelegramHubEmbed(member)],
      components: buildTelegramHubRows(member, "hub"),
    });
    return true;
  }

  if (id === ECON_TG_BACK_PROFILE) {
    if (!(await assertTelegramHubAccess(interaction, member))) return true;
    await replyOrUpdate(interaction, { embeds: [buildProfileEmbed(member)], components: buildProfileHubRows(member, "info") });
    return true;
  }

  if (id === ECON_TG_MENU_ROOT) {
    if (!(await assertTelegramHubAccess(interaction, member))) return true;
    await replyOrUpdate(interaction, {
      embeds: [buildTerminalPanelEmbed(member.guild.name)],
      components: buildTerminalPanelRows(member),
    });
    return true;
  }

  if (id === ECON_TG_NEW_CODE) {
    if (!(await assertTelegramHubAccess(interaction, member))) return true;
    const gid = member.guild.id;
    const uid = member.id;
    const last = getLastIssuedTelegramCode(gid, uid);
    const now = Date.now();
    if (last && now < last.expiresAtMs) {
      await replyOrUpdate(interaction, {
        embeds: [buildTelegramNewCodeConfirmEmbed(member)],
        components: buildTelegramHubRows(member, "confirmNew"),
      });
      return true;
    }
    createTelegramLinkCode(gid, uid, TG_LINK_CODE_TTL_MS);
    await replyOrUpdate(interaction, {
      embeds: [buildTelegramHubEmbed(member)],
      components: buildTelegramHubRows(member, "hub"),
    });
    return true;
  }

  if (id === ECON_TG_NEW_CONFIRM) {
    if (!(await assertTelegramHubAccess(interaction, member))) return true;
    createTelegramLinkCode(member.guild.id, member.id, TG_LINK_CODE_TTL_MS);
    await replyOrUpdate(interaction, {
      embeds: [buildTelegramHubEmbed(member)],
      components: buildTelegramHubRows(member, "hub"),
    });
    return true;
  }

  if (id === ECON_TG_NEW_CANCEL) {
    if (!(await assertTelegramHubAccess(interaction, member))) return true;
    await replyOrUpdate(interaction, {
      embeds: [buildTelegramHubEmbed(member)],
      components: buildTelegramHubRows(member, "hub"),
    });
    return true;
  }

  if (id === ECON_PROFILE_BUTTON_LADDER) {
    await replyOrUpdate(interaction, { embeds: [buildLadderEmbed(member)], components: buildProfileHubRows(member, "ladder") });
    return true;
  }

  if (id === ECON_PROFILE_BUTTON_LADDER_ALL) {
    await replyOrUpdate(interaction, {
      embeds: [buildLadderAllEmbed(member)],
      components: [shopNavBottomRow(ECON_PROFILE_BUTTON_LADDER)],
    });
    return true;
  }

  if (id === ECON_PROFILE_BUTTON_DETAILS) {
    await replyOrUpdate(interaction, {
      embeds: [buildProfileDetailsEmbed(member)],
      components: [shopNavBottomRow(ECON_PROFILE_BUTTON_INFO)],
    });
    return true;
  }

  if (id === ECON_PROFILE_BUTTON_BETS_HISTORY) {
    await replyOrUpdate(interaction, {
      embeds: [buildProfileBetHistoryEmbed(member, 0)],
      components: buildProfileBetsTabComponents(member, 0),
    });
    return true;
  }

  if (id.startsWith(ECON_PROFILE_BETS_PAGE_PREFIX)) {
    const raw = id.slice(ECON_PROFILE_BETS_PAGE_PREFIX.length);
    const parsed = Number.parseInt(raw, 10);
    const page = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
    await replyOrUpdate(interaction, {
      embeds: [buildProfileBetHistoryEmbed(member, page)],
      components: buildProfileBetsTabComponents(member, page),
    });
    return true;
  }

  if (id === ECON_BUTTON_WORK) {
    await replyOrUpdate(interaction, { embeds: [buildWorkMenuEmbed(member)], components: buildWorkMenuRows(member) });
    return true;
  }

  if (id === ECON_WORK_BUTTON_MY_JOB) {
    const uj = getEconomyUser(member.guild.id, member.id);
    if (!uj.jobId) {
      await interaction.reply({ content: "Сначала выберите работу в каталоге.", flags: MessageFlags.Ephemeral });
      return true;
    }
    await replyOrUpdate(interaction, { embeds: [buildCurrentJobEmbed(member)], components: buildCurrentJobRows(member) });
    return true;
  }

  if (id === ECON_BUTTON_SHOP) {
    await replyOrUpdate(interaction, { embeds: [buildShopHubEmbed(member)], components: buildShopHubRows(member) });
    return true;
  }

  if (id === ECON_SHOP_HUB) {
    await replyOrUpdate(interaction, { embeds: [buildShopHubEmbed(member)], components: buildShopHubRows(member) });
    return true;
  }

  if (id === ECON_SHOP_PHONE) {
    await replyOrUpdate(interaction, {
      embeds: [buildShopOriginPickEmbed("Телефон", member, "phone")],
      components: buildShopOriginPickRows(member, "phone", ECON_SHOP_HUB),
    });
    return true;
  }

  if (id.startsWith(ECON_SHOP_PHONE_DETAILS_PREFIX)) {
    const origin = parseOriginFromSuffix(id.slice(ECON_SHOP_PHONE_DETAILS_PREFIX.length));
    if (!origin) return true;
    await replyOrUpdate(interaction, {
      embeds: [buildShopPhoneDetailsEmbed(member, origin)],
      components: [shopNavBottomRow(`${ECON_SHOP_PHONE_ORIGIN_PREFIX}${origin}`)],
    });
    return true;
  }

  if (id.startsWith(ECON_SHOP_PHONE_ORIGIN_PREFIX)) {
    const origin = parseOriginFromSuffix(id.slice(ECON_SHOP_PHONE_ORIGIN_PREFIX.length));
    if (origin) {
      await replyOrUpdate(interaction, {
        embeds: [buildShopPhoneListEmbed(member, origin)],
        components: buildShopPhoneListRows(member, origin),
      });
      return true;
    }
  }

  if (id.startsWith(ECON_SHOP_PHONE_BUY_PREFIX)) {
    const pid = id.slice(ECON_SHOP_PHONE_BUY_PREFIX.length);
    const defP = getPhoneDef(pid);
    const emb = defP ? buildShopPhoneBuyConfirmEmbed(member, pid) : undefined;
    if (!defP || !emb) {
      await replyShopNotice(interaction, "Неизвестная модель телефона.", ECON_SHOP_PHONE);
      return true;
    }
    await replyOrUpdate(interaction, {
      embeds: [emb],
      components: buildShopPhoneBuyConfirmRows(member, pid, defP.origin),
    });
    return true;
  }

  if (id.startsWith(ECON_SHOP_PHONE_FULL_PREFIX)) {
    const pid = id.slice(ECON_SHOP_PHONE_FULL_PREFIX.length);
    const defP = getPhoneDef(pid);
    if (!defP) {
      await replyShopNotice(interaction, "Неизвестная модель телефона.", ECON_SHOP_PHONE);
      return true;
    }
    const r = purchasePhoneFull(member, pid);
    if (!r.ok) {
      const emb = buildShopPhoneBuyConfirmEmbed(member, pid);
      await replyOrUpdate(interaction, {
        embeds: [withShopNote(emb ?? buildShopNoticeEmbed("Покупка телефона", r.reply), r.reply)],
        components: buildShopPhoneBuyConfirmRows(member, pid, defP.origin),
      });
      return true;
    }
    await replyOrUpdate(interaction, {
      embeds: [withShopNote(buildShopPhoneListEmbed(member, defP.origin), `Куплено за полную стоимость.`)],
      components: buildShopPhoneListRows(member, defP.origin),
    });
    return true;
  }

  if (id.startsWith(ECON_SHOP_PHONE_TRADE_GO_PREFIX)) {
    const pid = id.slice(ECON_SHOP_PHONE_TRADE_GO_PREFIX.length);
    const defP = getPhoneDef(pid);
    if (!defP) {
      await replyShopNotice(interaction, "Неизвестная модель телефона.", ECON_SHOP_PHONE);
      return true;
    }
    const uids = selectedShopTradeUids(member.guild.id, member.id, "phone", pid);
    const r = purchasePhoneTrade(member, pid, uids);
    if (!r.ok) {
      const emb = buildShopPhoneTradePickEmbed(member, pid);
      await replyOrUpdate(interaction, {
        embeds: [withShopNote(emb ?? buildShopNoticeEmbed("Обмен телефона", r.reply), r.reply)],
        components: buildShopPhoneTradePickRows(member, pid),
      });
      return true;
    }
    clearShopTradeDraft(member.guild.id, member.id);
    await replyOrUpdate(interaction, {
      embeds: [withShopNote(buildShopPhoneListEmbed(member, defP.origin), "Обмен выполнен.")],
      components: buildShopPhoneListRows(member, defP.origin),
    });
    return true;
  }

  if (id.startsWith(ECON_SHOP_PHONE_TRADE_OK_PREFIX)) {
    const rest = id.slice(ECON_SHOP_PHONE_TRADE_OK_PREFIX.length);
    const sep = rest.lastIndexOf(":");
    const pid = rest.slice(0, sep);
    const uid = rest.slice(sep + 1);
    const defP = getPhoneDef(pid);
    if (!defP) {
      await replyShopNotice(interaction, "Неизвестная модель телефона.", ECON_SHOP_PHONE);
      return true;
    }
    beginShopTradeDraft(member.guild.id, member.id, "phone", pid, uid ? [uid] : []);
    const r = purchasePhoneTrade(member, pid, uid);
    if (!r.ok) {
      const emb = buildShopPhoneTradePickEmbed(member, pid);
      await replyOrUpdate(interaction, {
        embeds: [withShopNote(emb ?? buildShopNoticeEmbed("Обмен телефона", r.reply), r.reply)],
        components: buildShopPhoneTradePickRows(member, pid),
      });
      return true;
    }
    clearShopTradeDraft(member.guild.id, member.id);
    await replyOrUpdate(interaction, {
      embeds: [withShopNote(buildShopPhoneListEmbed(member, defP.origin), "Обмен выполнен.")],
      components: buildShopPhoneListRows(member, defP.origin),
    });
    return true;
  }

  if (id.startsWith(ECON_SHOP_PHONE_TRADE_TG_PREFIX)) {
    const rest = id.slice(ECON_SHOP_PHONE_TRADE_TG_PREFIX.length);
    const sep = rest.lastIndexOf(":");
    const pid = rest.slice(0, sep);
    const uid = rest.slice(sep + 1);
    const defP = getPhoneDef(pid);
    if (!defP) {
      await replyShopNotice(interaction, "Неизвестная модель телефона.", ECON_SHOP_PHONE);
      return true;
    }
    toggleShopTradeUid(member.guild.id, member.id, "phone", pid, uid);
    const emb = buildShopPhoneTradePickEmbed(member, pid);
    if (!emb) {
      await replyShopNotice(interaction, "Неизвестная модель телефона.", ECON_SHOP_PHONE);
      return true;
    }
    await replyOrUpdate(interaction, { embeds: [emb], components: buildShopPhoneTradePickRows(member, pid) });
    return true;
  }

  if (id.startsWith(ECON_SHOP_PHONE_TRADE_PREFIX)) {
    const pid = id.slice(ECON_SHOP_PHONE_TRADE_PREFIX.length);
    const defP = getPhoneDef(pid);
    if (!defP) {
      await replyShopNotice(interaction, "Неизвестная модель телефона.", ECON_SHOP_PHONE);
      return true;
    }
    const owned = listOwnedPhonesByOrigin(getEconomyUser(member.guild.id, member.id), defP.origin);
    beginShopTradeDraft(member.guild.id, member.id, "phone", pid, owned.length === 1 ? [owned[0]!.uid] : []);
    const emb = buildShopPhoneTradePickEmbed(member, pid);
    if (!emb) {
      await replyShopNotice(interaction, "Неизвестная модель телефона.", ECON_SHOP_PHONE);
      return true;
    }
    await replyOrUpdate(interaction, { embeds: [emb], components: buildShopPhoneTradePickRows(member, pid) });
    return true;
  }

  if (id.startsWith(ECON_SHOP_PHONE_BUY_CONFIRM_PREFIX)) {
    const pid = id.slice(ECON_SHOP_PHONE_BUY_CONFIRM_PREFIX.length);
    const defP = getPhoneDef(pid);
    if (!defP) {
      await replyShopNotice(interaction, "Неизвестная модель телефона.", ECON_SHOP_PHONE);
      return true;
    }
    const r = purchasePhone(member, pid);
    if (!r.ok) {
      const emb = buildShopPhoneBuyConfirmEmbed(member, pid);
      await replyOrUpdate(interaction, {
        embeds: [withShopNote(emb ?? buildShopNoticeEmbed("Покупка телефона", r.reply), r.reply)],
        components: buildShopPhoneBuyConfirmRows(member, pid, defP.origin),
      });
      return true;
    }
    await replyOrUpdate(interaction, {
      embeds: [withShopNote(buildShopPhoneListEmbed(member, defP.origin), "Куплено за полную стоимость.")],
      components: buildShopPhoneListRows(member, defP.origin),
    });
    return true;
  }

  if (id.startsWith(ECON_SHOP_PHONE_BUY_CANCEL_PREFIX)) {
    const origin = parseOriginFromSuffix(id.slice(ECON_SHOP_PHONE_BUY_CANCEL_PREFIX.length));
    if (!origin) return true;
    await replyOrUpdate(interaction, {
      embeds: [buildShopPhoneListEmbed(member, origin)],
      components: buildShopPhoneListRows(member, origin),
    });
    return true;
  }

  if (id === ECON_SHOP_PHONE_SELL) {
    const u = getEconomyUser(member.guild.id, member.id);
    if (listOwnedPhones(u).length === 0) {
      await replyShopNotice(interaction, "Нет **телефона** для продажи.", ECON_SHOP_PHONE);
      return true;
    }
    await replyOrUpdate(interaction, {
      embeds: [buildShopPhoneSellPickEmbed(member)],
      components: buildShopPhoneSellPickRows(member),
    });
    return true;
  }

  if (id.startsWith(ECON_SHOP_PHONE_SELL_OK_PREFIX)) {
    const uid = id.slice(ECON_SHOP_PHONE_SELL_OK_PREFIX.length);
    const r = sellOwnedPhone(member, uid);
    if (!r.ok) {
      await replyShopNotice(interaction, r.reply, ECON_SHOP_PHONE_SELL);
      return true;
    }
    await replyOrUpdate(interaction, {
      embeds: [withShopNote(buildShopOriginPickEmbed("Телефон", member, "phone"), `Телефон продан: **+${fmt(r.refund)}** ₽.`)],
      components: buildShopOriginPickRows(member, "phone", ECON_SHOP_HUB),
    });
    return true;
  }

  if (id.startsWith(ECON_SHOP_PHONE_SELL_UID_PREFIX)) {
    const uid = id.slice(ECON_SHOP_PHONE_SELL_UID_PREFIX.length);
    const rec = listOwnedPhones(getEconomyUser(member.guild.id, member.id)).find((p) => p.uid === uid);
    const origin = rec ? (getPhoneDef(rec.id)?.origin ?? "soviet") : "soviet";
    if (!rec) {
      await replyShopNotice(interaction, "Нет **телефона** для продажи.", ECON_SHOP_PHONE);
      return true;
    }
    await replyOrUpdate(interaction, {
      embeds: [buildShopPhoneSellConfirmEmbed(member, uid)],
      components: buildShopPhoneSellConfirmRows(origin, uid),
    });
    return true;
  }

  if (id.startsWith(`${ECON_SHOP_PHONE_SELL_CANCEL}:`)) {
    const origin = parseOriginFromSuffix(id.slice(`${ECON_SHOP_PHONE_SELL_CANCEL}:`.length));
    if (!origin) return true;
    await replyOrUpdate(interaction, {
      embeds: [buildShopPhoneListEmbed(member, origin)],
      components: buildShopPhoneListRows(member, origin),
    });
    return true;
  }

  if (id === ECON_SHOP_PHONE_SELL_CONFIRM) {
    const u = getEconomyUser(member.guild.id, member.id);
    const cur = getPhoneDef(u.phoneModelId);
    const origin = cur?.origin ?? "soviet";
    const r = sellOwnedPhone(member);
    if (!r.ok) {
      await replyShopNotice(interaction, r.reply, ECON_SHOP_PHONE);
      return true;
    }
    await replyOrUpdate(interaction, {
      embeds: [withShopNote(buildShopOriginPickEmbed("Телефон", member, "phone"), `Телефон продан: **+${fmt(r.refund)}** ₽.`)],
      components: buildShopOriginPickRows(member, "phone", ECON_SHOP_HUB),
    });
    return true;
  }

  if (id === ECON_SHOP_CAR) {
    await replyOrUpdate(interaction, {
      embeds: [buildShopOriginPickEmbed("Авто", member, "car")],
      components: buildShopOriginPickRows(member, "car", ECON_SHOP_HUB),
    });
    return true;
  }

  if (id.startsWith(ECON_SHOP_CAR_DETAILS_PREFIX)) {
    const origin = parseOriginFromSuffix(id.slice(ECON_SHOP_CAR_DETAILS_PREFIX.length));
    if (!origin) return true;
    await replyOrUpdate(interaction, {
      embeds: [buildShopCarDetailsEmbed(member, origin)],
      components: [shopNavBottomRow(`${ECON_SHOP_CAR_ORIGIN_PREFIX}${origin}`)],
    });
    return true;
  }

  if (id.startsWith(ECON_SHOP_CAR_ORIGIN_PREFIX)) {
    const origin = parseOriginFromSuffix(id.slice(ECON_SHOP_CAR_ORIGIN_PREFIX.length));
    if (origin) {
      await replyOrUpdate(interaction, {
        embeds: [buildShopCarListEmbed(member, origin)],
        components: buildShopCarListRows(member, origin),
      });
      return true;
    }
  }

  if (id.startsWith(ECON_SHOP_CAR_BUY_PREFIX)) {
    const cid = id.slice(ECON_SHOP_CAR_BUY_PREFIX.length);
    const defC = getCarDef(cid);
    const emb = defC ? buildShopCarBuyConfirmEmbed(member, cid) : undefined;
    if (!defC || !emb) {
      await replyShopNotice(interaction, "Неизвестная модель авто.", ECON_SHOP_CAR);
      return true;
    }
    await replyOrUpdate(interaction, {
      embeds: [emb],
      components: buildShopCarBuyConfirmRows(member, cid, defC.origin),
    });
    return true;
  }

  if (id.startsWith(ECON_SHOP_CAR_FULL_PREFIX)) {
    const cid = id.slice(ECON_SHOP_CAR_FULL_PREFIX.length);
    const defC = getCarDef(cid);
    if (!defC) {
      await replyShopNotice(interaction, "Неизвестная модель авто.", ECON_SHOP_CAR);
      return true;
    }
    const r = purchaseCarFull(member, cid);
    if (!r.ok) {
      const emb = buildShopCarBuyConfirmEmbed(member, cid);
      await replyOrUpdate(interaction, {
        embeds: [withShopNote(emb ?? buildShopNoticeEmbed("Покупка авто", r.reply), r.reply)],
        components: buildShopCarBuyConfirmRows(member, cid, defC.origin),
      });
      return true;
    }
    await replyOrUpdate(interaction, {
      embeds: [withShopNote(buildShopCarListEmbed(member, defC.origin), "Куплено за полную стоимость.")],
      components: buildShopCarListRows(member, defC.origin),
    });
    return true;
  }

  if (id.startsWith(ECON_SHOP_CAR_TRADE_GO_PREFIX)) {
    const cid = id.slice(ECON_SHOP_CAR_TRADE_GO_PREFIX.length);
    const defC = getCarDef(cid);
    if (!defC) {
      await replyShopNotice(interaction, "Неизвестная модель авто.", ECON_SHOP_CAR);
      return true;
    }
    const uids = selectedShopTradeUids(member.guild.id, member.id, "car", cid);
    const r = purchaseCarTrade(member, cid, uids);
    if (!r.ok) {
      const emb = buildShopCarTradePickEmbed(member, cid);
      await replyOrUpdate(interaction, {
        embeds: [withShopNote(emb ?? buildShopNoticeEmbed("Обмен авто", r.reply), r.reply)],
        components: buildShopCarTradePickRows(member, cid),
      });
      return true;
    }
    clearShopTradeDraft(member.guild.id, member.id);
    await replyOrUpdate(interaction, {
      embeds: [withShopNote(buildShopCarListEmbed(member, defC.origin), "Обмен выполнен.")],
      components: buildShopCarListRows(member, defC.origin),
    });
    return true;
  }

  if (id.startsWith(ECON_SHOP_CAR_TRADE_OK_PREFIX)) {
    const rest = id.slice(ECON_SHOP_CAR_TRADE_OK_PREFIX.length);
    const sep = rest.lastIndexOf(":");
    const cid = rest.slice(0, sep);
    const uid = rest.slice(sep + 1);
    const defC = getCarDef(cid);
    if (!defC) {
      await replyShopNotice(interaction, "Неизвестная модель авто.", ECON_SHOP_CAR);
      return true;
    }
    beginShopTradeDraft(member.guild.id, member.id, "car", cid, uid ? [uid] : []);
    const r = purchaseCarTrade(member, cid, uid);
    if (!r.ok) {
      const emb = buildShopCarTradePickEmbed(member, cid);
      await replyOrUpdate(interaction, {
        embeds: [withShopNote(emb ?? buildShopNoticeEmbed("Обмен авто", r.reply), r.reply)],
        components: buildShopCarTradePickRows(member, cid),
      });
      return true;
    }
    clearShopTradeDraft(member.guild.id, member.id);
    await replyOrUpdate(interaction, {
      embeds: [withShopNote(buildShopCarListEmbed(member, defC.origin), "Обмен выполнен.")],
      components: buildShopCarListRows(member, defC.origin),
    });
    return true;
  }

  if (id.startsWith(ECON_SHOP_CAR_TRADE_TG_PREFIX)) {
    const rest = id.slice(ECON_SHOP_CAR_TRADE_TG_PREFIX.length);
    const sep = rest.lastIndexOf(":");
    const cid = rest.slice(0, sep);
    const uid = rest.slice(sep + 1);
    const defC = getCarDef(cid);
    if (!defC) {
      await replyShopNotice(interaction, "Неизвестная модель авто.", ECON_SHOP_CAR);
      return true;
    }
    toggleShopTradeUid(member.guild.id, member.id, "car", cid, uid);
    const emb = buildShopCarTradePickEmbed(member, cid);
    if (!emb) {
      await replyShopNotice(interaction, "Неизвестная модель авто.", ECON_SHOP_CAR);
      return true;
    }
    await replyOrUpdate(interaction, { embeds: [emb], components: buildShopCarTradePickRows(member, cid) });
    return true;
  }

  if (id.startsWith(ECON_SHOP_CAR_TRADE_PREFIX)) {
    const cid = id.slice(ECON_SHOP_CAR_TRADE_PREFIX.length);
    const defC = getCarDef(cid);
    if (!defC) {
      await replyShopNotice(interaction, "Неизвестная модель авто.", ECON_SHOP_CAR);
      return true;
    }
    const owned = listOwnedCarsByOrigin(getEconomyUser(member.guild.id, member.id), defC.origin);
    beginShopTradeDraft(member.guild.id, member.id, "car", cid, owned.length === 1 ? [owned[0]!.uid] : []);
    const emb = buildShopCarTradePickEmbed(member, cid);
    if (!emb) {
      await replyShopNotice(interaction, "Неизвестная модель авто.", ECON_SHOP_CAR);
      return true;
    }
    await replyOrUpdate(interaction, { embeds: [emb], components: buildShopCarTradePickRows(member, cid) });
    return true;
  }

  if (id.startsWith(ECON_SHOP_CAR_BUY_CONFIRM_PREFIX)) {
    const cid = id.slice(ECON_SHOP_CAR_BUY_CONFIRM_PREFIX.length);
    const defC = getCarDef(cid);
    if (!defC) {
      await replyShopNotice(interaction, "Неизвестная модель авто.", ECON_SHOP_CAR);
      return true;
    }
    const r = purchaseCar(member, cid);
    if (!r.ok) {
      const emb = buildShopCarBuyConfirmEmbed(member, cid);
      await replyOrUpdate(interaction, {
        embeds: [withShopNote(emb ?? buildShopNoticeEmbed("Покупка авто", r.reply), r.reply)],
        components: buildShopCarBuyConfirmRows(member, cid, defC.origin),
      });
      return true;
    }
    await replyOrUpdate(interaction, {
      embeds: [withShopNote(buildShopCarListEmbed(member, defC.origin), "Куплено за полную стоимость.")],
      components: buildShopCarListRows(member, defC.origin),
    });
    return true;
  }

  if (id.startsWith(ECON_SHOP_CAR_BUY_CANCEL_PREFIX)) {
    const origin = parseOriginFromSuffix(id.slice(ECON_SHOP_CAR_BUY_CANCEL_PREFIX.length));
    if (!origin) return true;
    await replyOrUpdate(interaction, {
      embeds: [buildShopCarListEmbed(member, origin)],
      components: buildShopCarListRows(member, origin),
    });
    return true;
  }

  if (id === ECON_SHOP_PLATE) {
    syncVehiclePlatePrestige(member);
    await replyOrUpdate(interaction, {
      embeds: [buildShopPlateEmbed(member)],
      components: buildShopPlateRows(member),
    });
    return true;
  }

  if (id.startsWith(ECON_SHOP_PLATE_CAR_PREFIX)) {
    const carUid = id.slice(ECON_SHOP_PLATE_CAR_PREFIX.length);
    await replyPlateCarScreen(interaction, member, carUid);
    return true;
  }

  if (id.startsWith(ECON_SHOP_PLATE_NEW_PREFIX)) {
    const carUid = id.slice(ECON_SHOP_PLATE_NEW_PREFIX.length);
    const r = registerVehiclePlateForCar(member, carUid);
    if (!r.ok) {
      await replyPlateCarScreen(interaction, member, carUid, r.reply);
      return true;
    }
    await replyOrUpdate(interaction, {
      embeds: [buildShopPlateCarEmbed(member, carUid, r.lastRoll)!],
      components: buildShopPlateCarRows(member, carUid),
    });
    return true;
  }

  if (id.startsWith(ECON_SHOP_PLATE_DIG_PREFIX)) {
    const carUid = id.slice(ECON_SHOP_PLATE_DIG_PREFIX.length);
    const r = changeVehiclePlateDigitsForCar(member, carUid);
    if (!r.ok) {
      await replyPlateCarScreen(interaction, member, carUid, r.reply);
      return true;
    }
    await replyOrUpdate(interaction, {
      embeds: [buildShopPlateCarEmbed(member, carUid, r.lastRoll)!],
      components: buildShopPlateCarRows(member, carUid),
    });
    return true;
  }

  if (id.startsWith(ECON_SHOP_PLATE_LET_PREFIX)) {
    const carUid = id.slice(ECON_SHOP_PLATE_LET_PREFIX.length);
    const r = changeVehiclePlateLettersForCar(member, carUid);
    if (!r.ok) {
      await replyPlateCarScreen(interaction, member, carUid, r.reply);
      return true;
    }
    await replyOrUpdate(interaction, {
      embeds: [buildShopPlateCarEmbed(member, carUid, r.lastRoll)!],
      components: buildShopPlateCarRows(member, carUid),
    });
    return true;
  }

  if (id.startsWith(ECON_SHOP_PLATE_RGN_PREFIX)) {
    const carUid = id.slice(ECON_SHOP_PLATE_RGN_PREFIX.length);
    const r = changeVehiclePlateRegionForCar(member, carUid);
    if (!r.ok) {
      await replyPlateCarScreen(interaction, member, carUid, r.reply);
      return true;
    }
    await replyOrUpdate(interaction, {
      embeds: [buildShopPlateCarEmbed(member, carUid, r.lastRoll)!],
      components: buildShopPlateCarRows(member, carUid),
    });
    return true;
  }

  if (id.startsWith(ECON_SHOP_PLATE_DET_OK_PREFIX)) {
    const carUid = id.slice(ECON_SHOP_PLATE_DET_OK_PREFIX.length);
    const r = detachVehiclePlateFromCar(member, carUid);
    if (!r.ok) {
      await replyPlateCarScreen(interaction, member, carUid, r.reply);
      return true;
    }
    await replyPlateCarScreen(interaction, member, carUid, `Номер снят: **${r.plate}**.`);
    return true;
  }

  if (id.startsWith(ECON_SHOP_PLATE_DET_PREFIX)) {
    const carUid = id.slice(ECON_SHOP_PLATE_DET_PREFIX.length);
    const emb = buildShopPlateDetachConfirmEmbed(member, carUid);
    if (!emb) {
      await replyPlateCarScreen(interaction, member, carUid, "На этом авто нет госномера.");
      return true;
    }
    await replyOrUpdate(interaction, {
      embeds: [emb],
      components: buildShopPlateDetachConfirmRows(carUid),
    });
    return true;
  }

  if (id.startsWith(ECON_SHOP_PLATE_ATT_OK_PREFIX)) {
    const rest = id.slice(ECON_SHOP_PLATE_ATT_OK_PREFIX.length);
    const sep = rest.indexOf(":");
    const carUid = rest.slice(0, sep);
    const parts = decodePlateKey(rest.slice(sep + 1));
    if (!parts) {
      await replyPlateCarScreen(interaction, member, carUid, "Некорректный госномер.");
      return true;
    }
    const r = attachVehiclePlateToCar(member, carUid, parts);
    if (!r.ok) {
      await replyPlateCarScreen(interaction, member, carUid, r.reply);
      return true;
    }
    await replyPlateCarScreen(interaction, member, carUid, `Номер прикреплён: **${r.plate}**.`);
    return true;
  }

  if (id.startsWith(ECON_SHOP_PLATE_ATT_PICK_PREFIX)) {
    const rest = id.slice(ECON_SHOP_PLATE_ATT_PICK_PREFIX.length);
    const sep = rest.indexOf(":");
    const carUid = rest.slice(0, sep);
    const parts = decodePlateKey(rest.slice(sep + 1));
    if (!parts) {
      await replyPlateCarScreen(interaction, member, carUid, "Некорректный госномер.");
      return true;
    }
    const emb = buildShopPlateAttachConfirmEmbed(member, carUid, parts);
    if (!emb) {
      await replyPlateCarScreen(interaction, member, carUid, "Авто не найдено.");
      return true;
    }
    await replyOrUpdate(interaction, {
      embeds: [emb],
      components: buildShopPlateAttachConfirmRows(carUid, parts),
    });
    return true;
  }

  if (id.startsWith(ECON_SHOP_PLATE_ATT_PREFIX)) {
    const carUid = id.slice(ECON_SHOP_PLATE_ATT_PREFIX.length);
    const emb = buildShopPlateAttachEmbed(member, carUid);
    if (!emb) {
      await replyPlateCarScreen(interaction, member, carUid, "Авто не найдено.");
      return true;
    }
    await replyOrUpdate(interaction, {
      embeds: [emb],
      components: buildShopPlateAttachRows(member, carUid),
    });
    return true;
  }

  if (id === ECON_SHOP_PLATE_DETAILS) {
    await replyOrUpdate(interaction, {
      embeds: [buildShopPlateDetailsEmbed(member)],
      components: [shopNavBottomRow(ECON_SHOP_PLATE)],
    });
    return true;
  }

  if (id === ECON_SHOP_CAR_SELL) {
    const u = getEconomyUser(member.guild.id, member.id);
    if (listOwnedCars(u).length === 0) {
      await replyShopNotice(interaction, "Нет **авто** для продажи.", ECON_SHOP_CAR);
      return true;
    }
    await replyOrUpdate(interaction, {
      embeds: [buildShopCarSellPickEmbed(member)],
      components: buildShopCarSellPickRows(member),
    });
    return true;
  }

  if (id.startsWith(ECON_SHOP_CAR_SELL_OK_PREFIX)) {
    const uid = id.slice(ECON_SHOP_CAR_SELL_OK_PREFIX.length);
    const r = sellOwnedCar(member, uid);
    if (!r.ok) {
      await replyShopNotice(interaction, r.reply, ECON_SHOP_CAR_SELL);
      return true;
    }
    await replyOrUpdate(interaction, {
      embeds: [withShopNote(buildShopOriginPickEmbed("Авто", member, "car"), `Авто продано: **+${fmt(r.refund)}** ₽.`)],
      components: buildShopOriginPickRows(member, "car", ECON_SHOP_HUB),
    });
    return true;
  }

  if (id.startsWith(ECON_SHOP_CAR_SELL_UID_PREFIX)) {
    const uid = id.slice(ECON_SHOP_CAR_SELL_UID_PREFIX.length);
    const rec = listOwnedCars(getEconomyUser(member.guild.id, member.id)).find((c) => c.uid === uid);
    if (!rec) {
      await replyShopNotice(interaction, "Нет **авто** для продажи.", ECON_SHOP_CAR);
      return true;
    }
    await replyOrUpdate(interaction, {
      embeds: [buildShopCarSellConfirmEmbed(member, uid)],
      components: buildShopCarSellConfirmRows(uid),
    });
    return true;
  }

  if (id === ECON_SHOP_CAR_SELL_CANCEL) {
    const u = getEconomyUser(member.guild.id, member.id);
    const cur = getCarDef(u.ownedCarId);
    const origin = cur?.origin ?? "soviet";
    await replyOrUpdate(interaction, {
      embeds: [buildShopCarListEmbed(member, origin)],
      components: buildShopCarListRows(member, origin),
    });
    return true;
  }

  if (id === ECON_SHOP_CAR_SELL_CONFIRM) {
    const r = sellOwnedCar(member);
    if (!r.ok) {
      await replyShopNotice(interaction, r.reply, ECON_SHOP_CAR);
      return true;
    }
    await replyOrUpdate(interaction, {
      embeds: [withShopNote(buildShopOriginPickEmbed("Авто", member, "car"), `Авто продано: **+${fmt(r.refund)}** ₽.`)],
      components: buildShopOriginPickRows(member, "car", ECON_SHOP_HUB),
    });
    return true;
  }

  if (id === ECON_SHOP_HOUSE) {
    await replyOrUpdate(interaction, {
      embeds: [buildShopHousePickEmbed(member)],
      components: buildShopHousePickRows(ECON_SHOP_HUB),
    });
    return true;
  }

  if (id.startsWith(ECON_SHOP_HOUSE_DETAILS_PREFIX)) {
    const origin = parseOriginFromSuffix(id.slice(ECON_SHOP_HOUSE_DETAILS_PREFIX.length));
    if (!origin) return true;
    await replyOrUpdate(interaction, {
      embeds: [buildShopHouseDetailsEmbed(member, origin)],
      components: [shopNavBottomRow(`${ECON_SHOP_HOUSE_ORIGIN_PREFIX}${origin}`)],
    });
    return true;
  }

  if (id === ECON_SHOP_HOUSE_RENT_MENU) {
    await replyOrUpdate(interaction, {
      embeds: [buildShopHouseRentEmbed(member)],
      components: buildShopHouseRentRows(member),
    });
    return true;
  }

  if (id.startsWith(ECON_SHOP_HOUSE_ORIGIN_PREFIX)) {
    const origin = parseOriginFromSuffix(id.slice(ECON_SHOP_HOUSE_ORIGIN_PREFIX.length));
    if (origin) {
      await replyOrUpdate(interaction, {
        embeds: [buildShopHouseListEmbed(member, origin)],
        components: buildShopHouseListRows(member, origin),
      });
      return true;
    }
  }

  if (id === ECON_SHOP_ANIMALS) {
    await replyOrUpdate(interaction, { embeds: [buildShopAnimalsEmbed(member)], components: buildShopAnimalsRows(member) });
    return true;
  }

  if (id === ECON_SHOP_ANIMALS_BUY) {
    await replyOrUpdate(interaction, {
      embeds: [buildShopAnimalsBuyEmbed(member)],
      components: buildShopAnimalsBuyRows(member),
    });
    return true;
  }

  if (id === ECON_SHOP_ANIMALS_OWNED) {
    await replyOrUpdate(interaction, {
      embeds: [buildShopAnimalsOwnedEmbed(member)],
      components: buildShopAnimalsOwnedRows(member),
    });
    return true;
  }

  if (id === ECON_SHOP_ANIMALS_DETAILS) {
    await replyOrUpdate(interaction, {
      embeds: [buildShopAnimalsDetailsEmbed(member)],
      components: [shopNavBottomRow(ECON_SHOP_ANIMALS_BUY)],
    });
    return true;
  }

  if (id.startsWith(ECON_SHOP_PET_VIEW_PREFIX)) {
    const uid = id.slice(ECON_SHOP_PET_VIEW_PREFIX.length);
    const emb = buildShopPetViewEmbed(member, uid);
    if (!emb) {
      await replyShopNotice(interaction, "Питомец не найден.", ECON_SHOP_ANIMALS_OWNED);
      return true;
    }
    await replyOrUpdate(interaction, { embeds: [emb], components: buildShopPetViewRows(uid) });
    return true;
  }

  if (id.startsWith(ECON_SHOP_PET_RENAME_PREFIX)) {
    const uid = id.slice(ECON_SHOP_PET_RENAME_PREFIX.length);
    const rec = listOwnedPets(getEconomyUser(member.guild.id, member.id)).find((p) => p.uid === uid);
    if (!rec) {
      await replyShopNotice(interaction, "Питомец не найден.", ECON_SHOP_ANIMALS_OWNED);
      return true;
    }
    const modal = new ModalBuilder().setCustomId(`${ECON_MODAL_PET_RENAME_PREFIX}${uid}`).setTitle("Имя питомца");
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("name")
          .setLabel("Имя")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(PET_NAME_MAX)
          .setValue(rec.name.slice(0, PET_NAME_MAX)),
      ),
    );
    await interaction.showModal(modal);
    return true;
  }

  if (id.startsWith(ECON_SHOP_PET_BUY_PREFIX)) {
    const petId = id.slice(ECON_SHOP_PET_BUY_PREFIX.length);
    const r = purchasePet(member, petId);
    if (!r.ok) {
      await replyOrUpdate(interaction, {
        embeds: [withShopNote(buildShopAnimalsBuyEmbed(member), r.reply)],
        components: buildShopAnimalsBuyRows(member),
      });
      return true;
    }
    await replyOrUpdate(interaction, {
      embeds: [withShopNote(buildShopAnimalsBuyEmbed(member), "Питомец куплен.")],
      components: buildShopAnimalsBuyRows(member),
    });
    return true;
  }

  if (id === ECON_SHOP_HOUSE_RENT_1D || id === ECON_SHOP_HOUSE_RENT_7D || id === ECON_SHOP_HOUSE_RENT_30D) {
    const plan: HousingRentPlan = id === ECON_SHOP_HOUSE_RENT_1D ? "day" : id === ECON_SHOP_HOUSE_RENT_7D ? "week" : "month";
    const r = applyRentPlanPurchase(member, plan);
    if (!r.ok) {
      await replyOrUpdate(interaction, {
        embeds: [withShopNote(buildShopHouseRentEmbed(member), r.reply)],
        components: buildShopHouseRentRows(member),
      });
      return true;
    }
    await replyAfterRentPlanPurchase(interaction, member, "shop");
    return true;
  }

  if (id.startsWith(ECON_HOUSING_EXT_PREFIX)) {
    const raw = id.slice(ECON_HOUSING_EXT_PREFIX.length);
    const plan: HousingRentPlan | undefined =
      raw === "day" ? "day" : raw === "week" ? "week" : raw === "month" ? "month" : undefined;
    if (!plan) {
      await replyShopNotice(interaction, "Неверный пакет.", ECON_BUTTON_HOUSING);
      return true;
    }
    const r = applyRentPlanPurchase(member, plan);
    if (!r.ok) {
      await replyOrUpdate(interaction, {
        embeds: [withShopNote(buildMyRentEditEmbed(member), r.reply)],
        components: buildMyRentEditRows(member),
      });
      return true;
    }
    await replyAfterRentPlanPurchase(interaction, member, "myRentEdit");
    return true;
  }

  if (id === ECON_SHOP_HOUSE_LEAVE || id === ECON_HOUSING_LEAVE) {
    const u = getEconomyUser(member.guild.id, member.id);
    if ((u.housingKind ?? "none") !== "rent") {
      if (id === ECON_HOUSING_LEAVE) {
        await replyShopNotice(interaction, "Вы **не** на аренде.", ECON_BUTTON_HOUSING);
      } else {
        await replyOrUpdate(interaction, {
          embeds: [withShopNote(buildShopHouseRentEmbed(member), "Вы **не** на аренде.")],
          components: buildShopHouseRentRows(member),
        });
      }
      return true;
    }
    const quitJob = economyUserClearTier2PlusJobPatch(u);
    patchEconomyUser(member.guild.id, member.id, {
      ...clearSovietHousingRentPatch(),
      ...quitJob,
    });
    if (id === ECON_HOUSING_LEAVE) {
      await replyOrUpdate(interaction, {
        embeds: [buildTerminalPanelEmbed(member.guild.name)],
        components: buildTerminalPanelRows(member),
      });
    } else {
      await replyOrUpdate(interaction, {
        embeds: [buildShopHouseRentEmbed(member)],
        components: buildShopHouseRentRows(member),
      });
    }
    return true;
  }

  if (id.startsWith(ECON_SHOP_HOUSE_RENEW_AFTER_REQ_PREFIX)) {
    const raw = id.slice(ECON_SHOP_HOUSE_RENEW_AFTER_REQ_PREFIX.length);
    const planNext: HousingRentPlan | undefined =
      raw === "day" ? "day" : raw === "week" ? "week" : raw === "month" ? "month" : undefined;
    if (!planNext) {
      await interaction.reply({ content: "Неверный пакет.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const uR = getEconomyUser(member.guild.id, member.id);
    if ((uR.housingKind ?? "none") !== "rent") {
      await interaction.reply({ content: "План следующего цикла доступен только **на аренде**.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const nowR = Date.now();
    if (!uR.housingRentNextDueMs || nowR >= uR.housingRentNextDueMs) {
      await interaction.reply({
        content: "Нет активного оплаченного срока — **продлите** аренду, затем можно выбрать пакет на следующий цикл.",
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }
    const priceN = inflatedHousingRentPrice(member.guild.id, planNext);
    const embedR = new EmbedBuilder()
      .setColor(PANEL_COLOR)
      .setTitle("Пакет на следующий цикл")
      .setDescription(
        [
          `Сейчас действует оплаченный срок **до** <t:${Math.floor(uR.housingRentNextDueMs / 1000)}:F> — **он не меняется.**`,
          "",
          `После его окончания **первое** автосписание **в начале следующего дня** будет по пакету **${rentPlanLabelRu(planNext)}** (**${fmt(priceN)}** ₽).`,
          "",
          "Ручные продления до этой даты и пакет **текущего** цикла **не** затрагиваются.",
        ].join("\n"),
      )
      .setFooter({ text: `Запросил: ${member.user.tag}` });
    await interaction.reply({
      flags: MessageFlags.Ephemeral,
      embeds: [embedR],
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`${ECON_SHOP_HOUSE_RENEW_AFTER_CNF_PREFIX}${planNext}`)
            .setLabel("Подтвердить")
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(ECON_SHOP_HOUSE_RENEW_AFTER_CAN).setLabel("Отмена").setStyle(ButtonStyle.Secondary),
        ),
      ],
    });
    return true;
  }

  if (id.startsWith(ECON_SHOP_HOUSE_RENEW_AFTER_CNF_PREFIX)) {
    const raw = id.slice(ECON_SHOP_HOUSE_RENEW_AFTER_CNF_PREFIX.length);
    const planNext: HousingRentPlan | undefined =
      raw === "day" ? "day" : raw === "week" ? "week" : raw === "month" ? "month" : undefined;
    if (!planNext) {
      await interaction.reply({ content: "Неверный пакет.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const uC = getEconomyUser(member.guild.id, member.id);
    if ((uC.housingKind ?? "none") !== "rent") {
      await interaction.reply({ content: "Вы **не** на аренде.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const nowC = Date.now();
    if (!uC.housingRentNextDueMs || nowC >= uC.housingRentNextDueMs) {
      await interaction.reply({
        content: "Срок аренды уже истёк или не оплачен — действие недоступно.",
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }
    patchEconomyUser(member.guild.id, member.id, { housingRentRenewalPlan: planNext });
    const priceC = inflatedHousingRentPrice(member.guild.id, planNext);
    const doneEmb = new EmbedBuilder()
      .setColor(PANEL_COLOR)
      .setTitle("Сохранено")
      .setDescription(
        [
          `После <t:${Math.floor(uC.housingRentNextDueMs / 1000)}:F> первое автосписание **в начале следующего дня**: **${rentPlanLabelRu(planNext)}** (**${fmt(priceC)}** ₽).`,
          "",
          "До этой даты можно **переопределить** пакет в **Жильё** → **Изменить срок** (кнопки «После срока»).",
        ].join("\n"),
      );
    await interaction.update({ embeds: [doneEmb], components: [] });
    return true;
  }

  if (id === ECON_SHOP_HOUSE_RENEW_AFTER_CAN) {
    await interaction.update({ content: "Отменено.", embeds: [], components: [] });
    return true;
  }

  if (id.startsWith(ECON_SHOP_APT_BUY_PREFIX)) {
    const aid = id.slice(ECON_SHOP_APT_BUY_PREFIX.length);
    const defA = getApartmentDef(aid);
    const emb = defA ? buildShopApartmentBuyConfirmEmbed(member, aid) : undefined;
    if (!defA || !emb) {
      await replyShopNotice(interaction, "Неизвестная квартира.", ECON_SHOP_HOUSE);
      return true;
    }
    await replyOrUpdate(interaction, {
      embeds: [emb],
      components: buildShopApartmentBuyConfirmRows(member, aid, defA.origin),
    });
    return true;
  }

  if (id.startsWith(ECON_SHOP_APT_FULL_PREFIX)) {
    const aid = id.slice(ECON_SHOP_APT_FULL_PREFIX.length);
    const defA = getApartmentDef(aid);
    if (!defA) {
      await replyShopNotice(interaction, "Неизвестная квартира.", ECON_SHOP_HOUSE);
      return true;
    }
    const r = purchaseApartmentFull(member, aid);
    if (!r.ok) {
      const emb = buildShopApartmentBuyConfirmEmbed(member, aid);
      await replyOrUpdate(interaction, {
        embeds: [withShopNote(emb ?? buildShopNoticeEmbed("Покупка жилья", r.reply), r.reply)],
        components: buildShopApartmentBuyConfirmRows(member, aid, defA.origin),
      });
      return true;
    }
    if (r.refund > 0) {
      appendFeedEvent({
        ts: Date.now(),
        guildId: member.guild.id,
        type: "job:passive",
        actorUserId: member.id,
        text: `${member.toString()} купил **${defA.label}**: возврат с аренды **+${fmt(r.refund)}** ₽.`,
      });
      await ensureEconomyFeedPanel(interaction.client);
    }
    await replyOrUpdate(interaction, {
      embeds: [withShopNote(buildShopHouseListEmbed(member, defA.origin), "Куплено за полную стоимость.")],
      components: buildShopHouseListRows(member, defA.origin),
    });
    return true;
  }

  if (id.startsWith(ECON_SHOP_APT_TRADE_GO_PREFIX)) {
    const aid = id.slice(ECON_SHOP_APT_TRADE_GO_PREFIX.length);
    const defA = getApartmentDef(aid);
    if (!defA) {
      await replyShopNotice(interaction, "Неизвестная квартира.", ECON_SHOP_HOUSE);
      return true;
    }
    const uids = selectedShopTradeUids(member.guild.id, member.id, "apt", aid);
    const r = purchaseApartmentTrade(member, aid, uids);
    if (!r.ok) {
      const emb = buildShopAptTradePickEmbed(member, aid);
      await replyOrUpdate(interaction, {
        embeds: [withShopNote(emb ?? buildShopNoticeEmbed("Обмен жилья", r.reply), r.reply)],
        components: buildShopAptTradePickRows(member, aid),
      });
      return true;
    }
    clearShopTradeDraft(member.guild.id, member.id);
    await replyOrUpdate(interaction, {
      embeds: [withShopNote(buildShopHouseListEmbed(member, defA.origin), "Обмен выполнен.")],
      components: buildShopHouseListRows(member, defA.origin),
    });
    return true;
  }

  if (id.startsWith(ECON_SHOP_APT_TRADE_OK_PREFIX)) {
    const rest = id.slice(ECON_SHOP_APT_TRADE_OK_PREFIX.length);
    const sep = rest.lastIndexOf(":");
    const aid = rest.slice(0, sep);
    const uid = rest.slice(sep + 1);
    const defA = getApartmentDef(aid);
    if (!defA) {
      await replyShopNotice(interaction, "Неизвестная квартира.", ECON_SHOP_HOUSE);
      return true;
    }
    beginShopTradeDraft(member.guild.id, member.id, "apt", aid, uid ? [uid] : []);
    const r = purchaseApartmentTrade(member, aid, uid);
    if (!r.ok) {
      const emb = buildShopAptTradePickEmbed(member, aid);
      await replyOrUpdate(interaction, {
        embeds: [withShopNote(emb ?? buildShopNoticeEmbed("Обмен жилья", r.reply), r.reply)],
        components: buildShopAptTradePickRows(member, aid),
      });
      return true;
    }
    clearShopTradeDraft(member.guild.id, member.id);
    await replyOrUpdate(interaction, {
      embeds: [withShopNote(buildShopHouseListEmbed(member, defA.origin), "Обмен выполнен.")],
      components: buildShopHouseListRows(member, defA.origin),
    });
    return true;
  }

  if (id.startsWith(ECON_SHOP_APT_TRADE_TG_PREFIX)) {
    const rest = id.slice(ECON_SHOP_APT_TRADE_TG_PREFIX.length);
    const sep = rest.lastIndexOf(":");
    const aid = rest.slice(0, sep);
    const uid = rest.slice(sep + 1);
    const defA = getApartmentDef(aid);
    if (!defA) {
      await replyShopNotice(interaction, "Неизвестная квартира.", ECON_SHOP_HOUSE);
      return true;
    }
    toggleShopTradeUid(member.guild.id, member.id, "apt", aid, uid);
    const emb = buildShopAptTradePickEmbed(member, aid);
    if (!emb) {
      await replyShopNotice(interaction, "Неизвестная квартира.", ECON_SHOP_HOUSE);
      return true;
    }
    await replyOrUpdate(interaction, { embeds: [emb], components: buildShopAptTradePickRows(member, aid) });
    return true;
  }

  if (id.startsWith(ECON_SHOP_APT_TRADE_PREFIX)) {
    const aid = id.slice(ECON_SHOP_APT_TRADE_PREFIX.length);
    const defA = getApartmentDef(aid);
    if (!defA) {
      await replyShopNotice(interaction, "Неизвестная квартира.", ECON_SHOP_HOUSE);
      return true;
    }
    const owned = listOwnedApartmentsByOrigin(getEconomyUser(member.guild.id, member.id), defA.origin);
    beginShopTradeDraft(member.guild.id, member.id, "apt", aid, owned.length === 1 ? [owned[0]!.uid] : []);
    const emb = buildShopAptTradePickEmbed(member, aid);
    if (!emb) {
      await replyShopNotice(interaction, "Неизвестная квартира.", ECON_SHOP_HOUSE);
      return true;
    }
    await replyOrUpdate(interaction, { embeds: [emb], components: buildShopAptTradePickRows(member, aid) });
    return true;
  }

  if (id.startsWith(ECON_SHOP_APT_BUY_CONFIRM_PREFIX)) {
    const aid = id.slice(ECON_SHOP_APT_BUY_CONFIRM_PREFIX.length);
    const defA = getApartmentDef(aid);
    if (!defA) {
      await replyShopNotice(interaction, "Неизвестная квартира.", ECON_SHOP_HOUSE);
      return true;
    }
    const r = purchaseApartment(member, aid);
    if (!r.ok) {
      const emb = buildShopApartmentBuyConfirmEmbed(member, aid);
      await replyOrUpdate(interaction, {
        embeds: [withShopNote(emb ?? buildShopNoticeEmbed("Покупка жилья", r.reply), r.reply)],
        components: buildShopApartmentBuyConfirmRows(member, aid, defA.origin),
      });
      return true;
    }
    if (r.refund > 0) {
      appendFeedEvent({
        ts: Date.now(),
        guildId: member.guild.id,
        type: "job:passive",
        actorUserId: member.id,
        text: `${member.toString()} купил **${defA.label}**: возврат с аренды **+${fmt(r.refund)}** ₽.`,
      });
      await ensureEconomyFeedPanel(interaction.client);
    }
    await replyOrUpdate(interaction, {
      embeds: [withShopNote(buildShopHouseListEmbed(member, defA.origin), "Куплено за полную стоимость.")],
      components: buildShopHouseListRows(member, defA.origin),
    });
    return true;
  }

  if (id.startsWith(ECON_SHOP_APT_BUY_CANCEL_PREFIX)) {
    const origin = parseOriginFromSuffix(id.slice(ECON_SHOP_APT_BUY_CANCEL_PREFIX.length));
    if (!origin) return true;
    await replyOrUpdate(interaction, {
      embeds: [buildShopHouseListEmbed(member, origin)],
      components: buildShopHouseListRows(member, origin),
    });
    return true;
  }

  if (id === ECON_SHOP_APT_SELL_SOVIET) {
    const u = getEconomyUser(member.guild.id, member.id);
    if (listOwnedApartmentsByOrigin(u, "soviet").length === 0) {
      await replyShopNotice(interaction, "Нет **советского** жилья для продажи.", `${ECON_SHOP_HOUSE_ORIGIN_PREFIX}soviet`);
      return true;
    }
    await replyOrUpdate(interaction, {
      embeds: [buildShopAptSellPickEmbed(member, "soviet")],
      components: buildShopAptSellPickRows(member, "soviet"),
    });
    return true;
  }

  if (id === ECON_SHOP_APT_SELL_SOVIET_CANCEL) {
    await replyOrUpdate(interaction, {
      embeds: [buildShopHouseListEmbed(member, "soviet")],
      components: buildShopHouseListRows(member, "soviet"),
    });
    return true;
  }

  if (id === ECON_SHOP_APT_SELL_SOVIET_CONFIRM) {
    const r = sellSovietApartment(member);
    if (!r.ok) {
      await replyShopNotice(interaction, r.reply, ECON_SHOP_APT_SELL_SOVIET);
      return true;
    }
    await replyOrUpdate(interaction, {
      embeds: [withShopNote(buildShopHouseListEmbed(member, "soviet"), `Жильё продано: **+${fmt(r.refund)}** ₽.`)],
      components: buildShopHouseListRows(member, "soviet"),
    });
    return true;
  }

  if (id === ECON_SHOP_APT_SELL_FOREIGN) {
    const u = getEconomyUser(member.guild.id, member.id);
    if (listOwnedApartmentsByOrigin(u, "foreign").length === 0) {
      await replyShopNotice(interaction, "Нет **заморского** жилья для продажи.", `${ECON_SHOP_HOUSE_ORIGIN_PREFIX}foreign`);
      return true;
    }
    await replyOrUpdate(interaction, {
      embeds: [buildShopAptSellPickEmbed(member, "foreign")],
      components: buildShopAptSellPickRows(member, "foreign"),
    });
    return true;
  }

  if (id === ECON_SHOP_APT_SELL_FOREIGN_CANCEL) {
    await replyOrUpdate(interaction, {
      embeds: [buildShopHouseListEmbed(member, "foreign")],
      components: buildShopHouseListRows(member, "foreign"),
    });
    return true;
  }

  if (id === ECON_SHOP_APT_SELL_FOREIGN_CONFIRM) {
    const r = sellForeignApartment(member);
    if (!r.ok) {
      await replyShopNotice(interaction, r.reply, ECON_SHOP_APT_SELL_FOREIGN);
      return true;
    }
    await replyOrUpdate(interaction, {
      embeds: [withShopNote(buildShopHouseListEmbed(member, "foreign"), `Жильё продано: **+${fmt(r.refund)}** ₽.`)],
      components: buildShopHouseListRows(member, "foreign"),
    });
    return true;
  }

  if (id.startsWith(ECON_SHOP_APT_SELL_OK_PREFIX)) {
    const uid = id.slice(ECON_SHOP_APT_SELL_OK_PREFIX.length);
    const rec = findOwnedApartment(getEconomyUser(member.guild.id, member.id), uid);
    const origin = getApartmentDef(rec?.id)?.origin ?? "soviet";
    const r = sellOwnedApartment(member, uid);
    if (!r.ok) {
      await replyShopNotice(interaction, r.reply, origin === "foreign" ? ECON_SHOP_APT_SELL_FOREIGN : ECON_SHOP_APT_SELL_SOVIET);
      return true;
    }
    await replyOrUpdate(interaction, {
      embeds: [withShopNote(buildShopHouseListEmbed(member, origin), `Жильё продано: **+${fmt(r.refund)}** ₽.`)],
      components: buildShopHouseListRows(member, origin),
    });
    return true;
  }

  if (id.startsWith(ECON_SHOP_APT_SELL_UID_PREFIX)) {
    const uid = id.slice(ECON_SHOP_APT_SELL_UID_PREFIX.length);
    const rec = findOwnedApartment(getEconomyUser(member.guild.id, member.id), uid);
    const origin = getApartmentDef(rec?.id)?.origin ?? "soviet";
    if (!rec) {
      await replyShopNotice(interaction, "Жильё не найдено.", ECON_SHOP_HOUSE);
      return true;
    }
    await replyOrUpdate(interaction, {
      embeds: [buildShopApartmentSellConfirmEmbed(member, origin, uid)],
      components: buildShopAptUidSellConfirmRows(origin, uid),
    });
    return true;
  }

  if (id === ECON_SHOP_LOTTERY) {
    await replyOrUpdate(interaction, { embeds: [buildShopLotteryEmbed(member)], components: buildShopLotteryRows(member) });
    return true;
  }

  if (id === ECON_SHOP_LOTTERY_DETAILS) {
    await replyOrUpdate(interaction, {
      embeds: [buildShopLotteryDetailsEmbed()],
      components: [shopNavBottomRow(ECON_SHOP_LOTTERY)],
    });
    return true;
  }

  if (id === ECON_SHOP_LOTTERY_BUY_OPEN) {
    const modal = new ModalBuilder().setCustomId(ECON_MODAL_LOTTERY_QTY).setTitle("Купить лотерейные билеты");
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("qty")
          .setLabel("Количество (только цифры, 1–500)")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(4)
          .setPlaceholder("1"),
      ),
    );
    await interaction.showModal(modal);
    return true;
  }

  if (id.startsWith(ECON_LOTTERY_CONFIRM_PREFIX)) {
    const qty = Number.parseInt(id.slice(ECON_LOTTERY_CONFIRM_PREFIX.length), 10);
    if (!Number.isFinite(qty) || qty < 1) {
      await replyShopNotice(interaction, "Некорректное количество.", ECON_SHOP_LOTTERY);
      return true;
    }
    const total = qty * LOTTERY_TICKET_PRICE_RUB;
    const spend = trySpendEconomyUserRubles(member.guild.id, member.id, total);
    if (!spend.ok) {
      await replyOrUpdate(interaction, {
        embeds: [withShopNote(buildShopLotteryEmbed(member), `Не хватает **${fmt(Math.max(0, total - getEconomyUser(member.guild.id, member.id).rubles))}** ₽ (к оплате **${fmt(total)}**).`)],
        components: buildShopLotteryRows(member),
      });
      return true;
    }
    remitShopPurchaseVatToTreasury(member.guild.id, total);
    ensureDueLotteryDraws(member.guild);
    const period = lotteryPeriodMskYmd();
    addLotteryTickets(member.guild.id, period, member.id, qty);
    appendFeedEvent({
      ts: Date.now(),
      guildId: member.guild.id,
      type: "job:shift",
      actorUserId: member.id,
      text: `${member.toString()} купил лотерейных билетов: **${qty}** × **${LOTTERY_TICKET_PRICE_RUB.toLocaleString("ru-RU")}** ₽`,
    });
    await ensureEconomyFeedPanel(interaction.client);
    await interaction.update({ embeds: [buildShopLotteryEmbed(member)], components: buildShopLotteryRows(member) });
    return true;
  }

  if (id === ECON_LOTTERY_CANCEL) {
    await interaction.update({ embeds: [buildShopLotteryEmbed(member)], components: buildShopLotteryRows(member) });
    return true;
  }

  if (id === ECON_SHOP_SIM) {
    syncSimPrestige(member);
    const su = getEconomyUser(member.guild.id, member.id);
    if (!su.hasPhone) {
      await replyShopNotice(interaction, "Без **телефона** симку оформить нельзя — сначала купите телефон в магазине.", ECON_SHOP_HUB);
      return true;
    }
    await replyOrUpdate(interaction, { embeds: [buildShopSimEmbed(member)], components: buildShopSimRows(member) });
    return true;
  }

  if (id === ECON_SHOP_SIM_REGISTER) {
    const r = registerSimNumber(member);
    if (!r.ok) {
      await replyOrUpdate(interaction, {
        embeds: [withShopNote(buildShopSimEmbed(member), r.reply)],
        components: buildShopSimRows(member),
      });
      return true;
    }
    await replyOrUpdate(interaction, {
      embeds: [buildShopSimEmbed(member, r.lastRoll)],
      components: buildShopSimRows(member),
    });
    return true;
  }

  if (id === ECON_SHOP_SIM_CHANGE) {
    const u = getEconomyUser(member.guild.id, member.id);
    if (!userHasSimNumber(u)) {
      await replyOrUpdate(interaction, {
        embeds: [withShopNote(buildShopSimEmbed(member), "Сначала **купите симку**.")],
        components: buildShopSimRows(member),
      });
      return true;
    }
    await replyOrUpdate(interaction, {
      embeds: [buildShopSimChangeEmbed(member)],
      components: buildShopSimChangeRows(member),
    });
    return true;
  }

  if (id === ECON_SHOP_SIM_OPERATOR) {
    const r = changeSimOperator(member);
    if (!r.ok) {
      await replyOrUpdate(interaction, {
        embeds: [withShopNote(buildShopSimChangeEmbed(member), r.reply)],
        components: buildShopSimChangeRows(member),
      });
      return true;
    }
    await replyOrUpdate(interaction, {
      embeds: [buildShopSimChangeEmbed(member, r.lastRoll)],
      components: buildShopSimChangeRows(member),
    });
    return true;
  }

  if (id === ECON_SHOP_SIM_MID) {
    const r = changeSimMid(member);
    if (!r.ok) {
      await replyOrUpdate(interaction, {
        embeds: [withShopNote(buildShopSimChangeEmbed(member), r.reply)],
        components: buildShopSimChangeRows(member),
      });
      return true;
    }
    await replyOrUpdate(interaction, {
      embeds: [buildShopSimChangeEmbed(member, r.lastRoll)],
      components: buildShopSimChangeRows(member),
    });
    return true;
  }

  if (id === ECON_SHOP_SIM_LAST) {
    const r = changeSimLast(member);
    if (!r.ok) {
      await replyOrUpdate(interaction, {
        embeds: [withShopNote(buildShopSimChangeEmbed(member), r.reply)],
        components: buildShopSimChangeRows(member),
      });
      return true;
    }
    await replyOrUpdate(interaction, {
      embeds: [buildShopSimChangeEmbed(member, r.lastRoll)],
      components: buildShopSimChangeRows(member),
    });
    return true;
  }

  if (id === ECON_SHOP_SIM_DETAILS) {
    await replyOrUpdate(interaction, {
      embeds: [buildShopSimDetailsEmbed(member)],
      components: [shopNavBottomRow(ECON_SHOP_SIM)],
    });
    return true;
  }

  if (id === ECON_SHOP_SIM_TOPUP_OPEN) {
    const u = getEconomyUser(member.guild.id, member.id);
    if (!u.hasPhone) {
      await replyShopNotice(interaction, "Нужен **телефон**.", ECON_SHOP_HUB);
      return true;
    }
    if (!userHasSimNumber(u)) {
      await replyOrUpdate(interaction, {
        embeds: [withShopNote(buildShopSimEmbed(member), "Сначала купите симку.")],
        components: buildShopSimRows(member),
      });
      return true;
    }
    const modal = new ModalBuilder().setCustomId(ECON_MODAL_SIM_TOPUP).setTitle("Пополнить симку");
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("amount")
          .setLabel("Сумма в ₽ (со счёта → на баланс сим)")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMinLength(1)
          .setMaxLength(12),
      ),
    );
    await interaction.showModal(modal);
    return true;
  }

  if (id === ECON_COURIER_BIKE_1D || id === ECON_COURIER_BIKE_3D || id === ECON_COURIER_BIKE_7D) {
    const u = getEconomyUser(member.guild.id, member.id);
    if (u.jobId !== "courier") {
      await interaction.reply({ content: "Аренда вела доступна только на **доставке** (без личного авто).", flags: MessageFlags.Ephemeral });
      return true;
    }
    if (hasOwnedCourierCar(u)) {
      await interaction.reply({ content: "С **личным авто** аренда вела **не нужна**.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const now = Date.now();
    if (hasActiveBikeRental(u, now)) {
      const fresh = courierWorkRefreshPayload(member, interaction);
      await updateButtonParentMessage(interaction, {
        content: "Электровел **уже в аренде** — сообщение обновлено, кнопки аренды скрыты.",
        ...fresh,
      });
      return true;
    }
    const ms = id === ECON_COURIER_BIKE_1D ? BIKE_1D_MS : id === ECON_COURIER_BIKE_3D ? BIKE_3D_MS : BIKE_7D_MS;
    const bikeDays: 1 | 3 | 7 = id === ECON_COURIER_BIKE_1D ? 1 : id === ECON_COURIER_BIKE_3D ? 3 : 7;
    const price = scaledShopPrice(member.guild.id, courierBikeRentPriceRub(bikeDays));
    let bikeRentApplied = false;
    updateEconomyUser(member.guild.id, member.id, (cur) => {
      if (cur.rubles < price) return cur;
      bikeRentApplied = true;
      const nextUntil = extendBikeRentalMs(cur.courierBikeUntilMs, now, ms);
      return { ...cur, rubles: cur.rubles - price, courierBikeUntilMs: nextUntil };
    });
    if (!bikeRentApplied) {
      await interaction.reply({ content: `Нужно **${price} ₽**.`, flags: MessageFlags.Ephemeral });
      return true;
    }
    remitShopPurchaseVatToTreasury(member.guild.id, price);
    const refreshed = courierWorkRefreshPayload(member, interaction);
    await updateButtonParentMessage(interaction, refreshed);
    return true;
  }

  if (id === ECON_WORK_BUTTON_STARTERS) {
    await replyOrUpdate(interaction, { embeds: [buildStarterJobsEmbed(member)], components: buildStarterJobsRows() });
    return true;
  }

  if (id === ECON_WORK_BUTTON_TIER2) {
    const embed = buildTier2JobsOverviewEmbed(member);
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`${ECON_WORK_BUTTON_JOB_PREFIX}dispatcher`).setLabel("Колл-центр").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`${ECON_WORK_BUTTON_JOB_PREFIX}assembler`).setLabel("Склад").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`${ECON_WORK_BUTTON_JOB_PREFIX}expediter`).setLabel("Развлекательный центр").setStyle(ButtonStyle.Secondary),
    );
    await replyOrUpdate(interaction, { embeds: [embed], components: [row, shopNavBottomRow(ECON_BUTTON_WORK)] });
    return true;
  }

  if (id === ECON_WORK_BUTTON_TIER3) {
    await replyOrUpdate(interaction, {
      embeds: [buildTier3JobsOverviewEmbed(member)],
      components: buildTier3JobRows(),
    });
    return true;
  }

  if (id === ECON_IP_CALC_CLOSE) {
    const u = getEconomyUser(member.guild.id, member.id);
    if (u.jobId === "soleProp") {
      await replyOrUpdate(interaction, {
        embeds: [buildCurrentJobEmbed(member)],
        components: buildCurrentJobRows(member),
      });
    } else {
      const def = getAnyJobDef("soleProp");
      const req = meetsJobReq(u, def);
      await replyOrUpdate(interaction, {
        embeds: [buildJobInfoEmbed(member, "soleProp")],
        components: buildJobInfoRows(member, "soleProp", req.ok),
      });
    }
    return true;
  }

  if (
    id === ECON_IP_AD_OPEN ||
    id === ECON_IP_DEP_OPEN ||
    id === ECON_IP_WD_OPEN ||
    id === ECON_IP_CALC_OPEN ||
    id === ECON_IP_STAFF ||
    id === ECON_IP_CONTROL
  ) {
    const u = getEconomyUser(member.guild.id, member.id);
    const now = Date.now();
    if (id === ECON_IP_CALC_OPEN) {
      const modal = new ModalBuilder().setCustomId(ECON_MODAL_IP_CALC).setTitle("Калькулятор ИП");
      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId("amount")
            .setLabel("Капитал бизнеса: 0–500 000 000 ₽")
            .setStyle(TextInputStyle.Short)
            .setValue(String(u.jobId === "soleProp" ? (u.solePropCapitalRub ?? 0) : 0))
            .setRequired(true)
            .setMinLength(1)
            .setMaxLength(12),
        ),
      );
      await interaction.showModal(modal);
      return true;
    }
    if (u.jobId !== "soleProp") {
      await interaction.reply({ content: "Эти действия доступны только на работе **ИП**.", flags: MessageFlags.Ephemeral });
      return true;
    }
    if (id === ECON_IP_AD_OPEN) {
      const gid = member.guild.id;
      const maxAd = solePropAdMaxRub(gid, u.jobMskDayStreak ?? 0);
      const minAd = scalePositiveIncome(gid, 10_000);
      const modal = new ModalBuilder()
        .setCustomId(ECON_MODAL_IP_AD)
        .setTitle(`Реклама (${fmt(minAd)}–${fmt(maxAd)} ₽ с бизнеса)`);
      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId("amount")
            .setLabel("Сумма кампании с баланса бизнеса, ₽")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMinLength(4)
            .setMaxLength(12),
        ),
      );
      await interaction.showModal(modal);
      return true;
    }
    if (id === ECON_IP_DEP_OPEN) {
      const modal = new ModalBuilder().setCustomId(ECON_MODAL_IP_DEP).setTitle("На баланс бизнеса");
      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId("amount")
            .setLabel("Сумма со счёта → в бизнес, ₽")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMinLength(1)
            .setMaxLength(12),
        ),
      );
      await interaction.showModal(modal);
      return true;
    }
    if (id === ECON_IP_WD_OPEN) {
      const modal = new ModalBuilder().setCustomId(ECON_MODAL_IP_WD).setTitle("Вывод из бизнеса");
      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId("amount")
            .setLabel("Сумма на основной счёт, ₽")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMinLength(1)
            .setMaxLength(12),
        ),
      );
      await interaction.showModal(modal);
      return true;
    }
    if (id === ECON_IP_STAFF) {
      if (u.solePropStaffReadyAt && now < u.solePropStaffReadyAt) {
        await replyOrUpdate(interaction, { embeds: [buildCurrentJobEmbed(member)], components: buildCurrentJobRows(member) });
        return true;
      }
      const { patch, detail } = rollSolePropStaffOutcome(u, now);
      patchEconomyUser(member.guild.id, member.id, patch);
      await replyOrUpdate(interaction, {
        embeds: [buildCurrentJobEmbed(member, { tier3ActionNotes: [detail] })],
        components: buildCurrentJobRows(member),
      });
      return true;
    }
    if (id === ECON_IP_CONTROL) {
      if (u.solePropControlReadyAt && now < u.solePropControlReadyAt) {
        await replyOrUpdate(interaction, { embeds: [buildCurrentJobEmbed(member)], components: buildCurrentJobRows(member) });
        return true;
      }
      patchEconomyUser(member.guild.id, member.id, {
        solePropControlMskYmd: mskTodayYmd(now),
        solePropControlReadyAt: now + SOLE_PROP_CONTROL_CD_MS,
      });
      await replyOrUpdate(interaction, {
        embeds: [buildCurrentJobEmbed(member, { tier3ActionNotes: ["Контроль отмечен на текущие календарные сутки."] })],
        components: buildCurrentJobRows(member),
      });
      return true;
    }
    await interaction.reply({ content: "Действие не распознано.", flags: MessageFlags.Ephemeral });
    return true;
  }

  if (id === ECON_TIER3_SIDE || id === ECON_TIER3_BOSS) {
    const u = getEconomyUser(member.guild.id, member.id);
    const now = Date.now();
    if (!u.jobId || !isTier3JobId(u.jobId)) {
      await interaction.reply({ content: "Доступно только на **работе тир-3**.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const jobId = u.jobId;
    const def3 = getTier3JobDef(jobId as Tier3JobId);
    if (def3.archetype === "ip") {
      await interaction.reply({
        content: "На **ИП** нет этих кнопок — **реклама**, **персонал**, **контроль** и переводы **в бизнес / на счёт**.",
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    if (id === ECON_TIER3_SIDE) {
      if (def3.archetype !== "illegal") {
        await interaction.reply({ content: "На **офисе** нет «Связи» — только **Совещание**.", flags: MessageFlags.Ephemeral });
        return true;
      }
      if (u.tier3SideGigReadyAt && now < u.tier3SideGigReadyAt) {
        await replyOrUpdate(interaction, { embeds: [buildCurrentJobEmbed(member)], components: buildCurrentJobRows(member) });
        return true;
      }
      const streak = u.jobMskDayStreak ?? 0;
      let bonus = rubFromTier3MetaPercent(member.guild.id, streak);
      bonus = applyUnregisteredVehiclePenalty(u, bonus);
      updateEconomyUser(member.guild.id, member.id, (cur) => ({
        ...cur,
        rubles: cur.rubles + bonus,
        tier3SideGigReadyAt: now + TIER3_SIDE_GIG_CD_MS,
      }));
      await replyOrUpdate(interaction, {
        embeds: [
          buildCurrentJobEmbed(member, {
            tier3ActionNotes: [`Связь: **${formatDelta(bonus)}** на счёт (10–30% ориентира суточного оклада).`],
          }),
        ],
        components: buildCurrentJobRows(member),
      });
      return true;
    }

    if (id === ECON_TIER3_BOSS) {
      if (u.tier3BossReadyAt && now < u.tier3BossReadyAt) {
        await replyOrUpdate(interaction, { embeds: [buildCurrentJobEmbed(member)], components: buildCurrentJobRows(member) });
        return true;
      }
      if (def3.archetype === "legal") {
        const meeting = applyOfficeMeetingStreak(u.jobMskDayStreak ?? 0);
        patchEconomyUser(member.guild.id, member.id, {
          jobMskDayStreak: meeting.nextStreak,
          tier3BossReadyAt: now + TIER3_BOSS_CD_MS,
        });
        await replyOrUpdate(interaction, {
          embeds: [buildCurrentJobEmbed(member, { tier3ActionNotes: [meeting.detail] })],
          components: buildCurrentJobRows(member),
        });
        return true;
      }
      const streak = u.jobMskDayStreak ?? 0;
      const r = Math.random();
      let delta = 0;
      let detail: string;
      if (r < 0.42) {
        delta = randInt(5, 10);
        detail = `Куратор даёт ход: **+${delta}** дн. к стрику (быстрее к следующему рангу).`;
      } else if (r < 0.78) {
        delta = randInt(2, 4);
        detail = `Куратор подталкивает: **+${delta}** дн. к стрику.`;
      } else {
        detail = "Куратор на связи — **без изменений** по стрику.";
      }
      const nextStreak = streak + delta;
      patchEconomyUser(member.guild.id, member.id, {
        jobMskDayStreak: nextStreak,
        tier3BossReadyAt: now + TIER3_BOSS_CD_MS,
      });
      await replyOrUpdate(interaction, {
        embeds: [buildCurrentJobEmbed(member, { tier3ActionNotes: [detail] })],
        components: buildCurrentJobRows(member),
      });
      return true;
    }

    await interaction.reply({ content: "Действие не распознано.", flags: MessageFlags.Ephemeral });
    return true;
  }

  if (id.startsWith(ECON_WORK_BUTTON_JOB_DETAIL_PREFIX)) {
    const raw = id.slice(ECON_WORK_BUTTON_JOB_DETAIL_PREFIX.length);
    if (!isWorkJobId(raw)) {
      await interaction.reply({ content: "Неизвестная профессия.", flags: MessageFlags.Ephemeral });
      return true;
    }
    await replyOrUpdate(interaction, { embeds: [buildJobDetailEmbed(member, raw)], components: buildJobDetailRows(raw) });
    return true;
  }

  if (id.startsWith(ECON_WORK_BUTTON_JOB_DETAIL_CLOSE_PREFIX)) {
    const raw = id.slice(ECON_WORK_BUTTON_JOB_DETAIL_CLOSE_PREFIX.length);
    if (!isWorkJobId(raw)) {
      await interaction.reply({ content: "Неизвестная профессия.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const uClose = getEconomyUser(member.guild.id, member.id);
    if (uClose.jobId === raw) {
      await replyOrUpdate(interaction, { embeds: [buildCurrentJobEmbed(member)], components: buildCurrentJobRows(member) });
    } else {
      const defC = getAnyJobDef(raw);
      const reqC = meetsJobReq(uClose, defC);
      await replyOrUpdate(interaction, { embeds: [buildJobInfoEmbed(member, raw)], components: buildJobInfoRows(member, raw, reqC.ok) });
    }
    return true;
  }

  if (id.startsWith(ECON_WORK_BUTTON_JOB_PREFIX)) {
    const raw = id.slice(ECON_WORK_BUTTON_JOB_PREFIX.length);
    if (!isWorkJobId(raw)) {
      await interaction.reply({ content: "Неизвестная профессия.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const jobId = raw;
    const u = getEconomyUser(member.guild.id, member.id);
    const def = getAnyJobDef(jobId);
    const req = meetsJobReq(u, def);
    await replyOrUpdate(interaction, { embeds: [buildJobInfoEmbed(member, jobId)], components: buildJobInfoRows(member, jobId, req.ok) });
    return true;
  }

  if (id.startsWith(ECON_WORK_BUTTON_TAKE_PREFIX)) {
    const raw = id.slice(ECON_WORK_BUTTON_TAKE_PREFIX.length);
    if (!isWorkJobId(raw)) {
      await interaction.reply({ content: "Неизвестная профессия.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const jobId = raw;
    const cur = getEconomyUser(member.guild.id, member.id);
    const def = getAnyJobDef(jobId);
    const req = meetsJobReq(cur, def);
    if (!req.ok) {
      await interaction.reply({ content: `Не хватает навыков:\n- ${req.missing.join("\n- ")}`, flags: MessageFlags.Ephemeral });
      return true;
    }
    const nowTake = Date.now();
    if ((isTier2JobId(jobId) || isTier3PanelJob(jobId)) && !hasTier2PlusHousing(cur, nowTake)) {
      await interaction.reply({
        content: "Сначала оформите **жильё** (аренда или своя квартира) в магазине терминала — **обязательное** условие для профессий **ур. 2+**.",
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    if (cur.jobId) {
      const st = canWorkNow(cur, cur.jobId, Date.now());
      if (!st.ok) {
        await replyOrUpdate(interaction, { embeds: [buildCooldownBlockedEmbed(member, st.msLeft)], components: buildWorkMenuRows(member) });
        return true;
      }
      if (cur.jobId !== jobId) {
        await replyOrUpdate(interaction, {
          embeds: [buildSwitchJobConfirmEmbed(member, jobId)],
          components: buildSwitchJobConfirmRows(jobId),
        });
        return true;
      }
      await replyOrUpdate(interaction, { embeds: [buildCurrentJobEmbed(member)], components: buildCurrentJobRows(member) });
      return true;
    }

    const curTake = getEconomyUser(member.guild.id, member.id);
    patchEconomyUser(member.guild.id, member.id, {
      jobId,
      jobChosenAt: Date.now(),
      ...tier3PatchWhenJobChanges(curTake, jobId),
    });
    await replyOrUpdate(interaction, { embeds: [buildCurrentJobEmbed(member)], components: buildCurrentJobRows(member) });
    return true;
  }

  if (id.startsWith(ECON_WORK_BUTTON_SWITCH_CONFIRM_PREFIX)) {
    const raw = id.slice(ECON_WORK_BUTTON_SWITCH_CONFIRM_PREFIX.length);
    if (!isWorkJobId(raw)) {
      await interaction.reply({ content: "Неизвестная профессия.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const jobId = raw;
    const cur = getEconomyUser(member.guild.id, member.id);
    const def = getAnyJobDef(jobId);
    const req = meetsJobReq(cur, def);
    if (!req.ok) {
      await interaction.reply({ content: `Не хватает навыков:\n- ${req.missing.join("\n- ")}`, flags: MessageFlags.Ephemeral });
      return true;
    }
    const nowSw = Date.now();
    if ((isTier2JobId(jobId) || isTier3PanelJob(jobId)) && !hasTier2PlusHousing(cur, nowSw)) {
      await interaction.reply({
        content: "Сначала оформите **жильё** (аренда или своя квартира) в магазине терминала — **обязательное** условие для профессий **ур. 2+**.",
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    if (!cur.jobId) {
      patchEconomyUser(member.guild.id, member.id, {
        jobId,
        jobChosenAt: Date.now(),
        ...tier3PatchWhenJobChanges(cur, jobId),
      });
      await replyOrUpdate(interaction, { embeds: [buildCurrentJobEmbed(member)], components: buildCurrentJobRows(member) });
      return true;
    }

    const st = canWorkNow(cur, cur.jobId, Date.now());
    if (!st.ok) {
      await replyOrUpdate(interaction, { embeds: [buildCooldownBlockedEmbed(member, st.msLeft)], components: buildWorkMenuRows(member) });
      return true;
    }
    if (cur.jobId === jobId) {
      await replyOrUpdate(interaction, { embeds: [buildCurrentJobEmbed(member)], components: buildCurrentJobRows(member) });
      return true;
    }

    patchEconomyUser(member.guild.id, member.id, {
      jobId,
      jobChosenAt: Date.now(),
      ...tier3PatchWhenJobChanges(cur, jobId),
    });
    await replyOrUpdate(interaction, { embeds: [buildCurrentJobEmbed(member)], components: buildCurrentJobRows(member) });
    return true;
  }

  if (id === ECON_WORK_BUTTON_QUIT) {
    const u = getEconomyUser(member.guild.id, member.id);
    if (!u.jobId) {
      await replyOrUpdate(interaction, { embeds: [buildCurrentJobEmbed(member)], components: buildCurrentJobRows(member) });
      return true;
    }
    const st = canWorkNow(u, u.jobId, Date.now());
    if (!st.ok) {
      await replyOrUpdate(interaction, { embeds: [buildCooldownBlockedEmbed(member, st.msLeft)], components: buildWorkMenuRows(member) });
      return true;
    }
    const embed = new EmbedBuilder()
      .setColor(PANEL_COLOR)
      .setTitle("Увольнение")
      .setDescription(`Вы уверены, что хотите уволиться с работы **${jobTitle(u.jobId)}**?`);
    await replyOrUpdate(interaction, {
      embeds: [embed],
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId(ECON_WORK_BUTTON_QUIT_CONFIRM).setLabel("Да, уволиться").setStyle(ButtonStyle.Danger),
        ),
        shopNavBottomRow(ECON_BUTTON_WORK, "Отменить"),
      ],
    });
    return true;
  }

  if (id === ECON_WORK_BUTTON_QUIT_CONFIRM) {
    const u = getEconomyUser(member.guild.id, member.id);
    if (u.jobId) {
      const st = canWorkNow(u, u.jobId, Date.now());
      if (!st.ok) {
        await replyOrUpdate(interaction, { embeds: [buildCooldownBlockedEmbed(member, st.msLeft)], components: buildWorkMenuRows(member) });
        return true;
      }
    }
    const uQuit = getEconomyUser(member.guild.id, member.id);
    patchEconomyUser(member.guild.id, member.id, {
      jobId: undefined,
      jobChosenAt: undefined,
      lastWorkAtByJob: undefined,
      ...tier3PatchWhenJobChanges(uQuit, undefined),
    });
    await replyOrUpdate(interaction, { embeds: [buildWorkMenuEmbed(member)], components: buildWorkMenuRows(member) });
    return true;
  }

  if (id === ECON_WORK_BUTTON_SHIFT) {
    const r = await economyRunWorkShift(interaction.client, member);
    if (!r.ok) {
      if (r.kind === "ephemeral") {
        await interaction.reply({ content: r.message, flags: MessageFlags.Ephemeral });
      } else {
        await replyOrUpdate(interaction, { embeds: [buildCurrentJobEmbed(member)], components: buildCurrentJobRows(member) });
      }
      return true;
    }
    const embed = buildCurrentJobEmbed(member, { lastShiftDeltaRub: r.walletDeltaRub, lastShiftNotes: r.notes });
    await replyOrUpdate(interaction, { embeds: [embed], components: buildCurrentJobRows(member) });
    return true;
  }

  if (id === ECON_BUTTON_SKILLS) {
    await replyOrUpdate(interaction, { embeds: [buildSkillsEmbed(member)], components: buildSkillsRows(member) });
    return true;
  }

  if (id === ECON_SKILLS_DETAILS) {
    await replyOrUpdate(interaction, {
      embeds: [buildSkillsDetailsEmbed(member)],
      components: [shopNavBottomRow(ECON_BUTTON_SKILLS)],
    });
    return true;
  }

  if (id.startsWith(ECON_SKILL_BUTTON_PREFIX)) {
    const skillId = id.slice(ECON_SKILL_BUTTON_PREFIX.length) as SkillId;
    const tr = economyRunTrainSkill(member, skillId);
    if (!tr.ok) {
      if (tr.kind === "unknown_skill") {
        await interaction.reply({ content: "Неизвестный навык.", flags: MessageFlags.Ephemeral });
      } else {
        await replyOrUpdate(interaction, { embeds: [buildSkillsEmbed(member)], components: buildSkillsRows(member) });
      }
      return true;
    }
    await replyOrUpdate(interaction, { embeds: [buildSkillsEmbed(member)], components: buildSkillsRows(member) });
    return true;
  }

  if (id === ECON_FEED_BUTTON_ARCHIVE) {
    const page = 1;
    const { embed, totalPages } = buildFeedArchiveEmbed(member.guild.id, page);
    await interaction.reply({
      embeds: [embed],
      components: buildFeedArchiveRows(page, totalPages),
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  if (id.startsWith(ECON_FEED_BUTTON_PAGE_PREFIX)) {
    const raw = id.slice(ECON_FEED_BUTTON_PAGE_PREFIX.length);
    const page = Number.parseInt(raw, 10);
    const safePage = Number.isFinite(page) && page > 0 ? page : 1;
    const { embed, totalPages } = buildFeedArchiveEmbed(member.guild.id, safePage);
    await interaction.update({
      embeds: [embed],
      components: buildFeedArchiveRows(Math.min(Math.max(1, safePage), totalPages), totalPages),
    });
    return true;
  }

  if (id === ECON_BUTTON_PLAYERS) {
    await replyOrUpdate(interaction, { embeds: [buildPlayersMenuEmbed()], components: buildPlayersMenuRows() });
    return true;
  }

  if (id === ECON_PLAYERS_BUTTON_TOP_PS) {
    const e = await buildTopEmbed(member, "ps");
    await replyOrUpdate(interaction, {
      embeds: [e],
      components: [shopNavBottomRow(ECON_BUTTON_PLAYERS)],
    });
    return true;
  }

  if (id === ECON_PLAYERS_BUTTON_TOP_RUB) {
    const e = await buildTopEmbed(member, "rub");
    await replyOrUpdate(interaction, {
      embeds: [e],
      components: [shopNavBottomRow(ECON_BUTTON_PLAYERS)],
    });
    return true;
  }

  return false;
}

export async function handleEconomyModal(interaction: ModalSubmitInteraction): Promise<boolean> {
  const modalId = interaction.customId;

  if (modalId.startsWith(ECON_MODAL_PET_RENAME_PREFIX)) {
    if (!interaction.inGuild() || !interaction.guildId || !interaction.member) {
      await interaction.reply({ content: "Эта форма работает только на сервере.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const mem = interaction.member as GuildMember;
    if (mem.user.bot) {
      await interaction.reply({ content: "Ботам экономика не положена.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const uid = modalId.slice(ECON_MODAL_PET_RENAME_PREFIX.length);
    const r = renameOwnedPet(mem, uid, interaction.fields.getTextInputValue("name"));
    if (!r.ok) {
      await interaction.reply({ content: r.reply, flags: MessageFlags.Ephemeral });
      return true;
    }
    const emb = buildShopPetViewEmbed(mem, uid);
    try {
      await interaction.deferUpdate();
      if (emb) {
        await interaction.editReply({ embeds: [emb], components: buildShopPetViewRows(uid) });
      }
    } catch (e) {
      console.error("pet rename modal:", e);
      await interaction.followUp({ content: `Имя сохранено: **${r.name}**.`, flags: MessageFlags.Ephemeral });
    }
    return true;
  }

  if (modalId === ECON_MODAL_LOTTERY_QTY) {
    if (!interaction.inGuild() || !interaction.guildId || !interaction.member) {
      await interaction.reply({ content: "Эта форма работает только на сервере.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const mem = interaction.member as GuildMember;
    if (mem.user.bot) {
      await interaction.reply({ content: "Ботам экономика не положена.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const qty = parseLotteryQtyInput(interaction.fields.getTextInputValue("qty"));
    if (qty == null) {
      await interaction.reply({
        content: "Введите **целое число** от **1** до **500** (только цифры).",
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }
    const confirmPayload = {
      embeds: [buildLotteryConfirmEmbed(mem, qty)],
      components: buildLotteryConfirmRows(qty),
    };
    try {
      await interaction.deferUpdate();
      await interaction.editReply(confirmPayload);
      return true;
    } catch (e) {
      console.error("lottery modal: deferUpdate+editReply failed:", e);
      if (!interaction.deferred && !interaction.replied) {
        await interaction.reply({ ...confirmPayload, flags: MessageFlags.Ephemeral });
      } else {
        await interaction.followUp({
          content: "Не удалось обновить меню. Нажмите **Купить** ещё раз.",
          flags: MessageFlags.Ephemeral,
        });
      }
    }
    return true;
  }

  if (modalId === ECON_MODAL_SIM_TOPUP) {
    if (!interaction.inGuild() || !interaction.guildId || !interaction.member) {
      await interaction.reply({ content: "Эта форма работает только на сервере.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const mem = interaction.member as GuildMember;
    if (mem.user.bot) {
      await interaction.reply({ content: "Ботам экономика не положена.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const rawIn = interaction.fields.getTextInputValue("amount").trim().replace(/\s/g, "").replace(",", ".");
    const amount = Math.floor(Number(rawIn));
    if (!Number.isFinite(amount) || amount < 1) {
      await interaction.reply({ content: "Введите целое число **от 1 ₽**.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const u = getEconomyUser(mem.guild.id, mem.id);
    if (!u.hasPhone || !userHasSimNumber(u)) {
      await interaction.reply({ content: "Нужны телефон и активная симка.", flags: MessageFlags.Ephemeral });
      return true;
    }
    let toppedUp = false;
    let rubBalance = 0;
    updateEconomyUser(mem.guild.id, mem.id, (cur) => {
      rubBalance = cur.rubles;
      if (cur.rubles < amount) return cur;
      toppedUp = true;
      return {
        ...cur,
        rubles: cur.rubles - amount,
        simBalanceRub: (cur.simBalanceRub ?? 0) + amount,
      };
    });
    if (!toppedUp) {
      await interaction.reply({ content: `На счёте только **${fmt(rubBalance)} ₽**.`, flags: MessageFlags.Ephemeral });
      return true;
    }
    remitShopPurchaseVatToTreasury(mem.guild.id, amount);
    await interaction.reply({
      embeds: [buildShopSimEmbed(mem)],
      components: buildShopSimRows(mem),
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  if (modalId === ECON_MODAL_IP_CALC) {
    if (!interaction.inGuild() || !interaction.guildId || !interaction.member) {
      await interaction.reply({ content: "Калькулятор работает только на сервере.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const mem = interaction.member as GuildMember;
    const raw = interaction.fields.getTextInputValue("amount").trim().replace(/\s/g, "").replace(",", ".");
    const capital = Math.floor(Number(raw));
    if (!Number.isFinite(capital) || capital < 0 || capital > SOLE_PROP_CAP_MAX) {
      await interaction.reply({
        content: `Введите целое число от **0** до **${fmt(SOLE_PROP_CAP_MAX)}** ₽.`,
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }
    const payload = {
      embeds: [buildSolePropCalculatorEmbed(mem, capital)],
      components: buildSolePropCalculatorRows(),
    };
    try {
      await interaction.deferUpdate();
      await interaction.editReply(payload);
    } catch (error) {
      console.error("sole prop calculator: update source message failed:", error);
      if (!interaction.deferred && !interaction.replied) {
        await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
      }
    }
    return true;
  }

  if (modalId === ECON_MODAL_IP_AD || modalId === ECON_MODAL_IP_DEP || modalId === ECON_MODAL_IP_WD) {
    if (!interaction.inGuild() || !interaction.guildId || !interaction.member) {
      await interaction.reply({ content: "Эта форма работает только на сервере.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const mem = interaction.member as GuildMember;
    if (mem.user.bot) {
      await interaction.reply({ content: "Ботам экономика не положена.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const u = getEconomyUser(mem.guild.id, mem.id);
    if (u.jobId !== "soleProp") {
      await interaction.reply({ content: "Формы **ИП** доступны только на работе **ИП**.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const rawIn = interaction.fields.getTextInputValue("amount").trim().replace(/\s/g, "").replace(",", ".");
    const amount = Math.floor(Number(rawIn));
    if (!Number.isFinite(amount) || amount < 1) {
      await interaction.reply({ content: "Введите целое число **от 1 ₽**.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const now = Date.now();
    if (modalId === ECON_MODAL_IP_AD) {
      if (u.solePropAdvertReadyAt && now < u.solePropAdvertReadyAt) {
        await interaction.reply({ content: "Реклама ещё на перезарядке.", flags: MessageFlags.Ephemeral });
        return true;
      }
      const maxAd = solePropAdMaxRub(mem.guild.id, u.jobMskDayStreak ?? 0);
      const biz = u.solePropCapitalRub ?? 0;
      const out = solePropAdvertOutcome(mem.guild.id, biz, amount, maxAd);
      if (!out.ok && out.delta === 0) {
        await interaction.reply({ content: out.detail, flags: MessageFlags.Ephemeral });
        return true;
      }
      const nextBiz = Math.max(0, biz + out.delta);
      patchEconomyUser(mem.guild.id, mem.id, {
        solePropCapitalRub: nextBiz,
        solePropAdvertReadyAt: now + SOLE_PROP_AD_CD_MS,
      });
      await interaction.reply({
        embeds: [buildCurrentJobEmbed(mem, { tier3ActionNotes: [out.detail] })],
        components: buildCurrentJobRows(mem),
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }
    if (modalId === ECON_MODAL_IP_DEP) {
      let deposited = false;
      let rubBalance = 0;
      updateEconomyUser(mem.guild.id, mem.id, (cur) => {
        rubBalance = cur.rubles;
        if (cur.rubles < amount) return cur;
        deposited = true;
        return {
          ...cur,
          rubles: cur.rubles - amount,
          solePropCapitalRub: (cur.solePropCapitalRub ?? 0) + amount,
        };
      });
      if (!deposited) {
        await interaction.reply({ content: `На счёте только **${fmt(rubBalance)}** ₽.`, flags: MessageFlags.Ephemeral });
        return true;
      }
      await interaction.reply({
        embeds: [buildCurrentJobEmbed(mem, { tier3ActionNotes: [`На баланс бизнеса переведено **${fmt(amount)}** ₽.`] })],
        components: buildCurrentJobRows(mem),
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }
    const bizW = u.solePropCapitalRub ?? 0;
    if (amount > bizW) {
      await interaction.reply({ content: `В бизнесе только **${fmt(bizW)}** ₽.`, flags: MessageFlags.Ephemeral });
      return true;
    }
    const gid = mem.guild.id;
    const { toPersonalRub, feeToTreasuryRub } = solePropWithdrawWithFee(gid, amount);
    let withdrawn = false;
    updateEconomyUser(mem.guild.id, mem.id, (cur) => {
      const bizNow = cur.solePropCapitalRub ?? 0;
      if (bizNow < amount) return cur;
      withdrawn = true;
      return {
        ...cur,
        rubles: cur.rubles + toPersonalRub,
        solePropCapitalRub: bizNow - amount,
      };
    });
    if (!withdrawn) {
      await interaction.reply({ content: "Баланс бизнеса изменился, проверьте сумму и повторите.", flags: MessageFlags.Ephemeral });
      return true;
    }
    if (feeToTreasuryRub > 0) addToTreasury(gid, feeToTreasuryRub);
    const feeLine =
      feeToTreasuryRub > 0
        ? ` Комиссия учтена; на счёт **${fmt(toPersonalRub)}** ₽.`
        : ` На счёт **${fmt(toPersonalRub)}** ₽.`;
    await interaction.reply({
      embeds: [buildCurrentJobEmbed(mem, { tier3ActionNotes: [`Вывод с бизнеса **${fmt(amount)}** ₽.${feeLine}`] })],
      components: buildCurrentJobRows(mem),
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  return false;
}

