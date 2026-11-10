import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  PermissionsBitField,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
} from "discord.js";
import { getShopPriceMultiplier, quoteShopPrice } from "../economy/economyMacro.js";
import {
  getShopPriceDef,
  isShopPriceGroup,
  listShopPriceGroups,
  listShopPrices,
  setShopPriceOverride,
  shopPriceBase,
  shopPriceInflationOn,
  shopPriceIsOverridden,
  type ShopPriceGroup,
} from "../economy/shopPrices.js";
import { NEURO_BUTTON_ADMIN_SETTINGS_ROOT } from "./adminHub.js";

export const NEURO_SETTINGS_SHOP = "neuro:settings:shop";
const NEURO_SHOP_GROUP_PREFIX = "neuro:shop:g:";
const NEURO_SHOP_SELECT_PREFIX = "neuro:shop:sel:";
const MODAL_SHOP_PRICE_PREFIX = "modal:neuro:shopPrice:";

const SETTINGS_COLOR = 0x2b2d31;

function canManage(interaction: ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction): boolean {
  return (
    interaction.inGuild() &&
    (interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageGuild) ||
      interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator))
  );
}

function fmt(n: number): string {
  return n.toLocaleString("ru-RU");
}

function deny(interaction: ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction): Promise<unknown> {
  return interaction.reply({ content: "Нужны права **Управление сервером**.", flags: MessageFlags.Ephemeral });
}

async function showShop(
  interaction: ButtonInteraction | ModalSubmitInteraction,
  guildId: string,
  group?: ShopPriceGroup,
  note?: string,
): Promise<void> {
  const payload = group
    ? { embeds: [buildGroupEmbed(guildId, group, note)], components: buildGroupRows(guildId, group) }
    : { embeds: [buildShopRootEmbed(guildId, note)], components: buildShopRootRows() };
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

function buildShopRootEmbed(guildId: string, note?: string): EmbedBuilder {
  const mult = getShopPriceMultiplier(guildId);
  const lines = [
    `Множитель инфляции: **×${mult.toFixed(2)}**`,
    "У каждой цены своя база и свой флаг инфляции.",
    "Без инфляции цена остаётся как задана. Содержание животных без флага по-прежнему индексируется вместе с доходами.",
    "",
    "Выбери раздел, затем позицию. **Состав** — товары и пункты меню.",
  ];
  if (note) lines.unshift(note, "");
  return new EmbedBuilder().setColor(SETTINGS_COLOR).setTitle("Цены магазина").setDescription(lines.join("\n"));
}

function buildShopRootRows(): ActionRowBuilder<ButtonBuilder>[] {
  const groups = listShopPriceGroups();
  const buttons = groups.map((g) =>
    new ButtonBuilder().setCustomId(`${NEURO_SHOP_GROUP_PREFIX}${g.id}`).setLabel(g.label).setStyle(ButtonStyle.Secondary),
  );
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons.slice(0, 4)),
    new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons.slice(4, 8)),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId("neuro:shop:catalog").setLabel("Состав").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(NEURO_BUTTON_ADMIN_SETTINGS_ROOT).setLabel("Назад").setStyle(ButtonStyle.Secondary),
    ),
  ];
}

function buildGroupEmbed(guildId: string, group: ShopPriceGroup, note?: string): EmbedBuilder {
  const title = listShopPriceGroups().find((g) => g.id === group)?.label ?? "Цены";
  const mult = getShopPriceMultiplier(guildId);
  const lines = [
    `Множитель инфляции: **×${mult.toFixed(2)}**`,
    "В форме: цена и инфляция (`да` / `нет`). Слово **сброс** возвращает умолчание.",
  ];
  if (group === "petu") {
    lines.push("Без инфляции содержание индексируется вместе с доходами.");
  }
  if (note) lines.unshift(note, "");
  return new EmbedBuilder().setColor(SETTINGS_COLOR).setTitle(`Цены · ${title}`).setDescription(lines.join("\n"));
}

function buildGroupRows(guildId: string, group: ShopPriceGroup): ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] {
  const prices = listShopPrices(group, guildId).slice(0, 25);
  const rows: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] = [];
  if (prices.length > 0) {
    const menu = new StringSelectMenuBuilder()
      .setCustomId(`${NEURO_SHOP_SELECT_PREFIX}${group}`)
      .setPlaceholder("Выбери цену")
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(
        prices.map((p) => {
          const charged = quoteShopPrice(guildId, p.id);
          const infl = shopPriceInflationOn(guildId, p.id);
          const mark = infl ? "инфл." : p.whenNoInflation === "income" ? "доходы" : "без инфл.";
          const star = shopPriceIsOverridden(guildId, p.id) ? "• " : "";
          return {
            label: `${star}${p.label}`.slice(0, 100),
            value: p.id,
            description: `${fmt(charged)} ₽ · ${mark}`.slice(0, 100),
          };
        }),
      );
    rows.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu));
  }
  rows.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(NEURO_SETTINGS_SHOP).setLabel("К разделам").setStyle(ButtonStyle.Secondary),
    ),
  );
  return rows;
}

