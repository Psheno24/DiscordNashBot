import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
} from "discord.js";
import { quoteShopPrice } from "../economy/economyMacro.js";
import {
  SHOP_CUSTOM_LIMIT,
  SHOP_FOLDER_LIMIT,
  SHOP_MENU_DEFS,
  addCustomItem,
  addShopFolder,
  catalogItemHidden,
  catalogItemSection,
  customItemOf,
  itemShopFolderId,
  listCatalogAdminItems,
  listShopFolders,
  menuHidden,
  menuLabel,
  placeShopItem,
  removeCustomItem,
  removeShopFolder,
  renameShopFolder,
  setCatalogHidden,
  setCatalogLabel,
  setMenuPatch,
  setShopFolderHidden,
  shopFolder,
  updateCustomStats,
} from "../economy/shopCatalog.js";
import { listEconomyUsers } from "../economy/userStore.js";
import type { ShopCatalogKind } from "../guildConfig/store.js";
import { setShopPriceOverride, shopPriceBase } from "../economy/shopPrices.js";
import { isGuildOwner } from "./adminHub.js";
import { NEURO_SETTINGS_SHOP } from "./shopPricesAdmin.js";

export const NEURO_CATALOG = "neuro:shop:catalog";
const CAT_GOODS = "neuro:cat:goods";
const CAT_MENUS = "neuro:cat:menus";
const CAT_KIND = "neuro:cat:k:";
const CAT_ADD = "neuro:cat:add:";
const CAT_ITEM = "neuro:cat:i:";
const CAT_HIDE = "neuro:cat:h:";
const CAT_DEL = "neuro:cat:d:";
const CAT_EDIT = "neuro:cat:e:";
const CAT_MENU_ITEM = "neuro:cat:mi:";
const CAT_MENU_HIDE = "neuro:cat:mh:";
const CAT_MENU_EDIT = "neuro:cat:me:";
const SEL_KIND = "neuro:cat:sel:";
const SEL_MENU = "neuro:cat:selmenu";
const CAT_FOLDS = "neuro:cat:folds";
const CAT_FSEC = "neuro:cat:fsec:";
const CAT_FOPEN = "neuro:cat:fopen:";
const CAT_FADD = "neuro:cat:fadd:";
const CAT_FSUB = "neuro:cat:fsub:";
const CAT_FREN = "neuro:cat:fren:";
const CAT_FHIDE = "neuro:cat:fhide:";
const CAT_FDEL = "neuro:cat:fdel:";
const SEL_FOLD = "neuro:cat:fsel:";
const SEL_MOVE = "neuro:cat:fmov:";
const MODAL_FOLD = "modal:neuro:catFold:";
const MODAL_ADD = "modal:neuro:catAdd:";
const MODAL_EDIT = "modal:neuro:catEdit:";
const MODAL_MENU = "modal:neuro:catMenu:";

const COLOR = 0x2b2d31;

const KINDS: { id: ShopCatalogKind; label: string }[] = [
  { id: "phone", label: "Телефоны" },
  { id: "car", label: "Авто" },
  { id: "apt", label: "Квартиры" },
  { id: "pet", label: "Животные" },
];

function canManage(interaction: ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction): boolean {
  return isGuildOwner(interaction);
}

function fmt(n: number): string {
  return n.toLocaleString("ru-RU");
}

function isKind(id: string): id is ShopCatalogKind {
  return KINDS.some((k) => k.id === id);
}

function kindOfId(guildId: string, id: string): ShopCatalogKind | undefined {
  if (customItemOf(guildId, id)) return customItemOf(guildId, id)?.kind;
  if (id.startsWith("phone_")) return "phone";
  if (id.startsWith("car_")) return "car";
  if (id.startsWith("apt_")) return "apt";
  if (id.startsWith("pet_")) return "pet";
  if (id.startsWith("cph_")) return "phone";
  if (id.startsWith("ccr_")) return "car";
  if (id.startsWith("cap_")) return "apt";
  if (id.startsWith("cpt_")) return "pet";
  return undefined;
}

function priceKey(kind: ShopCatalogKind, id: string): string {
  if (kind === "phone") return `phone:${id}`;
  if (kind === "car") return `car:${id}`;
  if (kind === "apt") return `apt:${id}`;
  return `pet:${id}`;
}

function ownedAnywhere(guildId: string, id: string): boolean {
  for (const { user } of listEconomyUsers(guildId)) {
    if (user.ownedPhones?.some((p) => p.id === id)) return true;
    if (user.ownedCars?.some((c) => c.id === id)) return true;
    if (user.ownedApartments?.some((a) => a.id === id)) return true;
    if (user.ownedPets?.some((p) => p.id === id)) return true;
    if (user.phoneModelId === id || user.ownedCarId === id || user.ownedApartmentId === id || user.ownedForeignApartmentId === id || user.ownedPetId === id) {
      return true;
    }
  }
  return false;
}

