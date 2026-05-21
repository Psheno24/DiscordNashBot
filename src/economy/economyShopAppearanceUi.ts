import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  type ButtonInteraction,
  type GuildMember,
} from "discord.js";
import { appendFeedEvent } from "./feedStore.js";
import { renderProfileCardPng, type ProfileCardRenderOptions } from "./profileCardRender.js";
import {
  getProfileFrameColor,
  isProfileFrameColorId,
  PROFILE_COLOR_CHANGE_PRICE_RUB,
  PROFILE_FRAME_COLORS,
  type ProfileFrameColorId,
} from "./profileThemes.js";
import { getEconomyUser, patchEconomyUser } from "./userStore.js";
const ECON_SHOP_HUB_BACK = "econ:shop:hub";

const PANEL_COLOR = 0x2b2d31;

export const ECON_SHOP_APPEARANCE = "econ:shop:appearance";
export const ECON_SHOP_APPEARANCE_CARD = "econ:shop:appearance:card";
/** Примерить цвет рамки (без оплаты). */
export const ECON_SHOP_APPEARANCE_COLOR_TRY_PREFIX = "econ:shop:appearance:try:";
/** Купить выбранный цвет после примерки. */
export const ECON_SHOP_APPEARANCE_COLOR_BUY_PREFIX = "econ:shop:appearance:buy:";

function fmt(n: number): string {
  return n.toLocaleString("ru-RU");
}

export function buildShopAppearanceEmbed(member: GuildMember): EmbedBuilder {
  const u = getEconomyUser(member.guild.id, member.id);
  const cur = getProfileFrameColor(u.profileCardColor);
  return new EmbedBuilder()
    .setColor(PANEL_COLOR)
    .setTitle("Оформление")
    .setDescription(
      [
        `Баланс: **${fmt(u.rubles)}** ₽`,
        `Рамка сейчас: **${cur.label}**`,
        "",
        "1. Нажмите **цвет** — **примерка** с водяным знаком.",
        `2. Если нравится — **Купить** (**${fmt(PROFILE_COLOR_CHANGE_PRICE_RUB)}** ₽).`,
        "",
        "**Моя карточка** — как выглядит досье **сейчас** (без превью).",
        "Топ-1 по **СР** / **₽** — метка на рамке.",
      ].join("\n"),
    );
}

export function buildShopAppearanceRows(): ActionRowBuilder<ButtonBuilder>[] {
  const colorRow = new ActionRowBuilder<ButtonBuilder>();
  for (const c of PROFILE_FRAME_COLORS) {
    const short = c.label.length > 12 ? `${c.label.slice(0, 10)}…` : c.label;
    colorRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`${ECON_SHOP_APPEARANCE_COLOR_TRY_PREFIX}${c.id}`)
        .setLabel(`Примерить: ${short}`)
        .setStyle(ButtonStyle.Secondary),
    );
  }
  return [
    colorRow,
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(ECON_SHOP_APPEARANCE_CARD)
        .setLabel("Моя карточка")
        .setStyle(ButtonStyle.Success),
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(ECON_SHOP_HUB_BACK).setLabel("Назад в магазин").setStyle(ButtonStyle.Secondary),
    ),
  ];
}

