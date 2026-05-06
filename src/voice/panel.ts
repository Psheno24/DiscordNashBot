import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  ThreadAutoArchiveDuration,
  type ButtonInteraction,
  type Client,
  type Guild,
  type GuildMember,
} from "discord.js";
import { voiceLadderChannelId } from "../config.js";
import { loadVoiceLadder } from "./loadLadder.js";
import type { VoiceLadderTier } from "./types.js";
import { getVoiceSeconds } from "./timeStore.js";
import { getVoiceLadderPanelMessageId, setVoiceLadderPanelMessageId } from "./panelStore.js";
import { getUserVoicePanel, setUserVoicePanel } from "./userPanelStore.js";

export const VOICE_LADDER_BUTTON_ME = "voiceLadder:me";

const PANEL_COLOR = 0x263238;
const STATS_COLOR = 0x1b5e20;

function fmtMinutes(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (n < 0) n = 0;
  return n.toLocaleString("ru-RU");
}

function computeCurrentTier(ladder: VoiceLadderTier[], totalMin: number): { current: VoiceLadderTier; next?: VoiceLadderTier } {
  let current = ladder[0]!;
  for (const t of ladder) {
    if (totalMin >= t.voiceMinutesTotal) current = t;
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

function threadNameFor(member: GuildMember): string {
  const base = (member.user.username || member.id).toLowerCase();
  const safe = base.replace(/[^a-z0-9а-яё_-]/gi, "-").slice(0, 40) || member.id;
  return `лестница-${safe}`;
}

function buildTierRows(ladder: VoiceLadderTier[]): ActionRowBuilder<ButtonBuilder>[] {
  // Не показываем "нулевую" стартовую роль (обычно Стажёр).
  const visible = ladder.filter((t) => t.voiceMinutesTotal !== 0);

  // 4 ступени → 1 ряд. Если когда-нибудь станет >5, просто распилим по рядам.
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  let row = new ActionRowBuilder<ButtonBuilder>();
  for (let i = 0; i < visible.length; i++) {
    if (row.components.length >= 5) {
      rows.push(row);
      row = new ActionRowBuilder<ButtonBuilder>();
    }
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`voiceLadder:tier:${i}`)
        .setLabel(visible[i]!.roleName.slice(0, 80))
        .setStyle(ButtonStyle.Secondary),
    );
  }
  if (row.components.length) rows.push(row);
  return rows;
}

function buildPersonalEmbed(member: GuildMember, ladder: VoiceLadderTier[], totalMin: number): EmbedBuilder {
  const { current, next } = computeCurrentTier(ladder, totalMin);
  const nextLine = next
    ? `Следующая роль: **${next.roleName}** через **${fmtMinutes(next.voiceMinutesTotal - totalMin)}** мин.`
    : "Ты уже на **последней ступени** этой лестницы.";

  const e = new EmbedBuilder()
    .setColor(STATS_COLOR)
    .setTitle("Твоя голосовая лестница")
    .setDescription(
      [`Накоплено: **${fmtMinutes(totalMin)}** мин.`, `Текущая роль: **${current.roleName}**.`, nextLine].join("\n"),
    )
    .setFooter({ text: `Запросил: ${member.user.tag}` });

  // Детали ступеней: не показываем "нулевую" стартовую роль (обычно Стажёр).
  // Для достигнутых ступеней выводим "достигнуто", без "осталось 0".
  for (const t of ladder) {
    if (t.voiceMinutesTotal === 0) continue;
    const remain = t.voiceMinutesTotal - totalMin;
    const name = t.roleName.slice(0, 256);
    const value =
      remain <= 0
        ? `Порог: **${fmtMinutes(t.voiceMinutesTotal)}** мин.\nСтатус: **достигнуто**`
        : `Порог: **${fmtMinutes(t.voiceMinutesTotal)}** мин.\nОсталось: **${fmtMinutes(remain)}** мин.`;
    e.addFields({ name, value: value.slice(0, 1024), inline: false });
  }
  return e;
}