async function show(
  interaction: ButtonInteraction | ModalSubmitInteraction,
  payload: { embeds: EmbedBuilder[]; components: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] },
): Promise<void> {
  if (interaction.isModalSubmit()) {
    if (interaction.isFromMessage() && interaction.message) {
      await interaction.update(payload);
      return;
    }
    await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
    return;
  }
  const ephemeral = Boolean(interaction.message?.flags?.has(MessageFlags.Ephemeral));
  if (interaction.message && ephemeral) {
    await interaction.update(payload);
    return;
  }
  await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
}

function rootPayload(note?: string) {
  const lines = [
    "Скрыть, вернуть, переименовать и добавить товары.",
    "Категории — свои ветки и подкатегории, перенос товаров.",
    "Пункты меню терминала и магазина — отдельно: имя и видимость.",
    `Своих товаров в одном разделе — до **${SHOP_CUSTOM_LIMIT}**.`,
    "Уже купленное остаётся у игрока. Удалить свой товар можно, пока его ни у кого нет.",
  ];
  if (note) lines.unshift(note, "");
  return {
    embeds: [new EmbedBuilder().setColor(COLOR).setTitle("Состав магазина").setDescription(lines.join("\n"))],
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(CAT_GOODS).setLabel("Товары").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(CAT_FOLDS).setLabel("Категории").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(CAT_MENUS).setLabel("Пункты меню").setStyle(ButtonStyle.Secondary),
      ),
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(NEURO_SETTINGS_SHOP).setLabel("К ценам").setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

function goodsPayload() {
  return {
    embeds: [new EmbedBuilder().setColor(COLOR).setTitle("Товары").setDescription("Раздел, затем позиция.")],
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        ...KINDS.map((k) => new ButtonBuilder().setCustomId(`${CAT_KIND}${k.id}`).setLabel(k.label).setStyle(ButtonStyle.Secondary)),
      ),
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(NEURO_CATALOG).setLabel("Назад").setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

function kindPayload(guildId: string, kind: ShopCatalogKind, note?: string) {
  const title = KINDS.find((k) => k.id === kind)?.label ?? "Товары";
  const items = listCatalogAdminItems(guildId, kind).slice(0, 25);
  const lines = ["Выбери позицию или добавь свою.", "Скрытая не продаётся. Имя и база цены — в карточке."];
  if (note) lines.unshift(note, "");
  const rows: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] = [];
  if (items.length > 0) {
    rows.push(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`${SEL_KIND}${kind}`)
          .setPlaceholder("Позиция")
          .addOptions(
            items.map((item) => ({
              label: `${item.hidden ? "скрыт · " : ""}${item.custom ? "свой · " : ""}${item.label}`.slice(0, 100),
              value: item.id,
              description: `${fmt(quoteShopPrice(guildId, priceKey(kind, item.id)))} ₽`.slice(0, 100),
            })),
          ),
      ),
    );
  }
  rows.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`${CAT_ADD}${kind}`).setLabel("Добавить").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(CAT_GOODS).setLabel("Назад").setStyle(ButtonStyle.Secondary),
    ),
  );
  return {
    embeds: [new EmbedBuilder().setColor(COLOR).setTitle(`Товары · ${title}`).setDescription(lines.join("\n"))],
    components: rows,
  };
}

function itemPayload(guildId: string, id: string, note?: string) {
  const kind = kindOfId(guildId, id);
  if (!kind) return goodsPayload();
  const row = listCatalogAdminItems(guildId, kind).find((item) => item.id === id);
  const custom = customItemOf(guildId, id);
  const hidden = catalogItemHidden(guildId, id);
  const lines = [
    `**${row?.label ?? custom?.label ?? id}**`,
    `База: **${fmt(shopPriceBase(guildId, priceKey(kind, id)))}** ₽ · к оплате **${fmt(quoteShopPrice(guildId, priceKey(kind, id)))}** ₽`,
    hidden ? "Сейчас **скрыт** из продажи." : "Сейчас **в продаже**.",
  ];
  if (custom?.kind === "car") lines.push(`Скорость **${custom.speedKmh ?? "—"}** км/ч · КД доставки **${custom.courierShiftHours ?? "—"}** ч`);
  if (custom?.kind === "apt") lines.push(`ЖКХ: **${fmt(custom.monthlyUtilityRub ?? 0)}** ₽`);
  if (custom?.kind === "pet") lines.push(`Содержание **${fmt(custom.dailyUpkeepRub ?? 0)}** ₽ · СР **${fmt(custom.dailyPsRub ?? 0)}**`);
  if (!custom) lines.push("Статы встроенной модели не меняются. Цена, имя и витрина — да.");
  if (note) lines.unshift(note, "");
  const buttons = [
    new ButtonBuilder().setCustomId(`${CAT_EDIT}${id}`).setLabel("Имя и цена").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`${CAT_HIDE}${id}`).setLabel(hidden ? "В продажу" : "Скрыть").setStyle(ButtonStyle.Secondary),
  ];
  if (custom) buttons.push(new ButtonBuilder().setCustomId(`${CAT_DEL}${id}`).setLabel("Удалить").setStyle(ButtonStyle.Danger));
  return {
    embeds: [new EmbedBuilder().setColor(COLOR).setTitle("Товар").setDescription(lines.join("\n"))],
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons),
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`${CAT_KIND}${kind}`).setLabel("К списку").setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

