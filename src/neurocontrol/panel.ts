import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  PermissionsBitField,
  type Client,
  type ButtonInteraction,
  type ChannelSelectMenuInteraction,
} from "discord.js";
import { neuroControlChannelId } from "../config.js";
import { loadNeurocontrol } from "./loadConfig.js";
import type { NeuroRoleEntry, NeurocontrolFile } from "./types.js";
import { getPanelMessageId, setPanelMessageId } from "./panelStore.js";
import { getGuildConfig, patchGuildConfig } from "../guildConfig/store.js";

export const NEURO_BUTTON_ROLES = "neuro:roles";
export const NEURO_BUTTON_SETTINGS = "neuro:settings";

const NEURO_SELECT_WELCOME = "neuro:cfg:welcome";
const NEURO_SELECT_NEUROCONTROL = "neuro:cfg:neurocontrol";
const NEURO_SELECT_VOICE_LADDER = "neuro:cfg:voiceLadder";

const PANEL_COLOR = 0x263238;
const ROLES_COLOR = 0xb71c1c;
const SETTINGS_COLOR = 0x0d47a1;

function buildPanelEmbed(cfg: NeurocontrolFile): EmbedBuilder {
  const e = new EmbedBuilder()
    .setColor(PANEL_COLOR)
    .setTitle(cfg.panel.title)
    .setDescription(cfg.panel.description);
  if (cfg.panel.footer) e.setFooter({ text: cfg.panel.footer });
  return e;
}

function buildRolesRows(): ActionRowBuilder<ButtonBuilder>[] {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(NEURO_BUTTON_ROLES)
      .setLabel("Роли")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(NEURO_BUTTON_SETTINGS)
      .setLabel("Настройки")
      .setStyle(ButtonStyle.Secondary),
  );
  return [row];
}

function chunkFields(entries: NeuroRoleEntry[], perEmbed: number): NeuroRoleEntry[][] {
  const out: NeuroRoleEntry[][] = [];
  for (let i = 0; i < entries.length; i += perEmbed) {
    out.push(entries.slice(i, i + perEmbed));
  }
  return out;
}

function buildRoleEmbeds(roles: NeuroRoleEntry[]): EmbedBuilder[] {
  const chunks = chunkFields(roles, 25);
  return chunks.map((chunk, i) => {
    const e = new EmbedBuilder()
      .setColor(ROLES_COLOR)
      .setTitle(
        chunks.length > 1
          ? `Роли: обозначения и полномочия (${i + 1}/${chunks.length})`
          : "Роли: обозначения и полномочия",
      );
    for (const r of chunk) {
      const name = `${r.designation} · ${r.roleName}`.slice(0, 256);
      const value = r.capabilities.slice(0, 1024);
      e.addFields({ name, value, inline: false });
    }
    return e;
  });
}

export async function ensureNeuroPanel(client: Client) {
  for (const guild of client.guilds.cache.values()) {
    const chId = neuroControlChannelId(guild.id);
    if (!chId) continue;

    let cfg: NeurocontrolFile;
    try {
      cfg = loadNeurocontrol();
    } catch (e) {
      console.warn("ИИ Управление: neurocontrol.json не загружен, панель не выставлена:", e);
      continue;
    }

    const ch = await client.channels.fetch(chId).catch(() => null);
    if (!ch?.isTextBased() || ch.isDMBased()) {
      console.warn("ИИ Управление: канал нейроконтроля недоступен или не текстовый:", chId);
      continue;
    }

    const payload = {
      embeds: [buildPanelEmbed(cfg)],
      components: buildRolesRows(),
    };

    const storedId = getPanelMessageId(chId);
    if (storedId) {
      const msg = await ch.messages.fetch(storedId).catch(() => null);
      const botId = client.user?.id;
      if (msg && botId && msg.author.id === botId) {
        try {
          await msg.edit(payload);
          continue;
        } catch {
          /* создаём новое */
        }
      }
    }

    const sent = await ch.send(payload);
    setPanelMessageId(chId, sent.id);
  }
}

function canManage(interaction: ButtonInteraction | ChannelSelectMenuInteraction): boolean {
  return (
    interaction.inGuild() &&
    (interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageGuild) ||
      interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator))
  );
}

function fmtChannel(id?: string): string {
  return id ? `<#${id}>` : "не задан";
}