function buildColorPreviewBuyRows(colorId: ProfileFrameColorId): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${ECON_SHOP_APPEARANCE_COLOR_BUY_PREFIX}${colorId}`)
        .setLabel(`Купить · ${fmt(PROFILE_COLOR_CHANGE_PRICE_RUB)} ₽`)
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(ECON_SHOP_APPEARANCE)
        .setLabel("Назад к оформлению")
        .setStyle(ButtonStyle.Secondary),
    ),
  ];
}

/** Без embed — иначе у Discord слева цветная полоса; только вложение-картинка. */
export async function buildProfileCardMessagePayload(
  target: GuildMember,
  options: ProfileCardRenderOptions = {},
): Promise<{ file: AttachmentBuilder; content?: string }> {
  const png = await renderProfileCardPng(target, options);
  const file = new AttachmentBuilder(png, { name: "profile-card.png" });
  if (!options.watermark) {
    return { file };
  }
  const colorDef = getProfileFrameColor(
    options.previewColorId ?? getEconomyUser(target.guild.id, target.id).profileCardColor,
  );
  return {
    file,
    content: [
      `**Превью · ${colorDef.label}** · ${target.displayName}`,
      `_Водяной знак «ПРЕВЬЮ» — только пример. После **Купить** рамка сохранится без него._`,
    ].join("\n"),
  };
}

const PROFILE_CARD_RENDER_FAIL =
  "Не удалось собрать карточку. Проверьте, что на сервере установлены шрифты (DejaVu) и доступен аватар.";

export async function replyWithProfileCardImage(
  interaction: ButtonInteraction,
  member: GuildMember,
  options: ProfileCardRenderOptions = {},
): Promise<void> {
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  }
  try {
    const { file, content } = await buildProfileCardMessagePayload(member, options);
    const components = options.watermark && options.previewColorId
      ? buildColorPreviewBuyRows(options.previewColorId)
      : [];
    await interaction.editReply({
      content: content ?? undefined,
      files: [file],
      components,
    });
  } catch (e) {
    console.error("profile card render", e);
    await interaction.editReply({ content: PROFILE_CARD_RENDER_FAIL });
  }
}

export function isAppearanceShopButton(id: string): boolean {
  return (
    id === ECON_SHOP_APPEARANCE ||
    id === ECON_SHOP_APPEARANCE_CARD ||
    id.startsWith(ECON_SHOP_APPEARANCE_COLOR_TRY_PREFIX) ||
    id.startsWith(ECON_SHOP_APPEARANCE_COLOR_BUY_PREFIX)
  );
}

export async function handleAppearanceShopButton(interaction: ButtonInteraction, member: GuildMember): Promise<boolean> {
  const id = interaction.customId;

  if (id === ECON_SHOP_APPEARANCE) {
    await replyOrUpdateAppearanceMenu(interaction, member);
    return true;
  }

  if (id === ECON_SHOP_APPEARANCE_CARD) {
    await replyWithProfileCardImage(interaction, member, {});
    return true;
  }

  if (id.startsWith(ECON_SHOP_APPEARANCE_COLOR_TRY_PREFIX)) {
    const colorId = id.slice(ECON_SHOP_APPEARANCE_COLOR_TRY_PREFIX.length);
    if (!isProfileFrameColorId(colorId)) {
      await interaction.reply({ content: "Неизвестный цвет.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const u = getEconomyUser(member.guild.id, member.id);
    const def = getProfileFrameColor(colorId);
    if (u.profileCardColor === colorId) {
      await interaction.reply({
        content: `Цвет **${def.label}** уже активен. Откройте **«Моя карточка»**.`,
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }
    await replyWithProfileCardImage(interaction, member, {
      previewColorId: colorId,
      watermark: true,
    });
    return true;
  }

  if (id.startsWith(ECON_SHOP_APPEARANCE_COLOR_BUY_PREFIX)) {
    const colorId = id.slice(ECON_SHOP_APPEARANCE_COLOR_BUY_PREFIX.length);
    if (!isProfileFrameColorId(colorId)) {
      await interaction.reply({ content: "Неизвестный цвет.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const u = getEconomyUser(member.guild.id, member.id);
    const def = getProfileFrameColor(colorId);
    if (u.profileCardColor === colorId) {
      await interaction.reply({
        content: `Цвет **${def.label}** уже куплен и активен.`,
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }
    if (u.rubles < PROFILE_COLOR_CHANGE_PRICE_RUB) {
      await interaction.reply({
        content: `Нужно **${fmt(PROFILE_COLOR_CHANGE_PRICE_RUB)}** ₽.`,
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }
    patchEconomyUser(member.guild.id, member.id, {
      rubles: u.rubles - PROFILE_COLOR_CHANGE_PRICE_RUB,
      profileCardColor: colorId,
    });
    appendFeedEvent({
      ts: Date.now(),
      guildId: member.guild.id,
      type: "job:shift",
      actorUserId: member.id,
      text: `${member.toString()} купил цвет карточки **${def.label}** (−${fmt(PROFILE_COLOR_CHANGE_PRICE_RUB)} ₽).`,
    });
    await replyWithProfileCardImage(interaction, member, {});
    return true;
  }

  return false;
}

async function replyOrUpdateAppearanceMenu(interaction: ButtonInteraction, member: GuildMember): Promise<void> {
  const payload = {
    embeds: [buildShopAppearanceEmbed(member)],
    components: buildShopAppearanceRows(),
  };
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply(payload);
  } else {
    await interaction.update(payload);
  }
}