function menusPayload(guildId: string, note?: string) {
  const lines = ["Имя кнопки и можно ли её показывать. Скрытый пункт не рисуется, старые сообщения с ним ещё открываются."];
  if (note) lines.unshift(note, "");
  return {
    embeds: [new EmbedBuilder().setColor(COLOR).setTitle("Пункты меню").setDescription(lines.join("\n"))],
    components: [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(SEL_MENU)
          .setPlaceholder("Пункт")
          .addOptions(
            SHOP_MENU_DEFS.slice(0, 25).map((item) => ({
              label: `${menuHidden(guildId, item.id) ? "скрыт · " : ""}${item.group}: ${menuLabel(guildId, item.id)}`.slice(0, 100),
              value: item.id,
              description: item.fallback.slice(0, 100),
            })),
          ),
      ),
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(NEURO_CATALOG).setLabel("Назад").setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

function menuItemPayload(guildId: string, id: string, note?: string) {
  const def = SHOP_MENU_DEFS.find((item) => item.id === id);
  if (!def) return menusPayload(guildId);
  const hidden = menuHidden(guildId, id);
  const lines = [`**${def.group}**`, `Сейчас: **${menuLabel(guildId, id)}**`, hidden ? "Кнопка **скрыта**." : "Кнопка **видна**.", `Умолчание: ${def.fallback}`];
  if (note) lines.unshift(note, "");
  return {
    embeds: [new EmbedBuilder().setColor(COLOR).setTitle("Пункт меню").setDescription(lines.join("\n"))],
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`${CAT_MENU_EDIT}${id}`).setLabel("Переименовать").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`${CAT_MENU_HIDE}${id}`).setLabel(hidden ? "Показать" : "Скрыть").setStyle(ButtonStyle.Secondary),
      ),
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(CAT_MENUS).setLabel("К списку").setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

function parseRub(raw: string): number | null | undefined {
  const s = raw.trim().toLowerCase().replace(/\s/g, "").replace(",", ".");
  if (s === "сброс" || s === "-") return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0 || n > 1_000_000_000_000) return undefined;
  return Math.floor(n);
}

function parseOrigin(raw: string): "soviet" | "foreign" | undefined {
  const s = raw.trim().toLowerCase();
  if (s.startsWith("сов") || s === "с" || s === "soviet") return "soviet";
  if (s.startsWith("зам") || s === "з" || s === "foreign") return "foreign";
  return undefined;
}

function parseNum(raw: string, min: number, max: number): number | undefined {
  const n = Number(raw.trim().replace(/\s/g, "").replace(",", "."));
  if (!Number.isFinite(n) || n < min || n > max) return undefined;
  return n;
}

function field(id: string, label: string, value: string, required = true): ActionRowBuilder<TextInputBuilder> {
  const input = new TextInputBuilder()
    .setCustomId(id)
    .setLabel(label.slice(0, 45))
    .setStyle(TextInputStyle.Short)
    .setRequired(required)
    .setMaxLength(80);
  const text = value.replace(/\s+/g, " ").trim().slice(0, 80);
  if (text) input.setValue(text);
  return new ActionRowBuilder<TextInputBuilder>().addComponents(input);
}

function folderOptionLabel(guildId: string, folderId: string): string {
  const folder = shopFolder(guildId, folderId);
  if (!folder) return folderId;
  const parent = folder.parentId ? shopFolder(guildId, folder.parentId) : undefined;
  const path = parent ? `${parent.label} / ${folder.label}` : folder.label;
  return `${folder.hidden ? "скрыта · " : ""}${path}`.slice(0, 100);
}