function buildSettingsEmbed(guildId: string): EmbedBuilder {
  const cfg = getGuildConfig(guildId);
  return new EmbedBuilder()
    .setColor(SETTINGS_COLOR)
    .setTitle("Настройки бота (каналы)")
    .setDescription(
      [
        `Канал приветствий: ${fmtChannel(cfg.welcomeChannelId)}`,
        `Канал контроля (панель): ${fmtChannel(cfg.neuroControlChannelId)}`,
        `Канал статистики/лестницы: ${fmtChannel(cfg.voiceLadderChannelId)}`,
        "",
        "Выбери новый канал в селекте — настройка сохранится сразу.",
      ].join("\n"),
    );
}

function buildSettingsRows(): ActionRowBuilder<ChannelSelectMenuBuilder>[] {
  return [
    new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId(NEURO_SELECT_WELCOME)
        .setPlaceholder("Выбрать канал приветствий")
        .setChannelTypes(ChannelType.GuildText)
        .setMinValues(1)
        .setMaxValues(1),
    ),
    new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId(NEURO_SELECT_NEUROCONTROL)
        .setPlaceholder("Выбрать канал контроля (панель)")
        .setChannelTypes(ChannelType.GuildText)
        .setMinValues(1)
        .setMaxValues(1),
    ),
    new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId(NEURO_SELECT_VOICE_LADDER)
        .setPlaceholder("Выбрать канал статистики/лестницы")
        .setChannelTypes(ChannelType.GuildText)
        .setMinValues(1)
        .setMaxValues(1),
    ),
  ];
}

export async function handleNeuroButton(interaction: ButtonInteraction): Promise<boolean> {
  if (interaction.customId !== NEURO_BUTTON_ROLES) return false;

  let cfg: ReturnType<typeof loadNeurocontrol>;
  try {
    cfg = loadNeurocontrol();
  } catch {
    await interaction.reply({
      content: "Справочник ролей недоступен (ошибка `neurocontrol.json`).",
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  const embeds = buildRoleEmbeds(cfg.roles);
  await interaction.reply({ embeds, flags: MessageFlags.Ephemeral });
  return true;
}

export async function handleNeuroSettingsButton(interaction: ButtonInteraction): Promise<boolean> {
  if (interaction.customId !== NEURO_BUTTON_SETTINGS) return false;
  if (!interaction.inGuild() || !interaction.guildId) {
    await interaction.reply({ content: "Настройки доступны только на сервере.", flags: MessageFlags.Ephemeral });
    return true;
  }
  if (!canManage(interaction)) {
    await interaction.reply({ content: "Недостаточно прав (нужно Manage Server).", flags: MessageFlags.Ephemeral });
    return true;
  }

  await interaction.reply({
    embeds: [buildSettingsEmbed(interaction.guildId)],
    components: buildSettingsRows(),
    flags: MessageFlags.Ephemeral,
  });
  return true;
}

export async function handleNeuroSettingsSelect(interaction: ChannelSelectMenuInteraction): Promise<boolean> {
  if (![NEURO_SELECT_WELCOME, NEURO_SELECT_NEUROCONTROL, NEURO_SELECT_VOICE_LADDER].includes(interaction.customId)) {
    return false;
  }
  if (!interaction.inGuild() || !interaction.guildId) {
    await interaction.reply({ content: "Настройки доступны только на сервере.", flags: MessageFlags.Ephemeral });
    return true;
  }
  if (!canManage(interaction)) {
    await interaction.reply({ content: "Недостаточно прав (нужно Manage Server).", flags: MessageFlags.Ephemeral });
    return true;
  }

  const picked = interaction.values[0];
  // На всякий: оставим только текстовые каналы.
  const ch = await interaction.guild?.channels.fetch(picked).catch(() => null);
  if (!ch || ch.type !== ChannelType.GuildText) {
    await interaction.reply({ content: "Нужен текстовый канал сервера.", flags: MessageFlags.Ephemeral });
    return true;
  }

  if (interaction.customId === NEURO_SELECT_WELCOME) {
    patchGuildConfig(interaction.guildId, { welcomeChannelId: picked });
  } else if (interaction.customId === NEURO_SELECT_NEUROCONTROL) {
    patchGuildConfig(interaction.guildId, { neuroControlChannelId: picked });
  } else if (interaction.customId === NEURO_SELECT_VOICE_LADDER) {
    patchGuildConfig(interaction.guildId, { voiceLadderChannelId: picked });
  }

  await interaction.update({
    embeds: [buildSettingsEmbed(interaction.guildId)],
    components: buildSettingsRows(),
  });
  return true;
}