function buildTierEmbed(member: GuildMember, tier: VoiceLadderTier, totalMin: number): EmbedBuilder {
  const remain = Math.max(0, tier.voiceMinutesTotal - totalMin);
  return new EmbedBuilder()
    .setColor(STATS_COLOR)
    .setTitle(`Ступень: ${tier.roleName}`)
    .setDescription(
      [
        `Накоплено: **${fmtMinutes(totalMin)}** мин.`,
        `Порог: **${fmtMinutes(tier.voiceMinutesTotal)}** мин.`,
        `Осталось: **${fmtMinutes(remain)}** мин.`,
      ].join("\n"),
    )
    .setFooter({ text: `Запросил: ${member.user.tag}` });
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
  if (customId !== VOICE_LADDER_BUTTON_ME && !customId.startsWith("voiceLadder:tier:")) return false;

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

  const totalSec = getVoiceSeconds(interaction.guildId, member.id);
  const totalMin = Math.floor(totalSec / 60);

  const visible = ladder.filter((t) => t.voiceMinutesTotal !== 0);

  if (customId === VOICE_LADDER_BUTTON_ME) {
    // "Одно активное окно": создаём (или используем) приватную ветку и держим там одно актуальное сообщение.
    const baseChannel = interaction.channel;
    if (!baseChannel || baseChannel.type !== ChannelType.GuildText) {
      await interaction.reply({
        content: "Не могу открыть окно здесь. Нужен обычный текстовый канал сервера.",
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    let threadId: string | undefined;
    const stored = getUserVoicePanel(interaction.guildId, member.id);
    if (stored) threadId = stored.threadId;

    const thread =
      (threadId ? await interaction.guild?.channels.fetch(threadId).catch(() => null) : null) ??
      (await baseChannel.threads
        .create({
          name: threadNameFor(member),
          type: ChannelType.PrivateThread,
          autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
          reason: "ИИ Управление: персональное окно голосовой лестницы",
        })
        .catch(() => null));

    if (!thread || thread.type !== ChannelType.PrivateThread) {
      await interaction.reply({
        content:
          "Не смог открыть приватную ветку. Проверь права бота: **Manage Threads** и доступ к каналу.",
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    // Добавляем пользователя в приватную ветку (на всякий случай).
    await thread.members.add(member.id).catch(() => null);

    // Удаляем старое активное сообщение (если есть) и отправляем новое.
    if (stored?.messageId) {
      const oldMsg = await thread.messages.fetch(stored.messageId).catch(() => null);
      await oldMsg?.delete().catch(() => null);
    }

    const sent = await thread.send({
      embeds: [buildPersonalEmbed(member, ladder, totalMin)],
      components: buildTierRows(ladder),
    });

    setUserVoicePanel(interaction.guildId, member.id, { threadId: thread.id, messageId: sent.id });

    await interaction.reply({
      content: `Открыл твоё окно: <#${thread.id}>`,
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  const idxRaw = customId.slice("voiceLadder:tier:".length);
  const idx = Number.parseInt(idxRaw, 10);
  const tier = Number.isFinite(idx) ? visible[idx] : undefined;
  if (!tier) {
    await interaction.reply({ content: "Не нашёл эту ступень (возможно, лестница обновилась).", flags: MessageFlags.Ephemeral });
    return true;
  }

  // Если кнопки нажаты в приватной ветке — обновляем сообщение (без накопления новых "окон").
  if (interaction.message && interaction.channel?.type === ChannelType.PrivateThread) {
    await interaction.update({
      embeds: [buildTierEmbed(member, tier, totalMin)],
      components: buildTierRows(ladder),
    });
    return true;
  }

  await interaction.reply({ embeds: [buildTierEmbed(member, tier, totalMin)], flags: MessageFlags.Ephemeral });
  return true;
}