function foldsHome() {
  return {
    embeds: [
      new EmbedBuilder()
        .setColor(COLOR)
        .setTitle("Категории")
        .setDescription(
          [
            "Раздел, затем категория.",
            "Новая категория встаёт рядом с **Советское** и **Заморское**.",
            "Подкатегория создаётся внутри выбранной.",
            `Своих категорий в разделе — до **${SHOP_FOLDER_LIMIT}**.`,
            "Товар без переноса остаётся в своей ветке. Статы советского и заморского не меняются.",
          ].join("\n"),
        ),
    ],
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        ...KINDS.map((kind) => new ButtonBuilder().setCustomId(`${CAT_FSEC}${kind.id}`).setLabel(kind.label).setStyle(ButtonStyle.Secondary)),
      ),
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(NEURO_CATALOG).setLabel("Назад").setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

function foldSectionPayload(guildId: string, section: ShopCatalogKind, note?: string) {
  const title = KINDS.find((kind) => kind.id === section)?.label ?? "Категории";
  const folders = listShopFolders(guildId, section).slice(0, 25);
  const lines = ["Выбери категорию или создай новую рядом с Советским и Заморским."];
  if (note) lines.unshift(note, "");
  const rows: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] = [];
  if (folders.length > 0) {
    rows.push(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`${SEL_FOLD}${section}`)
          .setPlaceholder("Категория")
          .addOptions(folders.map((folder) => ({ label: folderOptionLabel(guildId, folder.id), value: folder.id }))),
      ),
    );
  }
  rows.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`${CAT_FADD}${section}`).setLabel("Новая категория").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(CAT_FOLDS).setLabel("Назад").setStyle(ButtonStyle.Secondary),
    ),
  );
  return {
    embeds: [new EmbedBuilder().setColor(COLOR).setTitle(`Категории · ${title}`).setDescription(lines.join("\n"))],
    components: rows,
  };
}

function foldCard(guildId: string, folderId: string, note?: string) {
  const folder = shopFolder(guildId, folderId);
  if (!folder) return foldsHome();
  const lines = [
    `**${folderOptionLabel(guildId, folder.id)}**`,
    folder.builtin ? "Встроенная ветка. Её можно переименовать и скрыть." : "Своя категория.",
    folder.hidden ? "Сейчас **скрыта**." : "Сейчас **видна** в магазине.",
    "Перенос кладёт товар в эту категорию. Убрать — возвращает в свою ветку.",
  ];
  if (note) lines.unshift(note, "");
  const items = listCatalogAdminItems(guildId, folder.section).slice(0, 25);
  const here = items.filter((item) => itemFolderHere(guildId, item.id, folder.id));
  const rows: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] = [];
  if (items.length > 0) {
    rows.push(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`${SEL_MOVE}${folder.id}`)
          .setPlaceholder("Перенести сюда")
          .addOptions(
            items.map((item) => ({
              label: `${itemFolderHere(guildId, item.id, folder.id) ? "здесь · " : ""}${item.label}`.slice(0, 100),
              value: item.id,
            })),
          ),
      ),
    );
  }
  if (here.length > 0) {
    rows.push(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`${SEL_MOVE}out:${folder.id}`)
          .setPlaceholder("Убрать отсюда")
          .addOptions(here.map((item) => ({ label: item.label.slice(0, 100), value: `out:${item.id}` }))),
      ),
    );
  }
  const buttons = [
    new ButtonBuilder().setCustomId(`${CAT_FREN}${folder.id}`).setLabel("Переименовать").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`${CAT_FHIDE}${folder.id}`).setLabel(folder.hidden ? "Показать" : "Скрыть").setStyle(ButtonStyle.Secondary),
  ];
  if (!folder.parentId) buttons.push(new ButtonBuilder().setCustomId(`${CAT_FSUB}${folder.id}`).setLabel("Подкатегория").setStyle(ButtonStyle.Success));
  rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons));
  const back = [
    new ButtonBuilder().setCustomId(`${CAT_FSEC}${folder.section}`).setLabel("К списку").setStyle(ButtonStyle.Secondary),
  ];
  if (!folder.builtin) back.unshift(new ButtonBuilder().setCustomId(`${CAT_FDEL}${folder.id}`).setLabel("Удалить").setStyle(ButtonStyle.Danger));
  rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(...back));
  return {
    embeds: [new EmbedBuilder().setColor(COLOR).setTitle("Категория").setDescription(lines.join("\n"))],
    components: rows.slice(0, 5),
  };
}

function originOfItem(guildId: string, itemId: string): "soviet" | "foreign" | undefined {
  const custom = customItemOf(guildId, itemId);
  if (custom) return custom.kind === "pet" ? undefined : custom.origin === "foreign" ? "foreign" : "soviet";
  if (itemId.includes("_for_")) return "foreign";
  if (itemId.includes("_sov_")) return "soviet";
  return undefined;
}

