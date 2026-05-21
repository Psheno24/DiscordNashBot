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
import { renderProfileCardPng } from "./profileCardRender.js";
import {
  getProfileFrameColor,
  isProfileFrameColorId,
  PROFILE_COLOR_CHANGE_PRICE_RUB,
  PROFILE_FRAME_COLORS,
} from "./profileThemes.js";
import { getEconomyUser, patchEconomyUser } from "./userStore.js";
const ECON_SHOP_HUB_BACK = "econ:shop:hub";

const PANEL_COLOR = 0x2b2d31;

export const ECON_SHOP_APPEARANCE = "econ:shop:appearance";
export const ECON_SHOP_APPEARANCE_CARD = "econ:shop:appearance:card";
export const ECON_SHOP_APPEARANCE_PREVIEW = "econ:shop:appearance:preview";
const ECON_SHOP_APPEARANCE_COLOR_PREFIX = "econ:shop:appearance:color:";

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
        `Рамка карточки: **${cur.label}**`,
        "",
        `Смена цвета рамки — **${fmt(PROFILE_COLOR_CHANGE_PRICE_RUB)}** ₽.`,
        "Топ-1 по **СР** и/или **₽** на сервере получает **светящуюся метку** на рамке.",
        "",
        "**Пример** — посмотреть карточку без оплаты.",
        "**Моя карточка** — сохранённый вид (обновляется при смене имущества).",
      ].join("\n"),
    );
}

export function buildShopAppearanceRows(): ActionRowBuilder<ButtonBuilder>[] {
  const colorRow = new ActionRowBuilder<ButtonBuilder>();
  for (const c of PROFILE_FRAME_COLORS) {
    const short = c.label.length > 10 ? `${c.label.slice(0, 8)}…` : c.label;
    colorRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`${ECON_SHOP_APPEARANCE_COLOR_PREFIX}${c.id}`)
        .setLabel(`${short} ${fmt(PROFILE_COLOR_CHANGE_PRICE_RUB)}₽`)
        .setStyle(ButtonStyle.Secondary),
    );
  }
  return [
    colorRow,
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(ECON_SHOP_APPEARANCE_PREVIEW)
        .setLabel("Пример карточки")
        .setStyle(ButtonStyle.Primary),
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

export async function buildProfileCardMessagePayload(target: GuildMember): Promise<{
  embed: EmbedBuilder;
  file: AttachmentBuilder;
}> {
  const png = await renderProfileCardPng(target);
  const file = new AttachmentBuilder(png, { name: "profile-card.png" });
  const accent = getProfileFrameColor(getEconomyUser(target.guild.id, target.id).profileCardColor).accent;
  const embed = new EmbedBuilder()
    .setColor(parseInt(accent.slice(1), 16))
    .setTitle(`Карточка · ${target.displayName}`)
    .setImage("attachment://profile-card.png");
  return { embed, file };
}

const PROFILE_CARD_RENDER_FAIL =
  "Не удалось собрать карточку. Проверьте, что на сервере установлены шрифты (DejaVu) и доступен аватар.";

export async function replyWithProfileCardImage(interaction: ButtonInteraction, member: GuildMember): Promise<void> {
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  }
  try {
    const { embed, file } = await buildProfileCardMessagePayload(member);
    await interaction.editReply({ embeds: [embed], files: [file] });
  } catch (e) {
    console.error("profile card render", e);
    await interaction.editReply({ content: PROFILE_CARD_RENDER_FAIL });
  }
}

export function isAppearanceShopButton(id: string): boolean {
  return (
    id === ECON_SHOP_APPEARANCE ||
    id === ECON_SHOP_APPEARANCE_CARD ||
    id === ECON_SHOP_APPEARANCE_PREVIEW ||
    id.startsWith(ECON_SHOP_APPEARANCE_COLOR_PREFIX)
  );
}

export async function handleAppearanceShopButton(interaction: ButtonInteraction, member: GuildMember): Promise<boolean> {
  const id = interaction.customId;

  if (id === ECON_SHOP_APPEARANCE) {
    await interaction.update({
      embeds: [buildShopAppearanceEmbed(member)],
      components: buildShopAppearanceRows(),
    });
    return true;
  }

  if (id === ECON_SHOP_APPEARANCE_PREVIEW || id === ECON_SHOP_APPEARANCE_CARD) {
    await replyWithProfileCardImage(interaction, member);
    return true;
  }

  if (id.startsWith(ECON_SHOP_APPEARANCE_COLOR_PREFIX)) {
    const colorId = id.slice(ECON_SHOP_APPEARANCE_COLOR_PREFIX.length);
    if (!isProfileFrameColorId(colorId)) {
      await interaction.reply({ content: "Неизвестный цвет.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const u = getEconomyUser(member.guild.id, member.id);
    const def = getProfileFrameColor(colorId);
    if (u.profileCardColor === colorId) {
      await interaction.reply({
        content: `Цвет **${def.label}** уже выбран. Нажмите **«Моя карточка»**, чтобы посмотреть.`,
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }
    if (u.rubles < PROFILE_COLOR_CHANGE_PRICE_RUB) {
      await interaction.reply({
        content: `Нужно **${fmt(PROFILE_COLOR_CHANGE_PRICE_RUB)}** ₽ для смены цвета.`,
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
      text: `${member.toString()} сменил цвет карточки на **${def.label}** (−${fmt(PROFILE_COLOR_CHANGE_PRICE_RUB)} ₽).`,
    });
    await replyWithProfileCardImage(interaction, member);
    return true;
  }

  return false;
}
