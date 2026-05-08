import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  type ButtonInteraction,
  type Client,
  type Guild,
  type GuildMember,
} from "discord.js";
import { voiceLadderChannelId } from "../config.js";
import { loadVoiceLadder } from "./loadLadder.js";
import type { VoiceLadderTier } from "./types.js";
import { getEconomyUser } from "../economy/userStore.js";
import { getVoiceLadderPanelMessageId, setVoiceLadderPanelMessageId } from "./panelStore.js";

export const VOICE_LADDER_BUTTON_ME = "voiceLadder:me";
export const VOICE_LADDER_BUTTON_REFRESH = "voiceLadder:refresh";

const PANEL_COLOR = 0x263238;
const STATS_COLOR = 0x1b5e20;

function fmtPoints(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (n < 0) n = 0;
  return n.toLocaleString("ru-RU");
}

function computeCurrentTier(ladder: VoiceLadderTier[], totalPS: number): { current: VoiceLadderTier; next?: VoiceLadderTier } {
  let current = ladder[0]!;
  for (const t of ladder) {
    if (totalPS >= t.voiceMinutesTotal) current = t;
  }
  const idx = ladder.findIndex((t) => t.roleName === current.roleName && t.voiceMinutesTotal === current.voiceMinutesTotal);
  const next = idx >= 0 ? ladder[idx + 1] : undefined;
  return { current, next };
}

function buildPanelEmbed(guild: Guild): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(PANEL_COLOR)
    .setTitle("Голосовая лестница")
    .setDescription(
      [
        "Нажми кнопку ниже, чтобы получить **персональную** статистику и список ступеней.",
        "Лестница считается по **Социальному рейтингу (СР)**, начисляемому за голос.",
        "Ответ придёт **только тебе** (ephemeral), хотя канал общий.",
      ].join("\n"),
    )
    .setFooter({ text: `Сервер: ${guild.name}` });
}

function buildPanelRows(): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(VOICE_LADDER_BUTTON_ME).setLabel("Моя лестница").setStyle(ButtonStyle.Primary),
    ),
  ];
}

function buildRefreshRow(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(VOICE_LADDER_BUTTON_REFRESH)
      .setLabel("Обновить")
      .setStyle(ButtonStyle.Primary),
  );
}

function buildPersonalComponents(ladder: VoiceLadderTier[]): ActionRowBuilder<ButtonBuilder>[] {
  void ladder; // лестница не влияет на компоненты (кнопка одна)
  return [buildRefreshRow()];
}

function buildPersonalEmbed(member: GuildMember, ladder: VoiceLadderTier[], totalPS: number): EmbedBuilder {
  const { current, next } = computeCurrentTier(ladder, totalPS);

  const e = new EmbedBuilder()
    .setColor(STATS_COLOR)
    .setTitle("Твоя голосовая лестница")
    .setDescription(
      [
        `Накоплено СР: **${fmtPoints(totalPS)}**`,
        `Текущая роль: **${current.roleName}**.`,
        next ? `Следующая роль: **${next.roleName}** через **${fmtPoints(next.voiceMinutesTotal - totalPS)}** СР.` : "Ты уже на **последней ступени** этой лестницы.",
      ].join("\n"),
    )
    .setFooter({ text: `Запросил: ${member.user.tag}` });
  return e;
}

export async function ensureVoiceLadderPanel(client: Client) {
  // Для каждого сервера — свой настроенный канал (или .env fallback).
  for (const guild of client.guilds.cache.values()) {
    const chId = voiceLadderChannelId(guild.id);
    if (!chId) continue;

    // Если конфиг лестницы битый/отсутствует — панель не выставляем (но бот продолжит работать).
    try {
      loadVoiceLadder();
    } catch (e) {
      console.warn("ИИ Управление: voice-ladder.json не загружен, панель лестницы не выставлена:", e);
      continue;
    }

    const ch = await client.channels.fetch(chId).catch(() => null);
    if (!ch?.isTextBased() || ch.isDMBased()) {
      console.warn("ИИ Управление: канал голосовой лестницы недоступен или не текстовый:", chId);
      continue;
    }
    if (!ch.isSendable()) {
      console.warn("ИИ Управление: нет прав отправлять в канал голосовой лестницы:", chId);
      continue;
    }

    const payload = {
      embeds: [buildPanelEmbed(ch.guild)],
      components: buildPanelRows(),
    };

    const storedId = getVoiceLadderPanelMessageId(chId);
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
    setVoiceLadderPanelMessageId(chId, sent.id);
  }
}

export async function handleVoiceLadderButton(interaction: ButtonInteraction): Promise<boolean> {
  const { customId } = interaction;
  if (
    customId !== VOICE_LADDER_BUTTON_ME &&
    customId !== VOICE_LADDER_BUTTON_REFRESH &&
    false
  ) {
    return false;
  }

  if (!interaction.inGuild() || !interaction.guildId || !interaction.member) {
    await interaction.reply({ content: "Эта кнопка работает только на сервере.", flags: MessageFlags.Ephemeral });
    return true;
  }

  const member = interaction.member as GuildMember;
  if (member.user.bot) {
    await interaction.reply({ content: "Ботам статистика не положена.", flags: MessageFlags.Ephemeral });
    return true;
  }

  let ladder: VoiceLadderTier[];
  try {
    ladder = loadVoiceLadder().ladder;
  } catch {
    await interaction.reply({
      content: "Лестница недоступна (ошибка `config/voice-ladder.json`).",
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  const totalPS = getEconomyUser(interaction.guildId, member.id).psTotal;

  if (customId === VOICE_LADDER_BUTTON_ME || customId === VOICE_LADDER_BUTTON_REFRESH) {
    const embeds = [buildPersonalEmbed(member, ladder, totalPS)];
    const components = buildPersonalComponents(ladder);

    if (customId === VOICE_LADDER_BUTTON_REFRESH && interaction.message) {
      await interaction.update({ embeds, components });
    } else {
      await interaction.reply({ embeds, components, flags: MessageFlags.Ephemeral });
    }
    return true;
  }

  return false;
}