function itemFolderHere(guildId: string, itemId: string, folderId: string): boolean {
  return itemShopFolderId(guildId, itemId, originOfItem(guildId, itemId)) === folderId;
}

export function isShopCatalogSelect(id: string): boolean {
  return id.startsWith(SEL_KIND) || id === SEL_MENU || id.startsWith(SEL_FOLD) || id.startsWith(SEL_MOVE);
}

export function isShopCatalogModal(id: string): boolean {
  return id.startsWith(MODAL_ADD) || id.startsWith(MODAL_EDIT) || id.startsWith(MODAL_MENU) || id.startsWith(MODAL_FOLD);
}

export async function handleShopCatalogButton(interaction: ButtonInteraction): Promise<boolean> {
  const id = interaction.customId;
  const mine =
    id === NEURO_CATALOG ||
    id === CAT_GOODS ||
    id === CAT_MENUS ||
    id.startsWith(CAT_KIND) ||
    id.startsWith(CAT_ADD) ||
    id.startsWith(CAT_ITEM) ||
    id.startsWith(CAT_HIDE) ||
    id.startsWith(CAT_DEL) ||
    id.startsWith(CAT_EDIT) ||
    id.startsWith(CAT_MENU_ITEM) ||
    id.startsWith(CAT_MENU_HIDE) ||
    id.startsWith(CAT_MENU_EDIT) ||
    id === CAT_FOLDS ||
    id.startsWith(CAT_FSEC) ||
    id.startsWith(CAT_FOPEN) ||
    id.startsWith(CAT_FADD) ||
    id.startsWith(CAT_FSUB) ||
    id.startsWith(CAT_FREN) ||
    id.startsWith(CAT_FHIDE) ||
    id.startsWith(CAT_FDEL);
  if (!mine) return false;
  if (!interaction.inGuild() || !interaction.guildId) {
    await interaction.reply({ content: "Только на сервере.", flags: MessageFlags.Ephemeral });
    return true;
  }
  if (!canManage(interaction)) {
    await interaction.reply({ content: "Состав магазина меняет только **создатель сервера**.", flags: MessageFlags.Ephemeral });
    return true;
  }
  const gid = interaction.guildId;
  if (id === NEURO_CATALOG) {
    await show(interaction, rootPayload());
    return true;
  }
  if (id === CAT_GOODS) {
    await show(interaction, goodsPayload());
    return true;
  }
  if (id === CAT_MENUS) {
    await show(interaction, menusPayload(gid));
    return true;
  }
  if (id.startsWith(CAT_KIND)) {
    const kind = id.slice(CAT_KIND.length);
    if (!isKind(kind)) return true;
    await show(interaction, kindPayload(gid, kind));
    return true;
  }
  if (id.startsWith(CAT_ITEM)) {
    await show(interaction, itemPayload(gid, id.slice(CAT_ITEM.length)));
    return true;
  }
  if (id.startsWith(CAT_HIDE)) {
    const itemId = id.slice(CAT_HIDE.length);
    const hidden = catalogItemHidden(gid, itemId);
    setCatalogHidden(gid, itemId, !hidden);
    await show(interaction, itemPayload(gid, itemId, hidden ? "Снова в продаже." : "Скрыто из продажи."));
    return true;
  }
  if (id.startsWith(CAT_DEL)) {
    const itemId = id.slice(CAT_DEL.length);
    const kind = kindOfId(gid, itemId);
    if (ownedAnywhere(gid, itemId)) {
      await show(interaction, itemPayload(gid, itemId, "Товар уже есть у игроков. Его можно только скрыть."));
      return true;
    }
    removeCustomItem(gid, itemId);
    await show(interaction, kind && isKind(kind) ? kindPayload(gid, kind, "Товар удалён.") : goodsPayload());
    return true;
  }
  if (id.startsWith(CAT_MENU_HIDE)) {
    const menuId = id.slice(CAT_MENU_HIDE.length);
    const hidden = menuHidden(gid, menuId);
    setMenuPatch(gid, menuId, { hidden: !hidden });
    await show(interaction, menuItemPayload(gid, menuId, hidden ? "Кнопка снова видна." : "Кнопка скрыта."));
    return true;
  }
  if (id.startsWith(CAT_MENU_ITEM)) {
    await show(interaction, menuItemPayload(gid, id.slice(CAT_MENU_ITEM.length)));
    return true;
  }
  if (id.startsWith(CAT_EDIT)) {
    const itemId = id.slice(CAT_EDIT.length);
    const kind = kindOfId(gid, itemId);
    if (!kind) return true;
    const custom = customItemOf(gid, itemId);
    const row = listCatalogAdminItems(gid, kind).find((item) => item.id === itemId);
    const modal = new ModalBuilder().setCustomId(`${MODAL_EDIT}${itemId}`).setTitle("Имя и цена".slice(0, 45));
    modal.addComponents(field("name", "Название. сброс — умолчание", row?.label ?? ""));
    modal.addComponents(field("price", "База, ₽. сброс — умолчание", String(shopPriceBase(gid, priceKey(kind, itemId)))));
    if (custom?.kind === "car") {
      modal.addComponents(field("speed", "Скорость, км/ч", String(custom.speedKmh ?? 60)));
      modal.addComponents(field("hours", "КД доставки, часы", String(custom.courierShiftHours ?? 2)));
    } else if (custom?.kind === "apt") {
      modal.addComponents(field("util", "ЖКХ в месяц, ₽", String(custom.monthlyUtilityRub ?? 0)));
    } else if (custom?.kind === "pet") {
      modal.addComponents(field("upkeep", "Содержание в сутки, ₽", String(custom.dailyUpkeepRub ?? 0)));
      modal.addComponents(field("ps", "СР в сутки", String(custom.dailyPsRub ?? 0)));
    }
    await interaction.showModal(modal);
    return true;
  }
  if (id.startsWith(CAT_MENU_EDIT)) {
    const menuId = id.slice(CAT_MENU_EDIT.length);
    const modal = new ModalBuilder().setCustomId(`${MODAL_MENU}${menuId}`).setTitle("Название кнопки");
    modal.addComponents(field("name", "Текст. сброс — умолчание", menuLabel(gid, menuId)));
    await interaction.showModal(modal);
    return true;
  }
  if (id.startsWith(CAT_ADD)) {
    const kind = id.slice(CAT_ADD.length);
    if (!isKind(kind)) return true;
    const modal = new ModalBuilder().setCustomId(`${MODAL_ADD}${kind}`).setTitle(`Новый товар · ${KINDS.find((k) => k.id === kind)?.label ?? ""}`.slice(0, 45));
    modal.addComponents(field("name", "Название", ""));
    modal.addComponents(field("price", "Цена, ₽", "0"));
    if (kind !== "pet") modal.addComponents(field("origin", "совет или замор", "совет"));
    if (kind === "car") {
      modal.addComponents(field("speed", "Скорость, км/ч", "80"));
      modal.addComponents(field("hours", "КД доставки, часы", "2"));
    } else if (kind === "apt") {
      modal.addComponents(field("util", "ЖКХ в месяц, ₽", "0"));
    } else if (kind === "pet") {
      modal.addComponents(field("upkeep", "Содержание в сутки, ₽", "0"));
      modal.addComponents(field("ps", "СР в сутки", "0"));
    }
    await interaction.showModal(modal);
    return true;
  }
  if (id === CAT_FOLDS) {
    await show(interaction, foldsHome());
    return true;
  }
  if (id.startsWith(CAT_FSEC)) {
    const section = id.slice(CAT_FSEC.length);
    if (!isKind(section)) return true;
    await show(interaction, foldSectionPayload(gid, section));
    return true;
  }
  if (id.startsWith(CAT_FOPEN)) {
    await show(interaction, foldCard(gid, id.slice(CAT_FOPEN.length)));
    return true;
  }
  if (id.startsWith(CAT_FADD)) {
    const section = id.slice(CAT_FADD.length);
    if (!isKind(section)) return true;
    const modal = new ModalBuilder().setCustomId(`${MODAL_FOLD}top:${section}`).setTitle("Новая категория");
    modal.addComponents(field("name", "Название", ""));
    await interaction.showModal(modal);
    return true;
  }
  if (id.startsWith(CAT_FSUB)) {
    const modal = new ModalBuilder().setCustomId(`${MODAL_FOLD}sub:${id.slice(CAT_FSUB.length)}`).setTitle("Подкатегория");
    modal.addComponents(field("name", "Название", ""));
    await interaction.showModal(modal);
    return true;
  }
  if (id.startsWith(CAT_FREN)) {
    const folderId = id.slice(CAT_FREN.length);
    const modal = new ModalBuilder().setCustomId(`${MODAL_FOLD}ren:${folderId}`).setTitle("Название категории");
    modal.addComponents(field("name", "Текст. сброс — умолчание", shopFolder(gid, folderId)?.label ?? ""));
    await interaction.showModal(modal);
    return true;
  }
  if (id.startsWith(CAT_FHIDE)) {
    const folderId = id.slice(CAT_FHIDE.length);
    const folder = shopFolder(gid, folderId);
    if (folder) setShopFolderHidden(gid, folderId, !folder.hidden);
    await show(interaction, foldCard(gid, folderId, folder?.hidden ? "Категория снова видна." : "Категория скрыта."));
    return true;
  }
  if (id.startsWith(CAT_FDEL)) {
    const folderId = id.slice(CAT_FDEL.length);
    const folder = shopFolder(gid, folderId);
    removeShopFolder(gid, folderId);
    await show(interaction, folder ? foldSectionPayload(gid, folder.section, "Категория удалена. Товары вернулись в свои ветки.") : foldsHome());
    return true;
  }
  return true;
}

