import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  type Channel,
  type Client,
  type ButtonInteraction,
} from "discord.js";
import { neuroControlChannelId } from "../config.js";
import { getGuildConfig } from "../guildConfig/store.js";
import { loadNeurocontrol } from "./loadConfig.js";
import type { NeuroRoleEntry, NeurocontrolFile } from "./types.js";
import { getPanelMessageId, setPanelMessageId } from "./panelStore.js";
import { buildNeuroMainPanelRows, NEURO_MAIN_INFO } from "./adminHub.js";
import { loadVoiceLadder } from "../voice/loadLadder.js";

const PANEL_COLOR = 0x263238;
const ROLES_COLOR = 0xb71c1c;
const NEURO_ROLES_DETAILS = "neuro:roles:details";
const NEURO_ROLES_LADDER = "neuro:roles:ladder";

function fmtTreasuryRub(n: number): string {
  return Math.floor(Math.max(0, n)).toLocaleString("ru-RU");
}

/** Канал из `.env` доступен всем гильдиям в кэше — обновляем панель только у владельца канала. */
function isNeuroControlChannelForGuild(ch: Channel, guildId: string): boolean {
  return "guildId" in ch && ch.guildId === guildId;
}

function buildPanelEmbed(cfg: NeurocontrolFile, guildId: string): EmbedBuilder {
  const treasury = getGuildConfig(guildId).treasuryRubles ?? 0;
  const desc = `Диспетчерский пункт ИИ Управления.\n\n**Казна:** **${fmtTreasuryRub(treasury)}** ₽`;
  const e = new EmbedBuilder().setColor(PANEL_COLOR).setTitle(cfg.panel.title).setDescription(desc);
  if (cfg.panel.footer) e.setFooter({ text: cfg.panel.footer });
  return e;
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

function buildRoleSummaryEmbed(roles: NeuroRoleEntry[]): EmbedBuilder {
  const lines = roles.map((r) => `• **${r.designation}** · ${r.roleName}`);
  return new EmbedBuilder()
    .setColor(ROLES_COLOR)
    .setTitle("Роли")
    .setDescription(lines.join("\n") || "Роли не настроены.");
}

function buildRoleRows(): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(NEURO_MAIN_INFO).setLabel("Список").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(NEURO_ROLES_DETAILS).setLabel("Полномочия").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(NEURO_ROLES_LADDER).setLabel("Пороги лестницы").setStyle(ButtonStyle.Secondary),
    ),
  ];
}

function buildRoleLadderEmbed(): EmbedBuilder {
  try {
    const lines = loadVoiceLadder().ladder.map(
      (step) => `• **${step.roleName}** — **${step.voiceMinutesTotal.toLocaleString("ru-RU")} СР**`,
    );
    return new EmbedBuilder().setColor(ROLES_COLOR).setTitle("Пороги лестницы").setDescription(lines.join("\n"));
  } catch {
    return new EmbedBuilder().setColor(ROLES_COLOR).setTitle("Пороги лестницы").setDescription("Лестница недоступна.");
  }
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
    if (!isNeuroControlChannelForGuild(ch, guild.id)) {
      continue;
    }
    if (!ch.isSendable()) {
      console.warn("ИИ Управление: нет прав отправлять в канал нейроконтроля:", chId);
      continue;
    }

    const payload = {
      embeds: [buildPanelEmbed(cfg, guild.id)],
      components: buildNeuroMainPanelRows(),
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

/** Обновить только закреплённое сообщение панели для одного сервера (казна и т.д.). */
export async function refreshNeuroPanelGuild(client: Client, guildId: string): Promise<void> {
  const chId = neuroControlChannelId(guildId);
  if (!chId) return;
  let cfg: NeurocontrolFile;
  try {
    cfg = loadNeurocontrol();
  } catch {
    return;
  }
  const ch = await client.channels.fetch(chId).catch(() => null);
  if (!ch?.isTextBased() || ch.isDMBased() || !isNeuroControlChannelForGuild(ch, guildId) || !ch.isSendable()) {
    return;
  }
  const payload = {
    embeds: [buildPanelEmbed(cfg, guildId)],
    components: buildNeuroMainPanelRows(),
  };
  const storedId = getPanelMessageId(chId);
  if (!storedId) return;
  const msg = await ch.messages.fetch(storedId).catch(() => null);
  const botId = client.user?.id;
  if (msg && botId && msg.author.id === botId) {
    await msg.edit(payload).catch(() => null);
  }
}

/** Кнопка «Инфо» — справочник ролей из neurocontrol.json. */
export async function handleNeuroButton(interaction: ButtonInteraction): Promise<boolean> {
  if (![NEURO_MAIN_INFO, NEURO_ROLES_DETAILS, NEURO_ROLES_LADDER].includes(interaction.customId)) return false;

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

  const embeds =
    interaction.customId === NEURO_ROLES_DETAILS
      ? buildRoleEmbeds(cfg.roles)
      : interaction.customId === NEURO_ROLES_LADDER
        ? [buildRoleLadderEmbed()]
        : [buildRoleSummaryEmbed(cfg.roles)];
  const payload = { embeds, components: buildRoleRows() };
  if (interaction.message?.flags.has(MessageFlags.Ephemeral)) {
    await interaction.update(payload);
  } else {
    await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
  }
  return true;
}