function parseRub(raw: string): number | null | undefined {
  const s = raw.trim().toLowerCase().replace(/\s/g, "").replace(",", ".");
  if (s === "сброс" || s === "-") return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0 || n > 1_000_000_000_000) return undefined;
  return Math.floor(n);
}

function parseInflation(raw: string): boolean | null | undefined {
  const s = raw.trim().toLowerCase();
  if (s === "сброс" || s === "-") return null;
  if (s === "да" || s === "yes" || s === "1" || s === "вкл") return true;
  if (s === "нет" || s === "no" || s === "0" || s === "выкл") return false;
  return undefined;
}

export function isShopPriceSelect(id: string): boolean {
  return id.startsWith(NEURO_SHOP_SELECT_PREFIX);
}

export function isShopPriceModal(id: string): boolean {
  return id.startsWith(MODAL_SHOP_PRICE_PREFIX);
}

export async function handleShopPriceAdminButton(interaction: ButtonInteraction): Promise<boolean> {
  const id = interaction.customId;
  if (id !== NEURO_SETTINGS_SHOP && !id.startsWith(NEURO_SHOP_GROUP_PREFIX)) return false;
  if (!interaction.inGuild() || !interaction.guildId) {
    await interaction.reply({ content: "Только на сервере.", flags: MessageFlags.Ephemeral });
    return true;
  }
  if (!canManage(interaction)) {
    await deny(interaction);
    return true;
  }
  if (id === NEURO_SETTINGS_SHOP) {
    await showShop(interaction, interaction.guildId);
    return true;
  }
  const group = id.slice(NEURO_SHOP_GROUP_PREFIX.length);
  if (!isShopPriceGroup(group)) {
    await showShop(interaction, interaction.guildId);
    return true;
  }
  await showShop(interaction, interaction.guildId, group);
  return true;
}

export async function handleShopPriceSelect(interaction: StringSelectMenuInteraction): Promise<boolean> {
  if (!isShopPriceSelect(interaction.customId)) return false;
  if (!interaction.inGuild() || !interaction.guildId) {
    await interaction.reply({ content: "Только на сервере.", flags: MessageFlags.Ephemeral });
    return true;
  }
  if (!canManage(interaction)) {
    await deny(interaction);
    return true;
  }
  const priceId = interaction.values[0] ?? "";
  const def = getShopPriceDef(priceId);
  if (!def) {
    await interaction.reply({ content: "Неизвестная цена.", flags: MessageFlags.Ephemeral });
    return true;
  }
  const gid = interaction.guildId;
  const base = shopPriceBase(gid, def.id);
  const infl = shopPriceInflationOn(gid, def.id);
  const modal = new ModalBuilder()
    .setCustomId(`${MODAL_SHOP_PRICE_PREFIX}${def.id}`)
    .setTitle(def.label.slice(0, 45));
  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId("rub")
        .setLabel("Цена, ₽ (сброс — умолчание)")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(18)
        .setValue(String(base)),
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId("inf")
        .setLabel("Инфляция: да / нет / сброс")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(8)
        .setValue(infl ? "да" : "нет"),
    ),
  );
  await interaction.showModal(modal);
  return true;
}

export async function handleShopPriceModal(interaction: ModalSubmitInteraction): Promise<boolean> {
  if (!isShopPriceModal(interaction.customId)) return false;
  if (!interaction.inGuild() || !interaction.guildId) {
    await interaction.reply({ content: "Только на сервере.", flags: MessageFlags.Ephemeral });
    return true;
  }
  if (!canManage(interaction)) {
    await deny(interaction);
    return true;
  }
  const priceId = interaction.customId.slice(MODAL_SHOP_PRICE_PREFIX.length);
  const def = getShopPriceDef(priceId);
  if (!def) {
    await interaction.reply({ content: "Неизвестная цена.", flags: MessageFlags.Ephemeral });
    return true;
  }
  const rub = parseRub(interaction.fields.getTextInputValue("rub"));
  const inflation = parseInflation(interaction.fields.getTextInputValue("inf"));
  if (rub === undefined || inflation === undefined) {
    await interaction.reply({
      content: "Цена — число от 0. Инфляция — **да**, **нет** или **сброс**.",
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }
  setShopPriceOverride(interaction.guildId, def.id, { rub, inflation });
  const charged = quoteShopPrice(interaction.guildId, def.id);
  await showShop(
    interaction,
    interaction.guildId,
    def.group,
    `**${def.label}**: база **${fmt(shopPriceBase(interaction.guildId, def.id))}** ₽, к оплате **${fmt(charged)}** ₽.`,
  );
  return true;
}