export async function handleShopCatalogSelect(interaction: StringSelectMenuInteraction): Promise<boolean> {
  if (!isShopCatalogSelect(interaction.customId)) return false;
  if (!interaction.inGuild() || !interaction.guildId) {
    await interaction.reply({ content: "Только на сервере.", flags: MessageFlags.Ephemeral });
    return true;
  }
  if (!canManage(interaction)) {
    await interaction.reply({ content: "Состав магазина меняет только **создатель сервера**.", flags: MessageFlags.Ephemeral });
    return true;
  }
  const value = interaction.values[0] ?? "";
  const gid = interaction.guildId;
  let payload: { embeds: EmbedBuilder[]; components: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] } =
    interaction.customId === SEL_MENU ? menuItemPayload(gid, value) : itemPayload(gid, value);
  if (interaction.customId.startsWith(SEL_FOLD)) payload = foldCard(gid, value);
  if (interaction.customId.startsWith(SEL_MOVE)) {
    const rest = interaction.customId.slice(SEL_MOVE.length);
    const removing = rest.startsWith("out:");
    const folderId = removing ? rest.slice("out:".length) : rest;
    const itemId = value.startsWith("out:") ? value.slice("out:".length) : value;
    const err = placeShopItem(gid, itemId, removing ? null : folderId);
    payload = foldCard(gid, folderId, err ?? (removing ? "Товар вернулся в свою ветку." : "Товар перенесён."));
  }
  if (interaction.message?.flags?.has(MessageFlags.Ephemeral)) await interaction.update(payload);
  else await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
  return true;
}

