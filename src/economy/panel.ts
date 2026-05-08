import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  type ButtonInteraction,
  type Client,
  type GuildMember,
} from "discord.js";
import { economyFeedChannelId, economyTerminalChannelId } from "../config.js";
import { getVoiceSeconds } from "../voice/timeStore.js";
import { appendFeedEvent, listFeedEvents } from "./feedStore.js";
import {
  getEconomyFeedPanelMessageId,
  getEconomyTerminalPanelMessageId,
  setEconomyFeedPanelMessageId,
  setEconomyTerminalPanelMessageId,
} from "./panelStore.js";
import { getEconomyUser, patchEconomyUser, type FocusPreset } from "./userStore.js";

export const ECON_BUTTON_MENU = "econ:menu";
export const ECON_BUTTON_PROFILE = "econ:profile";
export const ECON_BUTTON_FOCUS = "econ:focus";
export const ECON_BUTTON_FOCUS_ROLE = "econ:focus:role";
export const ECON_BUTTON_FOCUS_BALANCE = "econ:focus:balance";
export const ECON_BUTTON_FOCUS_MONEY = "econ:focus:money";
export const ECON_BUTTON_PLAYERS = "econ:players";

export const ECON_FEED_BUTTON_ARCHIVE = "econFeed:archive";
const ECON_FEED_BUTTON_PAGE_PREFIX = "econFeed:page:";

const PANEL_COLOR = 0x263238;
const PROFILE_COLOR = 0x1b5e20;
const FEED_COLOR = 0x0d47a1;

function fmt(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return Math.floor(n).toLocaleString("ru-RU");
}

function focusLabel(f: FocusPreset): string {
  if (f === "role") return "Роль (PS)";
  if (f === "money") return "Деньги (₽)";
  return "Баланс";
}

function buildTerminalPanelEmbed(guildName: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(PANEL_COLOR)
    .setTitle("Терминал страны")
    .setDescription(
      [
        "Управление экономикой и прогрессом — через кнопки ниже.",
        "Большинство экранов **личные** (ephemeral), спама в канале не будет.",
      ].join("\n"),
    )
    .setFooter({ text: `Сервер: ${guildName}` });
}

function buildTerminalPanelRows(): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(ECON_BUTTON_PROFILE).setLabel("Профиль").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(ECON_BUTTON_FOCUS).setLabel("Фокус").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(ECON_BUTTON_PLAYERS).setLabel("Игроки").setStyle(ButtonStyle.Secondary),
    ),
  ];
}

function buildMenuRow(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(ECON_BUTTON_MENU).setLabel("Главное меню").setStyle(ButtonStyle.Secondary),
  );
}

function buildFocusRows(cur: FocusPreset): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(ECON_BUTTON_FOCUS_ROLE)
        .setLabel(cur === "role" ? "Роль ✓" : "Роль")
        .setStyle(cur === "role" ? ButtonStyle.Primary : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(ECON_BUTTON_FOCUS_BALANCE)
        .setLabel(cur === "balance" ? "Баланс ✓" : "Баланс")
        .setStyle(cur === "balance" ? ButtonStyle.Primary : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(ECON_BUTTON_FOCUS_MONEY)
        .setLabel(cur === "money" ? "Деньги ✓" : "Деньги")
        .setStyle(cur === "money" ? ButtonStyle.Primary : ButtonStyle.Secondary),
    ),
    buildMenuRow(),
  ];
}

function buildProfileEmbed(member: GuildMember): EmbedBuilder {
  const u = getEconomyUser(member.guild.id, member.id);
  const totalVoiceMin = Math.floor(getVoiceSeconds(member.guild.id, member.id) / 60);

  return new EmbedBuilder()
    .setColor(PROFILE_COLOR)
    .setTitle("Профиль")
    .setDescription(
      [
        `PS (прогресс роли): **${fmt(u.psTotal)}**`,
        `Баланс ₽: **${fmt(u.rubles)}**`,
        `Фокус: **${focusLabel(u.focus)}**`,
        "",
        `Сырые минуты голоса (история): **${fmt(totalVoiceMin)}**`,
      ].join("\n"),
    )
    .setFooter({ text: `Запросил: ${member.user.tag}` });
}

function buildFocusEmbed(member: GuildMember): EmbedBuilder {
  const u = getEconomyUser(member.guild.id, member.id);
  return new EmbedBuilder()
    .setColor(PROFILE_COLOR)
    .setTitle("Фокус добычи")
    .setDescription(
      [
        "Выбери пресет — он влияет на то, куда уходит ценность активности.",
        "",
        `Текущий фокус: **${focusLabel(u.focus)}**`,
      ].join("\n"),
    )
    .setFooter({ text: `Запросил: ${member.user.tag}` });
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

  const nav = new ActionRowBuilder<ButtonBuilder>().addComponents(
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
    new ButtonBuilder().setCustomId(ECON_BUTTON_MENU).setLabel("Главное меню").setStyle(ButtonStyle.Secondary),
  );

  return [nav];
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

export async function ensureEconomyTerminalPanel(client: Client) {
  for (const guild of client.guilds.cache.values()) {
    const chId = economyTerminalChannelId(guild.id);
    if (!chId) continue;

    const ch = await client.channels.fetch(chId).catch(() => null);
    if (!ch?.isTextBased() || ch.isDMBased()) continue;
    if (!ch.isSendable()) continue;

    const payload = { embeds: [buildTerminalPanelEmbed(ch.guild.name)], components: buildTerminalPanelRows() };

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

async function replyOrUpdate(interaction: ButtonInteraction, payload: { embeds: EmbedBuilder[]; components: any[] }) {
  if (interaction.customId === ECON_BUTTON_MENU && interaction.message) {
    await interaction.update(payload);
    return;
  }
  if (interaction.customId.endsWith(":refresh") && interaction.message) {
    await interaction.update(payload);
    return;
  }
  await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
}

function isEconomyButton(id: string): boolean {
  return (
    [
      ECON_BUTTON_MENU,
      ECON_BUTTON_PROFILE,
      ECON_BUTTON_FOCUS,
      ECON_BUTTON_FOCUS_ROLE,
      ECON_BUTTON_FOCUS_BALANCE,
      ECON_BUTTON_FOCUS_MONEY,
      ECON_BUTTON_PLAYERS,
      ECON_FEED_BUTTON_ARCHIVE,
    ].includes(id) || false
  );
}

export async function handleEconomyButton(interaction: ButtonInteraction): Promise<boolean> {
  if (!isEconomyButton(interaction.customId) && !interaction.customId.startsWith(ECON_FEED_BUTTON_PAGE_PREFIX)) return false;
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

  if (id === ECON_BUTTON_MENU) {
    await interaction.reply({
      embeds: [buildTerminalPanelEmbed(member.guild.name)],
      components: buildTerminalPanelRows(),
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  if (id === ECON_BUTTON_PROFILE) {
    await replyOrUpdate(interaction, { embeds: [buildProfileEmbed(member)], components: [buildMenuRow()] });
    return true;
  }

  if (id === ECON_BUTTON_FOCUS) {
    const u = getEconomyUser(member.guild.id, member.id);
    await replyOrUpdate(interaction, { embeds: [buildFocusEmbed(member)], components: buildFocusRows(u.focus) });
    return true;
  }

  if ([ECON_BUTTON_FOCUS_ROLE, ECON_BUTTON_FOCUS_BALANCE, ECON_BUTTON_FOCUS_MONEY].includes(id)) {
    const next: FocusPreset = id === ECON_BUTTON_FOCUS_ROLE ? "role" : id === ECON_BUTTON_FOCUS_MONEY ? "money" : "balance";
    patchEconomyUser(member.guild.id, member.id, { focus: next });
    appendFeedEvent({
      ts: Date.now(),
      guildId: member.guild.id,
      type: "focus:set",
      actorUserId: member.id,
      text: `${member.toString()} сменил фокус на **${focusLabel(next)}**.`,
    });
    await ensureEconomyFeedPanel(interaction.client);
    await replyOrUpdate(interaction, { embeds: [buildFocusEmbed(member)], components: buildFocusRows(next) });
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
    await interaction.reply({
      content: "Раздел «Игроки» (поиск/топы/карточки) подключу следующим шагом.",
      flags: MessageFlags.Ephemeral,
      components: [buildMenuRow()],
    });
    return true;
  }

  return false;
}