export async function handleShopCatalogModal(interaction: ModalSubmitInteraction): Promise<boolean> {
  if (!isShopCatalogModal(interaction.customId)) return false;
  if (!interaction.inGuild() || !interaction.guildId) {
    await interaction.reply({ content: "Только на сервере.", flags: MessageFlags.Ephemeral });
    return true;
  }
  if (!canManage(interaction)) {
    await interaction.reply({ content: "Состав магазина меняет только **создатель сервера**.", flags: MessageFlags.Ephemeral });
    return true;
  }
  const gid = interaction.guildId;
  const id = interaction.customId;
  if (id.startsWith(MODAL_FOLD)) {
    const rest = id.slice(MODAL_FOLD.length);
    const name = interaction.fields.getTextInputValue("name");
    const reset = name.trim().toLowerCase() === "сброс" || name.trim() === "-";
    if (rest.startsWith("top:")) {
      const section = rest.slice("top:".length);
      if (!isKind(section)) return true;
      const added = addShopFolder(gid, section, name);
      await show(interaction, foldSectionPayload(gid, section, added.ok ? `Категория **${name.trim()}** добавлена.` : added.reason));
      return true;
    }
    if (rest.startsWith("sub:")) {
      const parentId = rest.slice("sub:".length);
      const parent = shopFolder(gid, parentId);
      if (!parent) return true;
      const added = addShopFolder(gid, parent.section, name, parentId);
      await show(interaction, added.ok ? foldCard(gid, added.id, "Подкатегория добавлена.") : foldCard(gid, parentId, added.reason));
      return true;
    }
    if (rest.startsWith("ren:")) {
      const folderId = rest.slice("ren:".length);
      renameShopFolder(gid, folderId, reset ? null : name);
      await show(interaction, foldCard(gid, folderId, "Название сохранено."));
      return true;
    }
    return true;
  }
  if (id.startsWith(MODAL_MENU)) {
    const menuId = id.slice(MODAL_MENU.length);
    const raw = interaction.fields.getTextInputValue("name").trim().toLowerCase();
    setMenuPatch(gid, menuId, { label: raw === "сброс" || raw === "-" ? null : interaction.fields.getTextInputValue("name") });
    await show(interaction, menuItemPayload(gid, menuId, "Название сохранено."));
    return true;
  }
  if (id.startsWith(MODAL_ADD)) {
    const kind = id.slice(MODAL_ADD.length);
    if (!isKind(kind)) return true;
    const name = interaction.fields.getTextInputValue("name");
    const price = parseRub(interaction.fields.getTextInputValue("price"));
    if (price == null || typeof price !== "number") {
      await interaction.reply({ content: "Цена — число от 0.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const origin = kind === "pet" ? undefined : parseOrigin(interaction.fields.getTextInputValue("origin"));
    if (kind !== "pet" && !origin) {
      await interaction.reply({ content: "Происхождение: **совет** или **замор**.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const draft = {
      kind,
      label: name,
      priceRub: price,
      origin,
      speedKmh: kind === "car" ? parseNum(interaction.fields.getTextInputValue("speed"), 10, 400) : undefined,
      courierShiftHours: kind === "car" ? parseNum(interaction.fields.getTextInputValue("hours"), 0.25, 48) : undefined,
      monthlyUtilityRub: kind === "apt" ? parseNum(interaction.fields.getTextInputValue("util"), 0, 1_000_000_000_000) : undefined,
      dailyUpkeepRub: kind === "pet" ? parseNum(interaction.fields.getTextInputValue("upkeep"), 0, 1_000_000_000_000) : undefined,
      dailyPsRub: kind === "pet" ? parseNum(interaction.fields.getTextInputValue("ps"), 0, 10_000_000) : undefined,
    };
    if (kind === "car" && (draft.speedKmh == null || draft.courierShiftHours == null)) {
      await interaction.reply({ content: "Скорость 10–400, КД 0.25–48 часов.", flags: MessageFlags.Ephemeral });
      return true;
    }
    if ((kind === "apt" && draft.monthlyUtilityRub == null) || (kind === "pet" && (draft.dailyUpkeepRub == null || draft.dailyPsRub == null))) {
      await interaction.reply({ content: "Дополнительные числа не разобрались.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const added = addCustomItem(gid, draft);
    await show(interaction, added.ok ? kindPayload(gid, kind, `Добавлено: **${name.trim()}**.`) : kindPayload(gid, kind, added.reason));
    return true;
  }
  if (id.startsWith(MODAL_EDIT)) {
    const itemId = id.slice(MODAL_EDIT.length);
    const kind = kindOfId(gid, itemId);
    if (!kind) return true;
    const nameRaw = interaction.fields.getTextInputValue("name").trim();
    const price = parseRub(interaction.fields.getTextInputValue("price"));
    if (price === undefined) {
      await interaction.reply({ content: "Цена — число от 0 или **сброс**.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const resetName = nameRaw.toLowerCase() === "сброс" || nameRaw === "-";
    setCatalogLabel(gid, itemId, resetName ? null : nameRaw);
    const custom = customItemOf(gid, itemId);
    if (custom) {
      if (price != null) {
        updateCustomStats(gid, itemId, { priceRub: price });
        setShopPriceOverride(gid, priceKey(kind, itemId), { rub: null });
      }
      if (custom.kind === "car") {
        const speed = parseNum(interaction.fields.getTextInputValue("speed"), 10, 400);
        const hours = parseNum(interaction.fields.getTextInputValue("hours"), 0.25, 48);
        if (speed == null || hours == null) {
          await interaction.reply({ content: "Скорость 10–400, КД 0.25–48 часов.", flags: MessageFlags.Ephemeral });
          return true;
        }
        updateCustomStats(gid, itemId, { speedKmh: speed, courierShiftHours: hours });
      }
      if (custom.kind === "apt") {
        const util = parseNum(interaction.fields.getTextInputValue("util"), 0, 1_000_000_000_000);
        if (util == null) {
          await interaction.reply({ content: "ЖКХ — число от 0.", flags: MessageFlags.Ephemeral });
          return true;
        }
        updateCustomStats(gid, itemId, { monthlyUtilityRub: util });
        setShopPriceOverride(gid, `aptu:${itemId}`, { rub: null });
      }
      if (custom.kind === "pet") {
        const upkeep = parseNum(interaction.fields.getTextInputValue("upkeep"), 0, 1_000_000_000_000);
        const ps = parseNum(interaction.fields.getTextInputValue("ps"), 0, 10_000_000);
        if (upkeep == null || ps == null) {
          await interaction.reply({ content: "Содержание и СР — числа от 0.", flags: MessageFlags.Ephemeral });
          return true;
        }
        updateCustomStats(gid, itemId, { dailyUpkeepRub: upkeep, dailyPsRub: ps });
        setShopPriceOverride(gid, `petu:${itemId}`, { rub: null });
      }
      if (price === null) setShopPriceOverride(gid, priceKey(kind, itemId), { rub: null });
    } else {
      setShopPriceOverride(gid, priceKey(kind, itemId), { rub: price });
    }
    await show(interaction, itemPayload(gid, itemId, "Сохранено."));
    return true;
  }
  return true;
}
